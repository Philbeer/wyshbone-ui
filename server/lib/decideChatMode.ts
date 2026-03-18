import { openai } from '../openai';

export type ChatModeType = 'CHAT_INFO' | 'CLARIFY_FOR_RUN' | 'RUN_SUPERVISOR';

export interface ChatModeDecision {
  mode: ChatModeType;
  reason: string;
  missingInfo?: string[];
  refuse?: boolean;
}

// Lightweight monitoring/alert pre-filter — regex only, unambiguous, cheap
const MONITORING_PATTERNS = [
  /\b(?:keep\s+(?:checking|looking|monitoring|watching|tracking|searching))\b/i,
  /\b(?:alert|notify|ping|email|text|message)\s+me\s+(?:when|if|once|as\s+soon\s+as)\b/i,
  /\b(?:let\s+me\s+know)\s+(?:when|if|once|as\s+soon\s+as)\b/i,
  /\b(?:watch\s+(?:for|out\s+for))\b/i,
  /\b(?:monitor|track|check\s+(?:regularly|daily|weekly|periodically|every))\b/i,
  /\b(?:set\s+up\s+(?:a\s+)?(?:monitor|alert|notification|watch|tracker))\b/i,
  /\b(?:create\s+(?:a\s+)?(?:monitor|alert|notification|scheduled|recurring))\b/i,
  /\b(?:schedule\s+(?:a\s+)?(?:check|search|scan|monitor|alert))\b/i,
  /\b(?:recurring|periodically|on\s+a\s+schedule)\b/i,
  /\b(?:become(?:s)?\s+available)\b/i,
];

function isMonitoringIntent(message: string): boolean {
  return MONITORING_PATTERNS.some(p => p.test(message));
}

const LLM_ROUTER_SYSTEM_PROMPT = `You are a routing classifier for a lead generation assistant. Classify this message into exactly one of four routes:

- agent_run: user wants to find, search for, or discover specific businesses, places, or organisations. Location may or may not be stated.
- clarify_before_run: user intent is a search task but critical information is missing or the request is genuinely ambiguous.
- direct_response: conversational, informational, or no search intent.
- refuse: fictional location, impossible request, or clearly nonsensical.

IMPORTANT ROUTING RULES:

1. If the message contains a clear entity type AND a clear location, always return agent_run. No exceptions.

2. Qualifiers and descriptors on the entity — such as "independent", "cheap", "good", "local", "small", "family-run", "award-winning", "high-end", "organic", "specialist", or any adjective — are filters for the search, not missing information. They do NOT make a request ambiguous. Do not use them as a reason to clarify or direct_response.

3. Commercial context phrases like "to sell my product", "for my business", "to find stockists", or "to reach customers" describe why the user wants results, not missing information. They do not require clarification.

4. Only return clarify_before_run if the entity type OR the location is genuinely absent and impossible to infer from context.

Respond with JSON only:
{ "route": "agent_run|clarify_before_run|direct_response|refuse", "reason": "one sentence", "missing_info": ["list if clarify_before_run, otherwise empty array"] }`;

export async function decideChatMode({ userMessage }: { userMessage: string }): Promise<ChatModeDecision> {
  // Fast path: monitoring/alert patterns are unambiguous and cheap
  if (isMonitoringIntent(userMessage)) {
    return {
      mode: 'RUN_SUPERVISOR',
      reason: 'Monitoring/alert intent detected (regex pre-filter)',
    };
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 200,
      messages: [
        { role: 'system', content: LLM_ROUTER_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const route: string = parsed.route || 'direct_response';
      const reason: string = parsed.reason || 'LLM classification';
      const missingInfo: string[] = Array.isArray(parsed.missing_info) ? parsed.missing_info : [];

      if (route === 'agent_run') {
        return { mode: 'RUN_SUPERVISOR', reason };
      }
      if (route === 'clarify_before_run') {
        return { mode: 'CLARIFY_FOR_RUN', reason, missingInfo };
      }
      if (route === 'refuse') {
        return { mode: 'CHAT_INFO', reason, refuse: true };
      }
      return { mode: 'CHAT_INFO', reason };
    }
  } catch (err: any) {
    console.error(`[ROUTER_LLM_ERROR] ${err.message}`);
  }

  return { mode: 'CHAT_INFO', reason: 'LLM router failed — defaulting to direct_response' };
}
