import OpenAI from "openai";
import { storage } from "./storage";
import { randomUUID } from "crypto";
import { buildPersonalizedSystemPrompt } from "./openai";
import type { SessionContext } from "./lib/context";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string; name?: string };
type Conversation = ChatMessage[];

export type VenueCache = {
  placeId: string;
  name: string;
  address: string;
  served: boolean;
}[];

const conversations = new Map<string, Conversation>();
const venueCaches = new Map<string, VenueCache>();
const runIds = new Map<string, string>();

export const SYSTEM_PROMPT: ChatMessage = {
  role: "system",
  content:
    "You are Wyshbone AI, a helpful sales/research assistant powered by GPT-5 with live web search capabilities. " +
    "Be concise, practical, and action-oriented.\n\n" +
    "CAPABILITIES:\n" +
    "- You have live internet access via web search to fetch current information, news, weather, and real-time data\n" +
    "- You remember the session context and previously found venues\n" +
    "- You can access verified business data via Wyshbone Global Database\n" +
    "- You can trigger Wyshbone backend workflows in batch via bubble_run_batch (uses Smartlead for campaigns)\n" +
    "- You can find contacts using saleshandy_batch_call (uses Hunter.io + SalesHandy - up to 60 results per search)\n\n" +
    "TOOL SELECTION RULES:\n" +
    "Both bubble_run_batch and saleshandy_batch_call search for business TYPES (e.g., 'restaurants', 'dentists').\n" +
    "The ONLY difference is the email provider:\n" +
    "- bubble_run_batch → Uses Smartlead for campaign management (legacy system)\n" +
    "- saleshandy_batch_call → Uses Hunter.io email discovery + SalesHandy campaigns (new cost-optimized system)\n\n" +
    "When user requests contact finding for business types, prefer saleshandy_batch_call (it's more cost-effective).\n" +
    "Examples:\n" +
    "- 'find contacts for restaurants in London targeting owners' → saleshandy_batch_call\n" +
    "- 'get emails for coffee shops in Manchester, target CEOs' → saleshandy_batch_call\n" +
    "- 'find dentists in Texas for Head of Sales role' → saleshandy_batch_call\n\n" +
    "CRITICAL MESSAGE PRIORITY RULES:\n" +
    "1. ⚡ CURRENT CONVERSATION (last 5-10 messages) = ABSOLUTE TOP PRIORITY - This is the active context\n" +
    "2. 📚 Durable Memory (stored facts) = FALLBACK ONLY - Use only when current conversation lacks details\n" +
    "3. When user says vague phrases like 'deep dive', 'yes', 'go ahead', 'do it' → LOOK AT CURRENT CONVERSATION FIRST\n\n" +
    "CONTEXT RESOLUTION FLOW:\n" +
    "Step 1: Check the CURRENT CONVERSATION messages for recent topics/context (last 5-10 messages)\n" +
    "Step 2: If current conversation has clear context → USE IT IMMEDIATELY (e.g., 'pubs in Kendal' mentioned recently)\n" +
    "Step 3: If current conversation is ambiguous → Check durable memory as fallback\n" +
    "Step 4: Only ask for confirmation if genuinely ambiguous - don't ask endlessly\n\n" +
    "EXAMPLES:\n" +
    "✅ CORRECT - Prioritizing current conversation:\n" +
    "  User: 'I'm looking for pubs in Kendal'\n" +
    "  User: 'do a deep dive'\n" +
    "  → AI proceeds immediately with deep research on 'pubs in Kendal' (CORRECT - clear context from recent conversation)\n\n" +
    "✅ CORRECT - Using durable memory as fallback:\n" +
    "  User starts NEW chat: 'Find coffee shops'\n" +
    "  Memory shows: 'Previously interested in Manchester'\n" +
    "  → AI asks: 'Would you like me to find coffee shops in Manchester?' (CONFIRM because combining memory with new input)\n\n" +
    "❌ WRONG - Ignoring current conversation:\n" +
    "  User: 'looking for pubs in Texas'\n" +
    "  User: 'deep dive'\n" +
    "  → AI asks 'What would you like me to research?' (WRONG - should have proceeded with 'pubs in Texas' from current conversation)\n\n" +
    "When vague input is detected ('deep dive', 'yes', 'do it'), your response MUST:\n" +
    "a) Extract topic from CURRENT CONVERSATION messages (highest priority)\n" +
    "b) If no topic in current conversation, check durable memory (fallback)\n" +
    "c) Ask for confirmation when making ANY assumption\n\n" +
    "WORKFLOW for venue discovery:\n" +
    "1. Analyze the user's query in context of the conversation\n" +
    "2. Check if you can answer from previously found venues (marked 'served: false' means not yet shown)\n" +
    "3. Only search for NEW venues via /api/places/search if you need more results\n" +
    "4. Never fabricate Place IDs - only use verified Wyshbone Global Database results\n" +
    "5. Track which venues you've shown to avoid duplicates\n\n" +
    "BUBBLE BATCH WORKFLOW - TOOL EXECUTION RULES:\n" +
    "When user requests a business search, gather these requirements BEFORE calling the tool:\n\n" +
    "1. Business type(s) - If missing, ask: 'What type of businesses?'\n" +
    "2. Location - If missing, ask: 'Which location/country?'\n" +
    "3. Job role/position - If missing, ask: 'Which job role?' (e.g., CEO, Head of Sales)\n" +
    "4. Number of regions - Default to 1 if not specified\n\n" +
    "CRITICAL: Once you have business_type + location + job_role → IMMEDIATELY call bubble_run_batch function tool!\n" +
    "DO NOT respond conversationally after gathering these 3 required fields. You MUST call the function tool.\n\n" +
    "Examples:\n" +
    "User: 'cardboard engineering london' → You ask: 'Which job role?'\n" +
    "User: 'CEO' → You MUST call bubble_run_batch({business_types:['cardboard engineering'],country:'London',roles:['CEO']})\n\n" +
    "User: 'Find bars in New York for CEOs' → You MUST call bubble_run_batch({business_types:['bars'],country:'New York',roles:['CEO']})\n\n" +
    "NEVER say 'I've completed the workflow' or 'I've triggered the search' without ACTUALLY calling the bubble_run_batch tool!\n\n" +
    "When enriching contacts: Only return PUBLIC contact info with a verifiable source URL. " +
    "Never guess personal emails, phone numbers, or names. If unsure, return an empty contacts list.",
};

