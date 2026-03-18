# UI Search Flow & Results Display — Architecture Report

**Purpose:** Ground-truth audit of how the UI currently handles search flow display and results.  
**Date:** 2026-03-18  
**Scope:** Code only. No assumptions from comments or docs.

---

## 1. QUERY SUBMISSION FLOW

### Primary Chat Interface

The primary chat is **`client/src/pages/chat.tsx`** (`ChatPage` component — 3,925 lines).  
The legacy `AgentChatPanel` (`client/src/components/agent/AgentChatPanel.tsx`) is **deprecated** and hidden behind a `WYSHBONE_DEV_LANE` flag.

#### Flow Summary

1. User types into the `<Textarea>` input and presses Enter or clicks Send.
2. `handleSend()` is called. It appends the user message to the `messages` state array and calls `streamChatResponse()`.
3. `streamChatResponse()` makes an HTTP POST to **`/api/chat`** using `fetch()` with `credentials: "include"`.
4. The response is consumed as an **SSE (Server-Sent Events) stream** parsed line-by-line.

#### API Endpoint Called

```
POST /api/chat
```

#### Payload Sent (exact fields from `chat.tsx` lines 2182–2194)

```json
{
  "messages": [...],            // Full conversation history as ChatMessage[]
  "user": { "id": "...", "email": "..." },
  "defaultCountry": "GB",
  "conversationId": "...",
  "clientRequestId": "<uuid>",
  "metadata": { ... },          // Optional — carry-forward follow-up metadata
  "follow_up": { ... },         // Optional — if follow_up in pending metadata
  "google_query_mode": "TEXT_ONLY" | "BIASED_STABLE",
  "run_config_overrides": {     // Omitted if all defaults
    "speed_mode": "faster" | "balanced" | "stricter",
    "replan_ceiling": 0-3,
    "ignore_learned_policy": true | false
  }
}
```

**Notable fields:**
- `clientRequestId` — a UUID generated fresh per send, used to track the run through polling.
- `google_query_mode` — read from `localStorage` via `getGoogleQueryMode()`.
- `run_config_overrides` — only sent if the user has changed from defaults via `RunConfigOverridesPanel`.
- There is **no `query_class` or `execution_path` field** in the payload sent by the UI. These are resolved server-side.
- There is **no `supervisor` dispatch** in the payload; the `/api/chat` backend determines whether to hand off to the Supervisor internally.

#### After Submission — SSE Events Processed

The SSE stream carries typed JSON events:

| Event type | What the UI does |
|---|---|
| `ack` | Sets progress stack to `[{stage:'ack', message:'OK, working'}]` |
| `run_id` | Stores `runId` in `supervisorRunIdRef` and dispatches `wyshbone:run_id` custom event |
| `status` | Appends/updates `progressStack` state (classifying → planning → executing → finalising → completed/failed) |
| `conversationId` | Stores received `conversationId` in state and `localStorage` |
| Plain text delta | Accumulated into `accumulatedContent` and displayed as a streaming assistant message |

Once the stream ends, AFR polling takes over (see below).

#### AFR Polling (results finalization)

After `isWaitingForSupervisor` becomes `true`, a `setInterval` at 1,500 ms polls:
```
GET /api/afr/run-status?client_request_id=...&runId=...
```
When the run reaches a terminal state, it fetches:
```
GET /api/afr/artefacts?runId=...&client_request_id=...
```
and calls `finalizeRunUI()` to build the result bubble.

Supervisor messages are also received via **Supabase Realtime** subscription (`subscribeSupervisorMessages(conversationId, ...)`) as a secondary path — but finalization is driven by the AFR poller, not realtime.

---

## 2. PIPELINE STATUS DISPLAY

### Component: `ChatPage` (`client/src/pages/chat.tsx`)

The UI tracks a **progress stack** (`progressStack` state, type `ProgressEvent[]`). Each event has a `stage`, `message`, `ts`, and optional `toolName`.

#### Stage → Display Mapping (`getStageDisplay` function, lines 377–403)

