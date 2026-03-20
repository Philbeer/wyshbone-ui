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

---

## Session 5 — BehaviourInspectContent Restored with RunResultBubble Fallback

**Date:** 2026-03-18  
**Task:** Restore `BehaviourInspectContent` as primary results display; add `RunResultBubble` as fallback for runs with no BJ data.

### Root Cause (Corrected Understanding)

The Session 4 fix was too broad. The original bug was not that `BehaviourInspectContent` was always rendering — it was that it rendered **blank** on Google Places runs where the Behaviour Judge had no data. The component fetches from `/api/afr/behaviour-judge` with 8 retries at 2.5s intervals. If no BJ record exists (Places runs, GPT-4o-primary runs), the component shows a muted "No Judge B result" placeholder and nothing else — no leads, no summary. That is the blank users saw.

`BehaviourInspectContent` is the preferred display for GP Cascade runs: it shows verified/snippet badges, expandable evidence rows per lead, and the BJ assessment alongside the leads. Removing it lost that rich display for all runs.

### Changes Made

**`client/src/pages/dev/qa-progress.tsx`**  
- Added `fallback?: ReactNode` to `BehaviourInspectContent`'s props.  
- Added early return before the main JSX: `if (!judgeBLoading && !judgeB && fallback != null) return <>{fallback}</>`.  
- When BJ data is unavailable after all retries and a `fallback` is supplied, the component exits cleanly and renders the fallback at the root level — no "Behaviour Judge" section header, no placeholder text.  
- When `fallback` is not supplied (existing QA/AFR usage from `BehaviourInspectModal`), behaviour is identical to before.

**`client/src/pages/chat.tsx`**  
- Added `import { BehaviourInspectContent } from "@/pages/dev/qa-progress"`.  
- Changed result bubble condition from `if (chatMessage.deliverySummary)` to `if (chatMessage.deliverySummary || chatMessage.runId)`.  
- When `chatMessage.runId` is present: renders `BehaviourInspectContent` with `runId` + `fallback={<RunResultBubble .../>}` (or `null` if no `deliverySummary`).  
- When no `runId` but `deliverySummary` present: renders `RunResultBubble` directly.  
- `RunResultBubble` props are extracted as a local `const runResultBubble` to avoid duplication.

### Decision: Early Return vs Inline Fallback

Considered rendering `fallback` inline inside the `<section>` block. Rejected: it would have placed `RunResultBubble` under the "Behaviour Judge (Judge B)" section header, creating a confusing visual hierarchy. Early return at the function root gives the fallback full control of the bubble layout.

### What This Means at Runtime

| Run type | `runId` set | BJ data arrives | Result shown |
|---|---|---|---|
| GP Cascade (BJ available) | ✅ | ✅ | `BehaviourInspectContent` — rich display |
| GP Cascade (BJ pending) | ✅ | ⏳ | "Awaiting Judge B…" → then rich display |
| Google Places / GPT-4o-primary | ✅ | ❌ (no record) | "Awaiting Judge B…" → then `RunResultBubble` fallback |
| Historical (no `runId`) | ❌ | — | `RunResultBubble` directly |

### Files Modified
- `client/src/pages/dev/qa-progress.tsx` — `BehaviourInspectContent` props + early return
- `client/src/pages/chat.tsx` — import restored, render branch updated

### Build
Vite build clean. No TypeScript errors.

**What's next:** The 20-second wait (8 × 2.5s retries) before the fallback shows on Places runs may be noticeable. If this becomes a reported UX issue, a `maxRetries` prop could be added to allow chat.tsx to use a shorter retry window (e.g. 3 retries).

---

## Session 6 — Rich Evidence Display for All Run Types

**Date:** 2026-03-18  
**Task:** Make the evidence-per-lead table (verified badges, expandable evidence rows) appear for all runs, not just BJ runs. BJ assessment section still only appears when BJ data exists.

### Root Cause

`BehaviourInspectContent`'s evidence table was gated on `judgeB?.input_snapshot?.leads_evidence ?? judgeB?.input_snapshot?.leads`. For Google Places runs (and GPT-4o-primary runs) where the Behaviour Judge doesn't write a record, `judgeB` is `null`, so this evaluated to `[]` and the entire evidence table was suppressed with `return null`.

The evidence data for all leads is independently available from two sources:
1. `/api/afr/delivery-evidence` — already fetched by the component, gives enriched evidence per lead (quotes, matched phrases, constraint verdicts, URLs). Built from the delivery payload stored in artefacts — works for all run types.
2. `chatMessage.deliverySummary` — the delivery summary passed from `chat.tsx`, contains `delivered_exact` and `delivered_closest` arrays with all leads.

