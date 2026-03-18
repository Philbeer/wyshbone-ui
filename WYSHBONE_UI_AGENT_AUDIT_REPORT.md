# Wyshbone UI — Agent System Interaction Audit

**Date:** 2026-03-08  
**Scope:** wyshbone-ui repository (client + server)  
**Method:** Static code analysis of all relevant source files  
**Reference plans:** `WBS_ARCHITECTURE_PLAN.md`, `Wyshbone-grand-plan/agent-architecture-4repos.md`, `ARCHITECTURE_STATE.md`, `replit.md`

---

## 1. Run Creation

### How user input becomes an agent run

The run creation flow is a multi-stage pipeline spanning frontend and backend:

| Step | Location | Function / Endpoint |
|------|----------|---------------------|
| User types message, presses Enter or Send | `client/src/pages/chat.tsx` | `handleSend()` |
| Input validated, intent classified (NEW_REPLACE, CONTINUE, MODIFY) | `client/src/pages/chat.tsx` | `classifyIntent()` |
| SSE stream opened to backend | `client/src/pages/chat.tsx` | `streamChatResponse()` → `POST /api/chat` |
| Message persisted to DB | `server/routes.ts` | `saveMessage()` |
| Run row created in `agent_runs` table | `server/lib/run-manager.ts` | `runManager.createRun()` |
| Intent routed via 3-way router | `server/lib/decideChatMode.ts` | `decideChatMode()` → CHAT_INFO, CLARIFY_FOR_RUN, or RUN_SUPERVISOR |
| Post-router classify gate for edge cases | `server/lib/classifyMessage.ts` | `classifyMessage()` (catches monitoring/scheduling intents missed by regex) |
| Supervisor task created if runnable | `server/routes.ts` | `createSupervisorTask()` via `detectSupervisorIntent()` |
| Run ID + supervisor task ID emitted to frontend via SSE | `server/routes.ts` | SSE events: `run_id`, `supervisorTaskId`, `confidence` |
| Frontend begins polling for progress | `client/src/pages/chat.tsx` | AFR polling at 1.5–3s intervals |

**Key observations:**
- A `clientRequestId` (UUID) is generated client-side and correlates the entire lifecycle.
- The backend performs idempotent run creation — the same `clientRequestId` will not create duplicate runs.
- A `confidence` SSE event is emitted before task creation, producing a blue-tinted "Searching for X in Y" bubble.
- Follow-up reuse (`detectFollowupReuse()`) can bypass the 3-way router entirely if a prior successful intent exists in-memory (60-min TTL).

**Risk:** Follow-up intent storage and clarify sessions are both **in-memory Maps** — lost on server restart with no fallback.

---

## 2. Clarification Gate

### Where the UI decides whether to ask a clarification question or start a run

The clarification gate operates at two levels with a dual-origin design:

#### 2a. Server-side gate (primary)

The `decideChatMode()` function in `server/lib/decideChatMode.ts` is the authoritative router:

| Decision | Condition | Route |
|----------|-----------|-------|
| **CHAT_INFO** | Informational question prefix ("who are", "what is"), no entity intent | GPT streaming, no execution |
| **CLARIFY_FOR_RUN** | Entity-finding intent detected BUT: missing location, missing concrete entity noun, or has semantic/subjective constraints | In-memory clarify session created |
| **RUN_SUPERVISOR** | Entity-finding intent with valid entity noun + known location + no unresolved semantic constraints | Supervisor task created |

Validation rules that force clarification:
- `isKnownLocation()` — unknown locations force CLARIFY_FOR_RUN
- `hasConcreteEntityNoun()` — purely subjective entity types ("best vibes") force CLARIFY_FOR_RUN
- Semantic constraints (relationship predicates, numeric thresholds) require explicit resolution via `semantic_constraint_resolved` flag
- Vague/invalid values are nulled out before session creation (G6 fix) to prevent false "Ready to search" states

#### 2b. Supervisor-side gate (secondary, behind feature flag)

