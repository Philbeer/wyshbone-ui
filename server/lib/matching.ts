/**
 * Entity Matching Functions for AI-powered Pub Deduplication
 * 
 * Uses PostgreSQL pg_trgm extension for fuzzy text matching
 * to find potential duplicate pub records and determine match confidence.
 * 
 * Also includes Claude AI-powered matching for ambiguous cases.
 */

import { neon } from "@neondatabase/serverless";
import Anthropic from "@anthropic-ai/sdk";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and, sql, desc, or, gte, asc } from "drizzle-orm";
import {
  pubsMaster,
  entitySources,
  entityReviewQueue,
  agentIntelligence,
  things,
  type InsertPubsMaster,
  type InsertEntitySource,
  type InsertEntityReviewQueue,
  type SelectPubsMaster,
  type SelectEntitySource,
  type InsertAgentIntelligence,
  type SelectAgentIntelligence,
  type InsertThing,
  type SelectThing,
} from "@shared/schema";

// ============================================
// ANTHROPIC CLIENT
// ============================================

let anthropicClient: Anthropic | null = null;
const MODEL = "claude-sonnet-4-20250514";

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY environment variable is not set");
    }
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return anthropicClient;
}

// ============================================
// DRIZZLE DATABASE CONNECTION
// ============================================

let drizzleDb: ReturnType<typeof drizzle> | null = null;

function getDrizzleDb() {
  if (!drizzleDb) {
    // SINGLE SOURCE OF TRUTH: SUPABASE_DATABASE_URL (Replit auto-provides DATABASE_URL for its built-in Postgres)
    const connectionUrl = process.env.SUPABASE_DATABASE_URL;
    if (!connectionUrl) {
      throw new Error("SUPABASE_DATABASE_URL not configured");
    }
    const queryClient = postgres(connectionUrl, {
      connect_timeout: 5,
      idle_timeout: 10,
      max_lifetime: 60 * 30,
    });
    drizzleDb = drizzle(queryClient);
  }
  return drizzleDb;
}

// ============================================
// CONFIDENCE THRESHOLDS
// ============================================

/**
 * Confidence thresholds for automated decision-making.
 * 
 * AUTO_MATCH (0.9): Confidence level at which we automatically merge entities
 * MANUAL_REVIEW (0.7): Confidence level that triggers human review queue
 * NEW_ENTITY (< 0.7): Below this, we create a new entity
 */
export const CONFIDENCE_THRESHOLDS = {
  /** Auto-merge if confidence >= 0.9 */
  AUTO_MATCH: 0.9,
  /** Queue for human review if confidence >= 0.7 but < 0.9 */
  MANUAL_REVIEW: 0.7,
  /** Create new entity if confidence < 0.7 */
  NEW_ENTITY: 0.7,
} as const;

// ============================================
// TYPES
// ============================================

export interface PubInput {
  name: string;
  postcode?: string | null;
  phone?: string | null;
  address?: string | null;
}

export interface PubMatch {
  id: number;
  name: string;
  postcode: string | null;
  phone: string | null;
  addressLine1: string | null;
  city: string | null;
  similarity: number;
}

export interface MatchCandidate extends PubMatch {
  isCustomer: boolean;
  totalOrders: number;
}

/**
 * Result from AI-powered entity matching.
 */
export interface MatchDecision {
  /** The matched pub from the database, if a match was found */
  match?: MatchCandidate;
  /** Confidence score 0-1 (1 = certain match, 0 = certain no match) */
  confidence: number;
  /** AI explanation for the match decision */
  reasoning: string;
  /** True if this should be created as a new entity */
  isNew: boolean;
}

/**
 * Event input for AI matching.
 */
export interface EventInput {
  name: string;
  date?: string | null;
  endDate?: string | null;
  location?: string | null;
  postcode?: string | null;
  description?: string | null;
  organizer?: string | null;
}

/**
 * Event candidate from the database.
 */
export interface EventCandidate {
  id: number;
  name: string;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  postcode: string | null;
  organizer: string | null;
  isRecurring: boolean;
}

// ============================================
// DATABASE CONNECTION
// ============================================

function getDb() {
  // SINGLE SOURCE OF TRUTH: SUPABASE_DATABASE_URL (Replit auto-provides DATABASE_URL for its built-in Postgres)
  const connectionUrl = process.env.SUPABASE_DATABASE_URL;
  if (!connectionUrl) {
    throw new Error("SUPABASE_DATABASE_URL not configured");
  }
  return neon(connectionUrl);
}

// ============================================
// MAIN MATCHING FUNCTIONS
// ============================================

/**
 * Find potential matching pubs in the database using fuzzy name matching.
 * 
 * Uses pg_trgm similarity scoring to find pubs with similar names,
 * optionally filtered by exact postcode match.
 * 
 * @param newPub - The incoming pub data to match against
 * @param workspaceId - Tenant workspace ID for isolation
 * @returns Array of potential matches with similarity scores, ordered by similarity DESC
 */
export async function findPotentialMatches(
  newPub: PubInput,
  workspaceId: number
): Promise<MatchCandidate[]> {
  const sql = getDb();
  
  const { name, postcode } = newPub;
  
  if (!name || name.trim().length === 0) {
    return [];
  }
  
  const normalizedName = name.trim().toLowerCase();
  const minSimilarity = 0.3;
  const limit = 10;

  try {
    let results;
    
    if (postcode && postcode.trim().length > 0) {
      // If postcode provided, filter by exact postcode match AND fuzzy name
      const normalizedPostcode = normalizePostcode(postcode);
      
      results = await sql`
        SELECT 
          id,
          name,
          postcode,
          phone,
          address_line_1 as "addressLine1",
          city,
          is_customer as "isCustomer",
          total_orders as "totalOrders",
          similarity(lower(name), ${normalizedName}) as similarity
        FROM pubs_master
        WHERE workspace_id = ${workspaceId}
          AND REPLACE(LOWER(postcode), ' ', '') = ${normalizedPostcode}
          AND similarity(lower(name), ${normalizedName}) > ${minSimilarity}
        ORDER BY similarity DESC
        LIMIT ${limit}
      `;
    } else {
      // No postcode - just search by name similarity
      results = await sql`
        SELECT 
          id,
          name,
          postcode,
          phone,
          address_line_1 as "addressLine1",
          city,
          is_customer as "isCustomer",
          total_orders as "totalOrders",
          similarity(lower(name), ${normalizedName}) as similarity
        FROM pubs_master
        WHERE workspace_id = ${workspaceId}
          AND similarity(lower(name), ${normalizedName}) > ${minSimilarity}
        ORDER BY similarity DESC
        LIMIT ${limit}
      `;
    }
    
    return results.map(row => ({
      id: row.id,
      name: row.name,
      postcode: row.postcode,
      phone: row.phone,
      addressLine1: row.addressLine1,
      city: row.city,
      similarity: parseFloat(row.similarity),
      isCustomer: row.isCustomer === true,
      totalOrders: row.totalOrders || 0,
    }));
  } catch (error) {
    console.error("[matching] Error finding potential matches:", error);
    throw error;
  }
}

/**
 * Determine if two pubs are an obvious match (high confidence, no AI needed).
 * 
 * Returns true only if:
 * - Postcodes match exactly (if both provided)
 * - Name similarity > 0.9 using pg_trgm
 * - OR phone matches exactly (if both provided)
 * 
 * @param pub1 - First pub to compare
 * @param pub2 - Second pub to compare  
 * @returns True if this is an obvious match that can be auto-merged
 */
export async function isObviousMatch(
  pub1: PubInput,
  pub2: PubInput
): Promise<boolean> {
  // If both have postcodes, they must match
  if (pub1.postcode && pub2.postcode) {
    const postcode1 = normalizePostcode(pub1.postcode);
    const postcode2 = normalizePostcode(pub2.postcode);
    
    if (postcode1 !== postcode2) {
      return false;
    }
  }
  
  // If both have phones and they match exactly, it's a match
  if (pub1.phone && pub2.phone) {
    const phone1 = normalizePhone(pub1.phone);
    const phone2 = normalizePhone(pub2.phone);
    
    if (phone1 === phone2 && phone1.length >= 10) {
      return true;
    }
  }
  
  // Check name similarity using pg_trgm
  const nameSimilarity = await getNameSimilarity(pub1.name, pub2.name);
  
  // For obvious match: need postcode match + very high name similarity
  if (pub1.postcode && pub2.postcode && nameSimilarity >= 0.9) {
    return true;
  }
  
  // Without postcode, need even higher similarity
  if (nameSimilarity >= 0.95) {
    return true;
  }
  
  return false;
}

/**
 * Get pg_trgm similarity score between two names using the database.
 * 
 * @param name1 - First name
 * @param name2 - Second name
 * @returns Similarity score 0-1
 */
async function getNameSimilarity(name1: string, name2: string): Promise<number> {
  const sql = getDb();
  
  const normalized1 = name1.trim().toLowerCase();
  const normalized2 = name2.trim().toLowerCase();
  
  try {
    const result = await sql`
      SELECT similarity(${normalized1}, ${normalized2}) as sim
    `;
    
    return parseFloat(result[0]?.sim || 0);
  } catch (error) {
    console.error("[matching] Error calculating name similarity:", error);
    // Fall back to JavaScript implementation
    return calculateStringSimilarity(name1, name2);
  }
}

// ============================================
// STRING SIMILARITY HELPERS
// ============================================

/**
 * Calculate Jaccard similarity between two strings based on word tokens.
 * 
 * Normalizes strings (lowercase, trim, remove punctuation) and computes
 * the Jaccard index: |A ∩ B| / |A ∪ B|
 * 
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Similarity score 0-1 (1 = identical, 0 = no overlap)
 */
export function calculateStringSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) {
    return 0;
  }
  
  const words1 = tokenize(str1);
  const words2 = tokenize(str2);
  
  if (words1.size === 0 && words2.size === 0) {
    return 1; // Both empty = identical
  }
  
  if (words1.size === 0 || words2.size === 0) {
    return 0; // One empty = no similarity
  }
  
  // Calculate intersection
  const intersection = new Set(Array.from(words1).filter(w => words2.has(w)));
  
  // Calculate union
  const union = new Set([...Array.from(words1), ...Array.from(words2)]);
  
  // Jaccard index
  return intersection.size / union.size;
}

