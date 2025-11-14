/**
 * Lead Clarification Helper (UI-002)
 * 
 * Centralized logic for detecting lead intent, checking missing fields,
 * generating clarifying questions, parsing answers, and enriching tool contexts.
 * 
 * This keeps the /api/chat endpoint clean and maintainable.
 */

import {
  getLeadRequestContext,
  saveLeadRequestContext,
  clearLeadRequestContext,
  getMissingLeadFields,
  buildClarifyingQuestions,
  isAwaitingClarification,
  setAwaitingClarification,
  clearAwaitingClarification,
  getPendingClarificationFields,
  type LeadRequestContext,
} from "./leadContextHelper";
import { storage } from "./storage";
import { openai } from "./openai";

// Tool names that trigger lead clarification
const LEAD_TOOL_NAMES = [
  "search_wyshbone_database",
  "saleshandy_batch_call",
  "bubble_run_batch", // Legacy but still supported
  "create_scheduled_monitor", // Only when used for business monitoring
];

// Keywords that indicate lead/sales intent
const LEAD_INTENT_KEYWORDS = [
  "find", "search", "get", "show", "list", "lookup", "discover",
  "leads", "contacts", "emails", "prospects", "businesses", "companies",
  "pubs", "restaurants", "shops", "stores", "cafes", "coffee", "bar", "hotel",
  "dentist", "dental", "gym", "salon", "spa", "clinic", "practice",
  "monitor", "track", "watch", "check", "schedule", "automate"
];

/**
 * Detect if the user message is likely to trigger lead-related tools.
 * Uses simple keyword matching + checks for existing lead context (for follow-ups).
 */
export async function detectLeadIntent(userMessage: string, sessionId: string): Promise<boolean> {
  const normalized = userMessage.toLowerCase();
  
  // Direct keyword match
  const hasKeywords = LEAD_INTENT_KEYWORDS.some(keyword => normalized.includes(keyword));
  if (hasKeywords) {
    return true;
  }
  
  // Check if we have existing lead context (indicates follow-up to lead request)
  const existingContext = await storage.getLeadRequestContext(sessionId);
  const hasExistingContext = Object.keys(existingContext).length > 0;
  
  if (hasExistingContext) {
    // This might be a follow-up to a lead request
    // Check for continuation indicators or missing field answers
    const continuationIndicators = ['yes', 'yeah', 'sure', 'okay', 'ok', 'go ahead', 'let\'s do it', 'sounds good', 'proceed'];
    const isContinuation = continuationIndicators.some(phrase => normalized.includes(phrase));
    
    if (isContinuation) {
      return true;
    }
    
    // Check if message contains location/number info (likely filling in missing fields)
    const hasLocationInfo = /\b(in|at|around|near|from)\b/.test(normalized);
    const hasNumberInfo = /\d+/.test(normalized);
    
    if (hasLocationInfo || hasNumberInfo) {
      return true;
    }
  }
  
  return false;
}

/**
 * Extract lead context parameters from a user message using GPT-4o-mini.
 * Returns partial context that can be merged with existing context.
 */
export async function extractLeadContext(
  userMessage: string,
  conversationHistory: string[]
): Promise<Partial<LeadRequestContext>> {
  try {
    const extractionPrompt = [
      {
        role: "system" as const,
        content: `Extract lead request parameters from the user's message. Return JSON with ONLY the fields you can confidently extract:

Possible fields:
- targetRegion: Location/region for the lead search (e.g., "North West", "London", "Texas", "UK-wide")
- targetPersona: Who to contact (e.g., "pub landlords", "coffee shop owners", "dental practice managers")
- volume: How many leads (e.g., "50", "25-30", "a small batch", "100")
- timing: When/how fast (e.g., "this week", "ongoing weekly", "by Friday", "as soon as possible")

IMPORTANT:
- Only include fields you can extract with confidence
- If a field is vague (e.g., "anywhere", "anyone"), mark it as the vague term itself (we'll catch it later)
- Look at recent conversation context to resolve references like "those cities", "same location"

Examples:
- "Find me 50 pubs in the North West where I can email the landlord this week" →
  {"targetRegion": "North West", "targetPersona": "pub landlords", "volume": "50", "timing": "this week"}
- "Can you find me some bars to pitch this month?" →
  {"targetPersona": "bars", "timing": "this month"}
- "I want to contact places about my beer, as many as possible" →
  {"targetPersona": "places", "volume": "as many as possible"}`,
      },
      {
        role: "user" as const,
        content: `Recent conversation:\n${conversationHistory.slice(-5).join('\n')}\n\nCurrent message: "${userMessage}"\n\nExtract lead parameters:`,
      },
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: extractionPrompt,
      response_format: { type: "json_object" },
    });

    const extracted = JSON.parse(response.choices[0]?.message?.content || "{}");
    console.log("📊 Extracted lead context:", extracted);
    
    return extracted as Partial<LeadRequestContext>;
  } catch (error: any) {
    console.error("❌ Lead context extraction error:", error.message);
    return {};
  }
}

/**
 * Parse answers from a clarification response and map them to pending fields.
 * Handles multi-field answers by splitting on commas, "and", or line breaks.
 */