When `SUPERVISOR_OWNS_CLARIFY=true`, CLARIFY_FOR_RUN messages are delegated to the Supervisor, which runs its own constraint gate. The Supervisor emits `clarify_gate` or `diagnostic` (with "constraint gate" + "BLOCKED" in title) artefacts. The AFR polling loop on the client detects these and transitions the UI into clarifying state.

#### 2c. Client-side clarify state machine

In `client/src/pages/chat.tsx`:
- `isClarifyingForRun` state flag controls whether the UI is in clarification mode
- `clarifyContext` holds the structured payload (entityType, location, semanticConstraint, missingFields, pendingQuestions)
- The `CLARIFY_GUARD` intercepts every message while a session is active, classifying it as EXECUTE, NEW_TASK, CHAT_INFO, REFINE, or META_TRUST
- Confirmation is explicit: the user must click "Search now" or send a bare acknowledgement — no auto-transition
- Active clarify messages render with amber border + "Action required" header
- Resolved clarify messages render dimmed with green checkmark + "Clarification answered — search resumed"

#### 2d. Artefact-based clarify detection (AFR path)

The AFR `/stream` endpoint performs server-side override: if it detects a `clarify_gate` artefact (or a diagnostic artefact with "constraint gate" + "BLOCKED" in the title), it overrides the run status to `clarifying`. The client polls this and hydrates the clarify UI from the artefact payload, providing resilience against SSE disconnections.

**Risk:** The two clarify sources (local in-memory session vs Supervisor constraint gate) use different payload shapes and extraction logic. The client has a complex fallback chain for question extraction across both formats.

---

## 3. Artefact Display

### How AFR artefacts are fetched and displayed

#### Fetch layer

| Endpoint | Purpose |
|----------|---------|
| `GET /api/afr/artefacts?runId=...` | Fetch all artefacts for a run |
| `GET /api/afr/artefacts?client_request_id=...` | Resolve runId from `agent_runs` table, then fetch |
| `GET /api/afr/stream?runId=...` | Poll for live status + event timeline |
| `POST /api/afr/artefacts` | Create artefact (accepts both UI and Supervisor payload formats) |

**Run bridging:** The backend merges artefacts from both the UI `run_id` and the `supervisor_run_id`, ensuring Supervisor-created artefacts appear under the user's run. Merge is triggered when the local run is missing either `delivery_summary` or `clarify_gate` artefacts.

**Polling:** `LiveActivityPanel.tsx` polls every 1.5–3 seconds.

#### Known artefact types

| Type | Origin | Rendered By |
|------|--------|-------------|
| `leads_list` / `plan_result` | Supervisor | `RunResultBubble` / `ResultsPanel` |
| `delivery_summary` | Supervisor | `RunResultBubble` (canonical status + counts) |
| `tower_judgement` | Tower/Supervisor | `TowerVerdictBadge` / `TrustErrorBlock` |
| `clarify_gate` | UI or Supervisor | Amber clarify message in chat |
| `diagnostic` | UI/Server | Intent previews, constraint gates |
| `chat_response` | UI/Server | Persisted chat record |
| `lead_pack` | Supervisor | Contact extraction (emails/phones) |
| `contact_extract` | Supervisor | Contact data for delivered leads |

#### Rendering components

- **`RunResultBubble.tsx`**: Primary result display in chat. Aggregates delivery summary, verification data, contact counts, and Tower verdict into a two-tier view (HumanSummary default, TechnicalDetails collapsed).
- **`CvlArtefactViews.tsx`**: Constraint Verification Logic views — `ConstraintsExtractedView`, `VerificationSummaryView`, `LeadVerificationView`, `StatusBadge`, `HardnessBadge`.
- **`ResultsPanel.tsx`**: Sidebar/modal with specialized views per tool type (QuickSearch, DeepResearch, EmailFinder).
- **`LiveActivityPanel.tsx`**: Real-time timeline with `TruthStrip` (diagnostic row of green/red indicators for backend state) and `TimelineEvent` components.
- **`UserResultsView.tsx`**: Splits leads into Verified Matches vs Candidates/Weak Matches.

