/**
 * AI Sleeper Agent for Pub Discovery
 * 
 * Uses Google Places API to discover new pubs and matches them against
 * the existing database to identify prospects.
 * 
 * Key features:
 * - Search Google Places for pubs/bars in a location
 * - Extract UK postcodes from formatted addresses
 * - Match discoveries against existing database
 * - Queue new prospects for freehouse research
 * - Email users about new opportunities
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and, sql, gte, lte, desc } from "drizzle-orm";
import {
  pubsMaster,
  entitySources,
  aiResearchQueue,
  things,
  agentIntelligence,
  type InsertPubsMaster,
  type SelectPubsMaster,
  type InsertThing,
  type SelectThing,
  type InsertAgentIntelligence,
} from "@shared/schema";
import {
  findMatchingEntityCached,
  askClaudeToMatchEvent,
  type PubInput,
  type EntitySource,
  type EventInput,
  type EventCandidate,
  type EventMatchDecision,
} from "./matching";
import { searchPlaces } from "../googlePlaces";
import { getUncachableResendClient } from "../resend-client";

// ============================================
// TYPES
// ============================================

/**
 * Google Place result from searchGooglePlaces.
 */
export interface GooglePlaceResult {
  /** Google Place ID */
  placeId: string;
  /** Resource name with "places/" prefix */
  resourceName: string;
  /** Business name */
  name: string;
  /** Full formatted address */
  formattedAddress: string;
  /** Phone number */
  phone: string | null;
  /** Website URL */
  website: string | null;
  /** Business types (e.g., ["bar", "restaurant"]) */
  types: string[];
  /** Google rating (1-5) */
  rating: number | null;
  /** Number of user ratings */
  userRatingCount: number | null;
  /** Latitude/longitude */
  location: {
    lat: number;
    lng: number;
  } | null;
  /** Business status */
  businessStatus: string;
}

/**
 * Location parameter for Google Places search.
 */
export interface SearchLocation {
  /** Location name (e.g., "Brighton, UK") */
  locationText?: string;
  /** Latitude coordinate */
  lat?: number;
  /** Longitude coordinate */
  lng?: number;
}

/**
 * Result from processSleepAgentProspect.
 */
export interface ProspectResult {
  /** Action taken: 'new', 'existing_customer', 'existing_prospect', 'skipped' */
  action: 'new' | 'existing_customer' | 'existing_prospect' | 'skipped' | 'error';
  /** Pub ID if created or matched */
  pubId?: number;
  /** Pub name */
  pubName: string;
  /** Google Place ID */
  googlePlaceId: string;
  /** Explanation of what happened */
  message: string;
  /** Was an email sent? */
  emailSent?: boolean;
  /** Was freehouse research queued? */
  researchQueued?: boolean;
  /** Error message if action is 'error' */
  error?: string;
}

/**
 * Summary of a sleeper agent run.
 */
export interface SleeperAgentRunSummary {
  /** Number of places searched */
  searchedCount: number;
  /** Number of new pubs discovered */
  newPubs: number;
  /** Number of existing customers found */
  existingCustomers: number;
  /** Number of existing prospects updated */
  existingProspects: number;
  /** Number of errors */
  errors: number;
  /** Start time */
  startedAt: Date;
  /** End time */
  completedAt: Date;
  /** Search query used */
  query: string;
  /** Location searched */
  location: string;
  /** Detailed results */
  results: ProspectResult[];
}

// ============================================
// DATABASE CONNECTION
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
// UK POSTCODE EXTRACTION
// ============================================

/**
 * UK postcode regex pattern.
 * 
 * Matches formats like:
 * - SW1A 1AA (London area)
 * - BN18 9AB (Arundel area)
 * - M1 1AE (Manchester)
 * - EH1 1AA (Edinburgh)
 * - W1A 1AA (London West End)
 */
const UK_POSTCODE_REGEX = /\b([A-Z]{1,2}[0-9]{1,2}[A-Z]?\s*[0-9][A-Z]{2})\b/i;

/**
 * Extract UK postcode from a formatted address.
 * 
 * Google Places returns addresses like:
 * "The Red Lion, 43 Queen Street, Arundel BN18 9AB, UK"
 * 
 * This function extracts the postcode (e.g., "BN18 9AB").
 * 
 * @param formattedAddress - Full address string from Google Places
 * @returns Normalized UK postcode (uppercase, with space) or null if not found
 */
export function extractPostcode(formattedAddress: string | null | undefined): string | null {
  if (!formattedAddress) {
    return null;
  }

  const match = formattedAddress.match(UK_POSTCODE_REGEX);
  
  if (!match) {
    return null;
  }

  // Normalize the postcode: uppercase, ensure single space before final 3 chars
  let postcode = match[1].toUpperCase().replace(/\s+/g, "");
  
  // Insert space before last 3 characters (outward code vs inward code)
  if (postcode.length >= 5) {
    postcode = postcode.slice(0, -3) + " " + postcode.slice(-3);
  }

  return postcode;
}

/**
 * Extract city/town from formatted address.
 */
export function extractCity(formattedAddress: string | null | undefined): string | null {
  if (!formattedAddress) {
    return null;
  }

  // Try to find city before postcode
  // Pattern: "..., CityName POSTCODE, UK"
  const cityMatch = formattedAddress.match(/,\s*([^,\d]+?)\s+[A-Z]{1,2}[0-9]/i);
  
  if (cityMatch) {
    return cityMatch[1].trim();
  }

  // Fallback: look for common UK cities
  const ukCities = [
    "London", "Birmingham", "Manchester", "Leeds", "Liverpool",
    "Newcastle", "Sheffield", "Bristol", "Nottingham", "Brighton",
    "Glasgow", "Edinburgh", "Cardiff", "Belfast", "Oxford",
    "Cambridge", "Southampton", "Portsmouth", "Leicester", "Coventry",
  ];

  for (const city of ukCities) {
    if (formattedAddress.includes(city)) {
      return city;
    }
  }

  return null;
}

/**
 * Extract street address (first line) from formatted address.
 */
export function extractStreetAddress(formattedAddress: string | null | undefined): string | null {
  if (!formattedAddress) {
    return null;
  }

  // Split by comma and take first part (usually street address)
  const parts = formattedAddress.split(",").map(p => p.trim());
  
  if (parts.length >= 2) {
    // Skip the business name if it's the first part
    // Google often formats as "Business Name, Street Address, City POSTCODE, Country"
    return parts[1];
  }

  return parts[0] || null;
}

// ============================================
// GOOGLE PLACES SEARCH
// ============================================

/**
 * Search Google Places for businesses in a location.
 * 
 * Uses the existing searchPlaces function from googlePlaces.ts
 * with pub/bar-specific settings.
 * 
 * @param query - Search query (e.g., "pubs", "bars", "freehouse")
 * @param location - Location to search (text or coordinates)
 * @param radius - Search radius in meters (default 5000m = 5km)
 * @returns Array of GooglePlaceResult objects
 */
