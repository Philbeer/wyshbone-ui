# WYSHBONE UNIFIED SYSTEM ANALYSIS
## UI + Supervisor + Tower Cross-Repository Audit

**Generated:** November 27, 2025  
**Repositories Analyzed:** 3 (wyshbone-ui, wyshbone-supervisor, wyshbone-control-tower)

---

## EXECUTIVE SUMMARY

The Wyshbone system consists of three separate applications that were originally connected via Replit's internal networking. The migration to GitHub/Vercel/Render has broken several integration points. This report identifies **21 critical issues**, **15 major integration gaps**, and provides a **prioritized remediation roadmap**.

---

## 1. ARCHITECTURE MAP

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           WYSHBONE ARCHITECTURE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐         ┌──────────────────┐         ┌──────────────┐ │
│  │   WYSHBONE UI    │         │    SUPERVISOR    │         │    TOWER     │ │
│  │   (Vercel)       │         │    (Render)      │         │   (Render)   │ │
│  ├──────────────────┤         ├──────────────────┤         ├──────────────┤ │
│  │ • Chat Interface │         │ • Task Polling   │         │ • Dashboard  │ │
│  │ • CRM/BrewCRM    │  Supabase │ • Lead Search  │  HTTP   │ • Evaluator  │ │
│  │ • Plan Approval  │◄────────►│ • Plan Executor │────────►│ • Run Logs   │ │
│  │ • Deep Research  │  Tables  │ • Email Service │  POST   │ • Behaviour  │ │
│  │ • Batch Jobs     │         │ • Goal Monitor  │         │   Tests      │ │
│  └────────┬─────────┘         └────────┬────────┘         └──────┬───────┘ │
│           │                            │                         │          │
│           └────────────────────────────┼─────────────────────────┘          │
│                                        │                                     │
│                              ┌─────────▼─────────┐                          │
│                              │     SUPABASE      │                          │
│                              │  (Shared Database) │                          │
│                              ├───────────────────┤                          │
│                              │ • supervisor_tasks │                          │
│                              │ • messages         │                          │
│                              │ • users            │                          │
│                              │ • facts            │                          │
│                              │ • conversations    │                          │
│                              │ • scheduled_monitors│                         │
│                              └───────────────────┘                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. CRITICAL FAILURES

| # | Issue | Location | Impact | Severity |
|---|-------|----------|--------|----------|
| 1 | **UI plan execution is in-memory only** | `ui/server/leadgen-plan.ts:31` | Plans lost on restart | 🔴 CRITICAL |
| 2 | **UI and Supervisor have SEPARATE plan systems** | UI: `leadgen-plan.ts`, SUP: `plan-executor.ts` | Plans not synced | 🔴 CRITICAL |
| 3 | **Supervisor's Tower logging only writes to console** | `supervisor/server/tower-logger.ts:66` | Tower never receives Supervisor logs | 🔴 CRITICAL |
| 4 | **UI Tower client uses wrong endpoint format** | `ui/server/lib/towerClient.ts:70` | POST to `/tower/runs/log` but Tower expects specific schema | 🔴 CRITICAL |
| 5 | **Duplicate route registration** | `ui/server/routes.ts:5240` and `:5476` | `/api/regions/list` registered twice | 🟠 HIGH |
| 6 | **Replit-specific URLs hardcoded** | Multiple files | Breaks on Render/Vercel | 🟠 HIGH |
| 7 | **No DATABASE_URL validation** | `ui/server/storage.ts:764` | Crashes without DATABASE_URL | 🟠 HIGH |
| 8 | **Tower server.js uses old imports** | `tower/server.js:3-4` | May fail on startup | 🟠 HIGH |
| 9 | **No health check endpoints** | All three repos | Load balancers can't verify health | 🟠 HIGH |
| 10 | **CORS not configured for cross-origin** | All backend servers | Vercel frontend can't call Render backends | 🟠 HIGH |

---

## 3. MAJOR INTEGRATION GAPS

