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
 * Uses simple keyword matching for now - can be enhanced with ML classifier later.
 */
export function detectLeadIntent(userMessage: string): boolean {
  const normalized = userMessage.toLowerCase();
  return LEAD_INTENT_KEYWORDS.some(keyword => normalized.includes(keyword));
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
 * Uses sequential mapping: first answer → first missing field, etc.
 */
export async function parseClarificationAnswers(
  userMessage: string,
  pendingFields: string[]
): Promise<Partial<LeadRequestContext>> {
  // Simple sequential mapping for now
  // Can be enhanced with GPT extraction if needed
  
  const context: Partial<LeadRequestContext> = {};
  
  // For now, treat the entire message as answering the first pending field
  // This is simple but works for most cases
  if (pendingFields.length > 0) {
    const field = pendingFields[0] as keyof LeadRequestContext;
    (context as any)[field] = userMessage.trim();
  }
  
  // TODO: Enhance with GPT extraction to parse multiple answers from one message
  // e.g., "London, pub owners, 50, this week" should fill all four fields
  
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
  const isLeadIntent = detectLeadIntent(userMessage);
  
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
