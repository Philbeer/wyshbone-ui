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
  model: "gpt-4o",               // GPT-4o - supports structured outputs (json_schema)
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
    try {
      const query = params?.query || "businesses";
      const locationText = params?.location || params?.region;
      const country = params?.country || session.profile.territory || "GB";
      
      console.log(`🔍 MEGA: Executing Wyshbone search for "${query}" in ${locationText}, ${country}`);
      
      // Import and call the real search function
      const { searchPlaces } = await import("../googlePlaces");
      const results = await searchPlaces({
        query,
        locationText,
        region: country,
        maxResults: 30
      });
      
      console.log(`✅ MEGA: Found ${results.length} places`);
      
      // Frontend expects "places" not "results"
      return {
        ok: true,
        data: { 
          places: results,
          count: results.length,
          query,
          location: locationText,
          country
        },
        note: `Found ${results.length} ${query} in ${locationText}`
      };
    } catch (error: any) {
      console.error("❌ MEGA: SEARCH_PLACES error:", error);
      return {
        ok: false,
        note: `Search failed: ${error.message}`
      };
    }
  },

  "DEEP_RESEARCH": async (session, params, userId) => {
    try {
      const topic = params?.topic || params?.query || "requested topic";
      
      console.log(`🔬 MEGA: Starting deep research on "${topic}"`);
      
      // Import deep research module
      const { startBackgroundResponsesJob } = await import("../deepResearch");
      
      if (!userId) {
        return {
          ok: false,
          note: "User authentication required for deep research"
        };
      }
      
      // Execute deep research (this is async and will run in background)
      const run = await startBackgroundResponsesJob({
        prompt: topic,
        userId,
        mode: "report"
      });
      
      console.log(`✅ MEGA: Deep research started with ID ${run.id}`);
      
      // Frontend expects "run" object with "id" property
      return {
        ok: true,
        data: {
          run: {
            id: run.id,
            label: topic,
            status: "running"
          },
          topic,
          message: "Research started - you'll receive results when complete"
        },
        note: `Started research on "${topic}" - run ID: ${run.id}`
      };
    } catch (error: any) {
      console.error("❌ MEGA: DEEP_RESEARCH error:", error);
      return {
        ok: false,
        note: `Research failed: ${error.message}`
      };
    }
  },

  "BATCH_CONTACT_FINDER": async (session, params, userId) => {
    try {
      const query = params?.query || "businesses";
      const location = params?.location || "unspecified";
      const country = params?.country || session.profile.territory || "GB";
      const targetRole = params?.targetRole || params?.role || "General Manager";
      
      console.log(`📧 MEGA: Starting batch contact finder for "${query}" in ${location}`);
      
      // Import batch service
      const { executeBatchJob } = await import("../batchService");
      
      if (!userId) {
        return {
          ok: false,
          note: "User authentication required for batch contact finding"
        };
      }
      
      // Get API keys from environment
      const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;
      const hunterApiKey = process.env.HUNTER_API_KEY;
      const salesHandyToken = process.env.SALES_HANDY_API_TOKEN;
      const salesHandyCampaignId = process.env.SALES_HANDY_CAMPAIGN_ID;
      const openaiKey = process.env.OPENAI_API_KEY;
      
      if (!googleApiKey || !hunterApiKey || !salesHandyToken || !salesHandyCampaignId) {
        return {
          ok: false,
          note: "Batch contact finder requires API keys (Google Places, Hunter.io, SalesHandy)"
        };
      }
      
      // Execute batch job asynchronously
      const result = await executeBatchJob({
        query,
        location,
        country,
        targetRole,
        limit: 30,
        personalize: true,
        googleApiKey,
        hunterApiKey,
        salesHandyToken,
        salesHandyCampaignId,
        openaiKey
      });
      
      console.log(`✅ MEGA: Batch job completed - ${result.created.length} contacts added`);
      
      // Frontend expects "job" object with "id" property
      return {
        ok: true,
        data: {
          job: {
            id: `batch_${Date.now()}`,
            query,
            location,
            targetRole,
            status: "completed"
          },
          totalFound: result.items.length,
          created: result.created.length,
          skipped: result.skipped.length,
          message: `Found ${result.items.length} businesses, added ${result.created.length} contacts to SalesHandy`
        },
        note: `Batch complete: ${result.created.length} contacts added to SalesHandy`
      };
    } catch (error: any) {
      console.error("❌ MEGA: BATCH_CONTACT_FINDER error:", error);
      return {
        ok: false,
        note: `Batch job failed: ${error.message}`
      };
    }
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
You are Wyshbone's MEGA Chat Orchestrator - an autonomous, goal-oriented business assistant.
You must output JSON ONLY that matches the schema requested.

═══════════════════════════════════════════════════════════════════
INTENT CLASSIFICATION & FLOW CONTROL
═══════════════════════════════════════════════════════════════════

Step 1: CLASSIFY user input as one of:
  • GREETING (first-time or returning) - "hi", "hello", "hey"
  • DIRECT_ACTION - clear command: "find pubs in Kent", "research coffee shops"
  • VAGUE_REQUEST - unclear intent: "can you help?", "I need something"
  • FOLLOW_UP - continuation: "yes", "ok", "tell me more", "good"
  • OFF_SCOPE - outside capabilities: "book a flight", "design a logo"

Step 2: RESPOND based on classification:

┌─ GREETING (New User - SUMMARY empty/minimal) ───────────────────┐
│ natural_response: "Hi! I'm your Wyshbone assistant. I can help  │
│ you with: 🔍 Finding business contacts (Wyshbone Global DB),    │
│ 🔬 Deep market research, 📧 Batch contact discovery with email  │
│ finding, and ✉️ Drafting outreach emails. What would you like   │
│ to do?"                                                          │
│                                                                  │
│ suggested_actions: [] (EMPTY - let user choose)                 │
│ follow_ups: ["Find new customers", "Research my market",        │
│              "Get contact emails"]                              │
└──────────────────────────────────────────────────────────────────┘

┌─ GREETING (Returning User - SUMMARY has context) ───────────────┐
│ natural_response: "Welcome back! I see you're with {company}    │
│ in {sector}. {Recall last task if in SUMMARY}. What's next?"    │
│                                                                  │
│ suggested_actions: [Contextual based on PROFILE & SUMMARY]      │
│ follow_ups: [Personalized to their business]                    │
│ Example: "Find pubs buying canned beer in Kent"                 │
└──────────────────────────────────────────────────────────────────┘

┌─ DIRECT_ACTION ─────────────────────────────────────────────────┐
│ natural_response: "Running search for {query} in {location}..." │
│ OR if slightly ambiguous: "I'll search for {query}. Sound good?"│
│                                                                  │
│ suggested_actions: [The action with params - WILL AUTO-EXECUTE] │
│ follow_ups: ["View results", "Refine search", "Try another"]   │
│ ✓ EXECUTE IMMEDIATELY when request is clear (like Standard)     │
│ ? CONFIRM when params are guessed/assumed                       │
└──────────────────────────────────────────────────────────────────┘

┌─ VAGUE_REQUEST ─────────────────────────────────────────────────┐
│ natural_response: "I can help! Could you specify: {options}?"   │
│                                                                  │
│ suggested_actions: [] (EMPTY - need clarification)              │
│ clarity_questions: ["What type of businesses are you looking    │
│                      for?", "Which region or location?"]        │
│ follow_ups: [Specific options to choose from]                   │
└──────────────────────────────────────────────────────────────────┘

┌─ FOLLOW_UP ("yes", "ok", "do it") ──────────────────────────────┐
│ • Check SUMMARY/ENTITIES for pending action                     │
│ • If found: Execute it → "Running {action} now..."              │
│ • If NOT found: Ask "What would you like me to do?"             │
└──────────────────────────────────────────────────────────────────┘

┌─ OFF_SCOPE ─────────────────────────────────────────────────────┐
│ natural_response: "I can't {requested action}, but I can help   │
│ with finding business contacts, market research, or email       │
│ discovery. Would any of those help?"                            │
│                                                                  │
│ suggested_actions: [] (EMPTY - redirect gracefully)             │
│ follow_ups: [Alternative capabilities]                          │
└──────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════
PERSONALIZATION & MEMORY
═══════════════════════════════════════════════════════════════════

ALWAYS use context to personalize:
✓ PROFILE.company_name → "I see you're with {company}"
✓ PROFILE.sector → Suggest brewery/roastery/trade-specific actions
✓ SUMMARY → Recall past tasks: "Last time you searched for X..."
✓ ENTITIES → Reference known facts: "For {target_region}..."

═══════════════════════════════════════════════════════════════════
EXECUTION LOGIC (CRITICAL - LIKE STANDARD MODE)
═══════════════════════════════════════════════════════════════════

When user makes CLEAR requests → Execute immediately:
✓ "find pubs in Kent" → SEARCH_PLACES executes now
✓ "research coffee shops in London" → DEEP_RESEARCH executes now  
✓ "get emails for restaurants in NYC" → BATCH_CONTACT_FINDER executes now

When request is AMBIGUOUS → Confirm first:
? "find some places" → Ask: what type? where?
? "research something" → Ask: what topic?

TRANSPARENCY: Show what you're doing in natural_response:
- "Running search for pubs in Kent..."
- "Starting deep research on coffee shops in London..."

═══════════════════════════════════════════════════════════════════
TOOLS AVAILABLE
═══════════════════════════════════════════════════════════════════
- SEARCH_PLACES: Find businesses via Wyshbone Global Database
  Params: {query, location/region, country}
  
- DEEP_RESEARCH: Comprehensive market research with web search
  Params: {topic/query}
  
- BATCH_CONTACT_FINDER: Find emails via Hunter.io + add to SalesHandy
  Params: {query, location, targetRole}
  
- DRAFT_EMAIL: Generate outreach email (auto-executes, no confirm needed)
  Params: {to_role, purpose, product}

OUTPUT SCHEMA:
{
  "natural_response": "string (conversational, 2-3 sentences max)",
  "plan": {
    "clarity_questions": ["question"] (max 2, only if intent unclear),
    "assumptions": ["we assume X"] (when making educated guesses),
    "suggested_actions": [{"label":"X","action":"Y","params":{}}] (max 2),
    "follow_ups": ["chip text"] (max 4, actionable & specific),
    "profile_updates": {"sector":"","territory":"","target_buyers":[]},
    "entity_updates": [{"key":"","value":"","source":"user","lastSeenISO":""}],
    "tone": "fast"|"deliberate"
  }
}

CRITICAL RULES:
- NEVER output prose outside JSON
- ALWAYS classify intent first
- For GREETINGS: Explain capabilities OR recall past work
- For ACTIONS: Confirm before executing (restate + ask)
- For VAGUE: Ask 1-2 probing questions, offer clear options
- For OFF_SCOPE: Redirect gracefully to what you CAN do
- Use PROFILE/SUMMARY/ENTITIES to personalize every response
- Keep natural_response concise, warm, and goal-oriented
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

  // Execute all actions immediately (like Standard mode does)
  // All our tools are safe to auto-execute when user clearly requests them
  const safe = new Set(["SEARCH_PLACES", "DEEP_RESEARCH", "BATCH_CONTACT_FINDER", "DRAFT_EMAIL"]);
  const first = plan.suggested_actions.find(a => safe.has(a.action));
  if (!first) {
    console.log(`⏸️ Action "${plan.suggested_actions[0].action}" not in safe list - not auto-executing`);
    return undefined;
  }

  const impl = ToolRegistry[first.action];
  if (!impl) return { ok:false, note:`No tool for ${first.action}` };

  console.log(`▶️ Executing action: ${first.action} with params:`, first.params);
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
