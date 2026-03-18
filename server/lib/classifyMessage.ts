import { openai } from '../openai';

export interface ClassifyResult {
  route: 'supervisor_plan' | 'direct_response';
  reason: string;
  confidence: number;
}

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

const SEARCH_ACTION_PATTERNS = [
  /\b(?:find\s+(?:out|me)?|search\s+(?:for)?|look\s+(?:up|for|into)|research|investigate|discover)\b.*\b(?:and|then)\s+(?:alert|notify|let\s+me\s+know|email|send|report)\b/i,
  /\b(?:check\s+(?:which|what|who|where|if|whether))\b.*\b(?:and|then)?\s*(?:alert|notify|let\s+me\s+know)\b/i,
  /\b(?:which|what|where)\b.*\b(?:offer|provide|have|sell|carry|stock)\b.*\b(?:alert|notify|let\s+me\s+know|keep\s+(?:me\s+)?(?:updated|posted|informed))\b/i,
];

const DEEP_RESEARCH_PATTERNS = [
  /\b(?:deep\s+research|in-depth\s+research|thorough(?:ly)?\s+research|comprehensive(?:ly)?\s+(?:research|investigate|analyze))\b/i,
  /\b(?:research\s+(?:everything|all)\s+(?:about|on|regarding))\b/i,
];

export function classifyMessageSync(message: string): ClassifyResult | null {
  const normalized = message.toLowerCase().trim();

  for (const pattern of MONITORING_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        route: 'supervisor_plan',
        reason: `Monitoring/scheduling intent detected: ${pattern.source}`,
        confidence: 0.95,
      };
    }
  }

  for (const pattern of SEARCH_ACTION_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        route: 'supervisor_plan',
        reason: `Search-and-alert intent detected: ${pattern.source}`,
        confidence: 0.9,
      };
    }
  }

  for (const pattern of DEEP_RESEARCH_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        route: 'supervisor_plan',
        reason: `Deep research intent detected: ${pattern.source}`,
        confidence: 0.9,
      };
    }
  }

  return null;
}

export async function classifyMessageWithLLM(message: string): Promise<ClassifyResult> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 150,
      messages: [
        {
          role: 'system',
          content: `You are a message classifier. Classify the user message into one of two routes:

1. "supervisor_plan" — the message asks for ANY of these:
   - Monitoring, tracking, or alerting (e.g. "keep checking", "alert me when", "notify me if")
   - Scheduled or recurring tasks
   - Finding/searching for businesses, places, or entities with specific criteria
   - Deep research or investigation that needs execution
   - Any task that requires ongoing work, web searching, or data gathering

2. "direct_response" — the message is purely conversational:
   - Greetings, thanks, opinions
   - Questions about how things work
   - General knowledge questions with no action needed
   - Clarifying previous answers

Respond with ONLY a JSON object: {"route": "supervisor_plan" or "direct_response", "reason": "brief reason"}`,
        },
        { role: 'user', content: message },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim() || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.route === 'supervisor_plan' || parsed.route === 'direct_response') {
        return {
          route: parsed.route,
          reason: parsed.reason || 'LLM classification',
          confidence: 0.85,
        };
      }
    }
  } catch (err: any) {
    console.error(`[CLASSIFY_LLM_ERROR] ${err.message}`);
  }

  return {
    route: 'direct_response',
    reason: 'LLM classification failed or inconclusive — defaulting to direct_response',
    confidence: 0.5,
  };
}

export async function classifyMessage(message: string): Promise<ClassifyResult> {
  const syncResult = classifyMessageSync(message);
  if (syncResult) {
    return syncResult;
  }

  return classifyMessageWithLLM(message);
}