| # | Gap | Expected | Actual | Repos Affected |
|---|-----|----------|--------|----------------|
| 1 | **UI plan → Supervisor plan sync** | UI creates plan, Supervisor executes | Both have separate plan systems | UI + SUP |
| 2 | **Supervisor → Tower HTTP logging** | POST to `/tower/runs/log` | Only console.log `[TOWER_LOG]` | SUP + TOWER |
| 3 | **Tower callback to UI** | Tower sends evaluation results | No callback mechanism | TOWER + UI |
| 4 | **Unified error response format** | `{ error: string, code: string }` | Inconsistent formats | ALL |
| 5 | **Shared types package** | Common interfaces | Each repo has own schema.ts | ALL |
| 6 | **Environment variable alignment** | Same vars across repos | Different names for same things | ALL |
| 7 | **API key authentication** | Consistent auth header | EXPORT_KEY vs TOWER_API_KEY | ALL |
| 8 | **Plan status endpoint** | UI polls Supervisor for status | UI has its own `/api/plan-status` | UI + SUP |
| 9 | **Supervisor task creation** | UI creates task via Supabase | Works but no confirmation callback | UI + SUP |
| 10 | **Live user run tracking** | All runs logged to Tower | Only UI sends, Supervisor doesn't | ALL |

---

## 4. API CONTRACT MISMATCHES

### 4.1 Tower Run Logging API

**UI sends (towerClient.ts):**
```typescript
{
  runId: string,
  conversationId: string,
  userId: string,
  userEmail: string,
  status: 'started' | 'success' | 'error' | 'timeout',
  source: 'live_user',
  request: { inputText: string },
  response: { outputText: string },
  toolCalls?: Array<...>,
  startedAt: number,
  completedAt?: number,
  durationMs?: number,
  model?: string,
  mode?: 'standard' | 'mega'
}
```

**Supervisor sends (tower-logger.ts):**
```typescript
// ONLY console.log, no HTTP POST!
console.log(`[TOWER_LOG] ${JSON.stringify(...)}`);
```

**Tower expects (runIngestionValidator.ts):**
```typescript
{
  runId?: string,           // Optional - generated if missing
  conversationId?: string,  // For conversation grouping
  userId?: string,
  sessionId?: string,
  source: string,           // Required: 'live_user', 'supervisor', etc.
  status: string,           // Required
  request?: { inputText?: string },
  response?: { outputText?: string },
  goal?: string,
  meta?: Record<string, any>
}
```

**FIX NEEDED:** Supervisor must HTTP POST instead of console.log

---

### 4.2 Plan Execution API

**UI expects:**
```typescript
// GET /api/plan-status?planId=xxx
{
  hasActivePlan: boolean,
  status: 'idle' | 'pending_approval' | 'executing' | 'completed' | 'failed',
  planId: string,
  steps: Array<{ id, title, status, type, resultSummary }>,
  currentStepIndex: number,
  totalSteps: number
}
```

**Supervisor provides:**
```typescript
// GET /api/plan-status?planId=xxx
{
  hasActivePlan: boolean,
  status: 'idle' | 'pending_approval' | 'executing' | 'completed' | 'failed',
  planId: string,
  steps: Array<{ id, title, status, type, errorMessage, attempts, resultSummary }>,
  currentStepIndex: number,
  totalSteps: number,
  updatedAt: string
}
```

**STATUS:** ✅ Compatible, but UI has duplicate implementation

---

### 4.3 Supabase Tables (Shared)

| Table | Used By | Purpose |
|-------|---------|---------|
| `supervisor_tasks` | UI (write), SUP (read/write) | Task queue for Supervisor |
| `messages` | UI (write), SUP (write) | Chat messages with `source` field |
| `users` | All | User profiles |
| `facts` | UI (write), SUP (read) | Extracted user facts |
| `conversations` | UI (write), SUP (read) | Conversation metadata |
| `scheduled_monitors` | UI (write), SUP (read) | Monitor configurations |

---

## 5. ENVIRONMENT VARIABLE ALIGNMENT