export async function searchGooglePlaces(
  query: string,
  location: SearchLocation,
  radius: number = 5000
): Promise<GooglePlaceResult[]> {
  const logPrefix = "[sleeper-agent:search]";

  // Check for API key
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error(`${logPrefix} Missing GOOGLE_PLACES_API_KEY environment variable`);
    throw new Error("GOOGLE_PLACES_API_KEY is not configured");
  }

  try {
    console.log(`${logPrefix} Searching for "${query}" in ${location.locationText || `${location.lat},${location.lng}`} (radius: ${radius}m)`);

    // Use existing searchPlaces function
    const results = await searchPlaces({
      query,
      locationText: location.locationText,
      lat: location.lat,
      lng: location.lng,
      radiusMeters: radius,
      maxResults: 60, // Max 60 results (3 pages)
      typesFilter: ["bar", "restaurant", "night_club", "cafe"], // Focus on hospitality
      region: "GB", // UK-focused
    });

    console.log(`${logPrefix} Found ${results.length} places`);

    // Map to our interface
    return results.map((place: any) => ({
      placeId: place.placeId,
      resourceName: place.resourceName,
      name: place.name,
      formattedAddress: place.address,
      phone: place.phone,
      website: place.website,
      types: place.types || [],
      rating: place.rating,
      userRatingCount: place.userRatingCount,
      location: place.location,
      businessStatus: place.businessStatus,
    }));
  } catch (error: any) {
    console.error(`${logPrefix} Google Places search error:`, error.message);
    
    // Handle rate limiting
    if (error.message?.includes("429") || error.message?.includes("RATE_LIMIT")) {
      console.warn(`${logPrefix} Rate limited by Google Places API`);
      throw new Error("Google Places API rate limit exceeded. Please try again later.");
    }
    
    throw error;
  }
}

/**
 * Search specifically for pubs in a location.
 * Convenience wrapper for pub-specific searches.
 */
export async function searchPubsInArea(
  location: SearchLocation,
  radius: number = 5000
): Promise<GooglePlaceResult[]> {
  return searchGooglePlaces("pubs", location, radius);
}

/**
 * Search for freehouses in a location.
 * Uses specific search terms to find independent pubs.
 */
export async function searchFreehousesInArea(
  location: SearchLocation,
  radius: number = 5000
): Promise<GooglePlaceResult[]> {
  // Search multiple terms and deduplicate
  const [pubs, freehouses] = await Promise.all([
    searchGooglePlaces("independent pub", location, radius),
    searchGooglePlaces("freehouse", location, radius),
  ]);

  // Deduplicate by place ID
  const seen = new Set<string>();
  const combined: GooglePlaceResult[] = [];
  
  for (const place of [...pubs, ...freehouses]) {
    if (!seen.has(place.placeId)) {
      seen.add(place.placeId);
      combined.push(place);
    }
  }

  return combined;
}

// ============================================
// SLEEPER AGENT PROSPECT PROCESSING
// ============================================

/**
 * Process a Google Place discovery as a sleeper agent prospect.
 * 
 * Steps:
 * 1. Map Google data to pub format
 * 2. Check if already known (via entity matching)
 * 3. If new: create pub, queue research, notify user
 * 4. If existing customer: skip (already served)
 * 5. If existing prospect: optionally update with fresh data
 * 
 * @param googlePlace - The Google Place result to process
 * @param workspaceId - Tenant workspace ID
 * @param userEmail - User email for notifications (optional)
 * @returns ProspectResult with action taken and details
 */
export async function processSleepAgentProspect(
  googlePlace: GooglePlaceResult,
  workspaceId: number,
  userEmail?: string
): Promise<ProspectResult> {
  const logPrefix = "[sleeper-agent:prospect]";
  const db = getDrizzleDb();

  try {
    // Step 1: Map Google data to pub input format
    const postcode = extractPostcode(googlePlace.formattedAddress);
    const city = extractCity(googlePlace.formattedAddress);
    const streetAddress = extractStreetAddress(googlePlace.formattedAddress);

    const newPubData: PubInput = {
      name: googlePlace.name,
      postcode,
      phone: googlePlace.phone,
      address: streetAddress,
    };

    console.log(`${logPrefix} Processing: "${googlePlace.name}" (${postcode || "no postcode"})`);

    // Step 2: Check if we already have this Google Place ID
    const existingSource = await checkGooglePlaceExists(googlePlace.placeId, workspaceId);
    
    if (existingSource) {
      console.log(`${logPrefix} Already have Google Place ID: ${googlePlace.placeId}`);
      
      // Get the pub record
      const existingPub = await getPubById(existingSource.pubId, workspaceId);
      
      if (existingPub?.isCustomer) {
        return {
          action: "existing_customer",
          pubId: existingPub.id,
          pubName: googlePlace.name,
          googlePlaceId: googlePlace.placeId,
          message: `Already a customer: "${existingPub.name}"`,
        };
      } else {
        // Update prospect with fresh Google data
        await updatePubFromGoogle(existingPub!.id, googlePlace, workspaceId);
        
        return {
          action: "existing_prospect",
          pubId: existingPub!.id,
          pubName: googlePlace.name,
          googlePlaceId: googlePlace.placeId,
          message: `Updated existing prospect: "${existingPub!.name}"`,
        };
      }
    }

    // Step 3: Try to match against existing pubs
    const matchDecision = await findMatchingEntityCached(
      newPubData,
      "google_places" as EntitySource,
      workspaceId
    );

    // Step 4: Handle based on match result
    if (!matchDecision.isNew && matchDecision.match) {
      // Found a match - is it a customer?
      if (matchDecision.match.isCustomer) {
        // Create entity source link
        await createGoogleEntitySource(
          matchDecision.match.id,
          googlePlace,
          workspaceId,
          matchDecision.confidence,
          matchDecision.reasoning
        );

        return {
          action: "existing_customer",
          pubId: matchDecision.match.id,
          pubName: googlePlace.name,
          googlePlaceId: googlePlace.placeId,
          message: `Matched to existing customer: "${matchDecision.match.name}"`,
        };
      } else {
        // It's a prospect - update with Google data
        await updatePubFromGoogle(matchDecision.match.id, googlePlace, workspaceId);
        
        // Create entity source link
        await createGoogleEntitySource(
          matchDecision.match.id,
          googlePlace,
          workspaceId,
          matchDecision.confidence,
          matchDecision.reasoning
        );

        // Maybe email about warm lead
        let emailSent = false;
        if (userEmail && matchDecision.confidence >= 0.8) {
          emailSent = await sendWarmLeadEmail(
            userEmail,
            googlePlace,
            matchDecision.match.name,
            matchDecision.reasoning
          );
        }

        return {
          action: "existing_prospect",
          pubId: matchDecision.match.id,
          pubName: googlePlace.name,
          googlePlaceId: googlePlace.placeId,
          message: `Updated existing prospect: "${matchDecision.match.name}" (${(matchDecision.confidence * 100).toFixed(0)}% match)`,
          emailSent,
        };
      }
    }

    // Step 5: It's a new pub! Create it
    const newPub = await createNewPubFromGoogle(googlePlace, workspaceId);

    // Queue for freehouse research
    const researchQueued = await queueFreehouseResearch(newPub.id, workspaceId);

    // Email user about new prospect
    let emailSent = false;
    if (userEmail) {
      emailSent = await sendNewProspectEmail(userEmail, googlePlace, newPub.id);
    }

    console.log(`${logPrefix} Created new pub: "${newPub.name}" (id: ${newPub.id})`);

    return {
      action: "new",
      pubId: newPub.id,
      pubName: googlePlace.name,
      googlePlaceId: googlePlace.placeId,
      message: `Discovered new pub: "${googlePlace.name}"`,
      emailSent,
      researchQueued,
    };

  } catch (error: any) {
    console.error(`${logPrefix} Error processing prospect:`, error.message);
    return {
      action: "error",
      pubName: googlePlace.name,
      googlePlaceId: googlePlace.placeId,
      message: `Error processing prospect`,
      error: error.message,
    };
  }
}