| Stage | Icon | Label |
|---|---|---|
| `ack` | ✔ | OK, working |
| `classifying` | 🔍 | Classifying intent |
| `planning` | 🔍 | Planning |
| `executing` + Google/Places tool | 🔎 | Running search |
| `executing` + other tool | 🔧 | Running tool |
| `executing` (generic) | 🔧 | Executing tools |
| `finalising` | ✍ | Finalising response |
| `completed` | ✅ | Done |
| `failed` | ❌ | Failed |

#### Progress Indicator Rendering

In the chat render section (lines ~3430–3550 in chat.tsx), there is a **progress indicator block** rendered in-line while `isStreaming` is true or `activeClientRequestId` is set. It shows:
- The most recent `progressStack` item icon and label.
- A small "lane" indicator (`run` vs `chat`) visible only in dev mode.
- An `executedToolsSummary` showing which tools ran after the stream ends.

There are **no step-by-step pipeline stage labels** visible to the user like "searching Google Places" or "visiting websites" — only the generic stage names above. The messages come from the `status` SSE events. The specific tool name can surface as "Running search" if it matches `search_places`/`places`/`google` patterns.

### Pipeline Status — Key Finding

**There are no user-facing messages that say "searching Google Places", "visiting websites", or "verifying with Tower"** in literal form. The pipeline progress is abstracted to the generic stage labels above. The `toolName` from the SSE `status` event can be displayed as "Running search" (for Google Places calls) or "Running tool" (for others), but the specific tool is not named to the user in production.

---

## 3. RESULTS DISPLAY

### Architecture

Results are rendered in `chat.tsx` inside the message loop. When a `Message` object has a `deliverySummary` field (not null), the message is rendered as a **result bubble** rather than a text bubble.

**The two result renderers used (lines 3183–3209):**

```tsx
if (chatMessage.runId) {
  // BehaviourInspectContent — see Section 5
} else {
  // RunResultBubble — the standard results component
}
```

The standard results component is **`RunResultBubble`** (`client/src/components/results/RunResultBubble.tsx`, 2,100 lines).

### Fields Shown Per Result

Each lead is rendered as a `LeadRow` (internal sub-component in RunResultBubble). Fields displayed:

| Field | Shown? | Notes |
|---|---|---|
| `name` | Yes | Bold, first line |
| `location` | Yes | With MapPin icon |
| `phone` | Yes | With Phone icon |
| `website` | Yes | With Globe icon, external link |
| `soft_violations` | Yes | Small muted text, shown when `showViolations` is true |
| `place_id` | Implicit | Used for verification matching but not displayed |
| `location_status` | Yes | Shown as a badge: Verified (geo) / Search-bounded / Out of area |

**Verification badge per lead:**
- `verified` (green, CheckCircle) — lead matched constraint checks
- `weak_match` (blue, CircleDot) — partial Tower semantic match
- `candidate` or `unverified` (amber/grey) — not confirmed
- No badge (`none`) — when verification data is unavailable

### Result Sections in RunResultBubble

The component renders different branch layouts depending on available data:

1. **Location buckets branch** (if `location_status` fields are present): Separates leads into "Verified (geo)", "Search-bounded", "Out of area", "Unknown" sections with icons.
2. **Receipt attributes branch** (if `run_receipt.outcomes.attributes` is present): Groups leads under "Verified — mentions '{attribute}'".
3. **Default branch**: Splits into "Verified matches (N)" and collapsible "Other candidates".

### Delivery Summary Fields Used

From `DeliverySummary`:
- `status` (PASS/PARTIAL/STOP/FAIL/ACCEPT_WITH_UNVERIFIED/CHANGE_PLAN/ERROR/UNAVAILABLE)
- `stop_reason` — shown as a red `FailingConstraintBanner` block
- `delivered_exact` — array of verified leads
- `delivered_closest` — array of unverified/candidate leads
- `shortfall` — shown in a "What's missing" card
- `requested_count` / `delivered_count` — shown as two stat boxes
- `suggested_next_question` — drives "Next actions" buttons
- `verified_exact_count`