/**
 * Tokenize a string into a set of normalized words.
 * Removes common pub-related stop words and normalizes text.
 */
function tokenize(str: string): Set<string> {
  // Normalize: lowercase, remove punctuation, split on whitespace
  const normalized = str
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .trim();
  
  // Split into words and filter
  const words = normalized.split(/\s+/).filter(w => w.length > 0);
  
  // Remove common stop words that don't help with matching
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'of', 'at', 'in', 'on', 'to',
    'pub', 'inn', 'bar', 'tavern', 'hotel', 'house', 'arms', 'head',
    'old', 'new', 'ye', 'olde', 'royal', 'kings', 'queens',
  ]);
  
  return new Set(words.filter(w => !stopWords.has(w) && w.length > 1));
}

// ============================================
// NORMALIZATION HELPERS
// ============================================

/**
 * Normalize a UK postcode for comparison.
 * Removes spaces and converts to lowercase.
 */
function normalizePostcode(postcode: string): string {
  return postcode.replace(/\s+/g, '').toLowerCase();
}

/**
 * Normalize a phone number for comparison.
 * Removes all non-digit characters.
 */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

// ============================================
// BATCH MATCHING FOR IMPORTS
// ============================================

export interface BatchMatchResult {
  inputIndex: number;
  input: PubInput;
  matchType: 'exact' | 'fuzzy' | 'new' | 'review';
  matchedPubId?: number;
  confidence: number;
  reasoning?: string;
  candidates?: MatchCandidate[];
}

/**
 * Process a batch of incoming pubs and categorize them for import.
 * 
 * Categories:
 * - 'exact': Obvious match, can be auto-merged (confidence >= 0.9)
 * - 'fuzzy': Possible match, needs AI verification (confidence 0.5-0.9)
 * - 'new': No matches found, create new record
 * - 'review': Multiple possible matches, needs human review
 * 
 * @param pubs - Array of incoming pub data
 * @param workspaceId - Tenant workspace ID
 * @returns Array of match results with categorization
 */
