/**
 * WYSHBONE SMART COACH LAYER
 * 
 * Additive coaching layer that enhances chat responses with:
 * - Proactive but not overwhelming questions (max 1-2)
 * - Safe, explicit assumptions
 * - Concrete next actions (search, research, email)
 * - Short, skimmable follow-ups
 * - Session profile management
 */

import { openai } from "./openai";
import type { SessionContext } from "./lib/context";

// Session profile enriched from user context
export type CoachProfile = {
  company_name?: string;
  domain?: string;
  sector?: string;
  known_products?: string[];
  target_buyers?: string[];
  territory?: string;
};

export type CoachAction = {
  label: string;
  action: "SEARCH_PLACES" | "DEEP_RESEARCH" | "EMAIL_DRAFT" | "DATA_CHECK";
  params: Record<string, any>;
};

export type CoachPlan = {
  clarity_questions: string[];
  assumptions: string[];
  suggested_actions: CoachAction[];
  follow_ups: string[];
  profile_updates?: Partial<CoachProfile>;
};

export type CoachResponse = {
  natural_response: string;
  coach_plan: CoachPlan;
};

const WYSHBONE_COACH_SYSTEM = `
You are Wyshbone's chat coach. Improve clarity and initiative without being pushy.

GOALS:
1) Be proactive but not overwhelming. Ask at most 1–2 targeted questions only when needed.
2) Personalize using profile: {company_name}, {domain}, {sector}, {known_products}, {target_buyers}, {territory}.
3) Make safe, explicit assumptions when context is thin and list them in "assumptions".
4) Always propose concrete next actions for lead-gen, research, list-building, email drafting, or data checks.
5) Keep messages short, skimmable, friendly, and useful.

OUTPUT FORMAT (MANDATORY JSON ONLY):
{
  "natural_response": "string",
  "coach_plan": {
    "clarity_questions": ["..."],
    "assumptions": ["..."],
    "suggested_actions": [
      {
        "label": "Find freehouse pubs in Kent",
        "action": "SEARCH_PLACES",
        "params": { "query": "freehouse pubs", "region": "Kent", "country": "GB" }
      }
    ],
    "follow_ups": ["short, concrete follow-up (<=12 words)"],
    "profile_updates": { "sector":"", "territory":"", "target_buyers":["..."], "known_products":["..."] }
  }
}

RULES:
- Never ask more than 2 questions at once.
- If you can act with safe defaults, propose it in suggested_actions.
- Keep follow-ups short (<=12 words).
- Do not output any prose outside the JSON object.
- For UK businesses, default to GB region code
- For search actions, always include query, region, and country params
`;

/**
 * Convert SessionContext to CoachProfile
 */
export function sessionContextToCoachProfile(context?: SessionContext): CoachProfile {
  if (!context) return {};
  
  const profile: CoachProfile = {
    company_name: context.companyName,
    domain: context.companyDomain,
    sector: context.inferredIndustry,
    territory: "GB", // Default to GB for UK-focused system
  };
  
  // Infer target buyers based on sector
  if (context.inferredIndustry === "Brewery") {
    profile.known_products = ["cask", "keg", "cans", "bottles"];
    profile.target_buyers = ["freehouse pubs", "bottle shops", "restaurants"];
  } else if (context.inferredIndustry === "Coffee Roaster") {
    profile.known_products = ["whole beans", "ground coffee"];
    profile.target_buyers = ["cafes", "restaurants", "retail shops"];
  } else if (context.inferredIndustry === "Trade Association") {
    profile.target_buyers = ["member prospects", "industry partners", "policy stakeholders"];
  }
  
  return profile;
}

/**
 * Call OpenAI with smart coach wrapper
 */
export async function wyshboneCoachWrapper(
  userMessage: string,
  profile: CoachProfile,
  conversationHistory?: Array<{ role: string; content: string }>
): Promise<CoachResponse> {
  const profileText = JSON.stringify(profile || {});
  const systemMsg = `${WYSHBONE_COACH_SYSTEM}\nPROFILE_CONTEXT=${profileText}`;

  // Build messages array with conversation history
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemMsg }
  ];
  
  // Add last 5 messages from history for context
  if (conversationHistory && conversationHistory.length > 0) {
    const recentHistory = conversationHistory.slice(-5);
    for (const msg of recentHistory) {
      if (msg.role === "user" || msg.role === "assistant") {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
  }
  
  // Add current user message
  messages.push({ role: "user", content: userMessage });

  const completion = await openai.chat.completions.create({
    model: "gpt-5",
    temperature: 0.6,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "wyshbone_coach",
        schema: {
          type: "object",
          required: ["natural_response", "coach_plan"],
          properties: {
            natural_response: { type: "string" },
            coach_plan: {
              type: "object",
              properties: {
                clarity_questions: { type: "array", items: { type: "string" } },
                assumptions: { type: "array", items: { type: "string" } },
                follow_ups: { type: "array", items: { type: "string" } },
                profile_updates: {
                  type: "object",
                  properties: {
                    company_name: { type: "string" },
                    domain: { type: "string" },
                    sector: { type: "string" },
                    known_products: { type: "array", items: { type: "string" } },
                    target_buyers: { type: "array", items: { type: "string" } },
                    territory: { type: "string" }
                  }
                },
                suggested_actions: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["label", "action"],
                    properties: {
                      label: { type: "string" },
                      action: { type: "string" },
                      params: { type: "object", additionalProperties: true }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    messages
  });

  const raw = completion.choices?.[0]?.message?.content || "{}";
  let parsed: CoachResponse;
  
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Fallback if parsing fails
    parsed = {
      natural_response: raw,
      coach_plan: {
        clarity_questions: [],
        assumptions: [],
        suggested_actions: [],
        follow_ups: []
      }
    };
  }

  return parsed;
}

/**
 * Apply profile updates from coach response
 */
export function applyProfileUpdates(
  profile: CoachProfile,
  updates?: Partial<CoachProfile>
): CoachProfile {
  if (!updates) return profile;
  
  return {
    ...profile,
    ...updates,
    // Merge arrays instead of replacing
    known_products: updates.known_products || profile.known_products,
    target_buyers: updates.target_buyers || profile.target_buyers,
  };
}