### Evidence / Attribute Verification

`attribute_verification` is not a directly displayed field. The equivalent is:
- `run_receipt.outcomes.attributes` — array of `ReceiptAttributeOutcome` objects with `attribute_raw`, `matched_count`, `matched_place_ids`, `evidence_refs` (url, snippet, matched_variant).
- `lead_verification` artefacts parsed into `leadVerifications: LeadVerificationEntry[]`, each containing `constraint_checks[]` with per-constraint verdicts (`VERIFIED`, `PLAUSIBLE`, `UNSUPPORTED`, `CONTRADICTED`, `UNKNOWN`), `source_tier`, and `reason`.

These are shown in `ConstraintBreakdown` (per-lead inline) and in `TechnicalDetails` (expandable "Show details" section).

---

## 4. TRUST CARD

### What It Is

There is no component literally named "TrustCard". The equivalent is the **Tower verdict display** within `RunResultBubble`.

### Where It Appears

Inside `RunResultBubble`, the Tower verdict is surfaced in two places:

1. **Inline banner blocks** at the top of the result bubble (conditional):
   - `TrustErrorBlock` — shown when `isTrustFailure` is true (amber warning: "Some results couldn't be fully checked").
   - Mixed verdict warning — amber banner when `isMixedVerdict` is true.
   - Unknown attribute constraint notice — blue banner with ShieldQuestion icon.

2. **`TechnicalDetails` section** (expandable, toggled by "Show details" button):
   - Shows `Verdict:` label with the Tower verdict string in colour-coded text.
   - Shows `Tower: {verdict}` inline in font-mono debug stats.
   - Shows `towerProxyUsed` (time proxy info) and `towerUnavailable` status.

### Information Shown

- Tower verdict string (PASS, FAIL, STOP, ACCEPT_WITH_UNVERIFIED, MIXED...)
- `towerLabel` — human-readable elaboration of the verdict
- `towerProxyUsed` — which time predicate was used
- Contact proof: inline line "N emails • N phones" via `ReceiptInlineLine`
- A `RunReceipt` comparison block (only if `VITE_SHOW_RECEIPT_COMPARISON=true`)

### Component

**`RunResultBubble`** (`client/src/components/results/RunResultBubble.tsx`) — specifically the `TrustErrorBlock`, `TechnicalDetails`, and inline banner conditionals within the main exported component.

There is also **`WhatJustHappenedPanel`** (`client/src/components/tower/WhatJustHappenedPanel.tsx`) — a slide-out panel triggered by a "What just happened?" button in the chat header. This shows Tower log history but is separate from the inline trust display.

---

## 5. BEHAVIOUR JUDGE (BJ) DISPLAY

### When BJ Is Shown

The BJ display is shown in the chat **instead of** `RunResultBubble` when a `deliverySummary` message has a `runId` set (line 3183–3189 in chat.tsx):

```tsx
if (chatMessage.runId) {
  <BehaviourInspectContent
    runId={chatMessage.runId}
    query={chatMessage.content || undefined}
    timestamp={chatMessage.timestamp}
  />
}
```

This means **in the current production flow, result messages that have a `runId` are always rendered through BehaviourInspectContent**, not RunResultBubble. This is a significant architectural note — `runId` is always present on finalized runs, so BehaviourInspectContent is the **primary** result display in practice.

### Three-Field Structure Displayed

The `BehaviourInspectContent` component (`client/src/pages/dev/qa-progress.tsx`, lines 248–590) fetches from:
```
GET /api/afr/behaviour-judge?run_id=...
```
And displays three sub-sections:

| Section | Data Field | Label Shown |
|---|---|---|
| 1 | `mission_intent_assessment` | "Mission Intent" |
| 2 | `ground_truth_assessment` | "Ground Truth" |
| 3 | `outcome` + `confidence` + `reason` | "Combined" |

Each sub-section (rendered by `BjSubSection`) shows:
- A colour-coded verdict chip (PASS = green, FAIL = red, other = grey)
- Confidence percentage badge
- `reasoning` text paragraph

