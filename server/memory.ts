import OpenAI from "openai";
import { storage } from "./storage";
import { randomUUID } from "crypto";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
type Conversation = ChatMessage[];

export type VenueCache = {
  placeId: string;
  name: string;
  address: string;
  served: boolean;
}[];

const conversations = new Map<string, Conversation>();
const venueCaches = new Map<string, VenueCache>();

const SYSTEM_PROMPT: ChatMessage = {
  role: "system",
  content:
    "You are Wyshbone AI, a helpful sales/research assistant powered by GPT-5 with live web search capabilities. " +
    "Be concise, practical, and UK-focused.\n\n" +
    "CAPABILITIES:\n" +
    "- You have live internet access via web search to fetch current information, news, weather, and real-time data\n" +
    "- You remember the session context and previously found venues\n" +
    "- You can access verified business data via Google Places API\n" +
    "- You can trigger Wyshbone backend workflows in batch via the bubble_run_batch tool\n\n" +
    "WORKFLOW for venue discovery:\n" +
    "1. Analyze the user's query in context of the conversation\n" +
    "2. Check if you can answer from previously found venues (marked 'served: false' means not yet shown)\n" +
    "3. Only search for NEW venues via /api/places/search if you need more results\n" +
    "4. Never fabricate Google Place IDs - only use verified Places API results\n" +
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
    label: "Conversation",
    createdAt: Date.now(),
  });

  return newId;
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
  const messages = await storage.listMessages(conversationId);
  
  const recentMessages = messages.slice(Math.max(0, messages.length - maxMessages));
  
  return recentMessages.map(msg => ({
    role: msg.role as "user" | "assistant" | "system",
    content: msg.content,
  }));
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

export async function buildContextWithFacts(
  userId: string,
  conversationHistory: ChatMessage[],
  maxFacts: number = 20
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
  
  const messages: ChatMessage[] = [SYSTEM_PROMPT];
  
  if (factLines) {
    messages.push({
      role: "system",
      content: `Durable memory (top ${topFacts.length} facts):\n${factLines}`
    });
  }
  
  messages.push(...conversationHistory);
  
  return messages;
}