// ============================================
// BATCH PROCESSING
// ============================================

/**
 * Run the sleeper agent on a location.
 * 
 * Searches for pubs and processes each one as a prospect.
 * 
 * @param query - Search query (e.g., "pubs", "freehouses")
 * @param location - Location to search
 * @param workspaceId - Tenant workspace ID
 * @param userEmail - User email for notifications
 * @param radius - Search radius in meters
 * @returns SleeperAgentRunSummary with results
 */
export async function runSleeperAgentSearch(
  query: string,
  location: SearchLocation,
  workspaceId: number,
  userEmail?: string,
  radius: number = 5000
): Promise<SleeperAgentRunSummary> {
  const logPrefix = "[sleeper-agent:run]";
  const startedAt = new Date();
  const locationString = location.locationText || `${location.lat},${location.lng}`;

  console.log(`${logPrefix} Starting sleeper agent run: "${query}" in ${locationString}`);

  const results: ProspectResult[] = [];
  let searchedCount = 0;
  let newPubs = 0;
  let existingCustomers = 0;
  let existingProspects = 0;
  let errors = 0;

  try {
    // Search for places
    const places = await searchGooglePlaces(query, location, radius);
    searchedCount = places.length;

    console.log(`${logPrefix} Found ${searchedCount} places to process`);

    // Process each place
    for (const place of places) {
      const result = await processSleepAgentProspect(place, workspaceId, userEmail);
      results.push(result);

      switch (result.action) {
        case "new":
          newPubs++;
          break;
        case "existing_customer":
          existingCustomers++;
          break;
        case "existing_prospect":
          existingProspects++;
          break;
        case "error":
          errors++;
          break;
      }

      // Small delay between processing to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }

  } catch (error: any) {
    console.error(`${logPrefix} Sleeper agent run failed:`, error.message);
    errors++;
  }

  const completedAt = new Date();
  const duration = (completedAt.getTime() - startedAt.getTime()) / 1000;

  console.log(`${logPrefix} Completed in ${duration.toFixed(1)}s: ${newPubs} new, ${existingCustomers} customers, ${existingProspects} prospects, ${errors} errors`);

  return {
    searchedCount,
    newPubs,
    existingCustomers,
    existingProspects,
    errors,
    startedAt,
    completedAt,
    query,
    location: locationString,
    results,
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if a Google Place ID already exists in entity_sources.
 */
async function checkGooglePlaceExists(
  placeId: string,
  workspaceId: number
): Promise<{ pubId: number } | null> {
  const db = getDrizzleDb();

  const results = await db
    .select({ pubId: entitySources.pubId })
    .from(entitySources)
    .where(
      and(
        eq(entitySources.sourceType, "google_places"),
        eq(entitySources.sourceId, placeId),
        eq(entitySources.workspaceId, workspaceId)
      )
    )
    .limit(1);

  return results.length > 0 ? { pubId: results[0].pubId } : null;
}

/**
 * Get a pub by ID.
 */
async function getPubById(
  pubId: number,
  workspaceId: number
): Promise<SelectPubsMaster | null> {
  const db = getDrizzleDb();

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
}

/**
 * Create a new pub from Google Place data.
 * 
 * Note: Only populates fields that exist in the pubs_master schema.
 * Fields like website, googlePlaceId, googleRating are not in the current schema
 * and will need a migration to add them.
 */
async function createNewPubFromGoogle(
  googlePlace: GooglePlaceResult,
  workspaceId: number
): Promise<SelectPubsMaster> {
  const db = getDrizzleDb();

  const postcode = extractPostcode(googlePlace.formattedAddress);
  const city = extractCity(googlePlace.formattedAddress);
  const streetAddress = extractStreetAddress(googlePlace.formattedAddress);

  const insertData: InsertPubsMaster = {
    workspaceId,
    name: googlePlace.name,
    postcode,
    addressLine1: streetAddress,
    city,
    phone: googlePlace.phone,
    latitude: googlePlace.location?.lat?.toString(),
    longitude: googlePlace.location?.lng?.toString(),
    isCustomer: false,
    discoveredBy: "ai_sleeper_agent",
    discoveredAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const [newPub] = await db.insert(pubsMaster).values(insertData).returning();

  // Create entity source link (stores full Google data in sourceData JSONB)
  await createGoogleEntitySource(
    newPub.id,
    googlePlace,
    workspaceId,
    1.0, // New entity has full confidence
    "Discovered by AI sleeper agent"
  );

  return newPub;
}

/**
 * Update an existing pub with fresh Google data.
 * 
 * Only updates fields that exist in the pubs_master schema.
 */
async function updatePubFromGoogle(
  pubId: number,
  googlePlace: GooglePlaceResult,
  workspaceId: number
): Promise<void> {
  const db = getDrizzleDb();

  const updateData: Partial<InsertPubsMaster> = {
    updatedAt: new Date(),
  };

  // Only update certain fields if they're provided
  if (googlePlace.phone) {
    updateData.phone = googlePlace.phone;
  }
  if (googlePlace.location) {
    updateData.latitude = googlePlace.location.lat.toString();
    updateData.longitude = googlePlace.location.lng.toString();
  }

  await db
    .update(pubsMaster)
    .set(updateData)
    .where(
      and(
        eq(pubsMaster.id, pubId),
        eq(pubsMaster.workspaceId, workspaceId)
      )
    );
}

/**
 * Create an entity source link for a Google Place.
 * 
 * Stores the full Google Places data in the sourceData JSONB field
 * for future reference and data enrichment.
 */
async function createGoogleEntitySource(
  pubId: number,
  googlePlace: GooglePlaceResult,
  workspaceId: number,
  confidence: number,
  reasoning: string
): Promise<void> {
  const db = getDrizzleDb();

  await db.insert(entitySources).values({
    pubId,
    workspaceId,
    sourceType: "google_places",
    sourceId: googlePlace.placeId,
    sourceData: {
      resourceName: googlePlace.resourceName,
      name: googlePlace.name,
      formattedAddress: googlePlace.formattedAddress,
      phone: googlePlace.phone,
      website: googlePlace.website,
      types: googlePlace.types,
      rating: googlePlace.rating,
      userRatingCount: googlePlace.userRatingCount,
      location: googlePlace.location,
      businessStatus: googlePlace.businessStatus,
    },
    confidence,
    matchedAt: new Date(),
    matchedBy: "sleeper_agent",
    matchedReasoning: reasoning,
    createdAt: new Date(),
  });
}

/**
 * Queue a pub for freehouse research.
 */
async function queueFreehouseResearch(
  pubId: number,
  workspaceId: number
): Promise<boolean> {
  const db = getDrizzleDb();

  try {
    await db.insert(aiResearchQueue).values({
      pubId,
      workspaceId,
      researchType: "find_freehouse",
      priority: 5, // Normal priority
      status: "pending",
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date(),
    });
    return true;
  } catch (error) {
    console.error("[sleeper-agent] Failed to queue freehouse research:", error);
    return false;
  }
}

// ============================================
// EMAIL NOTIFICATIONS
// ============================================

/**
 * Send email about a newly discovered pub.
 */
async function sendNewProspectEmail(
  userEmail: string,
  googlePlace: GooglePlaceResult,
  pubId: number
): Promise<boolean> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();

    const baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const pubUrl = `${baseUrl}/crm/pubs/${pubId}`;
    const postcode = extractPostcode(googlePlace.formattedAddress);

    await client.emails.send({
      from: fromEmail,
      to: userEmail,
      subject: `🍺 New Pub Discovered: ${googlePlace.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">🍺 New Pub Discovered</h2>
          
          <p>Wyshbone's AI sleeper agent has discovered a new pub that might be a prospect:</p>
          
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0;">${googlePlace.name}</h3>
            <p style="margin: 5px 0; color: #6b7280;">
              📍 ${googlePlace.formattedAddress}
            </p>
            ${googlePlace.phone ? `<p style="margin: 5px 0; color: #6b7280;">📞 ${googlePlace.phone}</p>` : ""}
            ${googlePlace.website ? `<p style="margin: 5px 0;"><a href="${googlePlace.website}" style="color: #2563eb;">🌐 Website</a></p>` : ""}
            ${googlePlace.rating ? `<p style="margin: 5px 0; color: #6b7280;">⭐ ${googlePlace.rating}/5 (${googlePlace.userRatingCount || 0} reviews)</p>` : ""}
          </div>
          
          <p>
            We're automatically researching whether this is a freehouse (independent pub) that could be a good customer.
          </p>
          
          <p style="margin-top: 20px;">
            <a href="${pubUrl}" style="background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">
              View Pub Details →
            </a>
          </p>
          
          <p style="color: #9ca3af; font-size: 12px; margin-top: 30px;">
            This email was sent by Wyshbone's AI Sleeper Agent.<br>
            ${postcode ? `Postcode: ${postcode}` : ""}
          </p>
        </div>
      `,
    });

    console.log(`[sleeper-agent:email] Sent new prospect email to ${userEmail}`);
    return true;
  } catch (error) {
    console.error("[sleeper-agent:email] Failed to send new prospect email:", error);
    return false;
  }
}

/**
 * Send email about a warm lead (existing prospect with fresh Google data).
 */
async function sendWarmLeadEmail(
  userEmail: string,
  googlePlace: GooglePlaceResult,
  existingPubName: string,
  matchReasoning: string
): Promise<boolean> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();

    await client.emails.send({
      from: fromEmail,
      to: userEmail,
      subject: `🔥 Warm Lead: ${googlePlace.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc2626;">🔥 Warm Lead Alert</h2>
          
          <p>Good news! We found fresh data on an existing prospect:</p>
          
          <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0;">${googlePlace.name}</h3>
            <p style="margin: 5px 0; color: #92400e;">
              Matched to: <strong>${existingPubName}</strong>
            </p>
            <p style="margin: 5px 0; color: #6b7280;">
              📍 ${googlePlace.formattedAddress}
            </p>
            ${googlePlace.rating ? `<p style="margin: 5px 0; color: #6b7280;">⭐ ${googlePlace.rating}/5 (${googlePlace.userRatingCount || 0} reviews)</p>` : ""}
          </div>
          
          <p style="font-style: italic; color: #6b7280;">
            "${matchReasoning}"
          </p>
          
          <p style="color: #9ca3af; font-size: 12px; margin-top: 30px;">
            This email was sent by Wyshbone's AI Sleeper Agent.
          </p>
        </div>
      `,
    });

    console.log(`[sleeper-agent:email] Sent warm lead email to ${userEmail}`);
    return true;
  } catch (error) {
    console.error("[sleeper-agent:email] Failed to send warm lead email:", error);
    return false;
  }
}