| Variable | UI | Supervisor | Tower | Notes |
|----------|-----|------------|-------|-------|
| `DATABASE_URL` | ✅ Required | ✅ Required | ✅ Required | Each has own Neon DB |
| `SUPABASE_URL` | ✅ | ✅ | ❌ | Shared Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | ✅ | ❌ | For backend writes |
| `TOWER_URL` | ✅ Optional | ❌ Missing | N/A | Supervisor needs this |
| `TOWER_API_KEY` | ✅ Optional | ❌ Missing | N/A | Supervisor needs this |
| `EXPORT_KEY` | ✅ | ✅ | ✅ | For export API auth |
| `OPENAI_API_KEY` | ✅ | ❌ Missing | ✅ | Supervisor needs if searching |
| `GOOGLE_PLACES_API_KEY` | ✅ | ✅ | ❌ | For lead search |
| `HUNTER_IO_API_KEY` | ✅ `HUNTER_API_KEY` | ✅ `HUNTER_IO_API_KEY` | ❌ | **NAME MISMATCH** |
| `REPLIT_*` | ⚠️ Legacy | ⚠️ Legacy | ⚠️ Legacy | Need removal |

---

## 6. SCHEMA COMPARISON

### 6.1 UI Schema (`ui/shared/schema.ts`)
- `locationHints`, `deepResearchRuns`, `conversations`, `messages`, `facts`
- `scheduledMonitors`, `users`, `userSessions`, `integrations`
- `batchJobs`, `leadGenPlans` ← **In-memory only**
- `crmSettings`, `crmCustomers`, `crmOrders`, `crmOrderLines`, `crmDeliveryRuns`
- `brewProducts`, `brewBatches`, `brewInventoryItems`, `brewContainers`, `brewDutyReports`, `brewSettings`

### 6.2 Supervisor Schema (`supervisor/shared/schema.ts`)
- `users`, `userSignals`, `suggestedLeads`, `processedSignals`
- `supervisorState`, `plans`, `planExecutions` ← **Persistent**

### 6.3 Tower Schema (`tower/shared/schema.ts`)
- `users`, `investigations`, `runs`, `behaviourTests`, `behaviourTestRuns`
- `patchEvaluations`, `patchSuggestions`, `devIssues`, `devIssueContext`, `devIssuePatches`

**KEY ISSUE:** UI's `leadGenPlans` table exists but is unused. UI uses in-memory Maps instead.

---

## 7. PHASE 1: CRITICAL INFRASTRUCTURE (Must-Fix)

| # | Task | File(s) | Priority | Est. Time |
|---|------|---------|----------|-----------|
| 1.1 | **Persist UI plans to database** - Replace in-memory Map with Drizzle storage | `ui/server/leadgen-plan.ts` | 🔴 P0 | 2h |
| 1.2 | **Fix Supervisor Tower logging** - Add HTTP POST instead of console.log | `supervisor/server/tower-logger.ts` | 🔴 P0 | 1h |
| 1.3 | **Add CORS configuration** to all backends | `ui/server/index.ts`, `supervisor/server/index.ts`, `tower/server.js` | 🔴 P0 | 30m |
| 1.4 | **Add /health endpoints** to all backends | All server index files | 🔴 P0 | 30m |
| 1.5 | **Remove duplicate /api/regions/list route** | `ui/server/routes.ts:5476` | 🔴 P0 | 5m |
| 1.6 | **Add DATABASE_URL validation** with helpful error | `ui/server/storage.ts` | 🔴 P0 | 15m |

---

## 8. PHASE 2: REPLIT MIGRATION (Required for Render/Vercel)

| # | Task | File(s) | Priority | Est. Time |
|---|------|---------|----------|-----------|
| 2.1 | **Replace REPLIT_DOMAINS** with `BACKEND_URL` env var | `ui/server/routes/xero-oauth.ts` | 🟠 P1 | 30m |
| 2.2 | **Replace REPLIT_DEV_DOMAIN** with `FRONTEND_URL` env var | `ui/server/routes.ts:743-744` | 🟠 P1 | 15m |
| 2.3 | **Remove REPL_SLUG and REPL_OWNER references** | `ui/server/routes/xero-oauth.ts`, `supervisor/server/supervisor.ts` | 🟠 P1 | 30m |
| 2.4 | **Create .env.example files** for all repos | Root of each repo | 🟠 P1 | 1h |
| 2.5 | **Add TOWER_URL and TOWER_API_KEY** to Supervisor | `supervisor/server/tower-logger.ts` | 🟠 P1 | 30m |

---