export async function batchFindMatches(
  pubs: PubInput[],
  workspaceId: number
): Promise<BatchMatchResult[]> {
  const results: BatchMatchResult[] = [];
  
  for (let i = 0; i < pubs.length; i++) {
    const pub = pubs[i];
    
    try {
      const candidates = await findPotentialMatches(pub, workspaceId);
      
      if (candidates.length === 0) {
        // No matches - this is a new pub
        results.push({
          inputIndex: i,
          input: pub,
          matchType: 'new',
          confidence: 1.0,
          reasoning: 'No similar pubs found in database',
        });
      } else if (candidates.length === 1 && candidates[0].similarity >= 0.9) {
        // Single high-confidence match - obvious match
        results.push({
          inputIndex: i,
          input: pub,
          matchType: 'exact',
          matchedPubId: candidates[0].id,
          confidence: candidates[0].similarity,
          reasoning: `High similarity match (${(candidates[0].similarity * 100).toFixed(1)}%)`,
          candidates,
        });
      } else if (candidates[0].similarity >= 0.5) {
        // Possible match - needs AI or human review
        if (candidates.length > 1 && candidates[1].similarity >= 0.5) {
          // Multiple possible matches - needs human review
          results.push({
            inputIndex: i,
            input: pub,
            matchType: 'review',
            confidence: candidates[0].similarity,
            reasoning: `Multiple possible matches found (${candidates.length} candidates)`,
            candidates,
          });
        } else {
          // Single fuzzy match - can try AI verification
          results.push({
            inputIndex: i,
            input: pub,
            matchType: 'fuzzy',
            matchedPubId: candidates[0].id,
            confidence: candidates[0].similarity,
            reasoning: `Possible match found (${(candidates[0].similarity * 100).toFixed(1)}%)`,
            candidates,
          });
        }
      } else {
        // Low similarity - treat as new
        results.push({
          inputIndex: i,
          input: pub,
          matchType: 'new',
          confidence: 1.0,
          reasoning: 'No sufficiently similar pubs found',
          candidates,
        });
      }
    } catch (error) {
      console.error(`[matching] Error processing pub at index ${i}:`, error);
      results.push({
        inputIndex: i,
        input: pub,
        matchType: 'review',
        confidence: 0,
        reasoning: `Error during matching: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }
  
  return results;
}

// ============================================
// AI-POWERED ENTITY MATCHING (Claude API)
// ============================================

/**
 * Claude API response format for pub matching.
 */
interface ClaudeMatchResponse {
  match_index: number | null;
  confidence: number;
  reasoning: string;
}

/**
 * Use Claude AI to determine if a new pub matches any existing candidates.
 * 
 * This function is called when pg_trgm returns fuzzy matches that aren't
 * confident enough for automatic merging. Claude analyzes the data and
 * makes a decision based on UK pub naming conventions and postcode specificity.
 * 
 * @param newPub - The incoming pub data to match
 * @param candidates - Array of potential matches from the database
 * @returns MatchDecision with the result and reasoning
 */
export async function askClaudeToMatch(
  newPub: PubInput,
  candidates: MatchCandidate[]
): Promise<MatchDecision> {
  // Check for API key first
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[matching] ANTHROPIC_API_KEY not set, falling back to best candidate");
    return fallbackTobestCandidate(candidates);
  }

  if (candidates.length === 0) {
    return {
      isNew: true,
      confidence: 1.0,
      reasoning: "No candidates provided for matching",
    };
  }

  try {
    const client = getAnthropicClient();
    
    const prompt = buildPubMatchingPrompt(newPub, candidates);
    
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    // Extract text content from response
    const textContent = response.content.find(c => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text response from Claude");
    }

    // Parse JSON response
    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in Claude response");
    }

    const parsed: ClaudeMatchResponse = JSON.parse(jsonMatch[0]);

    // Validate response
    if (typeof parsed.confidence !== "number" || parsed.confidence < 0 || parsed.confidence > 1) {
      throw new Error("Invalid confidence score in response");
    }

    // Build result
    if (parsed.match_index !== null && parsed.match_index >= 0 && parsed.match_index < candidates.length) {
      return {
        match: candidates[parsed.match_index],
        confidence: parsed.confidence,
        reasoning: parsed.reasoning || "Match found by AI analysis",
        isNew: false,
      };
    } else {
      return {
        isNew: true,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning || "No match found by AI analysis",
      };
    }
  } catch (error) {
    console.error("[matching] Error calling Claude for pub matching:", error);
    // Fall back to best candidate if Claude fails
    return fallbackTobestCandidate(candidates);
  }
}

/**
 * Build the prompt for Claude to analyze pub matches.
 */
function buildPubMatchingPrompt(newPub: PubInput, candidates: MatchCandidate[]): string {
  const candidateList = candidates
    .map((c, i) => {
      const parts = [
        `[${i}] "${c.name}"`,
        c.postcode ? `Postcode: ${c.postcode}` : null,
        c.addressLine1 ? `Address: ${c.addressLine1}` : null,
        c.city ? `City: ${c.city}` : null,
        c.phone ? `Phone: ${c.phone}` : null,
        c.isCustomer ? "(Existing customer)" : null,
      ].filter(Boolean);
      return parts.join(", ");
    })
    .join("\n");

  return `You are an expert at matching UK pub records to avoid duplicates in a database.

## Task
Determine if the NEW PUB below matches any of the EXISTING PUBS in our database.

## NEW PUB (from spreadsheet/import)
Name: "${newPub.name}"
${newPub.postcode ? `Postcode: ${newPub.postcode}` : "Postcode: (not provided)"}
${newPub.address ? `Address: ${newPub.address}` : ""}
${newPub.phone ? `Phone: ${newPub.phone}` : ""}

## EXISTING PUBS (candidates from database)
${candidateList}

## Important Context

### UK Postcodes
UK postcodes are VERY specific - they typically identify just a few buildings. Two pubs at the same postcode are almost certainly the same pub. Example: "SW1A 1AA" is Buckingham Palace's postcode.

### Pub Naming Conventions
UK pub names often vary in these ways:
- "The Red Lion" vs "Red Lion" (article dropped)
- "The Red Lion Inn" vs "The Red Lion" (suffix dropped)
- "The Red Lion Pub" vs "Red Lion" 
- "Ye Olde Red Lion" vs "The Old Red Lion"
- Common suffixes: Inn, Tavern, Hotel, Arms, Head, House

These variations usually indicate the SAME pub.

### Decision Rules
1. Same postcode + similar name = DEFINITE MATCH (even with name variations)
2. Same phone number = STRONG indicator of match
3. Different postcodes = Usually different pubs (even if similar names)
4. Similar name but no postcode data = UNCERTAIN, lean toward creating new record

## Your Response
Respond with ONLY a JSON object (no markdown, no explanation outside JSON):

{
  "match_index": <index number 0-${candidates.length - 1} if match found, or null if no match>,
  "confidence": <0.0 to 1.0>,
  "reasoning": "<brief explanation of your decision>"
}`;
}

/**
 * Fallback when Claude is unavailable - use the best candidate if confidence is high enough.
 */
function fallbackTobestCandidate(candidates: MatchCandidate[]): MatchDecision {
  if (candidates.length === 0) {
    return {
      isNew: true,
      confidence: 1.0,
      reasoning: "No candidates available",
    };
  }

  const best = candidates[0];
  
  // Only auto-match if similarity is very high
  if (best.similarity >= 0.85) {
    return {
      match: best,
      confidence: best.similarity,
      reasoning: `Fallback: High similarity match (${(best.similarity * 100).toFixed(1)}%) - Claude unavailable`,
      isNew: false,
    };
  }

  return {
    isNew: true,
    confidence: 0.5,
    reasoning: `Fallback: Best candidate similarity too low (${(best.similarity * 100).toFixed(1)}%) - Claude unavailable`,
  };
}

// ============================================
// AI-POWERED EVENT MATCHING (Claude API)
// ============================================

/**
 * Claude API response format for event matching.
 */
interface ClaudeEventMatchResponse {
  match_index: number | null;
  confidence: number;
  reasoning: string;
  is_recurring_instance: boolean;
}

/**
 * Result from AI-powered event matching.
 */
export interface EventMatchDecision {
  /** The matched event from the database, if a match was found */
  match?: EventCandidate;
  /** Confidence score 0-1 */
  confidence: number;
  /** AI explanation for the match decision */
  reasoning: string;
  /** True if this should be created as a new event */
  isNew: boolean;
  /** True if this is a new instance of a recurring event */
  isRecurringInstance: boolean;
}

/**
 * Use Claude AI to determine if a new event matches any existing candidates.
 * 
 * Handles tricky cases like:
 * - Same event name but different years (different events)
 * - Same event at same date (duplicate)
 * - Recurring events (beer festivals, markets)
 * 
 * @param newEvent - The incoming event data to match
 * @param candidates - Array of potential matches from the database
 * @returns EventMatchDecision with the result and reasoning
 */
export async function askClaudeToMatchEvent(
  newEvent: EventInput,
  candidates: EventCandidate[]
): Promise<EventMatchDecision> {
  // Check for API key first
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[matching] ANTHROPIC_API_KEY not set, cannot match events");
    return {
      isNew: true,
      confidence: 0.5,
      reasoning: "Claude API unavailable for event matching",
      isRecurringInstance: false,
    };
  }

  if (candidates.length === 0) {
    return {
      isNew: true,
      confidence: 1.0,
      reasoning: "No candidates provided for matching",
      isRecurringInstance: false,
    };
  }

  try {
    const client = getAnthropicClient();
    
    const prompt = buildEventMatchingPrompt(newEvent, candidates);
    
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    // Extract text content from response
    const textContent = response.content.find(c => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text response from Claude");
    }

    // Parse JSON response
    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in Claude response");
    }

    const parsed: ClaudeEventMatchResponse = JSON.parse(jsonMatch[0]);

    // Validate response
    if (typeof parsed.confidence !== "number" || parsed.confidence < 0 || parsed.confidence > 1) {
      throw new Error("Invalid confidence score in response");
    }

    // Build result
    if (parsed.match_index !== null && parsed.match_index >= 0 && parsed.match_index < candidates.length) {
      return {
        match: candidates[parsed.match_index],
        confidence: parsed.confidence,
        reasoning: parsed.reasoning || "Match found by AI analysis",
        isNew: false,
        isRecurringInstance: parsed.is_recurring_instance || false,
      };
    } else {
      return {
        isNew: true,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning || "No match found by AI analysis",
        isRecurringInstance: parsed.is_recurring_instance || false,
      };
    }
  } catch (error) {
    console.error("[matching] Error calling Claude for event matching:", error);
    return {
      isNew: true,
      confidence: 0.5,
      reasoning: `Error during AI matching: ${error instanceof Error ? error.message : "Unknown error"}`,
      isRecurringInstance: false,
    };
  }
}

/**
 * Build the prompt for Claude to analyze event matches.
 */
function buildEventMatchingPrompt(newEvent: EventInput, candidates: EventCandidate[]): string {
  const candidateList = candidates
    .map((c, i) => {
      const parts = [
        `[${i}] "${c.name}"`,
        c.startDate ? `Date: ${c.startDate}${c.endDate ? ` to ${c.endDate}` : ""}` : null,
        c.location ? `Location: ${c.location}` : null,
        c.postcode ? `Postcode: ${c.postcode}` : null,
        c.organizer ? `Organizer: ${c.organizer}` : null,
        c.isRecurring ? "(Recurring event)" : null,
      ].filter(Boolean);
      return parts.join(", ");
    })
    .join("\n");

  return `You are an expert at matching UK event records to avoid duplicates in a database.

## Task
Determine if the NEW EVENT below matches any of the EXISTING EVENTS in our database.

## NEW EVENT (from discovery/import)
Name: "${newEvent.name}"
${newEvent.date ? `Date: ${newEvent.date}${newEvent.endDate ? ` to ${newEvent.endDate}` : ""}` : "Date: (not provided)"}
${newEvent.location ? `Location: ${newEvent.location}` : ""}
${newEvent.postcode ? `Postcode: ${newEvent.postcode}` : ""}
${newEvent.organizer ? `Organizer: ${newEvent.organizer}` : ""}
${newEvent.description ? `Description: ${newEvent.description.substring(0, 200)}...` : ""}

## EXISTING EVENTS (candidates from database)
${candidateList}

## Important Context

### Event Types
Common event types in the UK pub/brewery industry:
- Beer festivals (often annual, same name different year = DIFFERENT event)
- Markets (weekly/monthly, recurring)
- Music nights (often weekly, recurring)
- Food events
- Pub quizzes (weekly, recurring)

### Matching Rules
1. SAME event name + SAME date = DUPLICATE (match it!)
2. SAME event name + DIFFERENT year = NEW EVENT (e.g., "Leeds Beer Festival 2024" vs "Leeds Beer Festival 2025")
3. Recurring events at different dates = NEW INSTANCE (mark as recurring)
4. Similar name but different location = Usually DIFFERENT events
5. Same location + similar date range = Likely SAME event

### Recurring Events
If an event appears to be a recurring instance of an existing event series (e.g., weekly market, annual festival), indicate this with is_recurring_instance: true. This helps us track the event series while creating separate records for each occurrence.

## Your Response
Respond with ONLY a JSON object (no markdown, no explanation outside JSON):

{
  "match_index": <index number 0-${candidates.length - 1} if exact duplicate found, or null if new/different event>,
  "confidence": <0.0 to 1.0>,
  "reasoning": "<brief explanation of your decision>",
  "is_recurring_instance": <true if this is a new occurrence of a recurring event series, false otherwise>
}`;
}

// ============================================
// ENTITY RESOLUTION ORCHESTRATOR
// ============================================

/**
 * Source type for tracking where pub data came from.
 */
export type EntitySource = 'spreadsheet' | 'xero' | 'google_places' | 'manual' | 'api';

/**
 * Main entity resolution orchestrator.
 * 
 * Coordinates the full matching pipeline:
 * 1. Fast SQL pre-filter using pg_trgm (findPotentialMatches)
 * 2. Check for obvious matches (exact postcode + high name similarity)
 * 3. If uncertain, use Claude AI for intelligent matching
 * 
 * @param newPub - The incoming pub data to match
 * @param source - Where this pub data came from (for logging/audit)
 * @param workspaceId - Tenant workspace ID for isolation
 * @returns MatchDecision with the result, confidence, and reasoning
 */
export async function findMatchingEntity(
  newPub: PubInput,
  source: EntitySource,
  workspaceId: number
): Promise<MatchDecision> {
  const startTime = Date.now();
  const logPrefix = `[matching:${source}]`;

  try {
    // Validate input
    if (!newPub.name || newPub.name.trim().length === 0) {
      console.warn(`${logPrefix} Empty pub name provided`);
      return {
        isNew: true,
        confidence: 0,
        reasoning: "Invalid input: pub name is required",
      };
    }

    console.log(`${logPrefix} Finding match for "${newPub.name}" (postcode: ${newPub.postcode || "none"})`);

    // Step 1: Fast SQL pre-filter using pg_trgm
    let candidates: MatchCandidate[];
    try {
      candidates = await findPotentialMatches(newPub, workspaceId);
      console.log(`${logPrefix} SQL pre-filter found ${candidates.length} candidates`);
    } catch (error) {
      console.error(`${logPrefix} Error in SQL pre-filter:`, error);
      return {
        isNew: true,
        confidence: 0,
        reasoning: `Database error during pre-filter: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }

    // Step 2: No candidates found - definitely new
    if (candidates.length === 0) {
      const elapsed = Date.now() - startTime;
      console.log(`${logPrefix} No candidates found, creating new entity (${elapsed}ms)`);
      return {
        isNew: true,
        confidence: 1.0,
        reasoning: "No similar pubs found in database",
      };
    }

    // Step 3: Check for obvious match (single high-confidence candidate)
    if (candidates.length === 1) {
      const candidate = candidates[0];
      
      try {
        // Convert candidate to PubInput for comparison
        const candidatePub: PubInput = {
          name: candidate.name,
          postcode: candidate.postcode,
          phone: candidate.phone,
        };

        const obvious = await isObviousMatch(newPub, candidatePub);
        
        if (obvious) {
          const elapsed = Date.now() - startTime;
          console.log(`${logPrefix} Obvious match found: "${candidate.name}" (id: ${candidate.id}, ${elapsed}ms)`);
          return {
            match: candidate,
            confidence: 1.0,
            reasoning: `Obvious match: same postcode and very similar name`,
            isNew: false,
          };
        }
      } catch (error) {
        console.error(`${logPrefix} Error checking obvious match:`, error);
        // Continue to AI matching if obvious match check fails
      }
    }

    // Step 4: Multiple candidates or uncertain - use Claude AI
    console.log(`${logPrefix} Using Claude AI to resolve ${candidates.length} candidate(s)`);
    
    let decision: MatchDecision;
    try {
      decision = await askClaudeToMatch(newPub, candidates);
    } catch (error) {
      console.error(`${logPrefix} Error in Claude matching:`, error);
      // Fall back to best candidate with reduced confidence
      decision = fallbackTobestCandidate(candidates);
    }

    const elapsed = Date.now() - startTime;
    if (decision.isNew) {
      console.log(`${logPrefix} AI decided: NEW entity (confidence: ${decision.confidence.toFixed(2)}, ${elapsed}ms)`);
    } else {
      console.log(`${logPrefix} AI decided: MATCH to "${decision.match?.name}" (id: ${decision.match?.id}, confidence: ${decision.confidence.toFixed(2)}, ${elapsed}ms)`);
    }

    return decision;

  } catch (error) {
    console.error(`${logPrefix} Unexpected error in findMatchingEntity:`, error);
    return {
      isNew: true,
      confidence: 0,
      reasoning: `Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

// ============================================
// CACHING LAYER
// ============================================

/**
 * In-memory cache for match decisions.
 * Key: normalized name + postcode
 * Value: MatchDecision from previous lookup
 */
const matchCache = new Map<string, MatchDecision>();

/**
 * Cache statistics for monitoring.
 */
let cacheStats = {
  hits: 0,
  misses: 0,
};

/**
 * Generate a cache key from pub data.
 * 
 * Normalizes the name and postcode to create a consistent key
 * that will match equivalent pubs.
 * 
 * @param pub - The pub data to generate a key for
 * @returns Normalized cache key string
 */
export function getCacheKey(pub: PubInput): string {
  // Normalize name: lowercase, trim, remove leading "The"/"Ye"
  let normalizedName = (pub.name || "")
    .toLowerCase()
    .trim()
    .replace(/^(the|ye|ye olde)\s+/i, "")
    .replace(/\s+/g, " ");

  // Normalize postcode: uppercase, remove all spaces
  let normalizedPostcode = (pub.postcode || "")
    .toUpperCase()
    .replace(/\s+/g, "");

  // Combine into cache key
  // Format: "name|postcode" or just "name|" if no postcode
  return `${normalizedName}|${normalizedPostcode}`;
}

/**
 * Entity resolution with caching layer.
 * 
 * Wraps findMatchingEntity with an in-memory cache to avoid
 * redundant database queries and AI calls for duplicate inputs.
 * 
 * Cache is useful when processing spreadsheets that may contain
 * the same pub listed multiple times.
 * 
 * @param newPub - The incoming pub data to match
 * @param source - Where this pub data came from
 * @param workspaceId - Tenant workspace ID for isolation
 * @returns MatchDecision (from cache or fresh lookup)
 */
export async function findMatchingEntityCached(
  newPub: PubInput,
  source: EntitySource,
  workspaceId: number
): Promise<MatchDecision> {
  // Generate cache key
  const cacheKey = getCacheKey(newPub);

  // Check cache first
  const cached = matchCache.get(cacheKey);
  if (cached) {
    cacheStats.hits++;
    console.log(`[matching:cache] HIT for "${newPub.name}" (key: ${cacheKey.substring(0, 30)}...)`);
    return cached;
  }

  // Cache miss - perform actual lookup
  cacheStats.misses++;
  console.log(`[matching:cache] MISS for "${newPub.name}" (key: ${cacheKey.substring(0, 30)}...)`);

  const decision = await findMatchingEntity(newPub, source, workspaceId);

  // Store in cache
  matchCache.set(cacheKey, decision);

  return decision;
}

/**
 * Clear the match cache.
 * Call this between import batches or when workspace data changes.
 */
export function clearMatchCache(): void {
  const size = matchCache.size;
  matchCache.clear();
  console.log(`[matching:cache] Cleared ${size} cached entries`);
}

/**
 * Get cache statistics for monitoring.
 */
export function getMatchCacheStats(): { hits: number; misses: number; size: number; hitRate: string } {
  const total = cacheStats.hits + cacheStats.misses;
  const hitRate = total > 0 ? ((cacheStats.hits / total) * 100).toFixed(1) + "%" : "N/A";
  
  return {
    hits: cacheStats.hits,
    misses: cacheStats.misses,
    size: matchCache.size,
    hitRate,
  };
}

/**
 * Reset cache statistics.
 */
export function resetMatchCacheStats(): void {
  cacheStats = { hits: 0, misses: 0 };
}

// ============================================
// CONFIDENCE-BASED DECISION HANDLERS
// ============================================

/**
 * Result from handleMatchDecision.
 */
export interface MatchActionResult {
  /** Action taken: 'matched', 'created', or 'review' */
  action: 'matched' | 'created' | 'review';
  /** ID of the pub (existing or newly created) */
  pubId?: number;
  /** ID of the review queue item (if queued for review) */
  reviewId?: number;
  /** Description of what happened */
  message: string;
}

/**
 * Review queue item data for flagForManualReview.
 */
export interface ReviewQueueData {
  workspaceId: number;
  newPubData: PubInput;
  sourceType: EntitySource;
  sourceId?: string;
  possibleMatchPubId?: number;
  confidence: number;
  reasoning: string;
}

/**
 * Handle a match decision based on confidence thresholds.
 * 
 * Decision logic:
 * - Confidence >= 0.9: Auto-match (update existing pub, create source link)
 * - Confidence >= 0.7: Queue for human review
 * - Confidence < 0.7: Create as new entity
 * 
 * @param newPub - The incoming pub data
 * @param decision - MatchDecision from AI or rule-based matching
 * @param sourceType - Where this pub data came from
 * @param sourceId - ID in the source system (e.g., Xero ContactID)
 * @param workspaceId - Tenant workspace ID
 * @returns MatchActionResult describing what action was taken
 */
export async function handleMatchDecision(
  newPub: PubInput,
  decision: MatchDecision,
  sourceType: EntitySource,
  sourceId: string | undefined,
  workspaceId: number
): Promise<MatchActionResult> {
  const db = getDrizzleDb();
  const logPrefix = `[matching:handler]`;

  try {
    // Case 1: Decision says it's a new entity
    if (decision.isNew) {
      // Create new pub in pubs_master
      const newPubRecord = await createNewPub(newPub, sourceType, workspaceId);
      
      // Create entity_source link
      await createEntitySourceLink(
        newPubRecord.id,
        workspaceId,
        sourceType,
        sourceId,
        newPub,
        1.0, // New entity has full confidence
        "exact_match",
        "Created as new entity"
      );

      console.log(`${logPrefix} Created new pub: "${newPub.name}" (id: ${newPubRecord.id})`);
      
      return {
        action: 'created',
        pubId: newPubRecord.id,
        message: `Created new pub "${newPub.name}"`,
      };
    }

    // Case 2: High confidence match (>= 0.9) - auto-merge
    if (decision.confidence >= CONFIDENCE_THRESHOLDS.AUTO_MATCH && decision.match) {
      const existingPubId = decision.match.id;

      // Update existing pub with any new data
      await updateExistingPub(existingPubId, newPub);

      // Create entity_source link
      await createEntitySourceLink(
        existingPubId,
        workspaceId,
        sourceType,
        sourceId,
        newPub,
        decision.confidence,
        "ai",
        decision.reasoning
      );

      console.log(`${logPrefix} Matched to existing pub: "${decision.match.name}" (id: ${existingPubId}, confidence: ${decision.confidence.toFixed(2)})`);
      
      return {
        action: 'matched',
        pubId: existingPubId,
        message: `Matched to existing pub "${decision.match.name}" (${(decision.confidence * 100).toFixed(0)}% confidence)`,
      };
    }

    // Case 3: Medium confidence (>= 0.7) - queue for human review
    if (decision.confidence >= CONFIDENCE_THRESHOLDS.MANUAL_REVIEW && decision.match) {
      const reviewId = await flagForManualReview({
        workspaceId,
        newPubData: newPub,
        sourceType,
        sourceId,
        possibleMatchPubId: decision.match.id,
        confidence: decision.confidence,
        reasoning: decision.reasoning,
      });

      console.log(`${logPrefix} Queued for review: "${newPub.name}" vs "${decision.match.name}" (reviewId: ${reviewId}, confidence: ${decision.confidence.toFixed(2)})`);
      
      return {
        action: 'review',
        reviewId,
        message: `Queued for manual review - possible match to "${decision.match.name}" (${(decision.confidence * 100).toFixed(0)}% confidence)`,
      };
    }

    // Case 4: Low confidence (< 0.7) - create as new entity
    const newPubRecord = await createNewPub(newPub, sourceType, workspaceId);
    
    // Create entity_source link
    await createEntitySourceLink(
      newPubRecord.id,
      workspaceId,
      sourceType,
      sourceId,
      newPub,
      1.0,
      "fuzzy",
      `Created as new entity (best match confidence: ${decision.confidence.toFixed(2)} was below threshold)`
    );

    console.log(`${logPrefix} Created new pub (low confidence match rejected): "${newPub.name}" (id: ${newPubRecord.id})`);
    
    return {
      action: 'created',
      pubId: newPubRecord.id,
      message: `Created new pub "${newPub.name}" (no confident match found)`,
    };

  } catch (error) {
    console.error(`${logPrefix} Error handling match decision:`, error);
    throw error;
  }
}

/**
 * Create a new pub in pubs_master.
 */
async function createNewPub(
  pub: PubInput,
  discoveredBy: EntitySource,
  workspaceId: number
): Promise<SelectPubsMaster> {
  const db = getDrizzleDb();

  const insertData: InsertPubsMaster = {
    workspaceId,
    name: pub.name,
    postcode: pub.postcode || null,
    phone: pub.phone || null,
    addressLine1: pub.address || null,
    discoveredBy,
    discoveredAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const [newPub] = await db.insert(pubsMaster).values(insertData).returning();
  
  return newPub;
}

/**
 * Update an existing pub with new data (non-destructive merge).
 * Only updates fields if the new value is provided and existing is empty.
 */
async function updateExistingPub(
  pubId: number,
  newData: PubInput
): Promise<void> {
  const db = getDrizzleDb();

  // Get existing pub
  const [existing] = await db.select().from(pubsMaster).where(eq(pubsMaster.id, pubId));
  
  if (!existing) {
    throw new Error(`Pub with id ${pubId} not found`);
  }

  // Build update object - only update empty fields
  const updates: Partial<InsertPubsMaster> = {
    updatedAt: new Date(),
  };

  // Non-destructive merge: only fill in missing data
  if (newData.phone && !existing.phone) {
    updates.phone = newData.phone;
  }
  if (newData.address && !existing.addressLine1) {
    updates.addressLine1 = newData.address;
  }
  if (newData.postcode && !existing.postcode) {
    updates.postcode = newData.postcode;
  }

  await db.update(pubsMaster).set(updates).where(eq(pubsMaster.id, pubId));
}

/**
 * Create an entity_source link between a pub and its source data.
 */
async function createEntitySourceLink(
  pubId: number,
  workspaceId: number,
  sourceType: EntitySource,
  sourceId: string | undefined,
  sourceData: PubInput,
  confidence: number,
  matchedBy: string,
  reasoning: string
): Promise<void> {
  const db = getDrizzleDb();

  const insertData: InsertEntitySource = {
    pubId,
    workspaceId,
    sourceType,
    sourceId: sourceId || null,
    sourceData,
    confidence,
    matchedAt: new Date(),
    matchedBy,
    matchedReasoning: reasoning,
    createdAt: new Date(),
  };

  await db.insert(entitySources).values(insertData);
}

/**
 * Flag an uncertain match for manual human review.
 * 
 * Inserts into entity_review_queue table with:
 * - New pub data (JSONB)
 * - Possible match pub ID
 * - Confidence score
 * - AI reasoning
 * 
 * @param reviewData - Data for the review queue item
 * @returns The ID of the created review queue item
 */
export async function flagForManualReview(
  reviewData: ReviewQueueData
): Promise<number> {
  const db = getDrizzleDb();
  const logPrefix = `[matching:review]`;

  try {
    const insertData: InsertEntityReviewQueue = {
      workspaceId: reviewData.workspaceId,
      newPubData: reviewData.newPubData,
      sourceType: reviewData.sourceType,
      sourceId: reviewData.sourceId || null,
      possibleMatchPubId: reviewData.possibleMatchPubId || null,
      confidence: reviewData.confidence,
      reasoning: reviewData.reasoning,
      status: 'pending',
      createdAt: new Date(),
    };

    const [result] = await db.insert(entityReviewQueue).values(insertData).returning();

    console.log(`${logPrefix} Created review queue item: id=${result.id}, confidence=${reviewData.confidence.toFixed(2)}`);
    
    return result.id;

  } catch (error) {
    console.error(`${logPrefix} Error creating review queue item:`, error);
    throw error;
  }
}

/**
 * Get pending review queue items for a workspace.
 */
export async function getPendingReviews(workspaceId: number): Promise<Array<{
  id: number;
  newPubData: PubInput;
  possibleMatchPubId: number | null;
  confidence: number;
  reasoning: string | null;
  createdAt: Date | null;
}>> {
  const db = getDrizzleDb();

  const results = await db.select({
    id: entityReviewQueue.id,
    newPubData: entityReviewQueue.newPubData,
    possibleMatchPubId: entityReviewQueue.possibleMatchPubId,
    confidence: entityReviewQueue.confidence,
    reasoning: entityReviewQueue.reasoning,
    createdAt: entityReviewQueue.createdAt,
  })
    .from(entityReviewQueue)
    .where(eq(entityReviewQueue.workspaceId, workspaceId));

  return results.map(r => ({
    id: r.id,
    newPubData: r.newPubData as PubInput,
    possibleMatchPubId: r.possibleMatchPubId,
    confidence: r.confidence,
    reasoning: r.reasoning,
    createdAt: r.createdAt,
  }));
}

/**
 * Resolve a review queue item after human decision.
 * 
 * @param reviewId - ID of the review queue item
 * @param decision - 'match' to merge with suggested pub, 'new' to create new, 'skip' to discard
 * @param reviewedBy - User ID who made the decision
 */
export async function resolveReview(
  reviewId: number,
  decision: 'match' | 'new' | 'skip',
  reviewedBy: number
): Promise<void> {
  const db = getDrizzleDb();

  await db.update(entityReviewQueue)
    .set({
      status: 'resolved',
      reviewedBy,
      reviewedAt: new Date(),
      reviewDecision: decision,
    })
    .where(eq(entityReviewQueue.id, reviewId));
}

// ============================================
// ENTITY LOOKUP METHODS
// ============================================

/**
 * Get a pub by its Xero Contact ID.
 * 
 * Queries pubs_master via entity_sources table to find pubs
 * that were linked from Xero.
 * 
 * @param xeroContactId - The Xero ContactID
 * @param workspaceId - Tenant workspace ID
 * @returns The pub record or null if not found
 */
export async function getPubByXeroContactId(
  xeroContactId: string,
  workspaceId: number
): Promise<SelectPubsMaster | null> {
  const db = getDrizzleDb();
  const logPrefix = `[matching:lookup]`;

  try {
    // Query entity_sources to find the pub ID, then join to get full pub details
    const results = await db
      .select({
        pub: pubsMaster,
      })
      .from(entitySources)
      .innerJoin(pubsMaster, eq(entitySources.pubId, pubsMaster.id))
      .where(
        and(
          eq(entitySources.sourceType, 'xero'),
          eq(entitySources.sourceId, xeroContactId),
          eq(entitySources.workspaceId, workspaceId)
        )
      )
      .limit(1);

    if (results.length === 0) {
      console.log(`${logPrefix} No pub found for Xero contact: ${xeroContactId}`);
      return null;
    }

    console.log(`${logPrefix} Found pub for Xero contact ${xeroContactId}: "${results[0].pub.name}" (id: ${results[0].pub.id})`);
    return results[0].pub;

  } catch (error) {
    console.error(`${logPrefix} Error looking up pub by Xero contact ID:`, error);
    throw error;
  }
}

/**
 * Get a pub by its Google Place ID.
 * 
 * Queries pubs_master via entity_sources table to find pubs
 * that were discovered from Google Places.
 * 
 * @param placeId - The Google Places place_id
 * @param workspaceId - Tenant workspace ID
 * @returns The pub record or null if not found
 */
export async function getPubByGooglePlaceId(
  placeId: string,
  workspaceId: number
): Promise<SelectPubsMaster | null> {
  const db = getDrizzleDb();
  const logPrefix = `[matching:lookup]`;

  try {
    const results = await db
      .select({
        pub: pubsMaster,
      })
      .from(entitySources)
      .innerJoin(pubsMaster, eq(entitySources.pubId, pubsMaster.id))
      .where(
        and(
          eq(entitySources.sourceType, 'google_places'),
          eq(entitySources.sourceId, placeId),
          eq(entitySources.workspaceId, workspaceId)
        )
      )
      .limit(1);

    if (results.length === 0) {
      console.log(`${logPrefix} No pub found for Google Place ID: ${placeId}`);
      return null;
    }

    console.log(`${logPrefix} Found pub for Google Place ${placeId}: "${results[0].pub.name}" (id: ${results[0].pub.id})`);
    return results[0].pub;

  } catch (error) {
    console.error(`${logPrefix} Error looking up pub by Google Place ID:`, error);
    throw error;
  }
}

/**
 * Get all pubs at a specific postcode.
 * 
 * @param postcode - UK postcode to search for
 * @param workspaceId - Tenant workspace ID
 * @returns Array of pubs at that postcode
 */
export async function getPubsByPostcode(
  postcode: string,
  workspaceId: number
): Promise<SelectPubsMaster[]> {
  const db = getDrizzleDb();
  const logPrefix = `[matching:lookup]`;

  try {
    // Normalize postcode for comparison (remove spaces, lowercase)
    const normalizedPostcode = postcode.replace(/\s+/g, '').toLowerCase();

    const results = await db
      .select()
      .from(pubsMaster)
      .where(
        and(
          eq(pubsMaster.workspaceId, workspaceId),
          sql`REPLACE(LOWER(${pubsMaster.postcode}), ' ', '') = ${normalizedPostcode}`
        )
      );

    console.log(`${logPrefix} Found ${results.length} pubs at postcode ${postcode}`);
    return results;

  } catch (error) {
    console.error(`${logPrefix} Error looking up pubs by postcode:`, error);
    throw error;
  }
}

/**
 * Search result with relevance score.
 */
export interface PubSearchResult extends SelectPubsMaster {
  /** Relevance score (higher = more relevant) */
  relevance: number;
  /** Match type: 'fts' for full-text, 'trgm' for trigram similarity */
  matchType: 'fts' | 'trgm' | 'combined';
}

/**
 * Search pubs using full-text search and trigram similarity.
 * 
 * Combines results from:
 * 1. Full-text search on search_vector column (if populated)
 * 2. pg_trgm similarity on name column
 * 
 * Results are deduplicated and ordered by relevance.
 * 
 * @param query - Search query string
 * @param workspaceId - Tenant workspace ID
 * @param limit - Maximum number of results (default: 50)
 * @returns Array of pubs with relevance scores
 */
export async function searchPubs(
  query: string,
  workspaceId: number,
  limit: number = 50
): Promise<PubSearchResult[]> {
  const sqlDb = getDb(); // Use neon for raw SQL
  const logPrefix = `[matching:search]`;

  if (!query || query.trim().length === 0) {
    return [];
  }

  const normalizedQuery = query.trim().toLowerCase();
  const minSimilarity = 0.2;

  try {
    console.log(`${logPrefix} Searching for "${query}" in workspace ${workspaceId}`);

    // Combined search using both full-text search and trigram similarity
    // This query:
    // 1. Uses ts_rank for full-text search relevance
    // 2. Uses similarity() for trigram matching
    // 3. Combines scores and deduplicates
    const results = await sqlDb`
      WITH fts_results AS (
        -- Full-text search results (if search_vector is populated)
        SELECT 
          id, name, postcode, phone, address_line_1, address_line_2, city, country,
          latitude, longitude, is_freehouse, pub_company, is_customer, is_closed,
          last_contacted_at, last_order_at, total_orders, customer_since,
          lead_score, lead_priority, data_quality_score, last_verified_at,
          discovered_by, discovered_at, created_at, updated_at, workspace_id,
          ts_rank(search_vector, plainto_tsquery('english', ${normalizedQuery})) as fts_score,
          0::float as trgm_score,
          'fts' as match_type
        FROM pubs_master
        WHERE workspace_id = ${workspaceId}
          AND search_vector IS NOT NULL
          AND search_vector @@ plainto_tsquery('english', ${normalizedQuery})
      ),
      trgm_results AS (
        -- Trigram similarity results
        SELECT 
          id, name, postcode, phone, address_line_1, address_line_2, city, country,
          latitude, longitude, is_freehouse, pub_company, is_customer, is_closed,
          last_contacted_at, last_order_at, total_orders, customer_since,
          lead_score, lead_priority, data_quality_score, last_verified_at,
          discovered_by, discovered_at, created_at, updated_at, workspace_id,
          0::float as fts_score,
          similarity(lower(name), ${normalizedQuery}) as trgm_score,
          'trgm' as match_type
        FROM pubs_master
        WHERE workspace_id = ${workspaceId}
          AND similarity(lower(name), ${normalizedQuery}) > ${minSimilarity}
      ),
      combined AS (
        -- Combine and deduplicate, keeping best scores
        SELECT DISTINCT ON (id)
          id, name, postcode, phone, address_line_1, address_line_2, city, country,
          latitude, longitude, is_freehouse, pub_company, is_customer, is_closed,
          last_contacted_at, last_order_at, total_orders, customer_since,
          lead_score, lead_priority, data_quality_score, last_verified_at,
          discovered_by, discovered_at, created_at, updated_at, workspace_id,
          GREATEST(fts_score, trgm_score) as relevance,
          CASE 
            WHEN fts_score > 0 AND trgm_score > 0 THEN 'combined'
            WHEN fts_score > 0 THEN 'fts'
            ELSE 'trgm'
          END as match_type
        FROM (
          SELECT * FROM fts_results
          UNION ALL
          SELECT * FROM trgm_results
        ) all_results
        ORDER BY id, GREATEST(fts_score, trgm_score) DESC
      )
      SELECT *
      FROM combined
      ORDER BY relevance DESC
      LIMIT ${limit}
    `;

    console.log(`${logPrefix} Found ${results.length} results for "${query}"`);

    // Map to PubSearchResult type
    return results.map(row => ({
      id: row.id,
      workspaceId: row.workspace_id,
      name: row.name,
      addressLine1: row.address_line_1,
      addressLine2: row.address_line_2,
      city: row.city,
      postcode: row.postcode,
      phone: row.phone,
      email: null, // Not in query
      country: row.country,
      latitude: row.latitude,
      longitude: row.longitude,
      isFreehouse: row.is_freehouse,
      pubCompany: row.pub_company,
      isCustomer: row.is_customer,
      isClosed: row.is_closed,
      lastContactedAt: row.last_contacted_at,
      lastOrderAt: row.last_order_at,
      totalOrders: row.total_orders,
      customerSince: row.customer_since,
      leadScore: row.lead_score,
      leadPriority: row.lead_priority,
      dataQualityScore: row.data_quality_score,
      lastVerifiedAt: row.last_verified_at,
      discoveredBy: row.discovered_by,
      discoveredAt: row.discovered_at,
      searchVector: null, // Not needed in result
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      relevance: parseFloat(row.relevance) || 0,
      matchType: row.match_type as 'fts' | 'trgm' | 'combined',
    }));

  } catch (error) {
    console.error(`${logPrefix} Error searching pubs:`, error);
    throw error;
  }
}

/**
 * Get a pub by its ID.
 * 
 * @param pubId - The pub ID
 * @param workspaceId - Tenant workspace ID (for security)
 * @returns The pub record or null if not found
 */
export async function getPubById(
  pubId: number,
  workspaceId: number
): Promise<SelectPubsMaster | null> {
  const db = getDrizzleDb();

  try {
    const results = await db
      .select()
      .from(pubsMaster)
      .where(
        and(
          eq(pubsMaster.id, pubId),
          eq(pubsMaster.workspaceId, workspaceId)
        )
      )
      .limit(1);

    return results.length > 0 ? results[0] : null;

  } catch (error) {
    console.error(`[matching:lookup] Error getting pub by ID:`, error);
    throw error;
  }
}

/**
 * Get all entity sources for a pub.
 * Shows where the pub data came from (Xero, Google, spreadsheet, etc.)
 * 
 * @param pubId - The pub ID
 * @param workspaceId - Tenant workspace ID
 * @returns Array of entity source records
 */
export async function getPubSources(
  pubId: number,
  workspaceId: number
): Promise<Array<{
  id: number;
  sourceType: string;
  sourceId: string | null;
  confidence: number;
  matchedBy: string | null;
  matchedReasoning: string | null;
  createdAt: Date | null;
}>> {
  const db = getDrizzleDb();

  try {
    const results = await db
      .select({
        id: entitySources.id,
        sourceType: entitySources.sourceType,
        sourceId: entitySources.sourceId,
        confidence: entitySources.confidence,
        matchedBy: entitySources.matchedBy,
        matchedReasoning: entitySources.matchedReasoning,
        createdAt: entitySources.createdAt,
      })
      .from(entitySources)
      .where(
        and(
          eq(entitySources.pubId, pubId),
          eq(entitySources.workspaceId, workspaceId)
        )
      )
      .orderBy(desc(entitySources.createdAt));

    return results;

  } catch (error) {
    console.error(`[matching:lookup] Error getting pub sources:`, error);
    throw error;
  }
}

/**
 * Check if a source record already exists.
 * Useful for avoiding duplicate source links during re-imports.
 * 
 * @param sourceType - Type of source (xero, google_places, etc.)
 * @param sourceId - ID in the source system
 * @param workspaceId - Tenant workspace ID
 * @returns True if source already linked to a pub
 */
export async function sourceExists(
  sourceType: EntitySource,
  sourceId: string,
  workspaceId: number
): Promise<boolean> {
  const db = getDrizzleDb();

  try {
    const results = await db
      .select({ id: entitySources.id })
      .from(entitySources)
      .where(
        and(
          eq(entitySources.sourceType, sourceType),
          eq(entitySources.sourceId, sourceId),
          eq(entitySources.workspaceId, workspaceId)
        )
      )
      .limit(1);

    return results.length > 0;

  } catch (error) {
    console.error(`[matching:lookup] Error checking source existence:`, error);
    throw error;
  }
}

// ============================================
// ENTITY SOURCE MANAGEMENT
// ============================================

/**
 * Input data for creating an entity source record.
 */
export interface CreateEntitySourceInput {
  pubId: number;
  workspaceId: number;
  sourceType: string;
  sourceId: string;
  sourceData: object;
  confidence: number;
  matchedBy?: string;
  matchedReasoning?: string;
}

/**
 * Create a new entity source record.
 * 
 * Links a pub to its original data source with confidence scores
 * and optional AI reasoning.
 * 
 * @param data - Entity source creation data
 * @returns The created entity source record with ID
 */
export async function createEntitySource(
  data: CreateEntitySourceInput
): Promise<SelectEntitySource> {
  const db = getDrizzleDb();
  const logPrefix = `[matching:source]`;

  try {
    const insertData: InsertEntitySource = {
      pubId: data.pubId,
      workspaceId: data.workspaceId,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      sourceData: data.sourceData,
      confidence: data.confidence,
      matchedAt: new Date(),
      matchedBy: data.matchedBy || null,
      matchedReasoning: data.matchedReasoning || null,
      createdAt: new Date(),
    };

    const [result] = await db.insert(entitySources).values(insertData).returning();

    console.log(`${logPrefix} Created entity source: pubId=${data.pubId}, type=${data.sourceType}, id=${result.id}`);
    
    return result;

  } catch (error) {
    console.error(`${logPrefix} Error creating entity source:`, error);
    throw error;
  }
}

/**
 * Get all entity sources for a pub.
 * 
 * Returns the complete history of where pub data came from,
 * including original source data as JSONB.
 * 
 * @param pubId - The pub ID
 * @param workspaceId - Tenant workspace ID
 * @returns Array of entity source records ordered by created_at DESC
 */
export async function getEntitySources(
  pubId: number,
  workspaceId: number
): Promise<SelectEntitySource[]> {
  const db = getDrizzleDb();
  const logPrefix = `[matching:source]`;

  try {
    const results = await db
      .select()
      .from(entitySources)
      .where(
        and(
          eq(entitySources.pubId, pubId),
          eq(entitySources.workspaceId, workspaceId)
        )
      )
      .orderBy(desc(entitySources.createdAt));

    console.log(`${logPrefix} Found ${results.length} sources for pub ${pubId}`);
    return results;

  } catch (error) {
    console.error(`${logPrefix} Error getting entity sources:`, error);
    throw error;
  }
}

// ============================================
// AGENT INTELLIGENCE MANAGEMENT
// ============================================

/**
 * Input data for creating agent intelligence records.
 */
export interface CreateAgentIntelligenceInput {
  workspaceId: number;
  entityType: string;
  entityId?: number;
  intelligenceType: string;
  observation: string;
  data?: object;
  confidence: number;
  source?: string;
  evidence?: string;
  sampleSize?: number;
  expiresAt?: Date;
}

/**
 * Create a new agent intelligence record.
 * 
 * Stores learned insights and patterns discovered by the AI agent
 * while analyzing brewery data. Creates institutional memory that
 * improves recommendations over time.
 * 
 * @param data - Agent intelligence creation data
 * @returns The created intelligence record with ID
 */
export async function createAgentIntelligence(
  data: CreateAgentIntelligenceInput
): Promise<SelectAgentIntelligence> {
  const db = getDrizzleDb();
  const logPrefix = `[matching:intelligence]`;

  try {
    const insertData: InsertAgentIntelligence = {
      workspaceId: data.workspaceId,
      entityType: data.entityType,
      entityId: data.entityId || null,
      intelligenceType: data.intelligenceType,
      observation: data.observation,
      data: data.data || null,
      confidence: data.confidence,
      source: data.source || null,
      evidence: data.evidence || null,
      sampleSize: data.sampleSize || null,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: data.expiresAt || null,
    };

    const [result] = await db.insert(agentIntelligence).values(insertData).returning();

    console.log(`${logPrefix} Created intelligence: type=${data.intelligenceType}, entity=${data.entityType}, id=${result.id}`);
    
    return result;

  } catch (error) {
    console.error(`${logPrefix} Error creating agent intelligence:`, error);
    throw error;
  }
}

/**
 * Filters for querying agent intelligence.
 */
export interface AgentIntelligenceFilters {
  entityType?: string;
  entityId?: number;
  intelligenceType?: string;
  minConfidence?: number;
  limit?: number;
}

/**
 * Get agent intelligence records with optional filters.
 * 
 * Query the AI's learned insights about pubs, events, or patterns.
 * Results are ordered by confidence DESC, then created_at DESC.
 * 
 * @param workspaceId - Tenant workspace ID
 * @param filters - Optional filters to narrow results
 * @returns Array of intelligence records
 */
export async function getAgentIntelligence(
  workspaceId: number,
  filters?: AgentIntelligenceFilters
): Promise<SelectAgentIntelligence[]> {
  const db = getDrizzleDb();
  const logPrefix = `[matching:intelligence]`;

  try {
    // Build conditions array
    const conditions = [eq(agentIntelligence.workspaceId, workspaceId)];

    if (filters?.entityType) {
      conditions.push(eq(agentIntelligence.entityType, filters.entityType));
    }

    if (filters?.entityId !== undefined) {
      conditions.push(eq(agentIntelligence.entityId, filters.entityId));
    }

    if (filters?.intelligenceType) {
      conditions.push(eq(agentIntelligence.intelligenceType, filters.intelligenceType));
    }

    if (filters?.minConfidence !== undefined) {
      conditions.push(sql`${agentIntelligence.confidence} >= ${filters.minConfidence}`);
    }

    // Exclude expired records
    conditions.push(
      or(
        sql`${agentIntelligence.expiresAt} IS NULL`,
        sql`${agentIntelligence.expiresAt} > NOW()`
      )!
    );

    const limit = filters?.limit || 100;

    const results = await db
      .select()
      .from(agentIntelligence)
      .where(and(...conditions))
      .orderBy(desc(agentIntelligence.confidence), desc(agentIntelligence.createdAt))
      .limit(limit);

    console.log(`${logPrefix} Found ${results.length} intelligence records`);
    return results;

  } catch (error) {
    console.error(`${logPrefix} Error getting agent intelligence:`, error);
    throw error;
  }
}

/**
 * Update usage tracking for an intelligence record.
 * Call this when an insight is used in a recommendation.
 * 
 * @param intelligenceId - The intelligence record ID
 */
export async function recordIntelligenceUsage(
  intelligenceId: number
): Promise<void> {
  const db = getDrizzleDb();

  try {
    await db
      .update(agentIntelligence)
      .set({
        lastUsedAt: new Date(),
        useCount: sql`COALESCE(${agentIntelligence.useCount}, 0) + 1`,
        updatedAt: new Date(),
      })
      .where(eq(agentIntelligence.id, intelligenceId));

  } catch (error) {
    console.error(`[matching:intelligence] Error recording usage:`, error);
    throw error;
  }
}

/**
 * Delete expired intelligence records.
 * Run periodically to clean up stale insights.
 * 
 * @param workspaceId - Tenant workspace ID
 * @returns Number of deleted records
 */
export async function cleanupExpiredIntelligence(
  workspaceId: number
): Promise<number> {
  const db = getDrizzleDb();
  const logPrefix = `[matching:intelligence]`;

  try {
    const result = await db
      .delete(agentIntelligence)
      .where(
        and(
          eq(agentIntelligence.workspaceId, workspaceId),
          sql`${agentIntelligence.expiresAt} IS NOT NULL`,
          sql`${agentIntelligence.expiresAt} < NOW()`
        )
      )
      .returning({ id: agentIntelligence.id });

    console.log(`${logPrefix} Cleaned up ${result.length} expired intelligence records`);
    return result.length;

  } catch (error) {
    console.error(`${logPrefix} Error cleaning up expired intelligence:`, error);
    throw error;
  }
}

/**
 * Get intelligence about a specific entity.
 * 
 * @param entityType - Type of entity (e.g., 'pub', 'event')
 * @param entityId - ID of the entity
 * @param workspaceId - Tenant workspace ID
 * @returns Array of intelligence records for this entity
 */
export async function getEntityIntelligence(
  entityType: string,
  entityId: number,
  workspaceId: number
): Promise<SelectAgentIntelligence[]> {
  return getAgentIntelligence(workspaceId, {
    entityType,
    entityId,
  });
}

/**
 * Common intelligence types for type safety.
 */
export const INTELLIGENCE_TYPES = {
  /** Insight about ordering patterns */
  ORDERING_PATTERN: 'ordering_pattern',
  /** Insight about seasonal trends */
  SEASONAL_TREND: 'seasonal_trend',
  /** Insight about customer preferences */
  CUSTOMER_PREFERENCE: 'customer_preference',
  /** Insight about geographic clustering */
  GEOGRAPHIC_CLUSTER: 'geographic_cluster',
  /** Insight about event timing */
  EVENT_TIMING: 'event_timing',
  /** Insight about lead quality */
  LEAD_QUALITY: 'lead_quality',
  /** Data quality observation */
  DATA_QUALITY: 'data_quality',
  /** Match pattern learned */
  MATCH_PATTERN: 'match_pattern',
} as const;

export type IntelligenceType = typeof INTELLIGENCE_TYPES[keyof typeof INTELLIGENCE_TYPES];

// ============================================
// THINGS (EVENTS) STORAGE
// ============================================

/**
 * Thing status options.
 */
export type ThingStatus = 'upcoming' | 'happening_now' | 'completed' | 'cancelled';

/**
 * Thing types for categorization.
 */
export const THING_TYPES = {
  BEER_FESTIVAL: 'beer_festival',
  MARKET: 'market',
  MUSIC_NIGHT: 'music_night',
  FOOD_EVENT: 'food_event',
  PUB_QUIZ: 'pub_quiz',
  TASTING_EVENT: 'tasting_event',
  COMEDY_NIGHT: 'comedy_night',
  SPORTS_EVENT: 'sports_event',
  CHARITY_EVENT: 'charity_event',
  OTHER: 'other',
} as const;

export type ThingType = typeof THING_TYPES[keyof typeof THING_TYPES];

/**
 * Input data for creating a thing (event).
 */
export interface CreateThingInput {
  thingType: string;
  name: string;
  description?: string;
  startDate?: Date | string;
  endDate?: Date | string;
  isRecurring?: boolean;
  recurrencePattern?: string;
  nextOccurrence?: Date | string;
  outletId?: number;
  standaloneLocation?: string;
  standaloneAddress?: string;
  standalonePostcode?: string;
  latitude?: number;
  longitude?: number;
  url?: string;
  contactEmail?: string;
  contactPhone?: string;
  ticketPrice?: number;
  expectedAttendance?: number;
  organizer?: string;
  relevanceScore?: number;
  leadPotentialScore?: number;
  discoveredBy?: string;
  sourceUrl?: string;
}

/**
 * Thing with joined outlet data.
 */
export interface ThingWithOutlet extends SelectThing {
  outlet?: SelectPubsMaster | null;
}

/**
 * Create a new thing (event/opportunity).
 * 
 * @param data - Thing creation data
 * @param workspaceId - Tenant workspace ID
 * @returns The created thing with ID
 */
export async function createThing(
  data: CreateThingInput,
  workspaceId: number
): Promise<SelectThing> {
  const db = getDrizzleDb();
  const logPrefix = `[matching:things]`;

  try {
    // Convert date strings to Date objects if needed
    const startDate = data.startDate 
      ? (typeof data.startDate === 'string' ? data.startDate : data.startDate.toISOString().split('T')[0])
      : null;
    const endDate = data.endDate
      ? (typeof data.endDate === 'string' ? data.endDate : data.endDate.toISOString().split('T')[0])
      : null;
    const nextOccurrence = data.nextOccurrence
      ? (typeof data.nextOccurrence === 'string' ? data.nextOccurrence : data.nextOccurrence.toISOString().split('T')[0])
      : null;

    const insertData: InsertThing = {
      workspaceId,
      thingType: data.thingType,
      name: data.name,
      description: data.description || null,
      startDate,
      endDate,
      isRecurring: data.isRecurring || false,
      recurrencePattern: data.recurrencePattern || null,
      nextOccurrence,
      outletId: data.outletId || null,
      standaloneLocation: data.standaloneLocation || null,
      standaloneAddress: data.standaloneAddress || null,
      standalonePostcode: data.standalonePostcode || null,
      latitude: data.latitude?.toString() || null,
      longitude: data.longitude?.toString() || null,
      url: data.url || null,
      contactEmail: data.contactEmail || null,
      contactPhone: data.contactPhone || null,
      ticketPrice: data.ticketPrice?.toString() || null,
      expectedAttendance: data.expectedAttendance || null,
      organizer: data.organizer || null,
      status: 'upcoming',
      relevanceScore: data.relevanceScore || null,
      leadPotentialScore: data.leadPotentialScore || null,
      discoveredBy: data.discoveredBy || null,
      discoveredAt: new Date(),
      sourceUrl: data.sourceUrl || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const [result] = await db.insert(things).values(insertData).returning();

    console.log(`${logPrefix} Created thing: "${data.name}" (type: ${data.thingType}, id: ${result.id})`);
    
    return result;

  } catch (error) {
    console.error(`${logPrefix} Error creating thing:`, error);
    throw error;
  }
}

/**
 * Get upcoming things (events) for a workspace.
 * 
 * @param workspaceId - Tenant workspace ID
 * @param limit - Maximum results (default: 20)
 * @returns Array of upcoming things with outlet data
 */
export async function getUpcomingThings(
  workspaceId: number,
  limit: number = 20
): Promise<ThingWithOutlet[]> {
  const db = getDrizzleDb();
  const logPrefix = `[matching:things]`;

  try {
    const today = new Date().toISOString().split('T')[0];

    // Query things with optional outlet join
    const results = await db
      .select({
        thing: things,
        outlet: pubsMaster,
      })
      .from(things)
      .leftJoin(pubsMaster, eq(things.outletId, pubsMaster.id))
      .where(
        and(
          eq(things.workspaceId, workspaceId),
          eq(things.status, 'upcoming'),
          or(
            gte(things.startDate, today),
            sql`${things.startDate} IS NULL`
          )
        )
      )
      .orderBy(
        desc(things.relevanceScore),
        asc(things.startDate)
      )
      .limit(limit);

    console.log(`${logPrefix} Found ${results.length} upcoming things`);

    // Map results to ThingWithOutlet
    return results.map(r => ({
      ...r.thing,
      outlet: r.outlet,
    }));

  } catch (error) {
    console.error(`${logPrefix} Error getting upcoming things:`, error);
    throw error;
  }
}

/**
 * Get all things (events) for a specific outlet/pub.
 * 
 * @param outletId - The pub ID
 * @param workspaceId - Tenant workspace ID
 * @returns Array of things at this outlet (past and future)
 */
export async function getThingsByOutlet(
  outletId: number,
  workspaceId: number
): Promise<SelectThing[]> {
  const db = getDrizzleDb();
  const logPrefix = `[matching:things]`;

  try {
    const results = await db
      .select()
      .from(things)
      .where(
        and(
          eq(things.outletId, outletId),
          eq(things.workspaceId, workspaceId)
        )
      )
      .orderBy(desc(things.startDate));

    console.log(`${logPrefix} Found ${results.length} things for outlet ${outletId}`);
    return results;

  } catch (error) {
    console.error(`${logPrefix} Error getting things by outlet:`, error);
    throw error;
  }
}

/**
 * Update the status of a thing.
 * 
 * @param thingId - The thing ID
 * @param status - New status
 * @param workspaceId - Tenant workspace ID (for security)
 * @returns The updated thing or null if not found
 */
export async function updateThingStatus(
  thingId: number,
  status: ThingStatus,
  workspaceId: number
): Promise<SelectThing | null> {
  const db = getDrizzleDb();
  const logPrefix = `[matching:things]`;

  try {
    const [result] = await db
      .update(things)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(things.id, thingId),
          eq(things.workspaceId, workspaceId)
        )
      )
      .returning();

    if (!result) {
      console.log(`${logPrefix} Thing ${thingId} not found for status update`);
      return null;
    }

    console.log(`${logPrefix} Updated thing ${thingId} status to: ${status}`);
    return result;

  } catch (error) {
    console.error(`${logPrefix} Error updating thing status:`, error);
    throw error;
  }
}

/**
 * Mark whether the user attended a thing.
 * 
 * @param thingId - The thing ID
 * @param attended - Whether the user attended
 * @param workspaceId - Tenant workspace ID (for security)
 * @returns The updated thing or null if not found
 */
export async function markUserAttended(
  thingId: number,
  attended: boolean,
  workspaceId: number
): Promise<SelectThing | null> {
  const db = getDrizzleDb();
  const logPrefix = `[matching:things]`;

  try {
    const [result] = await db
      .update(things)
      .set({
        userAttended: attended,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(things.id, thingId),
          eq(things.workspaceId, workspaceId)
        )
      )
      .returning();

    if (!result) {
      console.log(`${logPrefix} Thing ${thingId} not found for attendance update`);
      return null;
    }

    console.log(`${logPrefix} Marked thing ${thingId} attended: ${attended}`);
    return result;

  } catch (error) {
    console.error(`${logPrefix} Error marking attendance:`, error);
    throw error;
  }
}

/**
 * Get a thing by ID.
 * 
 * @param thingId - The thing ID
 * @param workspaceId - Tenant workspace ID (for security)
 * @returns The thing or null if not found
 */
export async function getThingById(
  thingId: number,
  workspaceId: number
): Promise<ThingWithOutlet | null> {
  const db = getDrizzleDb();

  try {
    const results = await db
      .select({
        thing: things,
        outlet: pubsMaster,
      })
      .from(things)
      .leftJoin(pubsMaster, eq(things.outletId, pubsMaster.id))
      .where(
        and(
          eq(things.id, thingId),
          eq(things.workspaceId, workspaceId)
        )
      )
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    return {
      ...results[0].thing,
      outlet: results[0].outlet,
    };

  } catch (error) {
    console.error(`[matching:things] Error getting thing by ID:`, error);
    throw error;
  }
}

/**
 * Mark user interest in a thing.
 * 
 * @param thingId - The thing ID
 * @param interested - Whether the user is interested
 * @param workspaceId - Tenant workspace ID
 * @returns The updated thing or null if not found
 */
export async function markUserInterested(
  thingId: number,
  interested: boolean,
  workspaceId: number
): Promise<SelectThing | null> {
  const db = getDrizzleDb();

  try {
    const [result] = await db
      .update(things)
      .set({
        userInterested: interested,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(things.id, thingId),
          eq(things.workspaceId, workspaceId)
        )
      )
      .returning();

    return result || null;

  } catch (error) {
    console.error(`[matching:things] Error marking interest:`, error);
    throw error;
  }
}

/**
 * Add user notes to a thing.
 * 
 * @param thingId - The thing ID
 * @param notes - User notes text
 * @param workspaceId - Tenant workspace ID
 * @returns The updated thing or null if not found
 */
export async function updateThingNotes(
  thingId: number,
  notes: string,
  workspaceId: number
): Promise<SelectThing | null> {
  const db = getDrizzleDb();

  try {
    const [result] = await db
      .update(things)
      .set({
        userNotes: notes,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(things.id, thingId),
          eq(things.workspaceId, workspaceId)
        )
      )
      .returning();

    return result || null;

  } catch (error) {
    console.error(`[matching:things] Error updating notes:`, error);
    throw error;
  }
}

/**
 * Rate a thing after attending.
 * 
 * @param thingId - The thing ID
 * @param rating - Rating 1-5
 * @param workspaceId - Tenant workspace ID
 * @returns The updated thing or null if not found
 */
export async function rateUserThing(
  thingId: number,
  rating: number,
  workspaceId: number
): Promise<SelectThing | null> {
  const db = getDrizzleDb();

  // Validate rating range
  const clampedRating = Math.max(1, Math.min(5, Math.round(rating)));

  try {
    const [result] = await db
      .update(things)
      .set({
        userRating: clampedRating,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(things.id, thingId),
          eq(things.workspaceId, workspaceId)
        )
      )
      .returning();

    return result || null;

  } catch (error) {
    console.error(`[matching:things] Error rating thing:`, error);
    throw error;
  }
}

/**
 * Search things by name or description.
 * 
 * @param query - Search query
 * @param workspaceId - Tenant workspace ID
 * @param limit - Maximum results (default: 50)
 * @returns Array of matching things
 */
export async function searchThings(
  query: string,
  workspaceId: number,
  limit: number = 50
): Promise<ThingWithOutlet[]> {
  const sqlDb = getDb();
  const logPrefix = `[matching:things]`;

  if (!query || query.trim().length === 0) {
    return [];
  }

  const normalizedQuery = query.trim().toLowerCase();

  try {
    // Use trigram similarity for fuzzy matching on name
    const results = await sqlDb`
      SELECT 
        t.*,
        p.id as outlet_id,
        p.name as outlet_name,
        p.postcode as outlet_postcode,
        p.city as outlet_city,
        similarity(lower(t.name), ${normalizedQuery}) as name_similarity
      FROM things t
      LEFT JOIN pubs_master p ON t.outlet_id = p.id
      WHERE t.workspace_id = ${workspaceId}
        AND (
          similarity(lower(t.name), ${normalizedQuery}) > 0.2
          OR lower(t.name) LIKE ${'%' + normalizedQuery + '%'}
          OR lower(t.description) LIKE ${'%' + normalizedQuery + '%'}
        )
      ORDER BY name_similarity DESC, t.start_date ASC
      LIMIT ${limit}
    `;

    console.log(`${logPrefix} Found ${results.length} things matching "${query}"`);

    // Map to ThingWithOutlet
    return results.map(row => ({
      id: row.id,
      workspaceId: row.workspace_id,
      thingType: row.thing_type,
      name: row.name,
      description: row.description,
      startDate: row.start_date,
      endDate: row.end_date,
      isRecurring: row.is_recurring,
      recurrencePattern: row.recurrence_pattern,
      nextOccurrence: row.next_occurrence,
      outletId: row.outlet_id,
      standaloneLocation: row.standalone_location,
      standaloneAddress: row.standalone_address,
      standalonePostcode: row.standalone_postcode,
      latitude: row.latitude,
      longitude: row.longitude,
      url: row.url,
      contactEmail: row.contact_email,
      contactPhone: row.contact_phone,
      ticketPrice: row.ticket_price,
      expectedAttendance: row.expected_attendance,
      organizer: row.organizer,
      status: row.status,
      userInterested: row.user_interested,
      userAttended: row.user_attended,
      userNotes: row.user_notes,
      userRating: row.user_rating,
      discoveredBy: row.discovered_by,
      discoveredAt: row.discovered_at,
      sourceUrl: row.source_url,
      relevanceScore: row.relevance_score,
      leadPotentialScore: row.lead_potential_score,
      lastVerifiedAt: row.last_verified_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      outlet: row.outlet_name ? {
        id: row.outlet_id,
        name: row.outlet_name,
        postcode: row.outlet_postcode,
        city: row.outlet_city,
      } as SelectPubsMaster : null,
    })) as ThingWithOutlet[];

  } catch (error) {
    console.error(`${logPrefix} Error searching things:`, error);
    throw error;
  }
}

/**
 * Get things happening now (within date range).
 * 
 * @param workspaceId - Tenant workspace ID
 * @param limit - Maximum results (default: 20)
 * @returns Array of things happening now
 */
export async function getThingsHappeningNow(
  workspaceId: number,
  limit: number = 20
): Promise<ThingWithOutlet[]> {
  const db = getDrizzleDb();
  const today = new Date().toISOString().split('T')[0];

  try {
    const results = await db
      .select({
        thing: things,
        outlet: pubsMaster,
      })
      .from(things)
      .leftJoin(pubsMaster, eq(things.outletId, pubsMaster.id))
      .where(
        and(
          eq(things.workspaceId, workspaceId),
          or(
            eq(things.status, 'happening_now'),
            and(
              sql`${things.startDate} <= ${today}`,
              or(
                sql`${things.endDate} >= ${today}`,
                sql`${things.endDate} IS NULL`
              )
            )
          )
        )
      )
      .orderBy(desc(things.relevanceScore))
      .limit(limit);

    return results.map(r => ({
      ...r.thing,
      outlet: r.outlet,
    }));

  } catch (error) {
    console.error(`[matching:things] Error getting things happening now:`, error);
    throw error;
  }
}