// ============================================
// EVENT DISCOVERY TYPES
// ============================================

/**
 * Event data discovered from search.
 */
export interface DiscoveredEvent {
  /** Event name */
  name: string;
  /** Event description */
  description: string | null;
  /** Start date (YYYY-MM-DD format) */
  startDate: string | null;
  /** End date (YYYY-MM-DD format) */
  endDate: string | null;
  /** Location/venue name */
  location: string | null;
  /** Full address */
  address: string | null;
  /** Postcode extracted from address */
  postcode: string | null;
  /** Event organizer */
  organizer: string | null;
  /** Event URL */
  url: string | null;
  /** Ticket URL or price info */
  ticketInfo: string | null;
  /** Source URL where event was found */
  sourceUrl: string | null;
  /** Event type inferred from content */
  eventType: EventType;
  /** Latitude */
  lat?: number | null;
  /** Longitude */
  lng?: number | null;
}

/**
 * Event types for classification.
 */
export type EventType = 
  | "beer_festival"
  | "beer_tasting"
  | "pub_event"
  | "trade_show"
  | "brewery_open_day"
  | "market"
  | "food_festival"
  | "live_music"
  | "pub_quiz"
  | "tap_takeover"
  | "meet_the_brewer"
  | "other";

/**
 * Result from processEvent.
 */