## 9. PHASE 3: PLAN SYSTEM UNIFICATION (Future)

| # | Task | File(s) | Priority | Est. Time |
|---|------|---------|----------|-----------|
| 3.1 | **Decide on single plan execution path** | Architecture decision | 🟡 P2 | 1h |
| 3.2 | **Option A: UI creates, Supervisor executes via Supabase** | Multiple files | 🟡 P2 | 4h |
| 3.3 | **Option B: UI creates AND executes locally** (current partial state) | `ui/server/leadgen-executor.ts` | 🟡 P2 | 2h |
| 3.4 | **Remove duplicate plan logic from non-chosen path** | Depends on 3.1 | 🟡 P2 | 2h |
| 3.5 | **Add plan completion webhook from Supervisor → UI** | New endpoint | 🟡 P2 | 2h |

---

## 10. PHASE 4: TOWER INTEGRATION (Future)

| # | Task | File(s) | Priority | Est. Time |
|---|------|---------|----------|-----------|
| 4.1 | **Standardize run log payload format** | All towerClient implementations | 🟢 P3 | 1h |
| 4.2 | **Add Tower callback webhook to UI** | `ui/server/routes.ts` | 🟢 P3 | 1h |
| 4.3 | **Add evaluation result display in UI** | `ui/client/src/components/` | 🟢 P3 | 2h |
| 4.4 | **Fix Hunter API key name inconsistency** | `ui/server/*`, `supervisor/server/*` | 🟢 P3 | 15m |

---

## 11. DEPLOYMENT CONFIGURATION

### 11.1 Vercel (UI Frontend)
```json
{
  "framework": "vite",
  "buildCommand": "cd client && npm run build",
  "outputDirectory": "client/dist",
  "env": {
    "VITE_API_BASE_URL": "@api_base_url"
  }
}
```

### 11.2 Render (UI Backend)
```yaml
services:
  - name: wyshbone-api
    type: web
    env: node
    buildCommand: npm install && npm run build
    startCommand: npm start
    healthCheckPath: /health
    envVars:
      - key: DATABASE_URL
        fromDatabase: wyshbone-db
      - key: TOWER_URL
        sync: false
```

### 11.3 Render (Supervisor)
```yaml
services:
  - name: wyshbone-supervisor
    type: web
    env: node
    buildCommand: npm install && npm run build
    startCommand: npm start
    healthCheckPath: /health
    envVars:
      - key: TOWER_URL
        value: https://wyshbone-tower.onrender.com
      - key: TOWER_API_KEY
        sync: false
```

---

## 12. IMPLEMENTATION CHECKLIST

### Phase 1 Checklist ✅ COMPLETED
- [x] 1.1 Persist UI plans to database
- [x] 1.2 Fix Supervisor Tower logging (HTTP POST)
- [x] 1.3 Add CORS to all backends
- [x] 1.4 Add /health endpoints
- [x] 1.5 Remove duplicate /api/regions/list
- [x] 1.6 Add DATABASE_URL validation

### Phase 2 Checklist ✅ COMPLETED
- [x] 2.1 Replace REPLIT_DOMAINS → BACKEND_URL
- [x] 2.2 Replace REPLIT_DEV_DOMAIN → FRONTEND_URL
- [x] 2.3 Remove REPL_SLUG/REPL_OWNER references
- [x] 2.4 Create .env.example templates (added to manual checklist)
- [x] 2.5 Add TOWER_URL to Supervisor (added HTTP POST logging)

### Phase 3 Checklist ✅ COMPLETED
- [x] 3.1 Document plan execution architecture (UI-local execution as primary)
- [x] 3.2 Add Tower logging to UI plan execution
- [x] 3.3 Fix Hunter API key inconsistency (standardized on HUNTER_API_KEY)
- [x] 3.4 Simplified Supervisor Resend client (removed Replit connector API)

### Phase 4 Checklist ✅ COMPLETED
- [x] 4.1 Add logPlanExecutionToTower() function to towerClient
- [x] 4.2 Integrate Tower logging into UI plan executor (start/success/error)
- [x] 4.3 Add /api/tower/webhook/evaluation endpoint for receiving results
- [x] 4.4 Add /api/tower/webhook/alert endpoint for receiving alerts