The "Combined" section additionally shows:
- Tower verdict badge (if `judgeB.tower_verdict` is set)
- `delivered_count / requested_count` in monospace

### Loading State

While fetching, shows "Awaiting Judge B…" text. Retries up to 8 times at 2.5 second intervals. If no result found after all retries, shows "No Judge B result in behaviour_judge_results for this run."

### Component Files

- **`client/src/pages/dev/qa-progress.tsx`** — `BehaviourInspectContent` (exported), `BjSubSection` (internal).
- Also used in `client/src/pages/dev/qa-progress.tsx` inline at line 588 (the QA progress table row detail view).
- Also referenced in `client/src/pages/dev/afr.tsx` (AFR run inspector page).

### Critical Note

`BehaviourInspectContent` is **imported from a `dev/` page** (`qa-progress.tsx`) and used as the primary result renderer in the production chat. This is an unusual architecture — the dev QA component is serving double duty as the production results UI for runs with a `runId`.

---

## 6. CONFIGURATION / TOGGLES

### Existing User-Facing Options

#### 1. Google Query Mode Toggle
**File:** `client/src/components/GoogleQueryModeToggle.tsx`  
**Type:** Binary toggle, persisted in `localStorage` under key `wyshbone.google_query_mode`  
**Values:** `TEXT_ONLY` (Fast, Zap icon) | `BIASED_STABLE` (Stable, Shield icon)  
**Sent as:** `google_query_mode` in the `/api/chat` payload  
**Location in UI:** In the chat input toolbar (visible in the dev diagnostic panel header text: `google_query_mode={getGoogleQueryMode()}`)

#### 2. Run Config Overrides Panel
**File:** `client/src/components/results/RunConfigOverridesPanel.tsx`  
**Type:** Collapsible panel with three controls  
**Rendered:** In `chat.tsx` above the input area (conditional render)  
**Controls:**
- **Speed / Thoroughness** — 3-button toggle: Faster | Balanced | Stricter  
  Maps to `speed_mode` field in `run_config_overrides`
- **Replan ceiling** — Slider 0–3  
  Maps to `replan_ceiling` field in `run_config_overrides`
- **Ignore learned policy** — Checkbox  
  Maps to `ignore_learned_policy` boolean in `run_config_overrides`

The panel shows an "active" amber badge when any override differs from defaults.

#### 3. Tower Loop Chat Mode Badge (Dev Only)
**File:** `client/src/components/agent/AgentChatPanel.tsx` — `TowerBadgeInline`  
**Condition:** Only visible in `import.meta.env.DEV`  
**Stored:** `localStorage` key `TOWER_LOOP_CHAT_MODE`

### No Existing Toggle for Search Method or Execution Path

There is **no current user-facing toggle for:**
- GPT-4o vs other model selection
- Execution path selection (e.g. standard vs deep)
- Query class override

The `query_class` and `execution_path` are not exposed to the UI at all — they are resolved entirely server-side.

### Where a "GPT-4o Primary" Toggle Would Logically Fit

Based on the existing pattern of `GoogleQueryModeToggle` and `RunConfigOverridesPanel`:

**Option A — Add to `RunConfigOverridesPanel`:**  
A new "Model" row could be added to the existing `RunConfigOverridesPanel` as a binary toggle. It would be sent alongside `run_config_overrides` in the `/api/chat` payload. This is the lowest-friction path — the pattern already exists for passing overrides to the backend.

**Option B — Toolbar toggle (like `GoogleQueryModeToggle`):**  
A dedicated icon-button toggle in the chat input bar (next to the Google Query Mode toggle). Would persist to `localStorage` and be sent as a top-level field on the `/api/chat` payload.

**Option C — Pre-run banner (like `PreRunBanner`):**  
`PreRunBanner` (`client/src/components/results/PreRunBanner.tsx`) already exists as a UI slot above the chat input that shows the policy snapshot before a run. A model-selection chip could sit alongside it.