export interface EventProcessResult {
  /** Action taken */
  action: "created" | "updated" | "skipped" | "error";
  /** Thing ID if created or updated */
  thingId?: number;
  /** Event name */
  eventName: string;
  /** Whether event was matched to existing */
  isNew: boolean;
  /** Relevance score calculated */
  relevanceScore?: number;
  /** Was email sent? */
  emailSent?: boolean;
  /** Outlet ID if linked to a pub */
  outletId?: number;
  /** Error message if action is 'error' */
  error?: string;
  /** AI reasoning for match/no-match */
  reasoning?: string;
}

/**
 * Summary of an event discovery run.
 */
export interface EventDiscoveryRunSummary {
  /** Query used */
  query: string;
  /** Location searched */
  location: string;
  /** Number of events found */
  eventsFound: number;
  /** Number of new events created */
  newEvents: number;
  /** Number of existing events updated */
  updatedEvents: number;
  /** Number of events skipped */
  skippedEvents: number;
  /** Number of errors */
  errors: number;
  /** Start time */
  startedAt: Date;
  /** End time */
  completedAt: Date;
  /** Detailed results */
  results: EventProcessResult[];
}

// ============================================
// EVENT TYPE INFERENCE
// ============================================

/**
 * Keywords for inferring event types.
 */
const EVENT_TYPE_KEYWORDS: Record<EventType, string[]> = {
  beer_festival: ["beer festival", "beer fest", "cask festival", "ale festival", "craft beer festival", "real ale festival"],
  beer_tasting: ["beer tasting", "tasting event", "tasting session", "sample", "flight tasting"],
  pub_event: ["pub event", "pub night", "special event at"],
  trade_show: ["trade show", "expo", "exhibition", "conference", "trade fair", "industry event"],
  brewery_open_day: ["brewery open day", "open doors", "brewery tour", "open house", "brewery visit"],
  market: ["market", "farmers market", "street food", "food market", "craft market"],
  food_festival: ["food festival", "food fest", "culinary", "gastro", "food and drink"],
  live_music: ["live music", "live band", "gig", "concert", "acoustic", "open mic"],
  pub_quiz: ["pub quiz", "quiz night", "trivia", "quiz"],
  tap_takeover: ["tap takeover", "guest beers", "brewery takeover", "guest tap"],
  meet_the_brewer: ["meet the brewer", "brewer visit", "brewer night", "brewer talk"],
  other: [],
};

/**
 * Infer event type from name and description.
 */
export function inferEventType(name: string, description?: string | null): EventType {
  const searchText = `${name} ${description || ""}`.toLowerCase();
  
  // Check each event type's keywords
  for (const [eventType, keywords] of Object.entries(EVENT_TYPE_KEYWORDS)) {
    if (eventType === "other") continue; // Skip 'other' - it's the fallback
    
    for (const keyword of keywords) {
      if (searchText.includes(keyword.toLowerCase())) {
        return eventType as EventType;
      }
    }
  }
  
  return "other";
}

/**
 * Calculate relevance score for an event based on user's business.
 * 
 * For a brewery CRM, beer festivals and trade events are highly relevant.
 */
export function calculateEventRelevanceScore(event: DiscoveredEvent): number {
  let score = 0.5; // Base score
  
  // Event type relevance
  const typeScores: Record<EventType, number> = {
    beer_festival: 0.95,
    trade_show: 0.90,
    brewery_open_day: 0.85,
    tap_takeover: 0.80,
    meet_the_brewer: 0.80,
    beer_tasting: 0.75,
    food_festival: 0.65,
    pub_event: 0.60,
    market: 0.55,
    live_music: 0.40,
    pub_quiz: 0.35,
    other: 0.50,
  };
  
  score = typeScores[event.eventType] || 0.5;
  
  // Boost for UK-based events (has UK postcode)
  if (event.postcode) {
    score += 0.05;
  }
  
  // Boost for events with clear dates
  if (event.startDate) {
    score += 0.05;
  }
  
  // Boost for events with venue information
  if (event.location) {
    score += 0.03;
  }
  
  // Cap at 1.0
  return Math.min(score, 1.0);
}

// ============================================
// GOOGLE CUSTOM SEARCH FOR EVENTS
// ============================================

/**
 * Search Google Custom Search for events.
 * 
 * Uses Google Custom Search API to find event listings.
 * Requires GOOGLE_CSE_API_KEY and GOOGLE_CSE_ID environment variables.
 * 
 * @param query - Search query (e.g., "beer festival UK 2026", "coffee expo London")
 * @param location - Optional location to append to query
 * @returns Array of discovered events
 */
export async function searchGoogleForEvents(
  query: string,
  location?: string
): Promise<DiscoveredEvent[]> {
  const logPrefix = "[sleeper-agent:events]";
  
  // Check for API keys
  const apiKey = process.env.GOOGLE_CSE_API_KEY || process.env.GOOGLE_API_KEY;
  const cseId = process.env.GOOGLE_CSE_ID;
  
  if (!apiKey) {
    console.error(`${logPrefix} Missing GOOGLE_CSE_API_KEY environment variable`);
    throw new Error("Google Custom Search API key not configured");
  }
  
  if (!cseId) {
    console.error(`${logPrefix} Missing GOOGLE_CSE_ID environment variable`);
    throw new Error("Google Custom Search Engine ID not configured");
  }
  
  // Build search query
  const fullQuery = location ? `${query} ${location}` : query;
  
  console.log(`${logPrefix} Searching for events: "${fullQuery}"`);
  
  try {
    const events: DiscoveredEvent[] = [];
    
    // Fetch multiple pages (up to 3 pages, 10 results each)
    for (let start = 1; start <= 21; start += 10) {
      const url = new URL("https://www.googleapis.com/customsearch/v1");
      url.searchParams.set("key", apiKey);
      url.searchParams.set("cx", cseId);
      url.searchParams.set("q", fullQuery);
      url.searchParams.set("start", start.toString());
      url.searchParams.set("num", "10");
      
      const response = await fetch(url.toString());
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`${logPrefix} Google CSE error:`, errorText);
        
        // Handle rate limiting
        if (response.status === 429) {
          console.warn(`${logPrefix} Rate limited, stopping search`);
          break;
        }
        
        throw new Error(`Google Custom Search API error: ${response.status}`);
      }
      
      const data = await response.json() as GoogleCSEResponse;
      
      if (!data.items || data.items.length === 0) {
        console.log(`${logPrefix} No more results at page ${Math.ceil(start / 10)}`);
        break;
      }
      
      // Parse each result into an event
      for (const item of data.items) {
        const event = parseSearchResultToEvent(item);
        if (event) {
          events.push(event);
        }
      }
      
      // Small delay between pages
      if (start < 21 && data.items.length === 10) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    console.log(`${logPrefix} Found ${events.length} potential events`);
    return events;
    
  } catch (error: any) {
    console.error(`${logPrefix} Search error:`, error.message);
    throw error;
  }
}

/**
 * Google Custom Search API response type.
 */