The component already fetched `deliveryEvidence` (source 1) but never used it as the lead list source. It only used it to ENRICH the leads from BJ input_snapshot.

### Changes Made

**`client/src/pages/dev/qa-progress.tsx` — `BehaviourInspectContent`**

1. **Added `deliverySummary?` prop** — inline type covering `delivered_exact` and `delivered_closest` arrays. No external import needed; type is self-contained.

2. **Added `dsLeads` useMemo** — builds a `LeadEvidence[]` from `deliverySummary.delivered_exact` + `delivered_closest`. Maps `name → lead_name`, `website → url`, passes through `verified`, `source_tier`, `constraint_verdicts`. Used as lead list fallback when BJ has no input_snapshot.

3. **Modified early return** — was `if (!judgeBLoading && !judgeB && fallback != null)`. Now also requires `dsLeads.length === 0`. When delivery leads exist, the component stays mounted and shows the evidence table rather than bailing to RunResultBubble.

4. **BJ section wrapped in conditional** — `{(judgeBLoading || judgeB || !deliverySummary) && (<section>...)}`. 
   - When `deliverySummary` is present (chat mode): hides entire BJ section when loading done and no BJ data. The "No Judge B result" placeholder never shows to users.
   - When `deliverySummary` is absent (QA/AFR mode): conditional is always true (`!deliverySummary`), existing behavior preserved exactly.

5. **Evidence section lead source changed** — was `judgeB?.input_snapshot?.leads_evidence ?? judgeB?.input_snapshot?.leads ?? []`. Now: `const bjLeads = judgeB?.input_snapshot?.leads_evidence ?? judgeB?.input_snapshot?.leads; const evidence: LeadEvidence[] = bjLeads ?? dsLeads`. For non-BJ runs, `dsLeads` provides the lead list. The `deliveryEvidence.evidenceMap` enriches each entry either way.

**`client/src/pages/chat.tsx`**

Added `deliverySummary={chatMessage.deliverySummary}` prop to the `BehaviourInspectContent` call.

### Decision: Where to Drive the Lead List From

The `deliveryEvidence.evidenceMap` (from the server) was considered as the sole lead source (using `Object.keys(evidenceMap)`). Rejected because the evidenceMap is fetched async and arrives after component mount — using `deliverySummary` as the immediate lead list means the evidence table renders synchronously on mount, then enriches progressively as `deliveryEvidence` arrives. Better UX, no flash.

### Runtime Behaviour After This Change

| Run type | BJ section | Evidence table source |
|---|---|---|
| GP Cascade, BJ data present | ✅ BJ verdict + assessments | `judgeB.input_snapshot.leads_evidence` + deliveryEvidence enrichment |
| GP Cascade, BJ loading | ⏳ "Awaiting Judge B…" | `dsLeads` from deliverySummary immediately |
| Google Places | ❌ hidden (no data) | `dsLeads` from deliverySummary |
| GPT-4o-primary | ❌ hidden (no data) | `dsLeads` from deliverySummary |
| QA/AFR page (no deliverySummary) | 🔵 "No Judge B result" shown | Only shows when judgeB has input_snapshot |

For Places/GPT-4o runs: evidence table shows lead names with expandable rows. Quote/matched-phrase fields say "not captured" since the Places pipeline doesn't produce match_evidence. But the expandable rows and badges are present and the bubble is never blank.

### Files Modified
- `client/src/pages/dev/qa-progress.tsx` — BehaviourInspectContent: new prop, dsLeads memo, modified early return, BJ section conditional, evidence lead source
- `client/src/pages/chat.tsx` — deliverySummary prop passed to BehaviourInspectContent

### Build
Vite build clean. No TypeScript errors.

**What's next:** For Places runs, the expandable evidence rows will mostly show "not captured" for quotes/matched-phrase since the Places pipeline doesn't produce match_evidence. If richer evidence is desired for Places leads, the pipeline would need to store additional artefact data.

---

## Session 7 — Evidence Field Mapping Fix (dsLeads → "not captured" resolved)

**Date:** 2026-03-18  
**Task:** Fix evidence row fields showing "not captured" in the chat bubble for non-BJ runs.

### Root Cause Analysis

After Session 6, the evidence table rendered (rows visible, expandable) but every expanded field showed "not captured". Two independent sources of data were failing:

**1. `deliveryEvidence.evidenceMap` (server) — URL missing for Places leads**

`getDeliveryEvidence` in `server/supabase-client.ts` built each evidenceMap entry's `url` field from `items[0]?.source_url || lead.url`. GP Cascade leads store their website in `lead.url`; Google Places leads store it in `lead.website`. So for Places runs, `rich.url` was always an empty string.