export async function parseClarificationAnswers(
  userMessage: string,
  pendingFields: Array<keyof LeadRequestContext>
): Promise<Partial<LeadRequestContext>> {
  const context: Partial<LeadRequestContext> = {};
  
  if (pendingFields.length === 0) {
    return context;
  }
  
  // If only one field pending, use the entire message
  if (pendingFields.length === 1) {
    const field = pendingFields[0];
    (context as any)[field] = userMessage.trim();
    return context;
  }
  
  // Multiple fields pending - try to parse multiple answers
  // Split on common separators: commas, "and", line breaks
  const segments = userMessage
    .split(/[,\n]+|\s+and\s+/i)
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  // Map each segment to corresponding pending field
  for (let i = 0; i < pendingFields.length; i++) {
    const field = pendingFields[i];
    
    if (i < segments.length) {
      // We have a segment for this field
      (context as any)[field] = segments[i];
    } else if (i === pendingFields.length - 1 && segments.length > pendingFields.length) {
      // More segments than fields - merge extras into last field
      const remainingSegments = segments.slice(i);
      (context as any)[field] = remainingSegments.join(', ');
    }
  }
  
  return context;
}

/**
 * Main handler for lead clarification flow.
 * Called from /api/chat before OpenAI tool calling.
 * 
 * Returns:
 * - { type: 'proceed', context } if all fields are ready - proceed with tools
 * - { type: 'clarify', questions } if we need to ask clarifying questions - return early
 * - { type: 'skip' } if this is not a lead request - skip clarification entirely
 */
export async function handleLeadClarification(params: {
  sessionId: string;
  userMessage: string;
  conversationHistory: string[];
}): Promise<
  | { type: 'skip' }
  | { type: 'clarify'; questions: string[]; formattedMessage: string }
  | { type: 'proceed'; context: LeadRequestContext; enrichedSystemMessage: string }
> {
  const { sessionId, userMessage, conversationHistory } = params;

  // Step 1: Check if we're currently awaiting clarification answers
  const awaitingClarification = await isAwaitingClarification(sessionId);
  
  if (awaitingClarification) {
    console.log("🔄 Parsing clarification answers from user");
    
    // Get pending fields
    const pendingFields = await getPendingClarificationFields(sessionId);
    
    // Parse the answer
    const parsedContext = await parseClarificationAnswers(userMessage, pendingFields);
    
    // Load existing context and merge
    const existingContext = await getLeadRequestContext(sessionId);
    const mergedContext = { ...existingContext, ...parsedContext };
    
    // Save updated context
    await saveLeadRequestContext(sessionId, mergedContext);
    
    // Check if we still have missing fields
    const missingFields = getMissingLeadFields(mergedContext);
    
    if (missingFields.length > 0) {
      // Still missing fields - ask again (max 3 questions total)
      const questions = buildClarifyingQuestions(missingFields);
      const formattedMessage = `Thanks! Just a bit more detail:\n\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;
      
      // Update awaiting state with new pending fields
      await setAwaitingClarification(sessionId, missingFields);
      
      return { type: 'clarify', questions, formattedMessage };
    } else {
      // All fields filled! Clear awaiting state and proceed
      await clearAwaitingClarification(sessionId);
      
      // Create enriched system message
      const enrichedSystemMessage = buildEnrichedSystemMessage(mergedContext);
      
      return { type: 'proceed', context: mergedContext, enrichedSystemMessage };
    }
  }

  // Step 2: Detect if this is a new lead request
  const isLeadIntent = await detectLeadIntent(userMessage, sessionId);
  
  if (!isLeadIntent) {
    // Not a lead request - skip clarification
    return { type: 'skip' };
  }

  console.log("🎯 Lead intent detected - checking for missing fields");

  // Step 3: Extract what we can from the user message
  const extractedContext = await extractLeadContext(userMessage, conversationHistory);
  
  // Load existing context (may have info from previous messages in this session)
  const existingContext = await getLeadRequestContext(sessionId);
  
  // Merge: new extraction takes precedence
  const mergedContext = { ...existingContext, ...extractedContext };
  
  // Save merged context
  await saveLeadRequestContext(sessionId, mergedContext);

  // Step 4: Check for missing fields
  const missingFields = getMissingLeadFields(mergedContext);
  
  if (missingFields.length === 0) {
    // All fields present - proceed with tools!
    console.log("✅ All lead fields present - proceeding with tools");
    
    const enrichedSystemMessage = buildEnrichedSystemMessage(mergedContext);
    
    return { type: 'proceed', context: mergedContext, enrichedSystemMessage };
  }

  // Step 5: Missing fields - ask clarifying questions
  console.log(`❓ Missing ${missingFields.length} lead fields - asking clarification questions`);
  
  const questions = buildClarifyingQuestions(missingFields);
  const formattedMessage = `To get this right, I need a bit more detail:\n\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;
  
  // Set awaiting clarification state
  await setAwaitingClarification(sessionId, missingFields);
  
  return { type: 'clarify', questions, formattedMessage };
}

/**
 * Build an enriched system message that injects the lead context into the conversation.
 * This guides the AI to use the captured parameters when calling tools.
 */
function buildEnrichedSystemMessage(context: LeadRequestContext): string {
  const parts: string[] = [];
  
  parts.push("**LEAD REQUEST CONTEXT (Use these parameters when calling lead tools):**");
  
  if (context.targetRegion) {
    parts.push(`- Target Region: ${context.targetRegion}`);
  }
  if (context.targetPersona) {
    parts.push(`- Target Persona: ${context.targetPersona}`);
  }
  if (context.volume) {
    parts.push(`- Volume: ${context.volume} leads`);
  }
  if (context.timing) {
    parts.push(`- Timing: ${context.timing}`);
  }
  
  parts.push("\nWhen calling lead search tools (search_wyshbone_database, saleshandy_batch_call, create_scheduled_monitor), incorporate these parameters into your tool calls.");
  
  return parts.join('\n');
}

/**
 * Clear lead context for a session (call this when starting a new search).
 */
export async function clearLeadContext(sessionId: string): Promise<void> {
  await clearLeadRequestContext(sessionId);
  await clearAwaitingClarification(sessionId);
  console.log("🧹 Cleared lead context for session:", sessionId);
}