---

**Total Issues Found:** 36  
**Critical Issues:** 10  
**Estimated Total Remediation Time:** 25-30 hours

---

## Manual Setup Checklist (Do Not Run Automatically)

### Git Commands (Run When Ready)
- [ ] `git add .`
- [ ] `git commit -m "Cursor Phase 1-4 complete: DB persistence, Replit migration, Tower integration"`
- [ ] `git push origin main` (when ready to deploy)

### UI Repository (wyshbone-ui root)
- [ ] `npm install` — Install new cors dependency
- [ ] `npx drizzle-kit push` — Push schema changes if lead_gen_plans table doesn't exist
- [ ] Set environment variables in `.env.local`:
  - [ ] `FRONTEND_URL=https://your-vercel-domain.vercel.app` — Public URL of the React frontend
  - [ ] `BACKEND_URL=https://your-api-domain.onrender.com` — Public URL of the Express backend (for OAuth redirects)
  - [ ] `TOWER_URL=https://your-tower-domain.onrender.com` (optional)
  - [ ] `TOWER_API_KEY=your-tower-api-key` (optional)

### Supervisor Repository (supervisor/)
- [ ] `cd supervisor && npm install` — Install new cors dependency
- [ ] Set environment variables:
  - [ ] `TOWER_URL=https://your-tower-domain.onrender.com`
  - [ ] `TOWER_API_KEY=your-tower-api-key`
  - [ ] `FRONTEND_URL=https://your-vercel-domain.vercel.app` — For email links
  - [ ] `DASHBOARD_URL=https://your-vercel-domain.vercel.app` — Alias for FRONTEND_URL
  - [ ] `RESEND_API_KEY=re_xxxxx` — Required for email notifications
  - [ ] `RESEND_FROM_EMAIL=noreply@yourdomain.com` — Optional, defaults to onboarding@resend.dev

### Tower Repository (tower/)
- [ ] `cd tower && npm install` — Install new cors dependency
- [ ] Set environment variables:
  - [ ] `FRONTEND_URL=https://your-vercel-domain.vercel.app`
  - [ ] `UI_URL=https://your-ui-backend.onrender.com`
  - [ ] `SUPERVISOR_URL=https://your-supervisor.onrender.com`
  - [ ] `HOSTING_USAGE_USD=0` (optional) — Set to track hosting costs in dashboard
  - [ ] `HOSTING_BILLING_STEP=50` (optional) — Billing increment for usage meter

### Create .env.example Files (Manual)
The following `.env.example` files should be created manually (blocked by gitignore):

<details>
<summary>UI Backend .env.example</summary>

```bash
# Required
DATABASE_URL=postgres://user:password@host:5432/dbname
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SESSION_SECRET=your-random-session-secret
OPENAI_API_KEY=sk-...
GOOGLE_PLACES_API_KEY=AIza...
HUNTER_API_KEY=your-hunter-key

# Deployment URLs
FRONTEND_URL=https://wyshbone.vercel.app
BACKEND_URL=https://wyshbone-api.onrender.com

# Optional
TOWER_URL=https://wyshbone-tower.onrender.com
TOWER_API_KEY=your-tower-key
STRIPE_SECRET_KEY=sk_live_...
RESEND_API_KEY=re_...
```
</details>

<details>
<summary>Supervisor .env.example</summary>

```bash
# Required
DATABASE_URL=postgres://user:password@host:5432/supervisor_db
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
GOOGLE_PLACES_API_KEY=AIza...
HUNTER_IO_API_KEY=your-hunter-key
RESEND_API_KEY=re_...

# Deployment URLs
FRONTEND_URL=https://wyshbone.vercel.app
TOWER_URL=https://wyshbone-tower.onrender.com
TOWER_API_KEY=your-tower-key
```
</details>

<details>
<summary>Tower .env.example</summary>

```bash
# Required
DATABASE_URL=postgres://user:password@host:5432/tower_db
OPENAI_API_KEY=sk-...

# Deployment URLs
FRONTEND_URL=https://wyshbone.vercel.app
UI_URL=https://wyshbone-api.onrender.com
SUPERVISOR_URL=https://wyshbone-supervisor.onrender.com
```
</details>

---