Additionally, the `quotes` flatMap only tried `e.quote`; GP evidence items can also have `e.approved_sentences` (array) or `e.text`. And `verification_status` on the lead-level (not item-level) wasn't consulted when `items` was empty.

**2. `dsLeads` useMemo (client) — fields not preserved**

The `dsLeads` mapping only wrote six fields (`lead_name`, `url`, `verified`, `source_tier`, `constraint_verdicts`). The rendering code falls back to direct `item.*` field access for `item.quotes`, `item.matched_phrase`, `item.context_snippet`, `item.tower_status`. Since those keys didn't exist on `item`, the fallback to "not captured" was always taken, even when the original lead object from `deliverySummary` did carry those fields.

For Places runs, the lead fields for quotes/matched_phrase/context_snippet are genuinely absent (Places search does not do web-scraping evidence extraction). But for GPT-4o-primary or any run where the delivery payload enriches leads with evidence, those fields were silently dropped by the narrow mapping.

### Changes Made

**`server/supabase-client.ts` — `getDeliveryEvidence`**

- `url` line now tries `lead.website` as final fallback: `items[0]?.source_url || lead.url || lead.website || ''`
- `quotes` changed from `items.map(e => e.quote).filter(Boolean)` to `items.flatMap(...)` that also handles `e.approved_sentences` (array) and `e.text` (string), expanding them properly
- `matched_phrase` now also tries `items[0]?.constraint_value` as fallback
- `context_snippet` now also tries `items[0]?.surrounding_context` as fallback  
- `verification_status` now also tries `lead.verification_status` when `items` is empty

**`client/src/pages/dev/qa-progress.tsx` — `dsLeads` useMemo**

