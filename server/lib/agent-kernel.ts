/* =====================================================================
   WYSHBONE "MEGA" AGENT KERNEL v2  (Hybrid Mode - Runs Alongside Standard Chat)
   - Engine: GPT-4 Turbo (OpenAI) via json_schema responses - OPTIMIZED FOR SPEED
   - Capabilities:
       • Planner → Executor
       • Session profile + entity memory + rolling summary
       • Tool registry & safe auto-exec
       • Chips (follow-ups + clarity questions)
       • Tunable verbosity / speed
   - Target: <12s average response time (was ~30s with GPT-5)
   ===================================================================== */

import { openai } from "../openai";
import type { User } from "@shared/schema";
import { buildSessionContext, type SessionContext } from "./context";

/* ========================= CONFIG ========================= */

const CONFIG = {
  model: "gpt-4-1106-preview",  // Fastest GPT-4 Turbo (was gpt-5)
  temperature: 0.4,              // Lower = faster + tighter replies (was 0.6)
  fastMode: true,
  maxRecentTurns: 6,             // Reduce tokens in prompt (was 10)
  autosummariseEvery: 4,         // Summarise sooner = less baggage (was 6)
  autoRunSafeActions: true,
  maxChips: 4,                   // Streamlined suggestions (was 5)
  maxClarityQs: 1                // Focus on key question (was 2)
};

/* ========================= MEMORY ========================= */

type SessionProfile = {
  company_name?: string;
  domain?: string;
  sector?: string;
  known_products?: string[];
  target_buyers?: string[];
  territory?: string;
};

type Entity = { 
  key: string; 
  value: string; 
  source: "user"|"assistant"|"tool"; 
  lastSeenISO: string;
};

type HistoryTurn = { 
  role:"user"|"assistant"|"tool"; 
  content:string; 
  ts: string;
};

type SessionState = {
  profile: SessionProfile;
  entities: Entity[];
  summary: string;
  history: HistoryTurn[];
  turns: number;
};

const SESSIONS = new Map<string, SessionState>();

function ensureSession(sessionId: string): SessionState {
  if (!SESSIONS.has(sessionId)) {
    SESSIONS.set(sessionId, { 
      profile: {}, 
      entities: [], 
      summary: "", 
      history: [], 
      turns: 0 
    });
  }
  return SESSIONS.get(sessionId)!;
}

/* ========================= TOOLS ========================= */

type ToolInvocation = {
  label: string;
  action: string;
  params?: Record<string, any>;
};

// Tool registry - wire to existing Wyshbone services
const ToolRegistry: Record<string, (session: SessionState, params?: any, userId?: string) => Promise<{ok:boolean; data?:any; note?:string}>> = {
  
  "SEARCH_PLACES": async (session, params, userId) => {
    // TODO: Wire to actual Wyshbone Global Database search
    // For now, return a helpful note
    const query = params?.query || "businesses";
    const location = params?.region || params?.location || "unspecified location";
    const country = params?.country || session.profile.territory || "GB";
    
    return {
      ok: true,
      data: { 
        query, 
        location, 
        country,
        note: "Search queued - this will execute Wyshbone Global Database search"
      },
      note: `Ready to search "${query}" in ${location}, ${country}`
    };
  },

  "DEEP_RESEARCH": async (session, params, userId) => {
    // TODO: Wire to actual deep research backend
    // For now, return a helpful note
    const topic = params?.topic || params?.query || "requested topic";
    
    return {
      ok: true,
      data: {
        topic,
        status: "queued",
        note: "Research queued - this will execute comprehensive deep research"
      },
      note: `Ready to research: "${topic}"`
    };
  },

  "BATCH_CONTACT_FINDER": async (session, params, userId) => {
    // TODO: Wire to actual SalesHandy batch system
    // For now, return a helpful note
    const query = params?.query || "businesses";
    const location = params?.location || "unspecified";
    const targetRole = params?.targetRole || params?.role || "General Manager";
    
    return {
      ok: true,
      data: {
        query,
        location,
        targetRole,
        status: "queued",
        note: "Batch job queued - this will find contacts via Hunter.io and add to SalesHandy"
      },
      note: `Ready to find ${targetRole} contacts for ${query} in ${location}`
    };
  },

  "DRAFT_EMAIL": async (session, params) => {
    const { to_role="General Manager", purpose="intro", product="your product" } = params || {};
    const body =
`Subject: Quick ${product} intro — potential fit?

Hi ${to_role},

I'll keep it brief — we help teams like yours with ${product}.
If useful, I can share a 60-second summary or a short sample list.

Would you be open to a quick look?

Best,
Wyshbone`;

    return { ok: true, data: { draft: body } };
  }
};

/* ========================= PROMPTS ========================= */