export function getConversation(sessionId: string): Conversation {
  if (!conversations.has(sessionId)) {
    conversations.set(sessionId, [SYSTEM_PROMPT]);
  }
  return conversations.get(sessionId)!;
}

export function appendMessage(sessionId: string, msg: ChatMessage) {
  const convo = getConversation(sessionId);
  convo.push(msg);
}

export function resetConversation(sessionId: string) {
  conversations.set(sessionId, [SYSTEM_PROMPT]);
  venueCaches.delete(sessionId);
  // Note: runIds are now keyed by conversationId, not sessionId
  // New conversations get new conversationIds, which automatically get fresh runIds
}

export function getVenueCache(sessionId: string): VenueCache {
  if (!venueCaches.has(sessionId)) {
    venueCaches.set(sessionId, []);
  }
  return venueCaches.get(sessionId)!;
}

export function addVenuesToCache(sessionId: string, venues: { placeId: string; name: string; address: string }[]) {
  const cache = getVenueCache(sessionId);
  for (const venue of venues) {
    if (!cache.find((v) => v.placeId === venue.placeId)) {
      cache.push({ ...venue, served: false });
    }
  }
}

export function markVenuesAsServed(sessionId: string, placeIds: string[]) {
  const cache = getVenueCache(sessionId);
  for (const venue of cache) {
    if (placeIds.includes(venue.placeId)) {
      venue.served = true;
    }
  }
}

/**
 * Get or create a unified runId for a conversation
 * This ensures all messages in a conversation use the same runId for Tower logging
 * @param conversationId - Unique conversation identifier (prevents cross-user collision)
 */
export function getOrCreateRunId(conversationId: string): string {
  if (!runIds.has(conversationId)) {
    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    runIds.set(conversationId, runId);
    console.log(`🆕 Created new unified runId for conversation ${conversationId}: ${runId}`);
  }
  return runIds.get(conversationId)!;
}

/**
 * Reset the runId for a conversation (called when conversation data is cleaned up)
 */
export function resetRunId(conversationId: string) {
  runIds.delete(conversationId);
  console.log(`🔄 Reset runId for conversation ${conversationId}`);
}