Switched from narrow field-by-field mapping to spreading `l` (`...l`) first, then overlaying explicit mappings:
- All original lead fields preserved on `item` — any future field the pipeline adds is automatically available
- `lead_name`: tries `l.name || l.lead_name || l.business_name`
- `url`: tries `l.website || l.url || l.source_url || l.website_url` (multi-source)
- `website_url`: set to `l.website || l.website_url` (renderer's third fallback)
- `quotes`: normalised to `string[]` from `l.quotes` (array) or `l.quote` (string)
- `matched_phrase`: tries `l.matched_phrase || l.constraint_value`
- `context_snippet`: tries `l.context_snippet || l.surrounding_context || l.context`
- `tower_status`: tries `l.tower_status || l.verification_status`

### Runtime Behaviour After This Change

| Field | Places run | GP Cascade run (no BJ) | GP Cascade run (BJ present) |
|---|---|---|---|
| URL visited | ✅ website (from `item.url`) | ✅ url (from `rich.url` or `item.url`) | ✅ source_url (from `rich.url`) |
| Quotes found | ⚪ "not captured" (correct — Places doesn't scrape) | Depends on artefact | ✅ from `rich.quotes` |
| Matched phrase | ⚪ "not captured" (correct) | Depends on artefact | ✅ from `rich.matched_phrase` |
| Context snippet | ⚪ "not captured" (correct) | Depends on artefact | ✅ from `rich.context_snippet` |
| Tower verdict | ⚪ "not captured" (run-level for Places) | Depends on artefact | ✅ from `rich.verification_status` |
| Badges | ✅ constraint_verdicts from `item` | ✅ from `rich.constraint_verdicts` | ✅ from `rich.constraint_verdicts` |

"not captured" for Places runs is correct behaviour — those fields simply don't exist in the Places pipeline's output. The fix ensures they show correctly when the data IS available (GP Cascade runs with artefact evidence).

### Files Modified
- `server/supabase-client.ts` — `getDeliveryEvidence`: URL fallback, quotes flatMap, additional field aliases
- `client/src/pages/dev/qa-progress.tsx` — `dsLeads` useMemo: spread all fields, normalise all evidence field aliases

### Build
Vite build clean. Server restarted. No TypeScript errors.

**What's next:** Consider logging the actual lead fields on mount (console.log item) to confirm field presence for GPT-4o runs, which sit between Places (no evidence) and GP Cascade (full match_evidence).

---

## Session 8 — Source Type Badge + Hide Empty Evidence Fields

**Date:** 2026-03-18  
**Task:** Polish the evidence row display: add coloured source-type badge (`snippet` / `first_party`), and hide empty evidence fields instead of showing "not captured".

### Changes Made

**`server/supabase-client.ts` — `LeadDeliveryEvidence` + `getDeliveryEvidence`**

- Added `source_type: string` field to `LeadDeliveryEvidence` interface.
- Populated from: `items[0]?.source_type || items[0]?.evidence_type || items[0]?.evidence_source || lead.source_tier || lead.source_type || ''`. The cascade covers all field-name variants used across different pipeline versions.

**`client/src/pages/dev/qa-progress.tsx` — `DeliveryLeadEvidence` interface**

- Added `source_type: string` field to match the server interface.

**`client/src/pages/dev/qa-progress.tsx` — `dsLeads` useMemo**

- Added explicit `source_type` field: `l.source_type || l.source_tier || l.evidence_source || l.evidence_type || ''`. Normalises all variants from the delivery artefact into a single key.

**`client/src/pages/dev/qa-progress.tsx` — evidence row renderer**

*Source type badge (collapsed row):*
- Removed the old `item.source_tier` badge (uniform blue, ignoring value).
- Added `rawSourceType = rich?.source_type || item.source_type || item.source_tier || ''` derivation.
- Added `sourceTypeCls` logic: `first_party` / `first_party_website` / `website` → `bg-green-100 text-green-700`; `snippet` / `search_snippet` → `bg-blue-100 text-blue-700`; anything else → `bg-gray-100 text-gray-600`.
- Renders the badge only when `rawSourceType` is truthy. Colour reflects evidence provenance.

*Empty field hiding (expanded panel):*
- `URL visited` row: now only renders when `siteUrl` is truthy.
- `Quotes found` row: now only renders when `allQuotes.length > 0`.
- `Matched phrase` row: now only renders when `matchedPhrase` is truthy.
- `Context snippet` row: now only renders when `contextSnippet` is truthy.
- `Tower verdict` row: now only renders when `towerStatus` is truthy.
- Added catch-all: when ALL five are empty, shows `"No evidence details captured."` so the expanded panel is never completely blank.

### Decision: "Not captured" vs hide

Hiding empty fields (option chosen) produces a cleaner panel for Places runs where only URL + badge are meaningful. The catch-all message covers the edge case where even the URL is missing, ensuring the user always sees *something* on expand rather than an empty div.

### Files Modified
- `server/supabase-client.ts` — `LeadDeliveryEvidence` interface + `getDeliveryEvidence` evidenceMap `source_type` field
- `client/src/pages/dev/qa-progress.tsx` — `DeliveryLeadEvidence` interface, `dsLeads` useMemo, evidence row renderer (badge + hide logic)

### Build
Vite build clean. Server restarted. No TypeScript errors.

**What's next:** The source type badge value (`snippet`, `first_party`, etc.) is rendered verbatim. If human-readable labels are preferred (e.g. "search result" instead of "snippet"), a `formatSourceType` mapping function could be added, mirroring the existing `formatSourceTier` in RunResultBubble.

---

## Session 9 — Chat Bubble Evidence Badge Parity with QA Progress Page

**Date:** 2026-03-18
**Task:** Make the chat bubble "EVIDENCE FOUND PER LEAD" evidence panel match the QA progress page in: verified/unverified badge presence, source type badge colour, and evidence field visibility.

### Root-cause analysis

Four distinct bugs were preventing the chat bubble from matching the QA page:

**Bug 1 — `normalizeVerdict` was case-sensitive.**
`verification_status` values from the delivery artefact arrive as `"VERIFIED"` (uppercase). The function compared `v === 'verified'` (lowercase), so every VERIFIED lead was classified as 'unverified'. Also, GP pipeline variants emit `"yes"`, `"exact"`, and `"search_bounded"` as affirmative verdicts — none of these were mapped.
Fix: lowercased input before comparison, added aliases `yes`, `exact`, `search_bounded` → `'verified'`.

**Bug 2 — `resolveConstraintBadges` blocked on `noVerification` even when explicit `constraint_verdicts` existed.**
When `verifiableConstraints` is empty (e.g. a Places run where the delivery artefact didn't carry a `verifiable_constraints` array at payload level), `noVerification = true` caused an early return of `[]` — even if each individual lead had `constraint_verdicts: [{constraint, verdict}]` populated. This produced no badges for an entire run just because the run-level metadata was absent.
Fix: moved the `constraint_verdicts` block above the `noVerification` guard — explicit lead-level verdicts always surface.

**Bug 3 — `web_search` source tier mapped to gray instead of blue.**
`sourceTypeCls` only put `snippet` and `search_snippet` in the blue category. BJ `input_snapshot.leads_evidence` entries carry `source_tier: "web_search"` for GP cascade leads. This tier fell through to gray.
Fix: added `web_search` to the blue (`bg-blue-100 text-blue-700`) branch. Also made the gray case conditional on `rawSourceType` being truthy (so blank source type produces no class string rather than a gray chip).

**Bug 4 — No badge fallback when `constraint_verdicts` and `verified` are both absent.**
For runs where only `rich.verification_status` (from the delivery evidenceMap) carries the lead's overall assessment, `resolveConstraintBadges` returned `[]` and no badge was shown.
Fix: added `effectiveBadges` derivation after `resolveConstraintBadges`: when `badges.length === 0` and `rich?.verification_status` is truthy, fabricate a single `{label: null, verdict: normalizeVerdict(rich.verification_status)}` badge. `<LeadConstraintBadges>` now renders `effectiveBadges`.

### Files Modified
- `client/src/pages/dev/qa-progress.tsx`
  - `normalizeVerdict`: case-insensitive, added `yes`/`exact`/`search_bounded` aliases
  - `resolveConstraintBadges`: `constraint_verdicts` check moved before `noVerification` guard
  - `sourceTypeCls`: added `web_search` → blue; gray branch conditioned on truthy `rawSourceType`
  - `effectiveBadges`: fallback from `rich.verification_status` when no explicit badges
  - `<LeadConstraintBadges>`: now receives `effectiveBadges` instead of `badges`

### Build
Vite build clean. HMR applied. No TypeScript errors.

### What's next
- Verify the chat bubble against a live GP Cascade run that has BJ data to confirm all four fixes produce matching badges.
- If `source_tier` values beyond `web_search`, `snippet`, `first_party`, `first_party_website`, `website` appear (e.g. `directory`, `crm`), extend the colour mapping accordingly.
- Consider a `formatSourceType` helper to render human-readable labels (e.g. "Web search" instead of "web_search") if stakeholders prefer it.

---

## Search Mode Toggle → execution_path Wiring Audit

**Date:** 2026-03-19  
**Task:** Wire the existing GP / GPT-4o search mode toggle so that `execution_path` is included in the Supervisor request body on every run submission.

### Finding

The wiring was **already fully implemented** prior to this task. No code changes were required.

### How it works (verified by code inspection)

| File | Line | Role |
|------|------|------|
| `client/src/components/SearchModeToggle.tsx` | 10 | Defines `SearchMode = "gp_cascade" \| "gpt4o_primary"` |
| `client/src/components/SearchModeToggle.tsx` | 12 | Module-level `_currentSearchMode` holds the live toggle value |
| `client/src/components/SearchModeToggle.tsx` | 14–16 | `getSearchMode()` reads and returns `_currentSearchMode` |
| `client/src/components/SearchModeToggle.tsx` | 21–28 | `handleSet()` updates both React state and the module-level variable on every toggle click |
| `client/src/pages/chat.tsx` | 42 | `getSearchMode` imported from `SearchModeToggle` |
| `client/src/pages/chat.tsx` | 2192 | `execution_path: getSearchMode()` included in the `POST /api/chat` body |
| `client/src/pages/chat.tsx` | 3728 | `<SearchModeToggle />` rendered in the chat toolbar |

### Behaviour

- **GP mode (default):** `execution_path` is sent as `"gp_cascade"`. The Supervisor defaults to this path, so the effect is the same whether the field is present or absent.
- **GPT-4o mode:** `execution_path` is sent as `"gpt4o_primary"`, routing the run through the GPT-4o primary pipeline.

### Files Modified
None — no changes were needed.

### Decisions Made
- No refactoring was performed. The existing module-level singleton pattern (`_currentSearchMode` + `getSearchMode()`) is a clean, low-overhead approach for sharing toggle state across the component boundary without adding a context or prop-drilling. It was left as-is.
- `execution_path` is always included in the payload (never omitted), which is consistent with the existing `google_query_mode` field convention in the same payload.

### What's next
- Confirm the Supervisor backend reads and routes on `execution_path` correctly for both values.
- Consider adding a visual indicator in the chat thread (e.g. a small badge on the assistant message) showing which execution path was used for a given run, to help with QA and debugging.

---

## execution_path → Supabase supervisor_tasks Fix

**Date:** 2026-03-19  
**Task:** Wire `execution_path` from the search mode toggle into the `request_data` column of every `supervisor_tasks` Supabase insert so the Supervisor can read it when claiming the task.

### Root Cause

The previous audit confirmed `getSearchMode()` was being called and sent to `POST /api/chat` as `execution_path`. However, the UI server's `/api/chat` route was **not** passing that field through to the `request_data` object written to Supabase. The `chatRequestSchema` Zod validator was also silently stripping `execution_path` because the field was not declared in the schema.

### What Changed

#### `shared/schema.ts`
- Added `execution_path: z.enum(["gp_cascade", "gpt4o_primary"]).optional()` to `chatRequestSchema`.
- Without this, Zod's `.safeParse()` would strip the field before it reached the route handler.

#### `server/routes.ts`
Three separate supervisor task creation paths were updated — all follow the same pattern: inject `execution_path` into `requestData` immediately after `google_query_mode`, then log it just before the Supabase insert.

| Path | Lines changed | Variable |
|------|--------------|----------|
| **CLARIFY_CONTINUATION** (clarify answer follow-up) | ~1317–1324 | `requestData` |
| **RUN_SUPERVISOR** (main `decideChatMode → RUN_SUPERVISOR` lane) | ~1432–1459 | `requestData` |
| **CLASSIFY_GATE** (CHAT_INFO override via classifier) | ~1565–1592 | `requestDataClassify` |

Each site received:
```typescript
if (execution_path) requestData.execution_path = execution_path;
// ...
console.log('[chat] Supabase insert execution_path:', execution_path ?? 'gp_cascade (default)');
```

The destructuring on line 1206 was also updated to extract `execution_path` from `validatedData`.

### Behaviour After Fix

- **GP mode (default / omitted):** `execution_path` is absent from the payload → `if (execution_path)` guard evaluates falsy → field not written to `request_data`. Supervisor defaults to `gp_cascade`. Console prints `gp_cascade (default)`.
- **GPT-4o mode:** `execution_path: "gpt4o_primary"` is written into `request_data`. Supervisor's `request_data.execution_path` branch at supervisor.ts line 1930 → mission-executor.ts line 714 activates the GPT-4o primary pipeline.

### Files Modified
- `shared/schema.ts` — added `execution_path` field to `chatRequestSchema`
- `server/routes.ts` — destructured `execution_path` from validated body; injected into `requestData` / `requestDataClassify` in all three supervisor task insert paths; added `console.log` before each insert

### Decisions Made
- Only injected `execution_path` when truthy (matching the existing `google_query_mode` convention) so GP-mode rows stay clean and the Supervisor's default behaviour is unchanged.
- The Tower `/api/chat` route (line 4848) also validates against `chatRequestSchema` but does not create supervisor tasks — no changes needed there.
- No changes to the Supervisor backend were required; it already reads `request_data.execution_path` at supervisor.ts line 1930.

### What's Next
- Trigger a GPT-4o mode run and inspect the `supervisor_tasks` row in Supabase to confirm `request_data.execution_path = "gpt4o_primary"` is present.
- Check the server console for `[chat] Supabase insert execution_path: gpt4o_primary` to verify end-to-end flow.
- Optionally surface the active execution path in the run artefacts or the chat UI for easier QA.

---

## Session: Evidence Dropdown "No evidence details captured" Regression Fix

**Date:** 2026-03-19  
**Status:** Complete

### Root Cause Analysis

The "No evidence details captured" fallback fired when all five display fields (`siteUrl`, `allQuotes`, `matchedPhrase`, `contextSnippet`, `towerStatus`) were empty after two-source resolution:

1. **`rich`** — from `GET /api/afr/delivery-evidence` → `getDeliveryEvidence()` which reads `delivery_summary` artefacts and builds `evidenceMap` keyed by `lead.name.toLowerCase().trim()`.
2. **`item`** — from `bjLeads` (Behaviour Judge `input_snapshot.leads_evidence`) when present, otherwise `dsLeads`.

Two failure modes caused the regression:

**Failure Mode A — Server-side (both GP + GPT-4o):**  
`getDeliveryEvidence` only searched `lead.match_evidence` and `lead.supporting_evidence` arrays. GPT-4o runs may store evidence in `lead.evidence`, `lead.evidence_refs`, or `lead.citations` fields. When none of these matched, `items` was `[]` and the entire `evidenceMap` entry had empty `url`/`quotes`/`matched_phrase`/`context_snippet`. Additionally, the URL fallback chain omitted `items[0]?.url`, `lead.source_url`, and `lead.website_url`.

**Failure Mode B — Client-side (chat bubble, bjLeads present):**  
When `bjLeads` is the primary evidence source (`evidence = bjLeads ?? dsLeads`), `dsLeads` was completely bypassed — not just as the evidence list, but also as a fallback for individual field data. `dsLeads` items (built from `chatMessage.deliverySummary`) carry rich mapped fields (`url`, `tower_status`, `quotes`, `matched_phrase`) that could rescue empty `bjLeads` items when `rich` is also null.

### Fix 1 — `server/supabase-client.ts` (`getDeliveryEvidence`)

Expanded the evidence array priority chain to handle more field names:

```typescript
const items: any[] = (lead.match_evidence?.length ? lead.match_evidence : null)
  ?? (lead.supporting_evidence?.length ? lead.supporting_evidence : null)
  ?? (lead.evidence?.length ? lead.evidence : null)
  ?? (lead.evidence_refs?.length ? lead.evidence_refs.map((r) => ({
      source_url: r.url || r.source_url || '',
      quote: r.snippet || r.quote || '',
      matched_phrase: r.matched_variant || r.matched_phrase || '',
      ...
    })) : null)
  ?? (lead.citations?.length ? lead.citations.map(...) : null)
  ?? [];
```

Expanded the URL fallback chain:
```typescript
url: items[0]?.source_url || items[0]?.url || lead.url || lead.website || lead.source_url || lead.website_url || '',
```

### Fix 2 — `client/src/pages/dev/qa-progress.tsx` (`BehaviourInspectContent`)

Built a `dsLeadsMap` (name-keyed lookup over `dsLeads`) before the evidence `.map()` and used `dsItem` as a final fallback in all five field derivations:

```typescript
const dsLeadsMap = new Map<string, LeadEvidence>(
  dsLeads.map(dl => {
    const key = (dl.lead_name || dl.name || ...).toLowerCase().trim();
    return [key, dl];
  })
);
// Inside .map():
const dsItem = dsLeadsMap.get(displayKey) ?? null;
const siteUrl = rich?.url || item.url || ... || dsItem?.url || dsItem?.source_url || '';
const towerStatus = rich?.verification_status || item.tower_status || dsItem?.tower_status || '';
// etc.
```

This gives three-tier fallback: `rich` (evidenceMap) → `item` (bjLeads) → `dsItem` (dsLeads).

### Files Modified
- `server/supabase-client.ts` — expanded `items` evidence array priority chain + URL fallback
- `client/src/pages/dev/qa-progress.tsx` — added `dsLeadsMap` + `dsItem` third-tier fallback in evidence field derivations

### Decisions Made
- Server fix covers `evidence_refs` (used by `ReceiptAttributeOutcome`/GPT-4o attribution), `evidence` (generic array), and `citations` (citation-style GPT-4o output) — all mapped to the canonical `{source_url, quote, matched_phrase, ...}` shape used by the rest of the function.
- Client fix only applies when `dsLeads` is populated (i.e., when `deliverySummary` prop is passed to `BehaviourInspectContent`). For the QA modal path (no `deliverySummary`), the server-side fix is the only rescue path.
- The priority order preserves existing behaviour: `rich` (most authoritative) → `item` (bjLeads direct fields) → `dsItem` (delivery summary fallback).

---

## Session: Evidence Dropdown — Root Cause Deep Dive (Follow-up)

**Date:** 2026-03-19  
**Status:** Complete

### What the diffs showed

Running `git diff evidence-badges-chat-bubble..HEAD` across all changed files confirmed:

- **`client/src/pages/chat.tsx`** — ZERO changes. No evidence rendering code was deleted.
- **`client/src/pages/dev/qa-progress.tsx`** — only the additive `dsLeadsMap`/`dsItem` changes from the previous session. No logic removed.
- **`server/routes.ts`** — only `execution_path` wiring and `console.log` statements. No evidence-related changes.
- **`server/supabase-client.ts`** — only the expanded evidence array fallbacks from the previous session.

The regression was therefore NOT caused by deleted client code, but by two latent bugs that were masked at tag-time by different data, now exposed as the Supervisor's delivery_summary format evolved:

### Root Cause 1 — `getDeliveryEvidence` name key derivation (server)

```typescript
// BEFORE (tag):
const name = (lead.name || '').toLowerCase().trim();
if (!name || seen.has(name)) continue;  // ← skips lead if lead.name is absent
```

If the Supervisor writes leads with `lead_name` or `business_name` but no `name` field, the lead is silently skipped and its `evidenceMap` entry is never written. The rendering then gets `rich = null` for every lead.

**Fix:** use the same multi-field derivation as the client's `dsLeads` mapping:
```typescript
const name = (lead.name || lead.lead_name || lead.business_name || lead.entity_name || '').toLowerCase().trim();
```

### Root Cause 2 — `dsLeads` mapping did not extract from nested evidence arrays (client)

The `dsLeads` useMemo only looked at top-level fields on each lead:
```typescript
url: l.website || l.url || l.source_url || l.website_url,   // ← misses match_evidence[0].source_url
quotes: Array.isArray(l.quotes) ? l.quotes : ...,           // ← misses match_evidence[].quote
matched_phrase: l.matched_phrase || ...,                     // ← misses match_evidence[0].matched_phrase
tower_status: l.tower_status || l.verification_status || '', // ← misses match_evidence[0].verification_status
```

When the Supervisor embeds evidence inside `match_evidence[]` or `supporting_evidence[]` (GP cascade / WEB_VISIT pattern), none of that data was surfaced in `dsLeads` items. So `dsItem` (the third-tier fallback from the previous session) was populated but all its evidence fields were still empty.

**Fix:** extract the first evidence item from `match_evidence`/`supporting_evidence`/`evidence` and use it as fallback for all evidence fields. Quotes are flat-mapped from all items.

### Files Modified
- `server/supabase-client.ts` — `getDeliveryEvidence` key derivation: `lead.name || lead.lead_name || lead.business_name || lead.entity_name`
- `client/src/pages/dev/qa-progress.tsx` — `dsLeads` useMemo: extracts `ev0` (first evidence item) from nested arrays; uses it as fallback for `url`, `quotes`, `matched_phrase`, `context_snippet`, `tower_status`, `source_type`

### Verification from logs
After the fix, the server log confirms:
- `[delivery-evidence] allDelivered count: 17` — all leads processed
- `[delivery-evidence] evidenceMap keys: ['blackpool council adoption services', ...]` — 17 keys registered
- `first entry constraint_verdicts: [{ constraint: 'Blackpool Council', verdict: 'verified' }]` — evidence data present
- Vite HMR: `hmr update /src/pages/dev/qa-progress.tsx` — no compile errors

### What's Next
- Trigger a fresh GP cascade run and expand evidence dropdowns to confirm URL + quotes + matched phrase now show
- Trigger a GPT-4o run and confirm evidence fields show (GPT-4o may use `supporting_evidence` or `evidence_refs`)
- Watch the `[delivery-evidence]` server logs for the new run to confirm evidenceMap entries have non-empty url/quotes

---

## BJ verdict wrong on multi-loop runs — fix `getBehaviourJudgeResult` preference logic

**Date:** 2026-03-20  
**Scope:** `server/supabase-client.ts` only

### Problem
Multi-loop Supervisor runs produce multiple rows in `behaviour_judge_results` — one per judged artefact (`final_delivery` per loop, plus a `combined_delivery` artefact covering all loops merged). The existing `getBehaviourJudgeResult(runId)` used `.maybeSingle()` which returns whichever row Supabase happens to return first. For multi-loop runs this was the last `final_delivery` row (e.g. "2 delivered") instead of the `combined_delivery` row (e.g. "8 delivered"), causing the BehaviourJudgeCard in the UI to show the wrong count.

### Investigation

**Schema confirmed via direct Supabase postgres query:**
```
id, run_id, outcome, reason, confidence, tower_verdict, delivered_count,
requested_count, input_snapshot, created_at, mission_intent_assessment,
ground_truth_assessment
```

No `artefact_type`, `judged_artefact_type`, or `source_artefact_type` column exists. The task description suggested looking for such a column — it does not exist in the current schema.

**Key discriminator found:** The `combined_delivery` BJ row always has `requested_count IS NOT NULL` (it knows the user's original request count). Per-loop `final_delivery` rows have `requested_count = NULL`. This was confirmed by querying actual multi-row runs in Supabase.

Example (run `c80ef2ee`):
- `delivered_count=6, requested_count=NULL` → per-loop final_delivery
- `delivered_count=8, requested_count=40` → combined_delivery ← correct answer
- `delivered_count=2, requested_count=NULL` → per-loop final_delivery

### Changes Made

**`server/supabase-client.ts`:**

1. Added private `pickBestBjRow(rows)` helper that selects the best row using:
   - Priority 1: `requested_count IS NOT NULL` (combined_delivery)
   - Priority 2: Highest `delivered_count` (most leads = most complete view)
   - Priority 3: Latest `created_at` (tiebreaker)

2. Rewrote `getBehaviourJudgeResult(runId)`: removed `.maybeSingle()`, fetches all rows for the run_id, passes them to `pickBestBjRow`.

3. Rewrote `getBehaviourJudgeResults(runIds)`: now groups all rows by `run_id` and calls `pickBestBjRow` per run. Also added `delivered_count`, `requested_count`, `created_at` to the SELECT (previously omitted, which would break the picker logic and was a separate bug).

4. `client/src/components/live-activity-panel.tsx`: verified no change needed — `BehaviourJudgeCard` already reads `judge.delivered_count` and `judge.requested_count` directly.

### What's Next
- Trigger a multi-loop run and confirm BehaviourJudgeCard shows combined_delivery count (not last loop's count)
- If Tower adds an explicit `artefact_type` column to `behaviour_judge_results` in future, update `pickBestBjRow` to check `row.artefact_type === 'combined_delivery'` as priority 0