#### Display flow

1. `LiveActivityPanel` polls `/api/afr/stream` and `/api/afr/artefacts`
2. Terminal status or `delivery_summary` artefact triggers `ResultsPanelContext` update
3. `RunResultBubble` reads `payload_json` from fetched artefacts
4. Passes to `CvlArtefactViews` for detailed rendering
5. Contact counts are extracted only from artefacts matching delivered leads (scoped extraction via `extractContactCounts`)

---

## 4. Tower Verdict Display

### How Tower judgements appear in the UI

#### Verdict resolution

`client/src/utils/towerVerdictResolver.ts` is the single source of truth:

| Rule | Behavior |
|------|----------|
| `final_delivery` phase judgement with PASS | Overrides all step-level failures |
| Single judgement | Used as-is |
| Multiple judgements, mixed pass/fail, no `final_delivery` phase | Displayed as "MIXED (N steps failed)" |
| `isTowerTrustFailure()` | Returns true only for unambiguous FAIL/ERROR/STOP; MIXED is NOT a trust failure |

All three display locations use this shared resolver for consistency.

#### Visual components

| Component | Location | Display |
|-----------|----------|---------|
| **`TowerVerdictBadge`** | `live-activity-panel.tsx` | Brain icon, color-coded: green (PASS/ACCEPT/CONTINUE), amber (REVISE/CHANGE_PLAN/RETRY/MIXED), red (FAIL/ERROR/STOP/ABANDON) |
| **`TrustErrorBlock`** | `RunResultBubble.tsx` | Red banner: "Some results couldn't be fully checked. You may want to retry or refine your search." Includes "Retry" and "Ask me a question" buttons |
| **`StopReasonBadge`** | `RunResultBubble.tsx` | Renders specific halt reason (tower_stopped, budget_exhausted, etc.) |
| **`StatusBadge`** | `CvlArtefactViews.tsx` | Per-constraint: "Verified" (ShieldCheck), "Not met" (ShieldAlert), "Not verified" (ShieldQuestion) |
| **`LeadBadge`** | `RunResultBubble.tsx` | Per-lead: green "Verified" (CheckCircle2), gray "Unverified" (HelpCircle), or "Weak match" |

#### Trace and diagnostic views

- **AFR Run Detail** (`pages/dev/afr.tsx`, `run-trace.tsx`): Step-by-step timeline with raw JSON payloads and Tower rationale
- **WhatJustHappenedPanel** (`components/tower/WhatJustHappenedPanel.tsx`): Local activity log sidebar
- **ExplainRunModal** (`components/agent/AgentWorkspace.tsx`): Plain-English run explanation with applied policy and strategy snapshot

---

## 5. Plan Visibility

### Whether plan versions or strategy changes are visible

Plan versions and strategy changes ARE visible, but only behind expandable detail sections:

#### Plan version timeline

`client/src/components/results/PlanVersionTimeline.tsx` renders:
- Version number (v1, v2, ...)
- Timestamp of each version
- Change log (`what_changed` field)
- Replan trigger (`replan_trigger` field)

Displayed within `TechnicalDetails` inside `RunResultBubble.tsx` only when more than one version exists. Collapsed by default — users must click "Show details" to see it.

#### Strategy/policy changes

| Component | What it shows |
|-----------|---------------|
| **`LearningDeltaSection`** (`RunResultBubble.tsx`) | "What changed since last time" — before/after values, Tower reason, metrics trigger |
| **`AppliedPolicySection`** (`RunResultBubble.tsx`) | Current applied policy or snapshot, including reasoning (`why_short`) |
| **ExplainRunModal** | Plain-English summary with "Applied policy" section |

#### Limitations

- All plan/strategy detail is behind "Show details" toggle — not surfaced in the default `HumanSummary` view
- No dedicated plan history page or timeline view outside of the chat bubble
- No side-by-side diff view for plans — `LearningDeltaSection` provides a semantic diff (field-level before/after) but not a structural diff