const SYSTEM_PROMPT = `
You are Wyshbone's MEGA Chat Orchestrator ("coach+planner+executor").
You must output JSON ONLY that matches the schema requested.

PRINCIPLES:
- Be proactive but not overbearing. Ask at most 1–2 targeted questions when they unlock the next step.
- Use PROFILE, ENTITIES, and SUMMARY to personalise recommendations.
- Prefer concrete actions (searches, filters, list building, email draft) over vague chat.
- If context is thin, make safe assumptions and list them in "assumptions".
- Keep "natural_response" short, skimmable, and action-oriented.
- Always provide "follow_ups" (clickable chips), <= 12 words each.

OUTPUT SCHEMA (MANDATORY):
{
  "natural_response": "string",
  "plan": {
    "clarity_questions": ["short question"],
    "assumptions": ["we assume ..."],
    "suggested_actions": [
      {"label":"Find pubs selling cans in Kent","action":"SEARCH_PLACES","params":{"query":"pubs selling canned beer","region":"Kent","country":"GB"}}
    ],
    "follow_ups": ["See top 50 matches?", "Draft first outreach email?"],
    "profile_updates": { "sector":"", "territory":"", "target_buyers":[""], "known_products":[""] },
    "entity_updates": [ {"key":"target_region","value":"Kent"} ],
    "tone": "fast" | "deliberate"
  }
}

RULES:
- NEVER output prose outside the JSON object.
- If you propose an action, keep params minimal and sensible.
- When helpful, adapt for brewery vs roastery vs trade association vs other sectors.
- If SUMMARY exists, avoid repeating already-known details.
- Prefer "tone":"fast" unless the user asks for depth/analysis, then "deliberate".
`;

/* ========================= SUMMARISER ========================= */

async function summariseHistory(summary: string, recent: HistoryTurn[]): Promise<string> {
  const clip = recent.map(t => `${t.ts} ${t.role.toUpperCase()}: ${t.content}`).join("\n");
  const sys = `You compress conversation turns into a compact running summary that preserves decisions, facts, and open TODOs. Keep it under 180 words.`;
  
  const completion = await openai.chat.completions.create({
    model: CONFIG.model,
    temperature: 0.2,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: `PRIOR SUMMARY:\n${summary || "(none)"}\n\nNEW TURNS:\n${clip}\n\nReturn the UPDATED summary only.` }
    ]
  });
  
  return completion.choices[0].message.content || summary;
}

/* ========================= CONTEXT BUILDER ========================= */

function recentTurns(state: SessionState): HistoryTurn[] {
  return state.history.slice(-CONFIG.maxRecentTurns);
}

function nowISO() { 
  return new Date().toISOString(); 
}

/* ========================= CORE CALL ========================= */

type KernelResult = {
  natural: string;
  plan: {
    clarity_questions?: string[];
    assumptions?: string[];
    suggested_actions?: ToolInvocation[];
    follow_ups?: string[];
    profile_updates?: Partial<SessionProfile>;
    entity_updates?: Entity[];
    tone?: "fast"|"deliberate";
  };
};