export function getVenueCacheContext(sessionId: string): string {
  const cache = getVenueCache(sessionId);
  if (cache.length === 0) return "No venues found yet in this session.";
  
  const served = cache.filter((v) => v.served);
  const unserved = cache.filter((v) => !v.served);
  
  let context = `Venue cache (${cache.length} total):\n`;
  if (served.length > 0) {
    context += `Already shown (${served.length}): ${served.map((v) => v.name).join(", ")}\n`;
  }
  if (unserved.length > 0) {
    context += `Not yet shown (${unserved.length}): ${unserved.map((v) => `${v.name} [${v.placeId}]`).join(", ")}`;
  }
  return context;
}

export async function maybeSummarize(
  sessionId: string,
  openai: OpenAI,
  maxMessages = 18
) {
  const convo = getConversation(sessionId);
  if (convo.length <= maxMessages) return;

  const summaryPrompt: ChatMessage[] = [
    {
      role: "system",
      content:
        "Summarize the conversation so far into key facts, goals, and outputs in ~120 words. " +
        "Do not invent details.",
    },
    ...convo,
  ];

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: summaryPrompt,
    max_tokens: 220,
  });

  const summary = resp.choices[0]?.message?.content ?? "";
  const lastAssistant = [...convo].reverse().find((m) => m.role === "assistant");

  conversations.set(sessionId, [
    SYSTEM_PROMPT,
    { role: "system", content: "Session summary so far: " + summary },
    ...(lastAssistant ? [lastAssistant] : []),
  ]);
}

const FACT_EXTRACTOR_PROMPT = (latestUser: string, latestAssistant: string) => `
From the most recent exchange, extract up to 3 durable, future-useful facts about the user or their long-term goals, preferences, constraints, or ongoing projects.

Rules:
- Only include facts likely true for months
- Avoid sensitive attributes unless explicitly stated
- Keep each fact 1 short sentence
- If no durable facts exist, return an empty list

Assign each fact a score from 0-100 AND a category based on importance and durability.

CRITICAL SCORING & CATEGORY GUIDELINES:
- Industries/business types mentioned (e.g., "coffee shops", "pubs", "dentistry", "veterinary supplies"): Score 85-95, category "industry"
- Locations/places mentioned (e.g., "London", "Texas", "Manchester", specific cities/regions): Score 85-95, category "place"
- Subjects/topics of interest (e.g., "deep research", "marketing agencies", "breweries"): Score 80-90, category "subject"
- User preferences and working style: Score 70-80, category "preference"
- General conversational context: Score 50-70, category "general"

Industries, locations, and subjects are HIGH PRIORITY and should receive the highest scores.

Return strict JSON: {"facts":[{"text":"...", "score": 0-100, "category": "industry"|"place"|"subject"|"preference"|"general"}, ...]}

Recent exchange:
USER: ${latestUser}
ASSISTANT: ${latestAssistant}
`;

export async function getOrCreateConversation(
  userId: string,
  conversationId?: string
): Promise<string> {
  if (conversationId) {
    const existing = await storage.getConversation(conversationId);
    if (existing) return conversationId;
  }

  const newId = randomUUID();
  await storage.createConversation({
    id: newId,
    userId,
    label: "New Chat",
    createdAt: Date.now(),
  });

  return newId;
}

export async function updateConversationLabel(
  conversationId: string,
  firstUserMessage: string
): Promise<void> {
  const truncated = firstUserMessage.slice(0, 50).trim();
  const label = firstUserMessage.length > 50 
    ? (truncated.lastIndexOf(' ') > 20 
        ? truncated.slice(0, truncated.lastIndexOf(' ')) + '...'
        : truncated)
    : truncated;
  
  const conversation = await storage.getConversation(conversationId);
  if (conversation && (conversation.label === "New Chat" || conversation.label === "Conversation")) {
    await storage.updateConversation(conversationId, { label });
    console.log(`📝 Updated conversation label to: "${label}"`);
  }
}

export async function saveMessage(
  conversationId: string,
  role: "user" | "assistant" | "system",
  content: string
): Promise<void> {
  await storage.createMessage({
    id: randomUUID(),
    conversationId,
    role,
    content,
    createdAt: Date.now(),
  });
}