**Recommended slot:** The `run_config_overrides` payload field. Add a `primary_model: "gpt4o" | "default"` field to `RunConfigOverrides` in `RunConfigOverridesPanel.tsx` and pass it through `/api/chat`.

---

## FILE REFERENCE SUMMARY

| Concern | File(s) |
|---|---|
| Primary chat & query submission | `client/src/pages/chat.tsx` |
| Legacy Claude chat (deprecated) | `client/src/components/agent/AgentChatPanel.tsx` |
| Progress stage display | `chat.tsx` — `getStageDisplay()`, `progressStack` state |
| Main result bubble | `client/src/components/results/RunResultBubble.tsx` |
| BJ / behaviour judge display | `client/src/pages/dev/qa-progress.tsx` — `BehaviourInspectContent` |
| Lead card rendering (sidebar panel) | `client/src/components/results/UserResultsView.tsx` |
| Full results side panel | `client/src/components/results/ResultsPanel.tsx` |
| Constraint/verification artefact views | `client/src/components/results/CvlArtefactViews.tsx` |
| Tower verdict resolution | `client/src/utils/towerVerdictResolver.ts` |
| Google Query Mode toggle | `client/src/components/GoogleQueryModeToggle.tsx` |
| Run config overrides | `client/src/components/results/RunConfigOverridesPanel.tsx` |
| Pre-run policy banner | `client/src/components/results/PreRunBanner.tsx` |
| Supervisor route (Tower judgement) | `server/routes/supervisor.ts` |
| Behaviour evaluator backend | `server/routes/behaviour-evaluator.ts` |
| AFR artefact routes (polling target) | inferred from `GET /api/afr/artefacts`, `GET /api/afr/run-status` |
| QA metrics / BJ data source | `server/routes/qa-metrics.ts` (inferred from `/api/afr/behaviour-judge`) |

---

## IMPLEMENTATION LOG — GPT-4o Primary Search Toggle

**Date:** 2026-03-18  
**Task:** Add a search-mode toggle to the chat UI and pass `execution_path` to the Supervisor.

---

### Files Changed

| File | Change |
|---|---|
| `client/src/components/SearchModeToggle.tsx` | **Created** — new toggle component |
| `client/src/pages/chat.tsx` | **Modified** — import added, toggle rendered in action bar, `execution_path` added to payload |

---

### New Component: `SearchModeToggle`

**File:** `client/src/components/SearchModeToggle.tsx`

**Exports:**
- `SearchMode` — TypeScript type: `"gp_cascade" | "gpt4o_primary"`
- `getSearchMode()` — imperative getter that returns the current mode (module-level variable, not localStorage). Called at query submission time by `chat.tsx`.
- `SearchModeToggle` — React component. Self-contained; holds its own `useState` and syncs to the module-level `_currentSearchMode` variable on every change.

**Pattern:** Mirrors `GoogleQueryModeToggle` exactly (same two-segment pill style, same module-level getter pattern). Uses `MapPin` icon for GP, `Sparkles` icon for GPT-4o. Tooltip explains the full values on hover.

**Default value:** `"gp_cascade"` (Google Places pipeline) — set as module-level default and initial state.

**Persistence:** Session only (React state). No `localStorage`, no database. Resets to `"gp_cascade"` on page reload, as specified.

---

### Toggle Placement in UI

**Location in `chat.tsx`:** Inside the input-area action bar (the `flex` row above the textarea and `RunConfigOverridesPanel`), in the left-hand `<div className="flex items-center gap-2">`. The toggle is the **first child** of that left div, before the dev-only lane indicator badge.

```tsx
<div className="flex items-center gap-2">
  <SearchModeToggle />               {/* ← added here */}
  {lastLane && window.WYSHBONE_DEV_LANE && ( ... )}
</div>
```

This positions it at the bottom-left of the chat interface, consistent with where other mode controls live (`GoogleQueryModeToggle` uses the same region in related contexts). It persists visually across all messages.

---

### Payload Field: `execution_path`

**Where it is added:** `streamChatResponse()` in `client/src/pages/chat.tsx`, inside the `fetch()` body JSON.

