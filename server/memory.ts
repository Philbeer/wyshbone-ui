import OpenAI from "openai";

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
    "BUBBLE BATCH WORKFLOW - CONVERSATIONAL REQUIREMENTS GATHERING:\n" +
    "When a user wants to search for businesses, have a conversation to gather these requirements:\n" +
    "1. Business type(s) - What kind of businesses? (e.g., 'dental suppliers', 'gyms')\n" +
    "2. Location/Country - Where? Deduce country from context (e.g., 'Florida' → US, 'London' → UK, 'Sydney' → AU)\n" +
    "3. Which regions - Specific counties/states, or should you auto-select them?\n" +
    "4. How many regions - How many counties/states to search? (default: 3)\n" +
    "5. Job roles (optional) - Which roles to target? (default: ['Head of Sales'])\n\n" +
    "CONVERSATIONAL FLOW:\n" +
    "- If user says 'Find dental suppliers in Florida' → Ask: 'How many Florida counties would you like me to search? I can auto-select them for you.'\n" +
    "- If user says 'Search for gyms' → Ask: 'Which location/country? And how many regions?'\n" +
    "- If user provides all details → Ask: 'Should I auto-select the counties/states, or do you have specific ones in mind?'\n" +
    "- Once you have: business_types + country + number_countiestosearch → THEN call bubble_run_batch tool\n\n" +
    "ONLY call bubble_run_batch when you have enough information. Be conversational and helpful.\n\n" +
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