---

## 6. Result Summary

### How the UI determines what results were delivered

#### Canonical status resolution

`client/src/utils/deliveryStatus.ts` contains `resolveCanonicalStatus()`:

| Canonical Status | Visual | Meaning |
|------------------|--------|---------|
| `PASS` | Green CheckCircle | Fully complete — requested count met, all verified |
| `PARTIAL` | Blue indicator | Some results returned, not all |
| `ACCEPT_WITH_UNVERIFIED` | Amber badge | Results delivered but constraints not fully verified |
| `STOP` | Red OctagonX | Search halted (tower_stopped, budget_exhausted, etc.) |
| `FAIL` | Red AlertTriangle | Verification failed or trust failure |

#### Result aggregation

`RunResultBubble.tsx` performs multi-source aggregation:
1. Reads `delivery_summary` artefact for requested vs delivered counts
2. Reads `lead_verifications` for per-lead evidence
3. Reads `tower_judgement` artefacts for verdict
4. Reads `lead_pack` and `contact_extract` artefacts for contact counts (scoped to delivered leads only)
5. Computes `buildRunNarrative()` — a pure function producing `RunNarrative { lines[], isTrustFailure, counts, contactCountsSource }`
6. Default view is `HumanSummary` — 3-6 lines of plain English prose

#### Live progress

`LiveActivityPanel.tsx` tracks a progress stack: `ack → classifying → planning → executing → finalising → completed`

#### Result views

- **`QuickSearchFullView`**: Grid/List with "Add to CRM" and "Export CSV"
- **`DeepResearchFullView`**: Markdown reports with source citations
- **`EmailFinderFullView`**: Step-by-step status for domain/email discovery

---

## 7. Honesty Rules

### Does the UI prevent showing "verified" when evidence is missing?

**Yes. The UI implements multiple honesty enforcement layers:**

#### Layer 1: Automatic PASS downgrade

In `RunResultBubble.tsx`, an explicit honesty gate:
```
if canonical.status === "PASS" && hasAnyUnverifiedResults:
    effectiveCanonical = { status: "ACCEPT_WITH_UNVERIFIED" }
```

`hasAnyUnverifiedResults` is true when:
- No verification data or semantic data exists
- Tower issued a failure or error
- Count of "verified exact" results < total leads shown

#### Layer 2: Per-lead badge accuracy

`LeadBadge` component defaults to "Unverified" (gray HelpCircle). A lead is only badged "Verified" (green CheckCircle) if it appears in the `verifiedIds` set, which requires positive evidence from `leadVerifications`, `semanticJudgements`, or `runReceipt`. A `weak_match` status exists for low-confidence evidence.

#### Layer 3: Trust failure banner

`TrustErrorBlock` renders when `isTowerTrustFailure()` returns true (unambiguous FAIL/ERROR/STOP). It explicitly warns: "Some results couldn't be fully checked."

#### Layer 4: ACCEPT_WITH_UNVERIFIED status

Defined in `deliveryStatus.ts` — specifically designed for cases where results exist but constraints could not be verified. Rendered with an amber badge to signal caution.

#### Layer 5: Contact count scoping

`extractContactCounts()` only counts contacts from artefacts that match delivered leads. It builds a set of delivered entity IDs from `delivery_summary.delivered_exact` and filters `lead_pack` artefacts against it. No inflated counts from non-delivered leads.

#### Layer 6: Receipt comparison (dev-only)

`ReceiptInlineLine` and `ReceiptComparison` components (gated behind `VITE_SHOW_RECEIPT_IN_BUBBLE=true` AND non-production) show backend receipt data alongside UI-derived counts, with amber warnings on mismatch.

#### Layer 7: Meta-trust interception

`isMetaTrustQuestion()` intercepts questions about accuracy/trust at the top of the chat handler and returns a canned honest-limitations response — preventing the system from making inflated claims about its own reliability.

---

## Appendix A: Additional Interaction Patterns