**Exact diff (payload object, lines ~2194–2196):**
```diff
  google_query_mode: getGoogleQueryMode(),
+ execution_path: getSearchMode(),
  run_config_overrides: ...
```

**Endpoint receiving it:** `POST /api/chat` — the existing Supervisor proxy endpoint. No new endpoint was created.

**Values sent:**
| Toggle state | `execution_path` value |
|---|---|
| Google Places (default) | `"gp_cascade"` |
| GPT-4o Search | `"gpt4o_primary"` |

The value is read via `getSearchMode()` at the moment `streamChatResponse()` is called — i.e. at query submission time, not at component render time. This is safe because the module-level variable is always in sync with the component state via the `handleSet` callback.

---

### Supervisor Contract Summary

For teams working on the Supervisor side:

```
POST /api/chat
{
  messages: [...],
  user: { id, email },
  conversationId: string,
  clientRequestId: string,          // UUID, generated per submit
  google_query_mode: "TEXT_ONLY" | "BIASED_STABLE",
  execution_path: "gp_cascade" | "gpt4o_primary",  // ← NEW FIELD
  run_config_overrides?: {
    speed_mode?: "faster" | "balanced" | "stricter",
    replan_ceiling?: number,
    ignore_learned_policy?: boolean,
  },
  // optional carry-forward fields:
  metadata?: object,
  follow_up?: object,
  defaultCountry?: string,
}
```

- `execution_path` is **always present** on every `/api/chat` request from this UI version onward (defaults to `"gp_cascade"`).
- No changes were made to SSE event handling, status display, results rendering, trust card, or BJ display. Those components are fully driven by whatever the Supervisor returns, unchanged.
- No conditional UI logic was added based on `execution_path` — the Supervisor is responsible for all path-specific behaviour.

---

## Session 3 — Blank White Page Investigation (2026-03-18)

### Issue

Pop-out tab (direct dev URL) showed a blank white page. The Replit preview iframe showed the app correctly. Previous sessions suspected CSS/paint issues or a blocking null-render in a context provider.

### Diagnostic Steps

1. **Build verification** — `vite build --mode development` completed successfully. 4,372 modules transformed, zero TypeScript or compilation errors. The `SearchModeToggle.tsx` addition and `chat.tsx` changes are valid.

2. **debug-bridge-client.js** — The synchronous render-blocking script in `index.html` is served in 2.7ms. Not the cause.

3. **Context provider audit** — `UserContext`, `AgentFirstContext`, `DemoModeProvider`, and the full provider tree in `App.tsx` were audited. No provider returns `null`. `AgentFirstContext` starts `false` (classic layout). No blocking loading state prevents rendering.

4. **Backend API calls confirmed in pop-out tab** — Backend logs at 9:58:44 showed a fresh demo session being created from the pop-out tab, proving React and JavaScript were executing. The blank page was not a JS failure.

5. **Root cause identified — Startup race condition:** Vite dev server starts in **~188ms**. The browser connects and immediately fires `initializeAuth()`, which calls `POST /api/auth/demo`. But the backend (port 5001) takes **2–3 seconds longer** to start (it runs schema migrations and Supabase pool initialization first). The first `POST /api/auth/demo` call fails with `ECONNREFUSED`. The original error handler had **no retry logic** — the app stayed stuck as `temp-demo-user` indefinitely, producing a degraded/blank state because the temp user has no valid session in the database.

6. **Secondary factor — Vite cold-start latency:** 4,372 modules on-demand compilation can add 30–120 seconds on first load after a restart, especially without pre-bundled dependencies.

### Fixes Applied

#### 1. Retry-with-backoff for demo user creation (`client/src/contexts/UserContext.tsx`)

The `POST /api/auth/demo` call now retries up to 5 times with delays `[0, 800ms, 1600ms, 3s, 5s]` on network errors or non-OK responses. The first attempt is immediate (delay 0) so there's no regression when the backend is already up. Subsequent attempts cover the typical backend startup window.

#### 2. Vite warmup + expanded pre-bundling (`client/vite.config.ts`)

