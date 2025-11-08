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
  lastUpdated: number; // Timestamp for cleanup
};

const SESSIONS = new Map<string, SessionState>();

// Clear stale sessions periodically (prevent Kent issue)
setInterval(() => {
  const MAX_SESSION_AGE_MS = 60 * 60 * 1000; // 1 hour
  const MAX_TURNS = 100;
  const now = Date.now();
  
  const entries = Array.from(SESSIONS.entries());
  let cleaned = 0;
  
  for (const [sessionId, state] of entries) {
    const sessionAge = now - state.lastUpdated;
    
    // Clear sessions that are either >1 hour old OR have >100 turns
    if (sessionAge > MAX_SESSION_AGE_MS || state.turns > MAX_TURNS) {
      const reason = sessionAge > MAX_SESSION_AGE_MS 
        ? `>1h old (${Math.floor(sessionAge / 60000)}min)`
        : `>${MAX_TURNS} turns`;
      console.log(`🧹 Clearing stale session (${reason}): ${sessionId.substring(0, 20)}...`);
      SESSIONS.delete(sessionId);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Session cleanup complete: ${cleaned} removed, ${SESSIONS.size} active`);
  }
}, 10 * 60 * 1000); // Every 10 minutes

function ensureSession(sessionId: string): SessionState {
  const MAX_SESSION_AGE_MS = 60 * 60 * 1000; // 1 hour (same as cleanup)
  const MAX_TURNS = 100;
  
  const existing = SESSIONS.get(sessionId);
  
  // Check if existing session is stale (prevents Kent issue)
  if (existing) {
    const sessionAge = Date.now() - existing.lastUpdated;
    const isStale = sessionAge > MAX_SESSION_AGE_MS || existing.turns > MAX_TURNS;
    
    if (isStale) {
      const reason = sessionAge > MAX_SESSION_AGE_MS 
        ? `>1h old (${Math.floor(sessionAge / 60000)}min)`
        : `>${MAX_TURNS} turns`;
      console.log(`🧹 Immediate cleanup: Discarding stale session (${reason}): ${sessionId.substring(0, 20)}...`);
      SESSIONS.delete(sessionId);
    } else {
      return existing;
    }
  }
  
  // Create fresh session (either first time or after staleness discard)
  const freshSession = { 
    profile: {}, 
    entities: [], 
    summary: "", 
    history: [], 
    turns: 0,
    lastUpdated: Date.now()
  };
  
  SESSIONS.set(sessionId, freshSession);
  console.log(`✨ Created fresh MEGA session: ${sessionId.substring(0, 20)}...`);
  return freshSession;
}

// Load conversation history from database to sync with Standard mode
async function syncSessionWithDatabase(
  conversationId: string,
  state: SessionState,
  storage: any
): Promise<void> {
  try {
    const messages = await storage.listMessages(conversationId);
    
    // Only load recent messages to avoid token overload (last 20 messages)
    const recentMessages = messages.slice(-20);
    
    // Convert database messages to session history format
    state.history = recentMessages.map((msg: any) => ({
      role: msg.role,
      content: msg.content,
      ts: new Date(msg.createdAt).toISOString()
    }));
    
    state.turns = Math.floor(recentMessages.length / 2); // Rough estimate
    
    console.log(`🔄 Synced MEGA session with database: ${recentMessages.length} messages loaded`);
  } catch (error) {
    console.error("Failed to sync session with database:", error);
  }
}

/* ========================= TOOLS ========================= */

type ToolInvocation = {
  label: string;
  action: string;
  params?: Record<string, any>;
};

// Import shared action execution logic (same as Standard mode)
import { executeAction } from "./actions";

// Tool registry - thin wrappers that delegate to shared execution logic
// This ensures MEGA and Standard mode execute functions identically
const ToolRegistry: Record<string, (session: SessionState, params?: any, userId?: string) => Promise<{ok:boolean; data?:any; note?:string; error?:string}>> = {
  
  "SEARCH_PLACES": async (session, params, userId) => {
    console.log(`🚀 MEGA: Delegating to shared action executor - SEARCH_PLACES`);
    
    // Enrich params with session profile defaults
    const enrichedParams = {
      ...params,
      country: params?.country || session.profile.territory || "GB"
    };
    
    return executeAction({
      action: "SEARCH_PLACES",
      params: enrichedParams,
      userId
    });
  },

  "DEEP_RESEARCH": async (session, params, userId) => {
    console.log(`🚀 MEGA: Delegating to shared action executor - DEEP_RESEARCH`);
    
    return executeAction({
      action: "DEEP_RESEARCH",
      params,
      userId
    });
  },

  "BATCH_CONTACT_FINDER": async (session, params, userId) => {
    console.log(`🚀 MEGA: Delegating to shared action executor - BATCH_CONTACT_FINDER`);
    
    // Enrich params with session profile defaults
    const enrichedParams = {
      ...params,
      country: params?.country || session.profile.territory || "GB"
    };
    
    return executeAction({
      action: "BATCH_CONTACT_FINDER",
      params: enrichedParams,
      userId
    });
  },

  "DRAFT_EMAIL": async (session, params, userId) => {
    console.log(`🚀 MEGA: Delegating to shared action executor - DRAFT_EMAIL`);
    
    return executeAction({
      action: "DRAFT_EMAIL",
      params,
      userId
    });
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
│ natural_response: "Searching for {query} in {location}..."      │
│                                                                  │
│ suggested_actions: [                                            │
│   {"label":"Search database", "action":"SEARCH_PLACES",         │
│    "params":{"query":"pubs","location":"Cornwall","country":"GB"}}│
│ ]                                                                │
│                                                                  │
│ follow_ups: ["View top 10", "Export results", "New search"]    │
│ ✓ ALWAYS include suggested_actions for clear requests           │
│ ✓ Action will execute automatically and show results            │
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

═══════════════════════════════════════════════════════════════════
DELEGATE TO STANDARD MODE (for complex streaming features)
═══════════════════════════════════════════════════════════════════
When user needs real-time web search, URL fetching, or complex multi-turn
conversation that benefits from streaming, use these actions - they will
automatically switch to Standard mode's streaming chat:

- WEB_SEARCH: Real-time web search with streaming responses
  Params: {query}
  
- FETCH_URL: Fetch and parse content from web page
  Params: {url}
  
- COMPLEX_CONVERSATION: Multi-turn conversation needing streaming
  Params: {context}

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
- For DIRECT_ACTION: MUST include suggested_actions array with action + params
- For VAGUE: Ask 1-2 probing questions, offer clear options
- For OFF_SCOPE: Redirect gracefully to what you CAN do
- Use PROFILE/SUMMARY/ENTITIES to personalize every response
- Keep natural_response concise, warm, and goal-oriented

EXAMPLES OF suggested_actions:
Input: "find pubs in cornwall"
Output: suggested_actions: [{"label":"Search","action":"SEARCH_PLACES","params":{"query":"pubs","location":"Cornwall","country":"GB"}}]

Input: "research coffee shops in London"
Output: suggested_actions: [{"label":"Research","action":"DEEP_RESEARCH","params":{"topic":"coffee shops in London"}}]
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
  
  // Actions that should delegate to Standard mode's streaming chat
  const delegateToStandard = new Set(["WEB_SEARCH", "FETCH_URL", "COMPLEX_CONVERSATION"]);
  
  const first = plan.suggested_actions[0];
  
  // Check if this action should be delegated to Standard mode
  if (delegateToStandard.has(first.action)) {
    console.log(`🔄 Delegating "${first.action}" to Standard mode for streaming execution`);
    return { 
      ok: true, 
      delegateToStandard: true,
      data: { action: first.action, params: first.params }
    };
  }
  
  // Check if action is in safe auto-execute list
  const safeAction = plan.suggested_actions.find(a => safe.has(a.action));
  if (!safeAction) {
    console.log(`⏸️ Action "${first.action}" not in safe list - not auto-executing`);
    return undefined;
  }

  const impl = ToolRegistry[safeAction.action];
  if (!impl) {
    console.log(`⚠️ No handler for "${safeAction.action}" - delegating to Standard mode`);
    return { 
      ok: true, 
      delegateToStandard: true,
      data: { action: safeAction.action, params: safeAction.params }
    };
  }

  console.log(`▶️ Executing action: ${safeAction.action} with params:`, safeAction.params);
  const result = await impl(state, safeAction.params, userId);
  state.history.push({ 
    role:"tool", 
    content:`${safeAction.action} → ${JSON.stringify(result)}`, 
    ts: nowISO() 
  });
  
  return result;
}

/* ========================= PUBLIC API ========================= */

export async function agentChat(
  conversationId: string, 
  userText: string, 
  user?: User,
  storage?: any
) {
  // Use conversationId as sessionId for in-memory state
  const state = ensureSession(conversationId);

  // Sync with database to load shared conversation history
  // This ensures MEGA sees what Standard mode has done
  if (storage && state.turns === 0) {
    await syncSessionWithDatabase(conversationId, state, storage);
  }

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

  // Save user message to database (to share with Standard mode)
  if (storage && user) {
    try {
      await storage.createMessage({
        id: crypto.randomUUID(),
        conversationId: conversationId,
        role: "user",
        content: userText,
        createdAt: Date.now()
      });
      console.log(`💾 MEGA: Saved user message to database (conversationId: ${conversationId})`);
    } catch (error) {
      console.error("Failed to save user message to database:", error);
    }
  }

  // Record user turn in session state
  state.history.push({ role:"user", content:userText, ts: nowISO() });
  state.turns++;
  state.lastUpdated = Date.now(); // Update timestamp to prevent premature cleanup

  // Planner
  const planned = await callPlanner(state, userText);

  // Apply profile/entity updates
  if (planned.plan?.profile_updates) {
    state.profile = { ...state.profile, ...planned.plan.profile_updates };
  }
  upsertEntities(state, planned.plan?.entity_updates);

  // Maybe auto-exec a safe action
  const autoResult = await maybeExecuteFirstSafeAction(state, planned.plan, user?.id);

  // Record assistant turn in session state
  state.history.push({ role:"assistant", content: planned.natural, ts: nowISO() });

  // Save assistant message to database (to share with Standard mode)
  if (storage && user) {
    try {
      await storage.createMessage({
        id: crypto.randomUUID(),
        conversationId: conversationId,
        role: "assistant",
        content: planned.natural,
        createdAt: Date.now()
      });
      console.log(`💾 MEGA: Saved assistant message to database (conversationId: ${conversationId})`);
    } catch (error) {
      console.error("Failed to save assistant message to database:", error);
    }
  }

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
    auto_action_result: autoResult,
    conversationId: conversationId // Return conversationId for frontend
  };
}