The following agent-system interaction patterns exist in the UI but fall outside the eight primary audit areas. They are included for completeness.

### A.1 Plan Approval Flow

The UI has a legacy plan approval workflow:
- `server/leadgen-plan.ts` — plan data structures and in-memory plan storage
- `server/plan-from-chat.ts` — generates plans from chat context
- `server/leadgen-executor.ts` — executes approved plans locally
- `GET /api/plan` — returns current plan for display
- `POST /api/plan/approve` — user approves plan, triggering execution

In the current architecture, plan approval has been largely superseded by the Supervisor delegation model (the `SUPERVISOR_OWNS_CLARIFY` path and direct `createSupervisorTask` flow). The legacy plan approval remains in code but is not the primary execution path.

### A.2 Sleeper Agent / Subconscious System

Background agent capabilities exist in the UI:
- **Server:** `server/lib/sleeper-agent.ts`, `server/routes/sleeper-agent.ts` — discovery search, event discovery, nightly update triggers
- **Server:** `server/cron/nightly-maintenance.ts` — scheduled background jobs
- **Client:** `client/src/features/subconscious/` — nudges UI, types, empty state component
- **Client:** `client/src/pages/nudges.tsx`, `client/src/pages/dev/sleeper-agent-monitor.tsx` — user-facing nudges page and dev monitor

API endpoints:
- `POST /api/sleeper-agent/search` — discovery search
- `POST /api/sleeper-agent/events` — event discovery
- `POST /api/sleeper-agent/nightly-update` — trigger nightly job

This provides limited background agent activity (discovery, event monitoring) but does not constitute the full autonomous continuous operation described in the V1 plan. The subconscious system generates nudges that appear in the UI but does not autonomously create or execute plans.

### A.3 Schema Evidence for Gap Claims

Verified against `shared/schema.ts`:
- **No learning tables found:** Grep for `learning_events`, `lead_performance`, `strategy_outcomes`, `evidence_patterns`, `segment_beliefs`, `agent_beliefs` returned zero matches.
- **No learning endpoints found:** Grep for `/api/learning` and `/api/beliefs` in `server/` returned zero matches.
- **WABS not imported:** No `wyshbone-behaviour` import found anywhere in the codebase.

These confirm the gap claims in Section 8 are evidence-based.

---

## 8. Gaps Relative to V1 Architecture Plan

The V1 architecture plan (`agent-architecture-4repos.md`) describes a 4-repo VALA system: UI (Face), Supervisor (Brain), Tower (Manager), WABS (Wisdom). The `WBS_ARCHITECTURE_PLAN.md` tracks 36 issues across 4 remediation phases. Below are the remaining gaps observed in the UI repo.

### 8.1 WABS Integration — NOT WIRED

| Plan says | Reality |
|-----------|---------|
| UI imports `wyshbone-behaviour` for tone, pacing, pushback, Socratic questioning | WABS is a standalone library with zero runtime dependencies. **Not imported by UI.** |
| WABS constrains plans based on learned ROI | No integration exists |
| WABS infers user frustration and adjusts tone | Not used in chat pipeline |

**Impact:** The agent has no behavioral constraint enforcement, no pushback on bad requests based on learned ROI, and no tone adaptation. This is the single largest architectural gap.

### 8.2 Learning System — NOT BUILT

| Plan says | Reality |
|-----------|---------|
| `lead_performance`, `strategy_outcomes`, `evidence_patterns`, `segment_beliefs` tables | None of these tables exist in the schema |
| `POST /api/learning/event` endpoint | Does not exist |
| `GET /api/beliefs` endpoint | Does not exist |
| Tower → UI learning event capture | Not implemented |
| Plans improve over time based on outcomes | Plans start from scratch each time |

**Impact:** The PLAN → ACT → EVALUATE → **ADAPT** → REPEAT loop is broken at ADAPT. No learning accumulation occurs.

### 8.3 Tower Integration — PARTIAL