Added `server.warmup.clientFiles` pointing at `main.tsx`, `App.tsx`, `pages/chat.tsx`, and `UserContext.tsx`. Vite now pre-transforms these files when the server starts rather than on first browser request. Also added `react`, `react-dom`, `react-dom/client`, `wouter`, `@tanstack/react-query`, `lucide-react`, `clsx`, `tailwind-merge`, and `class-variance-authority` to `optimizeDeps.include` so they are pre-bundled at dev-server startup.

### Invariants Preserved

- No changes to auth logic for real (non-demo) users.
- The retry loop exits immediately on success; there is no delay added to the happy path.
- `execution_path`, `SearchModeToggle`, and all prior deliverables are unaffected.

---

## 2026-03-18 — Bridge log test — confirming AGENT_LOG.md write workflow.

---

### Session Summary

**What changed:**
- No files created. `AGENT_LOG.md` (existing) was appended with a dated test entry and this structured summary.

**Decisions made:**
- Did not recreate `AGENT_LOG.md` since it already exists at the project root with prior session content intact.
- Appended rather than overwrote to preserve all previous audit and implementation history.

**What's next:**
- None.

---

## Session 4 — GP Run Results Not Surfacing in Chat Bubble (2026-03-18)

### Issue

GP pipeline runs completed correctly (results visible in AFR). But the final chat bubble shown to the user was either empty or not appearing. Results were present in the `delivery_summary` artefact but not rendered in the UI.

### Diagnostic Investigation

**Server-side trace** — Followed the full pipeline:
- `POST /api/chat` → `decideChatMode` → `RUN_SUPERVISOR` lane → `createSupervisorTask()`
- Supervisor runs GP pipeline externally, stores results in `delivery_summary` artefact
- Supervisor calls `POST /api/conversations/:id/result-message` with `deliverySummary` body
- UI receives the message via polling and stores it in component state as `chatMessage` with `.deliverySummary` and `.runId` set

**Client-side trace** — Followed the render path in `client/src/pages/chat.tsx`:

```tsx
// Lines 3185-3211 (before fix)
{chatMessage.runId ? (
  <BehaviourInspectContent      // ← BJ QA panel rendered when runId present
    runId={chatMessage.runId}
    ...
  />
) : (
  <RunResultBubble              // ← Results bubble only rendered when runId is ABSENT
    deliverySummary={chatMessage.deliverySummary}
    ...
  />
)}
```

**Root cause**: `chatMessage.runId` is **always** set on supervisor result messages (the `runId` comes from the delivery artefact and is always populated). This meant the ternary always took the `true` branch — showing `BehaviourInspectContent` (a dev/QA scoring panel from `pages/dev/qa-progress.tsx`) instead of `RunResultBubble`. The actual results were never shown.

`BehaviourInspectContent` loads BJ evaluation data for its given `runId`. If no BJ result exists in Supabase for that run (which is the common case for non-QA runs), it renders blank — producing the observed "empty or missing" chat bubble.

### Fix Applied

**File: `client/src/pages/chat.tsx`**

1. Removed the conditional that branched on `chatMessage.runId` in the delivery-summary render path.
2. Always render `RunResultBubble` directly. The `runId` prop is passed through to `RunResultBubble` as before — it already accepted it.
3. Removed the now-unused `import { BehaviourInspectContent } from "@/pages/dev/qa-progress"` import.

No server-side changes were needed. The BJ is not part of the inline completion sequence on the server — it writes only to Supabase/AFR and runs independently. The bug was purely a client-side render branch error.

### Invariants Preserved

- `BehaviourInspectContent` remains in `pages/dev/qa-progress.tsx` — untouched.
- `RunResultBubble` props are identical to before; `runId` is passed through.
- No changes to scoring logic, BJ prompts, Supabase writes, or AFR logging.
- All other message render paths (standard chat, monitor creation, clarification, etc.) are unaffected.

**What's next:** The Supervisor's BJ evaluation results should only be surfaced in the AFR / QA Progress dev page — not in the main chat bubble render path.