export async function loadConversationHistory(
  conversationId: string,
  maxMessages: number = 14
): Promise<ChatMessage[]> {
  // Load messages from local database (UI messages)
  const localMessages = await storage.listMessages(conversationId);
  
  // Load Supervisor messages from Supabase (if configured)
  let supervisorMessages: any[] = [];
  try {
    const { getSupervisorMessages, isSupabaseConfigured } = await import('./supabase-client');
    
    if (isSupabaseConfigured()) {
      supervisorMessages = await getSupervisorMessages(conversationId);
      console.log(`📨 Loaded ${supervisorMessages.length} Supervisor messages from Supabase`);
    }
  } catch (error) {
    console.warn('⚠️ Failed to load Supervisor messages:', error);
  }
  
  // Merge and sort all messages by timestamp
  const allMessages = [
    ...localMessages.map(msg => ({
      ...msg,
      createdAt: msg.createdAt,
      source: 'ui' as const
    })),
    ...supervisorMessages.map(msg => {
      // Normalize timestamp - handle numeric, string, or missing values
      let createdAt: number;
      if (typeof msg.created_at === 'number') {
        createdAt = msg.created_at;
      } else if (typeof msg.created_at === 'string') {
        const parsed = Date.parse(msg.created_at);
        createdAt = isNaN(parsed) ? Date.now() : parsed;
      } else {
        createdAt = Date.now();
      }
      
      return {
        id: msg.id,
        conversationId: msg.conversation_id,
        role: msg.role, // Keep original role for now, normalize later
        content: msg.content,
        createdAt,
        source: 'supervisor' as const,
        metadata: msg.metadata
      };
    })
  ].sort((a, b) => a.createdAt - b.createdAt);
  
  // Take the most recent messages
  const recentMessages = allMessages.slice(Math.max(0, allMessages.length - maxMessages));
  
  // Format for AI context - normalize roles and tag Supervisor messages
  return recentMessages.map(msg => {
    // Normalize role to OpenAI-compatible values
    let normalizedRole: "user" | "assistant" | "system";
    if (msg.role === 'supervisor' || msg.role === 'assistant') {
      normalizedRole = 'assistant'; // Supervisor messages are assistant responses
    } else if (msg.role === 'user') {
      normalizedRole = 'user';
    } else if (msg.role === 'system') {
      normalizedRole = 'system';
    } else {
      // Fallback for any unknown roles
      console.warn(`⚠️ Unknown message role '${msg.role}', defaulting to 'assistant'`);
      normalizedRole = 'assistant';
    }
    
    const baseMessage: ChatMessage = {
      role: normalizedRole,
      content: msg.content,
    };
    
    // Tag Supervisor messages so AI knows they're from the Supervisor
    if (msg.source === 'supervisor') {
      return {
        ...baseMessage,
        name: 'Supervisor', // OpenAI allows 'name' field to distinguish speakers
      } as ChatMessage;
    }
    
    return baseMessage;
  });
}

export async function extractAndSaveFacts(
  userId: string,
  conversationId: string,
  latestUserMessage: string,
  latestAssistantMessage: string,
  openai: OpenAI
): Promise<void> {
  try {
    const extract = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.0,
      messages: [
        { role: "system", content: "You extract facts in strict JSON format." },
        { role: "user", content: FACT_EXTRACTOR_PROMPT(latestUserMessage, latestAssistantMessage) }
      ]
    });

    const raw = extract.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);
    const factsOut = Array.isArray(parsed?.facts) ? parsed.facts : [];

    for (const f of factsOut.slice(0, 3)) {
      if (!f?.text) continue;
      
      const score = Math.max(0, Math.min(100, Math.floor(Number(f.score ?? 50))));
      const category = ['industry', 'place', 'subject', 'preference', 'general'].includes(f.category) 
        ? f.category 
        : 'general';
      
      await storage.createFact({
        id: randomUUID(),
        userId,
        sourceConversationId: conversationId,
        sourceMessageId: null,
        fact: String(f.text).slice(0, 400),
        score,
        category,
        createdAt: Date.now(),
      });
    }
  } catch (e: any) {
    console.error('Fact extraction error:', e?.message);
  }
}