| Plan says | Reality |
|-----------|---------|
| Systematic Tower event logging for all runs | Partial — `towerClient.ts` exists but usage is inconsistent |
| Tower callback webhook to UI | `POST /api/tower/webhook/evaluation` and `/alert` endpoints exist (Phase 4 complete) |
| Supervisor logs to Tower via HTTP POST | Fixed in Phase 1 (was console.log only) |
| Commercial effectiveness evaluation | Tower evaluates technical failures only, not commercial outcomes |

**Impact:** Tower evaluates execution quality but not business value. No lead quality scoring, conversion tracking, or ROI analysis.

### 8.4 Autonomous Continuous Operation — NOT IMPLEMENTED

| Plan says | Reality |
|-----------|---------|
| Daily/weekly sweeps for opportunities | Not implemented |
| Auto-generates plans based on learned ROI | Not implemented |
| Executes without manual approval for trusted strategies | Not implemented |
| Self-improves based on outcomes | Not implemented |

**Impact:** The system operates in request-response mode only. The VALA vision of continuous autonomous operation is entirely missing.

### 8.5 Clarify Session Persistence — FRAGILE

| Plan says | Reality |
|-----------|---------|
| Robust state management | Clarify sessions are in-memory Maps with 30-min TTL |
| Follow-up reuse across sessions | In-memory Maps with 60-min TTL |

**Impact:** Server restart loses all active clarify sessions and follow-up intent history. No database persistence for either.

### 8.6 Plan System Duplication — PARTIALLY RESOLVED

| Plan says | Reality |
|-----------|---------|
| Single plan execution path (Phase 3, item 3.1) | Phase 3 marked complete — UI-local execution chosen as primary |
| Remove duplicate plan logic | `leadGenPlans` table exists in schema but is unused; UI uses in-memory Maps |

**Impact:** Legacy plan table in schema is dead code. Acceptable but creates confusion for new developers.

### 8.7 Stubbed Supervisor Capabilities

Several Supervisor tool actions remain stubbed:
- Email sequence setup (returns mock campaign ID)
- Lead list save (simulates, returns mock ID)
- Monitor setup (returns mock monitor ID)
- Deep research (no implementation in Supervisor)

**Impact:** The UI presents these as available capabilities but the Supervisor cannot actually execute them end-to-end.

### 8.8 Evidence Quality Tracking — NOT SYSTEMATIC

| Plan says | Reality |
|-----------|---------|
| `evidence_patterns` table tracking reliability scores | Does not exist |
| Evidence quality scores feed into learning | No learning system exists |

**Impact:** The UI displays verification status (verified/unverified/weak) but does not track or learn from evidence quality patterns over time.

---

## Summary Matrix

| Area | Status | Maturity |
|------|--------|----------|
| Run Creation | Fully wired | High |
| Clarification Gate | Fully wired (dual-source) | High (complexity risk) |
| Artefact Display | Fully wired with bridging | High |
| Tower Verdict Display | Fully wired with shared resolver | High |
| Plan Visibility | Present but behind toggle | Medium |
| Result Summary | Fully wired with scoped counting | High |
| Honesty Rules | Multi-layer enforcement | High |
| WABS Integration | Not started | None |
| Learning System | Not started | None |
| Autonomous Operation | Not started | None |
| Tower Commercial Evaluation | Not started | None |
| Clarify Session Persistence | In-memory only | Low |

---

## Recommendations (prioritized)

1. **Persist clarify sessions to database** — eliminates fragility from server restarts.
2. **Begin WABS integration** — import `wyshbone-behaviour` and wire pushback + tone engines into the chat pipeline.
3. **Build learning event tables** — start with Option 2 (conversational learning) from the architecture plan.
4. **Add commercial metrics to Tower evaluation** — lead quality scoring, conversion tracking.
5. **Surface plan timeline in the default HumanSummary** — users should not need to open "Show details" to see that a replan occurred.
6. **Clean up dead schema** — remove unused `leadGenPlans` table or document it as deprecated.
7. **Address stubbed Supervisor tools** — either implement or remove from UI affordances to prevent user confusion.

---

*End of audit report.*