interface GoogleCSEResponse {
  items?: GoogleCSEItem[];
  searchInformation?: {
    totalResults: string;
  };
}

interface GoogleCSEItem {
  title: string;
  link: string;
  snippet: string;
  displayLink: string;
  pagemap?: {
    event?: Array<{
      name?: string;
      description?: string;
      startdate?: string;
      enddate?: string;
      location?: string;
      url?: string;
      organizer?: string;
    }>;
    metatags?: Array<Record<string, string>>;
  };
}

/**
 * Parse a Google CSE result into a DiscoveredEvent.
 */
function parseSearchResultToEvent(item: GoogleCSEItem): DiscoveredEvent | null {
  // Try to extract structured event data from pagemap
  const eventData = item.pagemap?.event?.[0];
  const metatags = item.pagemap?.metatags?.[0] || {};
  
  // Build event from available data
  const name = eventData?.name || 
               metatags["og:title"] || 
               metatags["twitter:title"] || 
               item.title;
               
  const description = eventData?.description || 
                      metatags["og:description"] || 
                      metatags["description"] || 
                      item.snippet;
  
  // Try to extract dates from various sources
  const startDate = eventData?.startdate || 
                    metatags["event:start_time"] ||
                    extractDateFromText(item.title + " " + item.snippet);
                    
  const endDate = eventData?.enddate || 
                  metatags["event:end_time"] ||
                  null;
  
  // Extract location
  const location = eventData?.location || 
                   metatags["event:location"] ||
                   extractLocationFromText(item.snippet);
  
  // Extract postcode if UK-based
  const postcode = extractPostcode(location || item.snippet);
  
  // Infer event type
  const eventType = inferEventType(name, description);
  
  // Skip if it doesn't look like an actual event
  if (!name || name.length < 5) {
    return null;
  }
  
  // Skip if it's clearly not an event (news articles, etc.)
  const lowerTitle = name.toLowerCase();
  if (lowerTitle.includes("news") || 
      lowerTitle.includes("review") ||
      lowerTitle.includes("article") ||
      lowerTitle.includes("photos from")) {
    return null;
  }
  
  return {
    name: cleanEventName(name),
    description: description?.substring(0, 500) || null,
    startDate: startDate ? normalizeDate(startDate) : null,
    endDate: endDate ? normalizeDate(endDate) : null,
    location,
    address: null,
    postcode,
    organizer: eventData?.organizer || null,
    url: eventData?.url || item.link,
    ticketInfo: null,
    sourceUrl: item.link,
    eventType,
    lat: null,
    lng: null,
  };
}

/**
 * Clean up event name from search results.
 */
function cleanEventName(name: string): string {
  return name
    .replace(/\s*[-|]\s*.*$/, "") // Remove "Event Name - Site Name"
    .replace(/\s*\|\s*.*$/, "")   // Remove "Event Name | Site Name"
    .replace(/\s+/g, " ")          // Normalize whitespace
    .trim()
    .substring(0, 255);            // Limit length
}

/**
 * Try to extract a date from text.
 * Returns ISO format date string or null.
 */
function extractDateFromText(text: string): string | null {
  // Common date patterns
  const patterns = [
    // "15 January 2026", "15th January 2026"
    /(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i,
    // "January 15, 2026"
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i,
    // "15/01/2026" or "15-01-2026"
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
    // "2026-01-15"
    /(\d{4})-(\d{2})-(\d{2})/,
  ];
  
  const months: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  };
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      try {
        let year: number, month: number, day: number;
        
        if (pattern === patterns[0]) {
          // "15 January 2026"
          day = parseInt(match[1]);
          month = months[match[2].toLowerCase()];
          year = parseInt(match[3]);
        } else if (pattern === patterns[1]) {
          // "January 15, 2026"
          month = months[match[1].toLowerCase()];
          day = parseInt(match[2]);
          year = parseInt(match[3]);
        } else if (pattern === patterns[2]) {
          // "15/01/2026" - assume UK format (DD/MM/YYYY)
          day = parseInt(match[1]);
          month = parseInt(match[2]);
          year = parseInt(match[3]);
        } else {
          // "2026-01-15"
          year = parseInt(match[1]);
          month = parseInt(match[2]);
          day = parseInt(match[3]);
        }
        
        // Validate
        if (year >= 2024 && year <= 2030 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        }
      } catch {
        continue;
      }
    }
  }
  
  return null;
}

/**
 * Try to extract location from text.
 */
function extractLocationFromText(text: string): string | null {
  // Look for "at [Location]" or "in [Location]"
  const atMatch = text.match(/(?:at|in)\s+([A-Z][^,.\n]+?)(?:,|\.|$)/i);
  if (atMatch) {
    return atMatch[1].trim();
  }
  
  return null;
}

/**
 * Normalize date string to ISO format.
 */
function normalizeDate(dateStr: string): string | null {
  if (!dateStr) return null;
  
  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr.substring(0, 10);
  }
  
  // Try to parse
  const parsed = extractDateFromText(dateStr);
  return parsed;
}

// ============================================
// EVENT MATCHING
// ============================================

/**
 * Match an event against existing things in the database.
 * 
 * Uses SQL pre-filtering followed by AI matching for ambiguous cases.
 * 
 * @param eventData - The discovered event to match
 * @param workspaceId - Tenant workspace ID
 * @returns EventMatchDecision with match result
 */