async function callPlanner(state: SessionState, userText: string): Promise<KernelResult> {
  console.log("📝 Planner called with userText:", userText.substring(0, 50));
  
  // Token optimization: limit context size for faster responses
  const profile = JSON.stringify(state.profile || {});
  const limitedEntities = (state.entities || []).slice(0, 20);  // Max 20 entities
  const entities = JSON.stringify(limitedEntities);
  const summary = (state.summary || "").slice(0, 1200);  // Max 1200 chars (~300 tokens)
  const recents = recentTurns(state)
    .slice(-CONFIG.maxRecentTurns)  // Ensure we respect maxRecentTurns
    .map(t => ({ role:t.role, content:t.content }));

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT + `\nFAST_MODE=${CONFIG.fastMode}\n` },
    { role: "user" as const, content:
`PROFILE=${profile}
ENTITIES=${entities}
SUMMARY=${summary}
RECENT=${JSON.stringify(recents)}
USER=${userText}`
    }
  ];

  console.log("🤖 Calling OpenAI with model:", CONFIG.model);
  const completion = await openai.chat.completions.create({
    model: CONFIG.model,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "wyshbone_plan",
        schema: {
          type: "object",
          required: ["natural_response","plan"],
          properties: {
            natural_response: { type: "string" },
            plan: {
              type: "object",
              properties: {
                clarity_questions: { type:"array", items:{type:"string"} },
                assumptions: { type:"array", items:{type:"string"} },
                follow_ups: { type:"array", items:{type:"string"} },
                tone: { type:"string", enum:["fast","deliberate"] },
                profile_updates: {
                  type:"object",
                  properties: {
                    company_name:{type:"string"},
                    domain:{type:"string"},
                    sector:{type:"string"},
                    known_products:{type:"array", items:{type:"string"}},
                    target_buyers:{type:"array", items:{type:"string"}},
                    territory:{type:"string"}
                  }
                },
                entity_updates: {
                  type:"array",
                  items:{ type:"object", properties:{
                    key:{type:"string"}, value:{type:"string"}
                  }}
                },
                suggested_actions: {
                  type:"array",
                  items:{
                    type:"object",
                    required:["label","action"],
                    properties:{
                      label:{type:"string"},
                      action:{type:"string"},
                      params:{type:"object", additionalProperties:true}
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

  console.log("📥 OpenAI response received");
  
  const raw = completion.choices?.[0]?.message?.content || "{}";
  try {
    const parsed = JSON.parse(raw);
    console.log("✅ Planner completed successfully");
    return {
      natural: parsed.natural_response || "",
      plan: parsed.plan || {}
    };
  } catch (err) {
    console.error("❌ Failed to parse OpenAI response:", err);
    return { natural: raw, plan: {} };
  }
}

/* ========================= ENTITY UPDATE ========================= */

function upsertEntities(state: SessionState, updates?: Entity[]) {
  if (!updates) return;
  const now = nowISO();
  for (const u of updates) {
    const idx = state.entities.findIndex(e => e.key === u.key);
    if (idx >= 0) {
      state.entities[idx].value = u.value;
      state.entities[idx].lastSeenISO = now;
    } else {
      state.entities.push({ 
        key: u.key, 
        value: u.value, 
        source: "assistant", 
        lastSeenISO: now 
      });
    }
  }
}

/* ========================= ACTION EXECUTOR ========================= */

async function maybeExecuteFirstSafeAction(state: SessionState, plan: KernelResult["plan"], userId?: string) {
  if (!CONFIG.autoRunSafeActions) return undefined;
  if (!plan?.suggested_actions?.length) return undefined;

  // Define what's considered "safe" to auto-run
  const safe = new Set(["DRAFT_EMAIL"]); // Only DRAFT_EMAIL is truly safe to auto-execute
  const first = plan.suggested_actions.find(a => safe.has(a.action));
  if (!first) {
    // For actions that need confirmation, return them without executing
    console.log(`⏸️ Action "${plan.suggested_actions[0].action}" requires confirmation - not auto-executing`);
    return undefined;
  }

  const impl = ToolRegistry[first.action];
  if (!impl) return { ok:false, note:`No tool for ${first.action}` };

  console.log(`🔧 Auto-executing safe action: ${first.action}`);
  const result = await impl(state, first.params, userId);
  state.history.push({ 
    role:"tool", 
    content:`${first.action} → ${JSON.stringify(result)}`, 
    ts: nowISO() 
  });
  
  return result;
}

/* ========================= PUBLIC API ========================= */

export async function agentChat(
  sessionId: string, 
  userText: string, 
  user?: User
) {
  const state = ensureSession(sessionId);

  // Merge user profile into session if provided
  if (user) {
    const ctx = buildSessionContext(user);
    state.profile = {
      company_name: ctx.companyName,
      domain: ctx.companyDomain,
      sector: ctx.inferredIndustry,
      territory: "GB" // Default territory
    };
  }

  // Record user turn
  state.history.push({ role:"user", content:userText, ts: nowISO() });
  state.turns++;

  // Planner
  const planned = await callPlanner(state, userText);

  // Apply profile/entity updates
  if (planned.plan?.profile_updates) {
    state.profile = { ...state.profile, ...planned.plan.profile_updates };
  }
  upsertEntities(state, planned.plan?.entity_updates);

  // Maybe auto-exec a safe action
  const autoResult = await maybeExecuteFirstSafeAction(state, planned.plan, user?.id);

  // Record assistant turn
  state.history.push({ role:"assistant", content: planned.natural, ts: nowISO() });

  // Periodic autosummary
  if (state.turns % CONFIG.autosummariseEvery === 0) {
    const recent = recentTurns(state);
    state.summary = await summariseHistory(state.summary, recent);
  }

  // Trim history length
  if (state.history.length > 200) {
    state.history.splice(0, state.history.length - 200);
  }

  // Chip limits
  const follow = (planned.plan.follow_ups || []).slice(0, CONFIG.maxChips);
  const qns = (planned.plan.clarity_questions || []).slice(0, CONFIG.maxClarityQs);

  console.log(`📊 Returning MEGA response with ${follow.length} follow-up chips`);

  return {
    ok: true,
    natural: planned.natural,
    plan: {
      ...planned.plan,
      follow_ups: follow,
      clarity_questions: qns
    },
    profile: state.profile,
    entities: state.entities,
    summary: state.summary,
    auto_action_result: autoResult
  };
}
