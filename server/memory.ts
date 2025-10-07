import OpenAI from "openai";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
type Conversation = ChatMessage[];

const conversations = new Map<string, Conversation>();

const SYSTEM_PROMPT: ChatMessage = {
  role: "system",
  content:
    "You are Wyshbone AI, a helpful sales/research assistant. Be concise and structured. " +
    "You remember the session context. On request, you can reformat previous output " +
    "as bullet points, summaries, or simple tables.\n\n" +
    "For new-customer discovery, ALWAYS call /api/places/search first. Never fabricate Google Place IDs. " +
    "Only enrich after Places results using /api/prospects/enrich. If no Places matches are found, " +
    "return an empty list with verified=false.\n\n" +
    "When enriching contacts: Only return PUBLIC contact info with a verifiable source URL. " +
    "Never guess personal emails, phone numbers, or names. If unsure, return an empty contacts list.\n\n" +
    "CRITICAL FORMATTING RULE: When displaying ANY venue/place data, you MUST use emoji icons. Here is the EXACT format to use:\n\n" +
    "1. **Venue Name**\n" +
    "📍 Full street address\n" +
    "📞 Phone number\n" +
    "🌐 Website URL (if available)\n" +
    "🆔 Place ID: ChIJ...\n" +
    "🟢 Status: OPERATIONAL\n\n" +
    "If enriched data exists, add:\n" +
    "📧 Contact Email: email@domain.com\n" +
    "🏷️ Category: [type]\n" +
    "📊 Lead Score: XX/100\n" +
    "💼 Summary: [1-2 sentence description]\n\n" +
    "If contact info exists:\n" +
    "👤 Name - Job Title\n" +
    "   • Role: role_normalized\n" +
    "   • 📞 Public phone\n" +
    "   • 🔗 Source: URL\n" +
    "   • Confidence: 0.X\n\n" +
    "NEVER use bullet point format like '- **Location:**' or '- **Address:**'. ALWAYS use the emoji icons shown above. " +
    "This applies to ALL results from /api/places/search, /api/prospects/enrich, and /api/prospects/search_and_enrich.",
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