export async function matchEventToThings(
  eventData: DiscoveredEvent,
  workspaceId: number
): Promise<EventMatchDecision> {
  const logPrefix = "[sleeper-agent:event-match]";
  const db = getDrizzleDb();
  
  console.log(`${logPrefix} Matching event: "${eventData.name}" (${eventData.startDate || "no date"})`);
  
  try {
    // Step 1: SQL pre-filter - find candidates
    let query = db
      .select({
        id: things.id,
        name: things.name,
        startDate: things.startDate,
        endDate: things.endDate,
        standaloneLocation: things.standaloneLocation,
        standalonePostcode: things.standalonePostcode,
        organizer: things.organizer,
        isRecurring: things.isRecurring,
      })
      .from(things)
      .where(
        and(
          eq(things.workspaceId, workspaceId),
          // Use trigram similarity on name
          sql`similarity(lower(${things.name}), lower(${eventData.name})) > 0.3`
        )
      )
      .orderBy(desc(sql`similarity(lower(${things.name}), lower(${eventData.name}))`))
      .limit(5);
    
    // If we have a date, also filter by date proximity (within 7 days)
    if (eventData.startDate) {
      const eventDate = new Date(eventData.startDate);
      const minDate = new Date(eventDate);
      const maxDate = new Date(eventDate);
      minDate.setDate(minDate.getDate() - 7);
      maxDate.setDate(maxDate.getDate() + 7);
      
      query = db
        .select({
          id: things.id,
          name: things.name,
          startDate: things.startDate,
          endDate: things.endDate,
          standaloneLocation: things.standaloneLocation,
          standalonePostcode: things.standalonePostcode,
          organizer: things.organizer,
          isRecurring: things.isRecurring,
        })
        .from(things)
        .where(
          and(
            eq(things.workspaceId, workspaceId),
            sql`similarity(lower(${things.name}), lower(${eventData.name})) > 0.3`,
            // Date within 7 days
            sql`${things.startDate} >= ${minDate.toISOString().split('T')[0]}::date`,
            sql`${things.startDate} <= ${maxDate.toISOString().split('T')[0]}::date`
          )
        )
        .orderBy(desc(sql`similarity(lower(${things.name}), lower(${eventData.name}))`))
        .limit(5);
    }
    
    const candidates = await query;
    
    console.log(`${logPrefix} Found ${candidates.length} candidates`);
    
    // Step 2: If no candidates, it's a new event
    if (candidates.length === 0) {
      return {
        isNew: true,
        confidence: 1.0,
        reasoning: "No similar events found in database",
        isRecurringInstance: false,
      };
    }
    
    // Step 3: Map to EventCandidate format for AI matching
    const eventCandidates: EventCandidate[] = candidates.map(c => ({
      id: c.id,
      name: c.name,
      startDate: c.startDate,
      endDate: c.endDate,
      location: c.standaloneLocation,
      postcode: c.standalonePostcode,
      organizer: c.organizer,
      isRecurring: c.isRecurring || false,
    }));
    
    // Step 4: Use AI matching for ambiguous cases
    const eventInput: EventInput = {
      name: eventData.name,
      date: eventData.startDate,
      endDate: eventData.endDate,
      location: eventData.location,
      postcode: eventData.postcode,
      description: eventData.description,
      organizer: eventData.organizer,
    };
    
    const decision = await askClaudeToMatchEvent(eventInput, eventCandidates);
    
    console.log(`${logPrefix} Match decision: isNew=${decision.isNew}, confidence=${decision.confidence.toFixed(2)}`);
    
    return decision;
    
  } catch (error: any) {
    console.error(`${logPrefix} Match error:`, error.message);
    
    // On error, assume new to avoid duplicates
    return {
      isNew: true,
      confidence: 0.5,
      reasoning: `Match error: ${error.message}`,
      isRecurringInstance: false,
    };
  }
}

// ============================================
// EVENT PROCESSING
// ============================================

/**
 * Process a discovered event.
 * 
 * Steps:
 * 1. Check if event already exists (via matchEventToThings)
 * 2. If new: create thing record, link to outlet, store intelligence, notify user
 * 3. If existing: update with fresh data
 * 
 * @param event - The discovered event to process
 * @param workspaceId - Tenant workspace ID
 * @param userEmail - User email for notifications (optional)
 * @returns EventProcessResult with action taken
 */
export async function processEvent(
  event: DiscoveredEvent,
  workspaceId: number,
  userEmail?: string
): Promise<EventProcessResult> {
  const logPrefix = "[sleeper-agent:process-event]";
  const db = getDrizzleDb();
  
  console.log(`${logPrefix} Processing: "${event.name}"`);
  
  try {
    // Step 1: Match against existing events
    const matchDecision = await matchEventToThings(event, workspaceId);
    
    // Step 2: Handle based on match result
    if (!matchDecision.isNew && matchDecision.match) {
      // Update existing event with fresh data
      const updated = await updateExistingEvent(
        matchDecision.match.id,
        event,
        workspaceId
      );
      
      return {
        action: "updated",
        thingId: matchDecision.match.id,
        eventName: event.name,
        isNew: false,
        reasoning: matchDecision.reasoning,
      };
    }
    
    // Step 3: It's a new event - try to link to an outlet
    let outletId: number | undefined;
    
    if (event.location) {
      // Try to match venue to existing pub
      const venueMatch = await findMatchingEntityCached(
        {
          name: event.location,
          postcode: event.postcode,
          address: event.address,
        },
        "google_places" as EntitySource,
        workspaceId
      );
      
      if (!venueMatch.isNew && venueMatch.match) {
        outletId = venueMatch.match.id;
        console.log(`${logPrefix} Linked to outlet: ${venueMatch.match.name} (id: ${outletId})`);
      }
    }
    
    // Step 4: Calculate relevance score
    const relevanceScore = calculateEventRelevanceScore(event);
    
    // Step 5: Create the thing record
    const newThing = await createEventThing(event, workspaceId, outletId, relevanceScore);
    
    // Step 6: Store agent intelligence about the event
    await storeEventIntelligence(event, newThing.id, workspaceId);
    
    // Step 7: Email user if high relevance
    let emailSent = false;
    if (userEmail && relevanceScore >= 0.7) {
      emailSent = await sendEventDiscoveredEmail(userEmail, event, newThing.id);
    }
    
    console.log(`${logPrefix} Created event: "${newThing.name}" (id: ${newThing.id}, relevance: ${relevanceScore.toFixed(2)})`);
    
    return {
      action: "created",
      thingId: newThing.id,
      eventName: event.name,
      isNew: true,
      relevanceScore,
      emailSent,
      outletId,
      reasoning: matchDecision.reasoning,
    };
    
  } catch (error: any) {
    console.error(`${logPrefix} Error:`, error.message);
    return {
      action: "error",
      eventName: event.name,
      isNew: false,
      error: error.message,
    };
  }
}

/**
 * Create a new thing record for an event.
 */
