# Wyshbone Agent System - 4-Repo Architecture

**Version:** 1.0  
**Created:** January 3, 2026  
**Based on:** Actual repository audits + Vision document  
**Purpose:** Technical architecture for implementing learning/beliefs system

---

## 📋 TABLE OF CONTENTS

1. [High-Level Architecture](#high-level)
2. [Repo 1: wyshbone-ui (The Cockpit)](#repo-ui)
3. [Repo 2: wyshbone-supervisor (The Operator)](#repo-supervisor)
4. [Repo 3: wyshbone-control-tower (The Evaluator)](#repo-tower)
5. [Repo 4: wyshbone-behaviour (The Judgement Layer)](#repo-wabs)
6. [Data Flow Diagrams](#data-flows)
7. [Integration Status Matrix](#integration-status)
8. [API Contracts](#api-contracts)
9. [The Core Loop Implementation](#core-loop)
10. [Where Learning Fits](#learning-system)

---

## 🏗️ HIGH-LEVEL ARCHITECTURE {#high-level}

### The Philosophy (from Vision Doc)

**Wyshbone is a VALA** (Vertical Autonomous Lead-Ops Agent):
```
Plan → Act → Evaluate → Adapt → Repeat
```

**Not:** "AI chatbot with CRM features"  
**Is:** "Autonomous commercial operator that compounds usefulness over time"

### Why 4 Repos?

Each repo represents a **separation of responsibility** (like parts of a real human operator):

```
┌─────────────────────────────────────────────────────────┐
│                    THE WYSHBONE AGENT                    │
├──────────────┬──────────────┬──────────────┬────────────┤
│              │              │              │            │
│  UI          │  Supervisor  │  Tower       │  WABS      │
│  (Face)      │  (Brain)     │  (Manager)   │  (Wisdom)  │
│              │              │              │            │
│  What user   │  Plans &     │  Evaluates   │  Prevents  │
│  sees and    │  executes    │  quality &   │  dumb      │
│  controls    │  work        │  enforces    │  decisions │
│              │              │  standards   │            │
└──────────────┴──────────────┴──────────────┴────────────┘
```

### Current Deployment Architecture

```
Production Setup:

┌────────────────┐         ┌─────────────────┐
│  wyshbone-ui   │◄───────►│  Supabase       │
│  (Main App)    │         │  (Shared State) │
│  Replit/Vercel │         │  PostgreSQL     │
└────────┬───────┘         └────────┬────────┘
         │                          │
         │ polls                    │ polls
         │ /export/status.json      │
         │                          │
         ▼                          ▼
┌────────────────┐         ┌─────────────────┐
│  supervisor    │         │  control-tower  │
│  (Separate     │         │  (Monitoring)   │
│   Replit)      │         │  Replit         │
└────────────────┘         └─────────────────┘

┌────────────────┐
│  behaviour     │  ← Library (not deployed)
│  (npm package) │     Can be imported by any repo
└────────────────┘
```

---

## 📱 REPO 1: wyshbone-ui (The Cockpit) {#repo-ui}

### Purpose
**The front end where users see reality and control the agent.**

### Tech Stack
- **Frontend:** React + Vite + Tailwind + shadcn/ui
- **Backend:** Express + TypeScript
- **Database:** PostgreSQL (via Drizzle ORM)
- **Hosting:** Supabase (database) + Replit/Vercel (app)

### Key Responsibilities

**What UI Does:**
1. ✅ **Captures user intent & constraints**
   - Goals, value, budget, time, risk tolerance
2. ✅ **Shows agent work visually**
   - Plans, run status, leads found, actions taken
3. ✅ **Provides control mechanisms**
   - Approve/reject plans, adjust constraints
4. ✅ **Displays evidence & outcomes**
   - Not vibes, actual results with sources
5. ✅ **Manages CRM data**
   - Customers, orders, products, suppliers
6. ✅ **Integrates with Xero**
   - Sync customers/orders, webhook handling

**What UI Does NOT Do:**
- ❌ Generate lead plans (Supervisor does)
- ❌ Execute complex orchestration (Supervisor does)
- ❌ Evaluate output quality (Tower does)
- ❌ Enforce behavioral constraints (WABS does)

### Database Schema Highlights

**88 tables total, grouped by function:**

#### Agent/AI Tables (12 tables)
```sql
deep_research_runs        -- AI research tracking
scheduled_monitors        -- Recurring AI tasks
lead_gen_plans           -- Plan approval workflow
facts                    -- User knowledge extraction
conversations            -- Chat sessions
messages                 -- Chat history
entity_review_queue      -- AI matching review
agent_intelligence       -- AI discoveries
pubs_master             -- 88k pub database
entity_sources          -- Multi-source tracking
```

#### CRM Tables (20+ tables)
```sql
crm_customers, crm_orders, crm_order_lines
crm_products, crm_stock, crm_delivery_runs
crm_call_diary, crm_activities, crm_tasks
suppliers, supplier_purchases, supplier_products
```

#### Brewery Vertical (10 tables)
```sql
brew_products, brew_batches, brew_inventory_items
brew_containers, brew_duty_reports
brew_price_books, brew_trade_store_*
```

#### Xero Integration (4 tables)
```sql
xero_connections, xero_import_jobs
xero_sync_queue, xero_webhook_events
```

#### Route Planner (3 NEW tables - just added by Claude Code)
```sql
delivery_routes, route_stops, route_optimization_results
```

### Key API Endpoints

#### Agent Endpoints
```typescript
POST /api/chat               // OpenAI chat (streaming)
POST /api/agent/chat         // Claude AI with tools
POST /agent/chat             // MEGA Agent (hybrid)
POST /api/deep-research      // Start research
GET  /api/plan               // Get current plan
POST /api/plan/approve       // Approve plan
```

#### Sleeper Agent (Background AI)
```typescript
POST /api/sleeper-agent/search     // Discovery search
POST /api/sleeper-agent/events     // Event discovery
POST /api/sleeper-agent/nightly-update  // Trigger job
```

#### Entity Matching (AI)
```typescript
GET  /api/entity-review/queue
POST /api/entity-review/:id/approve
POST /api/entity-review/:id/reject
```

#### Activity Logging (NEW)
```typescript
GET  /api/activity-log         // Recent activities
POST /api/activity-log         // Log activity
```

### Integration Points

**Talks To:**

| Service | Method | What For |
|---------|--------|----------|
| **Supabase** | Direct connection | Database, auth, realtime |
| **Supervisor** | Supabase tables | Creates `supervisor_tasks`, reads `messages` |
| **Tower** | HTTP POST | Logs runs via `/tower/runs/log` |
| **WABS** | Import (planned) | Behavior enforcement |
| **Xero** | OAuth + webhooks | Accounting integration |
| **Google Places** | API | Business search |
| **Anthropic** | API | Claude for agent/matching |
| **OpenAI** | API | GPT for chat/planning |

**Key Files:**
```
server/routes.ts            # Main API routes (~12k lines!)
server/anthropic-agent.ts   # Claude agent with tools
server/lib/matching.ts      # AI entity matching
server/lib/xero-import.ts   # Xero integration
server/cron/nightly-maintenance.ts  # Background jobs
```

### Current State

**✅ Working:**
- Chat with tools (Claude + OpenAI)
- Deep research
- Google Places search
- Xero integration (import/export)
- Entity matching (AI)
- Activity logging (NEW)
- Nightly pub database updates
- Route planner (just added by Claude Code)

**⚠️ Partial:**
- Supervisor integration (creates tasks, needs more wiring)
- Tower logging (endpoint exists, needs systematic use)
- WABS integration (not yet imported)

**❌ Missing:**
- Learning system (databases exist, logic needed)
- Beliefs updating based on outcomes
- Systematic Tower event logging

---

## 🧠 REPO 2: wyshbone-supervisor (The Operator) {#repo-supervisor}

### Purpose
**The execution brain that turns goals into plans and plans into actions.**

### Tech Stack
- **Backend:** Express + TypeScript
- **Frontend:** React + Vite (for monitoring dashboard)
- **Database:** PostgreSQL (local) + Supabase (shared state)
- **Hosting:** Separate Replit deployment

### Key Responsibilities

**What Supervisor Does:**
1. ✅ **Converts goals → plans**
   - Parses user goals into structured step DAG
   - Determines dependencies and execution order
2. ✅ **Executes plans**
   - Google Places search
   - Hunter.io email lookup
   - Data enrichment
   - (Stubbed: Email sequences, monitoring setup)
3. ✅ **Handles tool use**
   - Action registry: DEEP_RESEARCH, GLOBAL_DB, SCHEDULED_MONITOR, EMAIL_FINDER
4. ✅ **Writes structured outputs**
   - Leads, action results, status updates
5. ✅ **Background processing ("Subconscious")**
   - Polls Supabase every 30 seconds
   - Processes user signals → generates leads
   - Runs "subconscious packs" (stale leads analyzer)

**What Supervisor Does NOT Do:**
- ❌ Display UI to end users (UI repo does)
- ❌ Evaluate quality (Tower does)
- ❌ Enforce behavioral rules (WABS does)

### Database Schema

**Local PostgreSQL (5 tables):**
```sql
plans                    -- Lead gen plans (pending_approval, executing, etc.)
plan_executions         -- Historical execution records
supervisor_state        -- Checkpoint tracking for signal processing
processed_signals       -- Idempotency tracking
subconscious_nudges     -- Background-generated nudges
```

**Supabase Tables (Shared with UI):**
```sql
-- READS from Supabase:
users                   -- User profiles
user_signals           -- Activity triggers
facts                  -- User knowledge
messages               -- Conversation history
conversations          -- Session metadata
supervisor_tasks       -- Pending tasks from UI
scheduled_monitors     -- Active monitors
deep_research_runs     -- Research history

-- WRITES to Supabase:
messages               -- Supervisor responses (source='supervisor')
supervisor_tasks       -- Status updates
```

### Key API Endpoints

#### Plan Execution Pipeline
```typescript
POST /api/plan/start        // Create plan from goal
POST /api/plan/approve      // Approve & execute
GET  /api/plan/progress     // Get execution progress
```

#### Leads & Signals
```typescript
GET  /api/leads            // Get suggested leads
POST /api/leads/save       // Save a lead
GET  /api/leads/saved      // List saved leads
GET  /api/signals          // Get user signals
```

#### Subconscious
```typescript
GET  /api/subcon/nudges/account/:id
POST /api/subcon/nudges/resolve/:id
POST /api/subcon/nudges/dismiss/:id
```

#### Export (for Tower polling)
```typescript
GET  /export/status.json   // Summary status (requires X-EXPORT-KEY)
GET  /export/file          // File content
```

### Integration Points

**Talks To:**

| Service | Method | What For |
|---------|--------|----------|
| **Supabase** | Direct + polling | Shared state with UI |
| **UI** | Supabase tables | Reads tasks, writes messages |
| **Tower** | Polled by Tower | Status/file exports |
| **Google Places** | API | Lead discovery |
| **Hunter.io** | API | Email lookup |
| **Resend** | API | Email notifications |

**Integration Pattern with UI:**

```
UI creates supervisor_task in Supabase
         ↓
Supervisor polls Supabase (every 30s)
         ↓
Supervisor processes task
         ↓
Supervisor writes message to Supabase
         ↓
UI receives message via realtime subscription
```

### Current State

**✅ Working:**
- Plan creation & execution
- Google Places search
- Hunter email lookup
- Email notifications (Resend)
- Subconscious scheduler
- Polling architecture

**⚠️ Stubbed:**
- Email sequence setup (returns mock campaign ID)
- Lead list save (simulates, returns mock ID)
- Monitor setup (returns mock monitor ID)
- Deep research (no implementation)

**❌ Missing:**
- Learning from plan outcomes
- Strategy adaptation based on ROI
- Systematic Tower event logging
- WABS integration (no behavioral constraints)

---

## 🏗️ REPO 3: wyshbone-control-tower (The Evaluator) {#repo-tower}

### Purpose
**Oversight layer that makes Wyshbone safe, reliable, and improvable.**

### Tech Stack
- **Backend:** Express + TypeScript (server.js is ~1700 lines!)
- **Frontend:** React + Vite + shadcn/ui
- **Database:** PostgreSQL (Neon serverless)
- **AI:** OpenAI GPT-4o-mini for diagnosis
- **Hosting:** Separate Replit

### Key Responsibilities

**What Tower Does:**
1. ✅ **Ingests run events**
   - FROM: UI and Supervisor via `/tower/runs/log`
   - Tracks: source, user, goal, status, metadata
2. ✅ **Polls services for status**
   - Every N seconds: `/export/status.json`
   - Fetches files: `/export/file?path=...`
3. ✅ **Evaluates outputs**
   - "Is this lead real?"
   - "Is this claim supported?"
   - "Did this step complete?"
4. ✅ **Detects failure modes**
   - Timeouts, errors, hallucinations
   - Auto-triggers investigations
5. ✅ **Runs behavior tests**
   - 4 tests defined: greeting, personalization, lead-search, monitor-setup
   - Calls UI `/api/tower/chat-test` endpoint
6. ✅ **Diagnoses issues (LLM)**
   - Uses GPT-4o-mini to analyze failures
   - Suggests patches
7. ✅ **Produces "nudges"**
   - Fix, retry, change approach, stop
8. ✅ **Maintains evidence trails**
   - Run logs, investigation results, patch evaluations

**What Tower Does NOT Do:**
- ❌ Execute user-facing work (Supervisor does)
- ❌ Display to end users (UI does)
- ❌ Make behavioral decisions (WABS does)

### Database Schema (9 tables)

```sql
users                   -- Basic auth
runs                    -- Run tracking (source, goal, status)
investigations          -- Investigation records + diagnosis
behaviour_tests         -- Test definitions
behaviour_test_runs     -- Test execution history
patch_evaluations       -- Patch results
patch_suggestions       -- AI-suggested patches
dev_issues             -- Developer-reported issues
dev_issue_context      -- Context for dev issues
dev_issue_patches      -- Patches for dev issues
```

### Key API Endpoints

#### Run Tracking
```typescript
POST /tower/runs/log         // Main ingestion endpoint
GET  /tower/runs             // List recent runs
GET  /tower/runs/live        // Live user runs
GET  /tower/runs/:id         // Get run details
POST /tower/runs/:id/investigate  // Trigger investigation
```

#### Investigations
```typescript
POST /tower/evaluator/investigate
GET  /tower/evaluator/investigations
GET  /tower/evaluator/investigations/:id
```

#### Behaviour Tests
```typescript
GET  /tower/behaviour-tests
POST /tower/behaviour-tests/run
POST /tower/behaviour-tests/:testId/investigate
```

#### Conversation Quality
```typescript
POST /tower/conversation-quality/*      // Manual flags
POST /tower/auto-conversation-quality/* // Auto-analysis
```

### Integration Points

**Receives Events FROM:**
```
UI → POST /tower/runs/log
Supervisor → POST /tower/runs/log
```

**Polls Data FROM:**
```
UI → GET /export/status.json, GET /export/file
Supervisor → GET /export/status.json, GET /export/file
```

**Calls FOR Testing:**
```
UI → POST /api/tower/chat-test
```

### Investigation Triggers

```typescript
type InvestigationTrigger =
  | "manual"                    // User-initiated
  | "timeout"                   // Auto-detect
  | "tool_error"                // Auto-detect
  | "behaviour_flag"            // Test failure
  | "conversation_quality"      // Manual quality flag
  | "auto_conversation_quality" // Auto-analysis
  | "patch_failure";            // Patch failed
```

### Behaviour Tests Defined

```typescript
1. "greeting-basic"         // Greeting/onboarding
2. "personalisation-domain" // Domain-aware responses
3. "lead-search-basic"      // Lead search
4. "monitor-setup-basic"    // Monitoring setup
```

### Current State

**✅ Working:**
- Run ingestion from UI/Supervisor
- Investigation system
- Behaviour tests (4 defined)
- Auto-detection of failures
- LLM diagnosis (GPT-4o-mini)
- Conversation quality analysis
- Patch evaluation
- Dev issues workflow
- Status polling

**⚠️ Partial:**
- Systematic event logging (endpoint exists, underused)
- Integration with learning system (data exists, not used)

**❌ Missing:**
- Learning event capture (no schema for commercial learning)
- ROI pattern tracking
- Strategy effectiveness analysis

---

## 🧘 REPO 4: wyshbone-behaviour (The Judgement Layer) {#repo-wabs}

### Purpose
**Policy and judgement layer that makes the agent behave rationally.**

### Tech Stack
- **Type:** Standalone TypeScript library (NOT an app!)
- **Database:** None (in-memory Map for now)
- **API:** None (exports functions)
- **Dependencies:** Zero runtime dependencies

### Key Responsibilities

**What WABS Does:**
1. ✅ **Enforces principles**
   - User tells agent what success is worth (not what to do)
   - Agent abandons bad strategies when ROI is wrong
   - Agent prefers evidence, explicit about uncertainty
2. ✅ **Applies constraints**
   - Budget limits (API spend, outreach volume)
   - Time limits (stop conditions)
   - Risk posture (aggressive vs conservative)
   - Compliance rules (spam avoidance, opt-out)
   - Vertical rules (what "good lead" means per industry)
3. ✅ **Adds "pushback"**
   - "This isn't worth it given your budget"
   - "This target market is too broad"
   - "Your success criteria are unclear"
4. ✅ **Manages behavioral state**
   - Tone (default, empathetic, assertive)
   - Pacing (delays, chunking)
   - Emotional inference (frustration detection)
   - Socratic questioning (clarifications)
   - User preferences (communication style, risk tolerance)

**What WABS Does NOT Do:**
- ❌ Execute tasks (Supervisor does)
- ❌ Display UI (UI repo does)
- ❌ Store data permanently (in-memory only, needs DB backing)

### Core Engines (7 engines)

```typescript
1. Tone Engine (§2)            // Default, empathetic, assertive
2. Pacing Engine (§3)          // Response timing/chunking
3. Socratic Engine (§4)        // Clarifying questions
4. Pushback Engine (§5)        // Challenge bad decisions
5. Emotional Inference (§6)    // Detect frustration/confusion
6. Insight Injection (§7)      // Pattern-based insights (stubbed)
7. Behavioural Memory (§9)     // User preferences (in-memory)
```

### Main Exports

```typescript
import {
  generateAgentResponse,         // Main orchestrator
  generateFailSafeResponse,      // Uncertainty handling
  inferEmotion,                  // Emotional state detection
  determineTone,                 // Tone selection
  calculatePacing,               // Response timing
  maybeGeneratePushback,         // Challenge bad ideas
  maybeAskClarifyingQuestions,   // Socratic questions
  rememberPreference,            // User preference storage
  // ... many more
} from 'wyshbone-behaviour';
```

### Processing Flow

```
1. Enrich context with stored preferences
2. Infer emotion from message patterns
3. Update frustration level
4. Determine tone (default/empathetic/assertive)
5. Maybe generate pushback (if bad decision)
6. Maybe ask clarifying questions (Socratic)
7. Maybe inject insight (pattern match)
8. Calculate pacing for UI rendering
9. Return structured output
```

### Integration Hooks (Planned - WABS §12)

| Target Repo | Hook Points |
|-------------|-------------|
| **Tower** | Reasoning filters, pushback triggers, insight injection, tone selection |
| **Supervisor** | Follow-up scheduler, long-running task cues, check-ins, error handling |
| **UI** | Pacing engine, message renderer, emotion-to-format mapping |

### Current State

**✅ Working (6/8 engines):**
- Emotional inference
- Tone model
- Pushback engine
- Socratic engine
- Pacing engine
- Behavioural memory (in-memory)
- Fail-safe uncertainty handling

**⚠️ Stubbed (2 engines):**
- Insight injection (needs lead data access)
- Follow-up behaviour (needs Supervisor integration)

**❌ Missing:**
- Database persistence (all in-memory)
- Import by other repos (not yet used!)
- ROI-based constraint enforcement
- Evidence quality requirements

---

## 🔄 DATA FLOW DIAGRAMS {#data-flows}

### Flow 1: User Chat Interaction (Current)

```
User types message in UI
         ↓
POST /api/chat (or /api/agent/chat)
         ↓
UI backend processes with Claude/OpenAI
         ↓
[WABS NOT YET INTEGRATED]
         ↓
Response streamed to user
         ↓
[TOWER LOGGING: Partial]
```

**Issues:**
- No WABS behavioral filtering
- Inconsistent Tower logging
- No learning capture

---

### Flow 2: Plan Creation & Execution (Current)

```
User sets goal in UI
         ↓
UI writes to Supabase: supervisor_tasks table
         ↓
Supervisor polls Supabase (every 30s)
         ↓
Supervisor detects new task
         ↓
Supervisor generates plan (LeadGenPlan)
         ↓
Supervisor writes to Supabase: messages table
         ↓
UI displays plan for approval
         ↓
User approves
         ↓
UI updates supervisor_task status
         ↓
Supervisor executes plan steps:
  - Google Places search
  - Hunter email lookup
  - (Stubbed: email sequences, monitoring)
         ↓
Supervisor writes results to Supabase: messages
         ↓
[TOWER LOGGING: Partial - not systematic]
         ↓
[NO LEARNING CAPTURE]
```

**Issues:**
- No systematic Tower logging of execution
- No learning from plan outcomes
- No ROI tracking
- No strategy adaptation

---

### Flow 3: Tower Behaviour Test (Current)

```
Tower triggers test
         ↓
POST /tower/behaviour-tests/run
         ↓
Tower calls UI: POST /api/tower/chat-test
         ↓
UI processes test message
         ↓
UI returns response
         ↓
Tower evaluates response against test criteria
         ↓
Tower stores result: behaviour_test_runs table
         ↓
If failure: Auto-trigger investigation
         ↓
Tower diagnoses with GPT-4o-mini
         ↓
Tower stores investigation: investigations table
```

**Works well! But:**
- Only 4 tests defined
- No commercial effectiveness tests (ROI, conversions)
- Results not fed back to improve agent

---

### Flow 4: Nightly Maintenance (Current)

```
Cron triggers (2 AM)
         ↓
UI: server/cron/nightly-maintenance.ts
         ↓
For each pub in pubs_master:
  - Verify with Google Places
  - Check whatpub.com
  - Update status/info
         ↓
Log to activity_log table (NEW)
         ↓
[TOWER LOGGING: Missing]
```

**Issues:**
- Not logged to Tower
- No learning from verification patterns
- No quality metrics tracked

---

### Flow 5: DESIRED - Complete Agent Loop (Target)

```
┌─────────────────────────────────────────────┐
│ 1. PLAN (UI + Supervisor + WABS)            │
│                                             │
│ User: "Find me new brewery customers"      │
│    ↓                                        │
│ UI captures goal + constraints              │
│    ↓                                        │
│ [WABS checks constraints are rational]      │
│    ↓                                        │
│ Supervisor generates plan                   │
│    ↓                                        │
│ [WABS validates plan ROI]                   │
│    ↓                                        │
│ UI shows plan for approval                  │
└─────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────┐
│ 2. ACT (Supervisor)                         │
│                                             │
│ Execute plan steps:                         │
│  - Search Google Places                     │
│  - Find emails with Hunter                  │
│  - Enrich lead data                         │
│  - Save to CRM                              │
│  - [Log every action to Tower]              │
└─────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────┐
│ 3. EVALUATE (Tower)                         │
│                                             │
│ Tower receives execution events             │
│    ↓                                        │
│ Tower evaluates:                            │
│  - Lead quality                             │
│  - Evidence strength                        │
│  - Success/failure patterns                 │
│  - Time/cost efficiency                     │
│    ↓                                        │
│ Tower generates evaluation:                 │
│  - Quality scores                           │
│  - Issues/nudges                            │
│  - Pattern insights                         │
└─────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────┐
│ 4. ADAPT (Learning System - TO BE BUILT)    │
│                                             │
│ Capture learning events:                    │
│  - Lead conversion outcomes                 │
│  - Strategy effectiveness                   │
│  - ROI patterns                             │
│  - Evidence quality patterns                │
│    ↓                                        │
│ Update beliefs:                             │
│  - Best-fit segments                        │
│  - Effective strategies                     │
│  - Required evidence quality                │
│  - Budget allocation                        │
│    ↓                                        │
│ [WABS enforces belief-based constraints]    │
│    ↓                                        │
│ Store for next iteration                    │
└─────────────────────────────────────────────┘
              ↓
         Repeat (with improved knowledge)
```

---

## 📊 INTEGRATION STATUS MATRIX {#integration-status}

### UI ↔ Supervisor

| Integration Point | Method | Status | Notes |
|-------------------|--------|--------|-------|
| Task creation | Supabase `supervisor_tasks` | ✅ Working | UI writes, Supervisor reads |
| Response delivery | Supabase `messages` | ✅ Working | Supervisor writes, UI reads |
| Realtime updates | Supabase subscriptions | ✅ Working | UI listens for new messages |
| Plan approval | Task status updates | ✅ Working | Bidirectional via Supabase |

**Issues:**
- Polling-based (30s delay)
- No direct API calls
- Supabase as message bus

---

### UI ↔ Tower

| Integration Point | Method | Status | Notes |
|-------------------|--------|--------|-------|
| Run logging | `POST /tower/runs/log` | ⚠️ Partial | Endpoint exists, underused |
| Status export | `GET /export/status.json` | ❌ Missing | Not implemented in UI |
| File export | `GET /export/file` | ❌ Missing | Not implemented in UI |
| Chat testing | `POST /api/tower/chat-test` | ✅ Working | Tower calls UI for tests |

**Issues:**
- Run logging not systematic
- Export endpoints missing (Tower can't poll UI)
- One-way communication (Tower → UI works, UI → Tower partial)

---

### Supervisor ↔ Tower

| Integration Point | Method | Status | Notes |
|-------------------|--------|--------|-------|
| Run logging | `POST /tower/runs/log` | ⚠️ Partial | Could be more comprehensive |
| Status export | `GET /export/status.json` | ✅ Working | Tower polls this |
| File export | `GET /export/file` | ✅ Working | Tower fetches files |

**Better than UI ↔ Tower!**

---

### UI/Supervisor ↔ WABS

| Integration Point | Method | Status | Notes |
|-------------------|--------|--------|-------|
| Import library | npm install | ❌ Not done | Library exists but not imported |
| Tone filtering | Function calls | ❌ Not used | Would improve chat quality |
| Pushback | Function calls | ❌ Not used | Could prevent bad decisions |
| Pacing | Function calls | ❌ Not used | Could improve UX |
| Constraints | Function calls | ❌ Not used | No ROI enforcement |

**WABS is ready but not integrated anywhere!**

---

### Summary Integration Health

```
✅ Solid: UI ↔ Supervisor (via Supabase)
⚠️ Partial: UI → Tower, Supervisor → Tower
❌ Missing: WABS integration (everywhere)
❌ Missing: Learning system (no repo for it yet!)
```

---

## 🔌 API CONTRACTS {#api-contracts}

### UI → Supervisor (via Supabase)

**Task Creation:**
```typescript
// UI writes to Supabase
INSERT INTO supervisor_tasks (
  user_id,
  task_type,      // 'chat', 'plan_generation', etc
  task_data,      // JSONB with goal, context
  status,         // 'pending'
  created_at
)

// Supervisor polls and reads
SELECT * FROM supervisor_tasks
WHERE status = 'pending'
ORDER BY created_at ASC
```

**Response Delivery:**
```typescript
// Supervisor writes to Supabase
INSERT INTO messages (
  conversation_id,
  role,           // 'assistant'
  content,        // Response text
  source,         // 'supervisor'
  created_at
)

// UI subscribes via realtime
supabase
  .channel('messages')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages'
  }, (payload) => {
    // Update UI with new message
  })
  .subscribe()
```

---

### UI/Supervisor → Tower

**Run Logging:**
```typescript
POST /tower/runs/log
Content-Type: application/json

{
  source: 'wyshbone-ui' | 'wyshbone-supervisor',
  userId: string,
  goal: string,
  status: 'started' | 'progress' | 'completed' | 'failed',
  meta: {
    // Arbitrary metadata
    planId?: string,
    stepName?: string,
    error?: string,
    // etc
  }
}

Response: { runId: string }
```

**Status Export (for polling):**
```typescript
GET /export/status.json
Headers:
  X-EXPORT-KEY: <secret>

Response: {
  service: string,
  uptime: number,
  lastActivity: timestamp,
  activeRuns: number,
  // etc
}
```

**File Export:**
```typescript
GET /export/file?path=<file-path>
Headers:
  X-EXPORT-KEY: <secret>

Response: File contents (text)
```

---

### Tower → UI

**Behaviour Test:**
```typescript
POST /api/tower/chat-test
Content-Type: application/json

{
  message: string,
  context?: object
}

Response: {
  response: string,
  latency: number,
  // other metrics
}
```

---

### Proposed: Supervisor → WABS

**Tone Filtering:**
```typescript
import { determineTone } from 'wyshbone-behaviour';

const tone = determineTone({
  lastUserMessage: "Forget it, this is taking too long",
  conversationHistory: [...],
  frustrationLevel: 0.7
});
// Returns: 'empathetic'
```

**Pushback:**
```typescript
import { maybeGeneratePushback } from 'wyshbone-behaviour';

const pushback = maybeGeneratePushback({
  lastUserMessage: "Just get me all pubs in Sussex",
  context: { budget: 100, maxResults: 1000 }
});

// Returns: "That's too broad. Sussex has ~2,000 pubs. 
// Which specific areas or pub types matter most?"
```

---

## 🔁 THE CORE LOOP IMPLEMENTATION {#core-loop}

### Philosophy (from Vision)

```
Plan → Act → Evaluate → Adapt → Repeat
```

**This is NOT a one-off chatbot. This is CONTINUOUS OPERATION.**

### Current Implementation Status

| Phase | Status | Where It Happens | Issues |
|-------|--------|------------------|--------|
| **PLAN** | ✅ Partial | UI captures goal → Supervisor generates plan | WABS not validating rationality |
| **ACT** | ✅ Working | Supervisor executes plan steps | Tower logging incomplete |
| **EVALUATE** | ⚠️ Partial | Tower has infrastructure | Not systematic, no commercial metrics |
| **ADAPT** | ❌ Missing | No learning system exists | No beliefs updating, no strategy improvement |
| **REPEAT** | ⚠️ Manual | User must initiate new plans | Not autonomous, no continuous operation |

---

### What PLAN Looks Like (Current)

**Location:** UI (goal capture) + Supervisor (plan generation)

```
1. User: "Find me 50 craft beer pubs in Yorkshire"
2. UI captures: goal, constraints (budget, time, risk)
3. [MISSING: WABS validates goal is rational given constraints]
4. UI creates supervisor_task in Supabase
5. Supervisor polls, detects task
6. Supervisor generates plan:
   - Step 1: Google Places search ("craft beer pubs", "Yorkshire")
   - Step 2: Hunter domain search for each pub
   - Step 3: Hunter email enrichment
   - Step 4: Save to suggested_leads table
   - [STUBBED: Step 5: Email sequence setup]
   - [STUBBED: Step 6: Monitor setup]
7. Supervisor writes plan to messages table
8. UI displays plan for user approval
9. [MISSING: WABS checks plan ROI vs budget]
10. User approves
11. UI updates task status to 'approved'
```

**Issues:**
- No WABS validation of goal rationality
- No ROI pre-check
- No learning from past plan success/failure

---

### What ACT Looks Like (Current)

**Location:** Supervisor (execution)

```
1. Supervisor detects approved task
2. For each step in plan:
   a. Execute action (Google Places, Hunter, etc)
   b. Capture result
   c. [PARTIAL: Log to Tower]
   d. Check dependencies
   e. Continue or fail
3. Update progress in Supabase
4. Write completion message
5. [MISSING: Systematic Tower logging]
6. [MISSING: Evidence quality tracking]
```

**Issues:**
- Tower logging not comprehensive
- No evidence quality scores
- No time/cost tracking per step
- Stubbed steps (email, monitoring)

---

### What EVALUATE Looks Like (Current)

**Location:** Tower

```
1. Tower polls Supervisor/UI for status
2. [PARTIAL: Receives run events via /tower/runs/log]
3. Tower stores run data
4. Tower runs behaviour tests (4 tests)
5. [MISSING: Commercial effectiveness evaluation]
6. If failure detected → Auto-investigate
7. GPT-4o-mini diagnoses issue
8. Tower stores investigation
9. [MISSING: Learning events generated]
10. [MISSING: Quality scores stored for learning]
```

**Issues:**
- Focus on technical failures, not commercial outcomes
- No lead quality scoring
- No conversion tracking
- No ROI analysis
- Evaluations not fed back to improve future plans

---

### What ADAPT Looks Like (MISSING!)

**Location:** TO BE BUILT (Learning System)

**Should look like:**
```
1. Capture learning events from Tower evaluations:
   - Lead quality scores
   - Conversion outcomes
   - Strategy effectiveness
   - Evidence strength patterns
   - ROI per segment

2. Process learning events:
   - Identify patterns
   - Update beliefs
   - Adjust strategy weights

3. Store updated beliefs:
   - Best-fit segments
   - Effective strategies
   - Required evidence quality
   - Budget allocation rules

4. WABS enforces beliefs:
   - Constraints based on learned ROI
   - Pushback on known-bad strategies
   - Evidence requirements

5. Next PLAN uses updated beliefs:
   - Prioritize high-ROI segments
   - Avoid known-bad approaches
   - Set appropriate confidence thresholds
```

**Current reality:**
- ❌ No learning event capture
- ❌ No belief storage
- ❌ No pattern analysis
- ❌ No strategy adaptation
- ❌ Plans don't improve over time

---

### What REPEAT Looks Like (Current vs Desired)

**Current:**
```
User manually creates new plan
  → Starts from scratch
  → No accumulated knowledge
  → Same mistakes possible
```

**Desired (VALA vision):**
```
System runs continuously:
  → Daily/weekly sweeps for opportunities
  → Auto-generates plans based on learned ROI
  → Executes without manual approval (for trusted strategies)
  → Self-improves based on outcomes
  → Alerts user to strategy changes
  → Stops wasting money on low-ROI segments
```

---

## 🧠 WHERE LEARNING FITS {#learning-system}

### The Gap

**We have:**
- ✅ Infrastructure for execution (Supervisor)
- ✅ Infrastructure for evaluation (Tower)
- ✅ Infrastructure for behavioral rules (WABS - not integrated)
- ✅ Data about outcomes (scattered across repos)

**We're missing:**
- ❌ **Learning event capture** (Tower → Learning DB)
- ❌ **Belief storage** (Where beliefs live)
- ❌ **Pattern analysis** (Learning processor)
- ❌ **Belief retrieval** (Plans use beliefs)
- ❌ **WABS integration** (Beliefs → Constraints)

---

### Proposed Learning Architecture

#### New Database Tables (UI repo)

**Option 1: Commercial Learning Focus**
```sql
-- Lead performance tracking
CREATE TABLE lead_performance (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL,
  lead_id TEXT NOT NULL,
  segment_type TEXT,           -- 'craft-beer-pub', 'freehouse', etc
  region TEXT,
  discovery_method TEXT,       -- 'google-places', 'manual', etc
  converted BOOLEAN,
  conversion_date TIMESTAMP,
  revenue_generated NUMERIC,
  cost_to_acquire NUMERIC,
  roi NUMERIC,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Strategy effectiveness
CREATE TABLE strategy_outcomes (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL,
  strategy_id TEXT,            -- Hash of plan structure
  plan_type TEXT,              -- 'lead-discovery', 'outreach', etc
  segment TEXT,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  total_cost NUMERIC,
  total_revenue NUMERIC,
  avg_time_to_result INTERVAL,
  effectiveness_score NUMERIC, -- Calculated ROI metric
  last_updated TIMESTAMP DEFAULT NOW()
);

-- Evidence quality patterns
CREATE TABLE evidence_patterns (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL,
  evidence_type TEXT,          -- 'google-places-match', 'email-verified', etc
  reliability_score NUMERIC,   -- 0.0 to 1.0
  false_positive_rate NUMERIC,
  sample_size INTEGER,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Segment beliefs (what we've learned)
CREATE TABLE segment_beliefs (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL,
  segment_type TEXT,
  region TEXT,
  belief_type TEXT,            -- 'conversion-rate', 'avg-deal-size', 'response-rate'
  value NUMERIC,
  confidence NUMERIC,          -- 0.0 to 1.0 based on sample size
  sample_size INTEGER,
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Option 2: Conversational Learning (Simpler Start)**
```sql
-- User corrections
CREATE TABLE user_corrections (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  original_response TEXT,
  corrected_response TEXT,
  context JSONB,
  applied BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Agent beliefs
CREATE TABLE agent_beliefs (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL,
  belief_type TEXT,
  subject TEXT,
  content JSONB,
  confidence NUMERIC(3,2),
  source TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Learning events
CREATE TABLE learning_events (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL,
  event_type TEXT,
  context JSONB,
  learning JSONB,
  applied BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Recommendation: Start with Option 2 (simpler), add Option 1 tables as we build out commercial learning.**

---

### Data Flow for Learning

```
┌─────────────────────────────────────────────┐
│ CAPTURE (Tower)                             │
│                                             │
│ Plan executed → outcomes tracked            │
│ Lead quality evaluated                      │
│ Conversions monitored                       │
│ Costs calculated                            │
│    ↓                                        │
│ Generate learning event                     │
│    ↓                                        │
│ POST /api/learning/event (new endpoint)     │
└─────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────┐
│ STORE (UI DB)                               │
│                                             │
│ learning_events table                       │
│ strategy_outcomes table                     │
│ evidence_patterns table                     │
│ segment_beliefs table                       │
└─────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────┐
│ PROCESS (New service or Supervisor)         │
│                                             │
│ Analyze learning events                     │
│ Identify patterns                           │
│ Calculate ROI metrics                       │
│ Update beliefs                              │
│    ↓                                        │
│ Update segment_beliefs table                │
│ Update strategy_outcomes table              │
└─────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────┐
│ RETRIEVE (Supervisor planning)              │
│                                             │
│ GET /api/beliefs?segment=craft-beer-pubs    │
│    ↓                                        │
│ Returns: conversion rates, avg ROI,         │
│          effective strategies, etc          │
│    ↓                                        │
│ Supervisor uses in plan generation:         │
│  - Prioritize high-ROI segments             │
│  - Set realistic targets                    │
│  - Choose effective strategies              │
└─────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────┐
│ ENFORCE (WABS integration)                  │
│                                             │
│ WABS reads beliefs                          │
│    ↓                                        │
│ Enforces constraints based on learned ROI   │
│  - Pushback on low-ROI segments             │
│  - Budget allocation by effectiveness       │
│  - Stop conditions when not working         │
└─────────────────────────────────────────────┘
```

---

### Integration Points for Learning

#### Tower → UI (Learning Event Capture)

**New endpoint needed in UI:**
```typescript
POST /api/learning/event

{
  eventType: 'plan_outcome' | 'lead_quality' | 'conversion' | 'user_correction',
  data: {
    // Event-specific data
    planId?: string,
    leadId?: string,
    outcome?: 'success' | 'failure',
    metrics?: { cost, revenue, quality_score, etc }
  },
  context: {
    segment: string,
    strategy: string,
    // etc
  }
}
```

**Tower calls this after:**
- Plan execution completes
- Lead quality evaluated
- Conversion tracked
- User correction submitted

---

#### UI → Supervisor (Belief Retrieval)

**New endpoint needed in UI:**
```typescript
GET /api/beliefs?segment=X&type=Y

Response: {
  beliefs: [
    {
      type: 'conversion-rate',
      segment: 'craft-beer-pubs',
      region: 'Yorkshire',
      value: 0.15,        // 15% conversion rate
      confidence: 0.8,    // 80% confident (good sample size)
      sampleSize: 50
    },
    {
      type: 'avg-deal-size',
      segment: 'craft-beer-pubs',
      value: 5000,        // £5k average
      confidence: 0.7
    }
  ]
}
```

**Supervisor calls this:**
- Before generating plan
- To prioritize segments
- To set realistic targets
- To choose strategies

---

#### WABS Integration (Constraint Enforcement)

**WABS needs access to beliefs:**

```typescript
import { 
  generateAgentResponse,
  maybeGeneratePushback 
} from 'wyshbone-behaviour';

// Extend WABS with belief-based constraints
const response = generateAgentResponse({
  lastUserMessage: "Find me 1000 pubs in Sussex",
  context: {
    budget: 500,
    beliefs: {
      costPerLead: 2.50,        // Learned from past
      conversionRate: 0.10,     // 10% convert
      avgDealSize: 3000         // £3k per deal
    }
  }
});

// WABS calculates:
// 1000 leads × £2.50 = £2,500 cost
// Budget only £500
// Expected revenue: 100 conversions × £3k = £300k
// But can't afford the search!

// WABS pushback:
// "Your budget of £500 won't cover 1000 leads 
//  (costs ~£2,500 based on our experience).
//  With £500, you can find ~200 pubs.
//  Should we focus on a specific area?"
```

---

## 🎯 SUMMARY & NEXT STEPS

### Current System Strengths

✅ **Solid UI ↔ Supervisor integration** (via Supabase)  
✅ **Working plan generation & execution**  
✅ **Tower evaluation infrastructure exists**  
✅ **WABS behavioral library is complete**  
✅ **Data is being tracked** (just not used for learning)

### Critical Gaps

❌ **No learning system** (biggest gap!)  
❌ **WABS not integrated** (ready but unused)  
❌ **Tower logging not systematic** (partial)  
❌ **No commercial effectiveness tracking** (only technical)  
❌ **No autonomous continuous operation** (manual cycles)

### Recommended Build Order

**Phase 1: Foundation (Week 1-2)**
1. Add learning database tables to UI
2. Create `/api/learning/event` endpoint
3. Create `/api/beliefs` endpoint
4. Add Tower → UI event logging

**Phase 2: Basic Learning (Week 2-3)**
1. Capture user corrections
2. Store basic beliefs
3. Retrieve beliefs in plan generation
4. Show learned insights in UI

**Phase 3: WABS Integration (Week 3-4)**
1. Import WABS into UI
2. Apply tone/pacing to chat
3. Add pushback engine
4. Integrate beliefs with WABS constraints

**Phase 4: Commercial Learning (Week 4-6)**
1. Track lead performance
2. Calculate strategy ROI
3. Update segment beliefs
4. Prioritize by effectiveness

**Phase 5: Autonomous Operation (Week 6+)**
1. Scheduled plan generation
2. Auto-execution for trusted strategies
3. Self-improvement loops
4. Continuous optimization

---

**This architecture doc provides the foundation for all future planning and implementation decisions.**