export async function extractFactsFromPrompt(
  userId: string,
  prompt: string,
  openai: OpenAI
): Promise<void> {
  try {
    const extractPrompt = `
Extract durable facts about the user's interests, goals, or preferences from this research request.

Rules:
- Only include facts likely true for months
- Keep each fact 1 short sentence
- If no durable facts exist, return an empty list

Assign each fact a score from 0-100 AND a category based on importance and durability.

CRITICAL SCORING & CATEGORY GUIDELINES:
- Industries/business types mentioned (e.g., "coffee shops", "pubs", "dentistry", "veterinary supplies"): Score 85-95, category "industry"
- Locations/places mentioned (e.g., "London", "Texas", "Manchester", "Hampshire", specific cities/regions): Score 85-95, category "place"
- Subjects/topics of interest (e.g., "deep research", "marketing agencies", "breweries"): Score 80-90, category "subject"
- User preferences and working style: Score 70-80, category "preference"
- General conversational context: Score 50-70, category "general"

Industries, locations, and subjects are HIGH PRIORITY and should receive the highest scores.

Return strict JSON: {"facts":[{"text":"...", "score": 0-100, "category": "industry"|"place"|"subject"|"preference"|"general"}, ...]}

Research request:
${prompt}
`;

    const extract = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.0,
      messages: [
        { role: "system", content: "You extract facts in strict JSON format." },
        { role: "user", content: extractPrompt }
      ]
    });

    const raw = extract.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);
    const factsOut = Array.isArray(parsed?.facts) ? parsed.facts : [];

    console.log(`📝 Extracted ${factsOut.length} facts from research prompt`);

    for (const f of factsOut.slice(0, 3)) {
      if (!f?.text) continue;
      
      const score = Math.max(0, Math.min(100, Math.floor(Number(f.score ?? 50))));
      const category = ['industry', 'place', 'subject', 'preference', 'general'].includes(f.category) 
        ? f.category 
        : 'general';
      
      await storage.createFact({
        id: randomUUID(),
        userId,
        sourceConversationId: null,
        sourceMessageId: null,
        fact: String(f.text).slice(0, 400),
        score,
        category,
        createdAt: Date.now(),
      });
      
      console.log(`   ✓ Saved: "${String(f.text).slice(0, 60)}..." (${category}, score: ${score})`);
    }
  } catch (e: any) {
    console.error('Fact extraction from prompt error:', e?.message);
  }
}

export async function buildContextWithFacts(
  userId: string,
  conversationHistory: ChatMessage[],
  maxFacts: number = 20,
  userContext?: SessionContext
): Promise<ChatMessage[]> {
  const allFacts = await storage.listTopFacts(userId, 100);
  
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const THIRTY_DAYS = 30 * ONE_DAY;
  
  // Apply recency boost to high-priority categories (industry, place, subject)
  const boostedFacts = allFacts.map(f => {
    const age = now - f.createdAt;
    let recencyBoost = 0;
    
    // High-priority categories get recency boost
    if (['industry', 'place', 'subject'].includes(f.category || 'general')) {
      // Boost: +20 for facts < 1 day, +15 for < 7 days, +10 for < 30 days
      if (age < ONE_DAY) {
        recencyBoost = 20;
      } else if (age < 7 * ONE_DAY) {
        recencyBoost = 15;
      } else if (age < THIRTY_DAYS) {
        recencyBoost = 10;
      }
    }
    
    const effectiveScore = f.score + recencyBoost;
    return { ...f, effectiveScore };
  });
  
  // Sort by effective score (with recency boost) and take top N
  const topFacts = boostedFacts
    .sort((a, b) => b.effectiveScore - a.effectiveScore || b.createdAt - a.createdAt)
    .slice(0, maxFacts);
  
  const factLines = topFacts.map((f) => `- ${f.fact} (score ${f.score})`).join('\n');
  
  // CRITICAL ORDER: System prompt (personalized if context provided) → Conversation history (PRIORITY) → Durable memory (FALLBACK)
  const systemPromptContent = userContext 
    ? buildPersonalizedSystemPrompt(userContext)
    : SYSTEM_PROMPT.content;
  
  const messages: ChatMessage[] = [{
    role: "system",
    content: systemPromptContent
  }];
  
  // Add conversation history FIRST (highest priority)
  messages.push(...conversationHistory);
  
  // Add durable memory AFTER conversation (as fallback context)
  if (factLines) {
    messages.push({
      role: "system",
      content: `[Background context - use only as FALLBACK if current conversation lacks details]\nDurable memory (top ${topFacts.length} learned facts):\n${factLines}\n\nREMINDER: Check CURRENT CONVERSATION messages above before using this background memory.`
    });
  }
  
  return messages;
}