async function createEventThing(
  event: DiscoveredEvent,
  workspaceId: number,
  outletId?: number,
  relevanceScore?: number
): Promise<SelectThing> {
  const db = getDrizzleDb();
  
  // Determine if this might be a recurring event
  const isRecurring = detectRecurringEvent(event);
  
  const insertData: InsertThing = {
    workspaceId,
    thingType: event.eventType,
    name: event.name,
    description: event.description,
    startDate: event.startDate,
    endDate: event.endDate,
    isRecurring,
    outletId: outletId || null,
    standaloneLocation: outletId ? null : event.location,
    standaloneAddress: outletId ? null : event.address,
    standalonePostcode: outletId ? null : event.postcode,
    latitude: event.lat?.toString(),
    longitude: event.lng?.toString(),
    url: event.url,
    organizer: event.organizer,
    status: "upcoming",
    discoveredBy: "ai_sleeper_agent",
    discoveredAt: new Date(),
    sourceUrl: event.sourceUrl,
    relevanceScore,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  
  const [newThing] = await db.insert(things).values(insertData).returning();
  
  return newThing;
}

/**
 * Update an existing event with fresh data.
 */
async function updateExistingEvent(
  thingId: number,
  event: DiscoveredEvent,
  workspaceId: number
): Promise<void> {
  const db = getDrizzleDb();
  
  await db
    .update(things)
    .set({
      description: event.description || undefined,
      url: event.url || undefined,
      sourceUrl: event.sourceUrl || undefined,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(things.id, thingId),
        eq(things.workspaceId, workspaceId)
      )
    );
}

/**
 * Store agent intelligence about a discovered event.
 */
async function storeEventIntelligence(
  event: DiscoveredEvent,
  thingId: number,
  workspaceId: number
): Promise<void> {
  const db = getDrizzleDb();
  
  try {
    const intelligenceData: InsertAgentIntelligence = {
      workspaceId,
      entityType: "thing",
      entityId: thingId,
      intelligenceType: "event_discovery",
      observation: `Discovered ${event.eventType.replace(/_/g, " ")} event: "${event.name}" from web search`,
      data: {
        eventType: event.eventType,
        location: event.location,
        postcode: event.postcode,
        startDate: event.startDate,
        sourceUrl: event.sourceUrl,
        discoveredAt: new Date().toISOString(),
      },
      confidence: calculateEventRelevanceScore(event),
      source: "sleeper_agent",
      createdAt: new Date(),
    };
    
    await db.insert(agentIntelligence).values(intelligenceData);
  } catch (error) {
    console.error("[sleeper-agent] Failed to store event intelligence:", error);
    // Non-critical, don't throw
  }
}

/**
 * Detect if an event is likely recurring based on name/description.
 */
function detectRecurringEvent(event: DiscoveredEvent): boolean {
  const text = `${event.name} ${event.description || ""}`.toLowerCase();
  
  const recurringIndicators = [
    "annual",
    "yearly",
    "every year",
    "nth edition",
    "\\d+(?:st|nd|rd|th) annual",
    "\\d+(?:st|nd|rd|th) edition",
    "weekly",
    "monthly",
    "every month",
    "every week",
  ];
  
  for (const indicator of recurringIndicators) {
    if (new RegExp(indicator, "i").test(text)) {
      return true;
    }
  }
  
  return false;
}

// ============================================
// EVENT EMAIL NOTIFICATIONS
// ============================================

/**
 * Send email about a newly discovered event.
 */
async function sendEventDiscoveredEmail(
  userEmail: string,
  event: DiscoveredEvent,
  thingId: number
): Promise<boolean> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    const baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const eventUrl = `${baseUrl}/crm/things/${thingId}`;
    
    const eventTypeLabel = event.eventType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    
    await client.emails.send({
      from: fromEmail,
      to: userEmail,
      subject: `🎉 Event Discovered: ${event.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #7c3aed;">🎉 Relevant Event Discovered</h2>
          
          <p>Wyshbone's AI sleeper agent has discovered an event that might interest you:</p>
          
          <div style="background: #f5f3ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #7c3aed;">
            <p style="margin: 0 0 5px 0; color: #7c3aed; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
              ${eventTypeLabel}
            </p>
            <h3 style="margin: 0 0 10px 0; color: #1f2937;">${event.name}</h3>
            ${event.startDate ? `<p style="margin: 5px 0; color: #6b7280;">📅 ${formatEventDate(event.startDate, event.endDate)}</p>` : ""}
            ${event.location ? `<p style="margin: 5px 0; color: #6b7280;">📍 ${event.location}${event.postcode ? `, ${event.postcode}` : ""}</p>` : ""}
            ${event.organizer ? `<p style="margin: 5px 0; color: #6b7280;">🎤 ${event.organizer}</p>` : ""}
            ${event.description ? `<p style="margin: 10px 0 0 0; color: #374151; font-size: 14px;">${event.description.substring(0, 200)}${event.description.length > 200 ? "..." : ""}</p>` : ""}
          </div>
          
          <p>
            This event has been added to your "Things" list for tracking.
          </p>
          
          <p style="margin-top: 20px;">
            <a href="${eventUrl}" style="background: #7c3aed; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-right: 10px;">
              View Event Details →
            </a>
            ${event.url ? `<a href="${event.url}" style="color: #7c3aed; padding: 12px 24px; text-decoration: none;">Visit Website</a>` : ""}
          </p>
          
          <p style="color: #9ca3af; font-size: 12px; margin-top: 30px;">
            This email was sent by Wyshbone's AI Sleeper Agent.
          </p>
        </div>
      `,
    });
    
    console.log(`[sleeper-agent:email] Sent event discovered email to ${userEmail}`);
    return true;
  } catch (error) {
    console.error("[sleeper-agent:email] Failed to send event email:", error);
    return false;
  }
}

/**
 * Format event date for display.
 */
function formatEventDate(startDate: string, endDate?: string | null): string {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };
  
  if (endDate && endDate !== startDate) {
    return `${formatDate(startDate)} - ${formatDate(endDate)}`;
  }
  
  return formatDate(startDate);
}

// ============================================
// BATCH EVENT DISCOVERY
// ============================================

/**
 * Run event discovery for a query and location.
 * 
 * @param query - Search query (e.g., "beer festival", "craft beer expo")
 * @param location - Location string (e.g., "UK", "London")
 * @param workspaceId - Tenant workspace ID
 * @param userEmail - User email for notifications
 * @returns EventDiscoveryRunSummary with results
 */
export async function runEventDiscovery(
  query: string,
  location: string,
  workspaceId: number,
  userEmail?: string
): Promise<EventDiscoveryRunSummary> {
  const logPrefix = "[sleeper-agent:event-discovery]";
  const startedAt = new Date();
  
  console.log(`${logPrefix} Starting event discovery: "${query}" in ${location}`);
  
  const results: EventProcessResult[] = [];
  let eventsFound = 0;
  let newEvents = 0;
  let updatedEvents = 0;
  let skippedEvents = 0;
  let errors = 0;
  
  try {
    // Search for events
    const events = await searchGoogleForEvents(query, location);
    eventsFound = events.length;
    
    console.log(`${logPrefix} Found ${eventsFound} events to process`);
    
    // Process each event
    for (const event of events) {
      const result = await processEvent(event, workspaceId, userEmail);
      results.push(result);
      
      switch (result.action) {
        case "created":
          newEvents++;
          break;
        case "updated":
          updatedEvents++;
          break;
        case "skipped":
          skippedEvents++;
          break;
        case "error":
          errors++;
          break;
      }
      
      // Small delay between processing
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
  } catch (error: any) {
    console.error(`${logPrefix} Event discovery failed:`, error.message);
    errors++;
  }
  
  const completedAt = new Date();
  const duration = (completedAt.getTime() - startedAt.getTime()) / 1000;
  
  console.log(`${logPrefix} Completed in ${duration.toFixed(1)}s: ${newEvents} new, ${updatedEvents} updated, ${errors} errors`);
  
  return {
    query,
    location,
    eventsFound,
    newEvents,
    updatedEvents,
    skippedEvents,
    errors,
    startedAt,
    completedAt,
    results,
  };
}
