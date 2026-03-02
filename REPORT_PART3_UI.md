# REPORT_PART3_UI.md — MVP Learning Plan: UI Surface Area Audit

**Date:** 2 March 2026
**Scope:** Wyshbone UI repo only (`client/`)
**Auditor:** Automated code audit

---

## 1. Executive Summary

- The UI already renders **Tower verdict badges**, **stop reasons**, **policy snapshots** (including `max_replans` and `applied_policies`), and basic **plan versioning** — all driven by AFR artefact polling, not a dedicated learning API.
- There are **no user-facing controls** to adjust knobs such as verification level, search budget, strictness, or replan ceiling; all configuration values are display-only or hardcoded.
- The phrases **"why this approach"** and **"behaviour note"** do not appear anywhere in the UI codebase; the closest equivalents are `why_short` in `PolicySnapshot` and `rationale` fields in `RunSummaryView`.
- Plan version history is **implicit** (derived from `plan_version` / `plan_update` artefacts) with no dedicated timeline or comparison view.
- The largest Part 3 gap is the **complete absence of a Learning Loop UI** — there is no surface for the system to show what it learned across runs, no belief/policy editor, and no mechanism for users to accept, reject, or tune learned rules.

---

## 2. What Learning-Related UI Features Exist Today

| Feature | File(s) | Description |
|---|---|---|
| PolicySnapshot display | `AgentWorkspace.tsx` (lines 460–568) | Shows `why_short`, `applied_policies[]`, `max_replans`, `max_replans_evidence` inside a "Learning" card within the Run Explanation dialog. |
| Tower Verdict Badge | `live-activity-panel.tsx` (`TowerVerdictBadge`, line 424) | Colour-coded badge showing accept / revise / change_plan / retry / abandon / stop with optional score %. |
| Stop Reason display | `live-activity-panel.tsx` (`RunSummaryView`, line 457; `TowerJudgementView`, line 714) and `RunResultBubble.tsx` (line 80) | Renders `stop_reason` / `halt_reason` in an orange callout. |
| Plan artefact viewer | `live-activity-panel.tsx` (`PlanArtefactView`, line 593) | Renders plan steps, constraints, assumptions, and `plan_version`. |
| Run Result Bubble | `RunResultBubble.tsx` | End-user summary of delivered vs requested leads, verification status, canonical status (PASS/PARTIAL/STOP/FAIL), tower verdict, and follow-up actions. |
| AFR dev viewer | `pages/dev/afr.tsx` | Developer-only page to browse runs, artefacts, and judgements. |
| Run Trace page | `pages/dev/run-trace.tsx` | Developer tool that reconstructs tower verdicts and lead evidence from artefact streams. |
| "What was learned" panel | `components/results/WhatWasLearnedPanel.tsx` | Renders active `RuleUpdate[]` items with rule text, confidence badge (high/med/low), evidence run count, and reason. Embedded in `UserResultsView.tsx`. Driven by AFR artefacts. |
| Rule Updates (type) | `types/afr.ts` (`RuleUpdate` interface, line 67) | Data type exists for rule CRUD (create/adjust/retire, confidence, evidence_run_ids). Used by `WhatWasLearnedPanel`. |
| My Goals Panel | `my-goals-panel.tsx` | Lists active goals and current plan status. |
| Plan Approval Panel | `plan-approval-panel.tsx` | User approves or regenerates a proposed plan before execution. |

---

## 3. What Is Missing for Part 3

1. **Learning Dashboard** — A `WhatWasLearnedPanel` exists and renders per-run rule updates with confidence badges, but there is no aggregate dashboard showing accumulated rules across multiple runs, belief adjustment trends, or confidence evolution over time.
2. **Rule/Belief Editor** — `RuleUpdate` type exists but there is no CRUD UI to view, accept, reject, or manually create rules.
3. **"Why this approach" explainer** — No component explains the agent's chosen strategy before execution; `why_short` is post-hoc only.
4. **"Behaviour note" annotations** — The concept does not exist in the UI. No mechanism to attach per-run behavioural observations visible to the user.
5. **Plan Version History / Diff** — `plan_version` is displayed as a badge (`Plan v2`) but there is no timeline, side-by-side diff, or version selector.
6. **User Knob Controls** — No UI controls for `strictness`, `search_budget`, `verification_level`, `replan_ceiling`, or `stop_early` toggle. All are either absent or display-only.
7. **Feedback Loop UI** — No thumbs-up/down, "this was wrong", or correction affordance on delivered results that feeds back into the learning system.
8. **Learning Signal Indicators** — No visual markers on results showing "this was used to update a rule" or "this run triggered a belief change."

---

## 4. Biggest User-Facing Risks

| Risk | Severity | Detail |
|---|---|---|
| Agent appears opaque | High | Without "why this approach" or a learning dashboard, users cannot understand or trust the agent's evolving behaviour. |
| No user override for knobs | High | If the agent learns a bad policy (e.g., `max_replans = 1`), the user has no way to reset or override it from the UI. |
| Silent policy application | Medium | Policies are applied server-side and only shown after the fact in a collapsible detail section; users may never see them. |
| Plan version confusion | Medium | Users see "Plan v2" but cannot see what changed from v1, leading to confusion about replanning decisions. |
| Stop reasons may be cryptic | Medium | Stop reasons like `artefacts_unavailable`, `tower_stopped`, `run_halted` are shown verbatim with no user-friendly explanation. |

---

## 5. Where Learning Signals Are Displayed

### Components That Display Learning-Adjacent Data

#### 5.1 "why this approach" (closest: `why_short`)

| File | Component | Props/State | Driven By |
|---|---|---|---|
| `client/src/components/agent/AgentWorkspace.tsx` | `RunExplanationDialog` (inner) | `policySnapshot.why_short` (string) | AFR artefacts (`policy_applications` / `policy_application_snapshot` type) |
| `client/src/components/results/RunResultBubble.tsx` | `RunResultBubble` | `policySnapshot?.why_short` via `RunResultBubbleProps` | Artefacts API (`/api/afr/artefacts`) |

**Verdict:** Partial coverage. Only post-hoc. No pre-execution "why this approach" exists.

#### 5.2 "behaviour note"

**Not found.** No component uses or renders anything labeled "behaviour note" or "behavior note." The closest is `rationale` in `RunSummaryView` and `TowerJudgementView` which are Tower-generated, not user annotations.

#### 5.3 "policy/knobs"

| File | Component | Props/State | Driven By |
|---|---|---|---|
| `client/src/components/agent/AgentWorkspace.tsx` | `RunExplanationDialog` (Learning section) | `policySnapshot.applied_policies[]` (array of `AppliedPolicy`), `policySnapshot.max_replans`, `policySnapshot.max_replans_evidence` | AFR artefacts |
| `client/src/components/results/RunResultBubble.tsx` | `RunResultBubble` | `policySnapshot` prop (type `PolicySnapshot`) | Artefacts API |

#### 5.4 "Tower verdict badges"

| File | Component | Props/State | Driven By |
|---|---|---|---|
| `client/src/components/live-activity-panel.tsx` | `TowerVerdictBadge` (line 424) | `verdict: string`, `score?: number \| null` | AFR artefact of type `tower_judgement` or `run_summary` containing `verdict` field |
| `client/src/components/live-activity-panel.tsx` | `RunSummaryView` (line 448) | `payload` → parsed `.verdict`, `.score` | AFR artefacts |
| `client/src/components/live-activity-panel.tsx` | `TowerJudgementView` (line 709) | `payload` → parsed `.verdict`, `.score` | AFR artefacts |
| `client/src/components/results/RunResultBubble.tsx` | `RunResultBubble` | `towerVerdict?: string`, `towerProxyUsed?: string`, `towerStopTimePredicate?: boolean` | Artefacts API, assembled in `chat.tsx` finalizeRunUI |
| `client/src/pages/dev/run-trace.tsx` | `RunTracePage` | `tower_verdict` from artefact analysis (line 57) | AFR artefacts |

#### 5.5 "stop reasons"

| File | Component | Props/State | Driven By |
|---|---|---|---|
| `client/src/components/live-activity-panel.tsx` | `RunSummaryView` (line 457) | `parsed.stop_reason \|\| parsed.halt_reason` | AFR artefacts (`run_summary` type) |
| `client/src/components/live-activity-panel.tsx` | `TowerJudgementView` (line 714) | Same pattern | AFR artefacts (`tower_judgement` type) |
| `client/src/components/results/RunResultBubble.tsx` | `RunResultBubble` (line 80) | `deliverySummary.stop_reason` | Assembled in `chat.tsx` from artefact data |
| `client/src/utils/deliveryStatus.ts` | `resolveCanonicalStatus` | `input.stop_reason` → `CanonicalDeliveryStatus` | Called by `RunResultBubble` |

#### 5.6 "plan version history"

| File | Component | Props/State | Driven By |
|---|---|---|---|
| `client/src/components/live-activity-panel.tsx` | `PlanArtefactView` (line 593) | `parsed.version \|\| parsed.plan_version` → displayed as badge `Plan v{N}` | AFR artefacts (`plan` / `plan_update` type) |
| `client/src/components/live-activity-panel.tsx` | Sequence completion view (line 1541) | `planVersion` derived from presence of `plan_update` artefact | AFR artefacts |
| `client/src/pages/dev/afr.tsx` | AFR dev page (line 747) | `parsed.version \|\| parsed.plan_version` | AFR artefacts |

**Verdict:** Version number is shown; no history list, no diff, no rollback.

---

## 6. Inputs and Overrides

### 6.1 UI Controls That Act as Configuration Overrides

| Control Concept | Present? | Location | Wiring | Backend Endpoint |
|---|---|---|---|---|
| "Reset" (cache/state) | Partial | `client/src/main.tsx` (line 18) | Query param `?reset=1` clears `localStorage` | None (client-only) |
| "Reset" (task progress) | Dev-only | `client/src/utils/taskEvaluationReset.ts` | In-memory script, no UI button | None (client-only `localStorage`) |
| "Be stricter" | **No** | — | — | — |
| "Be faster" | **No** | — | — | — |
| "Change verification level" | **No** | — | — | — |
| "Change search budget" | **No** | — | — | — |
| "Change replan ceiling" | **No** | `DEFAULT_MAX_REPLANS = 3` is hardcoded in `RunResultBubble.tsx` (line 17) | Constant, not user-modifiable | — |
| Google query mode toggle | Yes | `client/src/components/GoogleQueryModeToggle.tsx` | Local state toggle, unclear backend binding | — |
| Deep research intensity | Type only | `client/src/types/agent-tools.ts` (`DeepResearchParams.intensity`) | `'standard' \| 'ultra'` — no UI toggle found | Passed to `/api/chat` in message metadata |
| Plan approve / regenerate | Yes | `client/src/contexts/PlanContext.tsx` | `apiRequest("POST", "/api/plan/approve")` | `POST /api/plan/approve` |

### 6.2 Summary

There are **zero user-accessible controls** for tuning agent behaviour knobs (strictness, budget, verification depth, replan ceiling). The only user-facing override is plan approval/rejection. All other knobs are either hardcoded constants or backend-only.

---

## 7. Evidence of Existing "Knob" Concepts in UI

| Term | File | Line(s) | Description |
|---|---|---|---|
| `policy` | `client/src/components/results/RunResultBubble.tsx` | 10–24 | `AppliedPolicy` and `PolicySnapshot` interfaces defining `policy_id`, `rule_text`, `source`, `why_short`, `max_replans` |
| `policy` | `client/src/components/agent/AgentWorkspace.tsx` | 46–78 | `extractPolicySnapshot()` parses `policy_applications` and `policy_application_snapshot` artefact types |
| `budget` | `client/src/types/afr.ts` | 3 | `GoalWorth.budget` field (numeric) |
| `budget` | `client/src/components/results/CvlArtefactViews.tsx` | 28–29 | `budget_used` / `budget_total` displayed for CVL verification tasks |
| `budget` | `server/lib/decideChatMode.ts` | 414 | Listed as a "subjective quality word" — triggers clarification if user says it |
| `max_replans` | `client/src/components/results/RunResultBubble.tsx` | 17, 22 | `DEFAULT_MAX_REPLANS = 3`; `PolicySnapshot.max_replans` |
| `max_replans` | `client/src/components/agent/AgentWorkspace.tsx` | 537–539 | Displayed with "(learned)" indicator when differs from default |
| `stop_policy_v1` | `client/src/pages/chat.tsx` | 484 | Extracted from `policy_application_snapshot` payload, presence noted but not rendered to user |
| `intensity` | `client/src/types/agent-tools.ts` | 58 | `DeepResearchParams.intensity: 'standard' \| 'ultra'` — depth knob for research |
| `verification_depth` | — | — | Term not found. Closest: `intensity` and `budget_used/total` |
| `strictness` | — | — | Term not found in code. Concept partially captured by policy rules. |
| `knob` | — | — | Term not found in UI code. Appears only in `attached_assets/` documentation files. |
| `replan ceiling` | — | — | Phrase not found. Concept exists as `max_replans`. |
| `stop early` | `client/src/pages/chat.tsx` | 484 | `stop_policy_v1` extracted but not surfaced to user. |

---

## 8. Data Flow Map

```
┌──────────────┐
│  User types  │
│  in ChatPage │  client/src/pages/chat.tsx
└──────┬───────┘
       │ POST /api/chat (SSE stream)
       ▼
┌──────────────┐
│  server/     │  server/routes.ts → handleChatStream()
│  routes.ts   │  Creates Run ID, authenticates user
└──────┬───────┘
       │ decideChatMode()
       ▼
┌──────────────────────┐
│ server/lib/          │
│ decideChatMode.ts    │  Returns: CHAT_INFO | CLARIFY_FOR_RUN | RUN_SUPERVISOR
└──────┬───────────────┘
       │
       ├─── CHAT_INFO ───► GPT-5 streaming reply → SSE → ChatPage renders message
       │
       ├─── CLARIFY_FOR_RUN ──► SSE type:'clarify_for_run' → ChatPage renders clarification UI
       │                        server/lib/clarifySession.ts handles follow-ups
       │
       └─── RUN_SUPERVISOR ──► createSupervisorTask()
                                server/supabase-client.ts → inserts into supervisor_tasks table
                                │
                                ▼
                          ┌─────────────────┐
                          │ External         │
                          │ Supervisor       │  (separate service, not in this repo)
                          │ + Tower          │  Executes tools, produces artefacts
                          └────────┬────────┘
                                   │ Writes artefacts to DB
                                   ▼
                          ┌─────────────────┐
                          │ AFR Polling      │
                          │ (client-side)    │
                          └────────┬────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
    GET /api/afr/stream   GET /api/afr/artefacts   GET /api/afr/runs/{id}
    (poll for completion)  (fetch results)          (fetch run bundle)
              │                    │                    │
              └────────────────────┼────────────────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │ finalizeRunUI()  │  client/src/pages/chat.tsx
                          │ Assembles:       │  - DeliverySummary
                          │                  │  - PolicySnapshot
                          │                  │  - TowerVerdict
                          │                  │  - VerificationSummary
                          └────────┬────────┘
                                   │
                                   ▼
                          ┌─────────────────────────────────┐
                          │ RunResultBubble                  │
                          │ client/src/components/results/   │
                          │ RunResultBubble.tsx               │
                          │                                   │
                          │ Renders: status badge, leads,     │
                          │ tower verdict, stop reason,       │
                          │ policy snapshot, follow-up actions │
                          └───────────────────────────────────┘
```

### Backend Endpoints Used (as found in code)

| Endpoint | Method | Purpose | Called From |
|---|---|---|---|
| `/api/chat` | POST | SSE stream for chat + run orchestration | `chat.tsx` line 1566 |
| `/api/afr/stream` | GET | Poll for supervisor task completion | `chat.tsx` line 871 |
| `/api/afr/artefacts` | GET | Fetch structured artefacts for a run | `chat.tsx` line 549 |
| `/api/afr/runs` | GET | List recent runs | `chat.tsx` line 1150, `afr-data.ts` line 20 |
| `/api/afr/runs/{id}` | GET | Fetch single run bundle (decisions, verdicts, outcomes) | `afr-data.ts` line 54 |
| `/api/afr/runs/{id}/artefacts` | GET | Fetch artefacts for a specific run | `afr.tsx` line 622 |
| `/api/afr/run-diagnostic` | GET | Diagnostic info for a run | `chat.tsx` line 123 |
| `/api/afr/rules` | GET | List learned rules | `afr-data.ts` line 80 |
| `/api/afr/rules/{id}` | GET | Fetch single rule | `afr-data.ts` line 98 |
| `/api/afr/judgements` | GET | Fetch tower judgements | `afr.tsx` line 1021 |
| `/api/plan/approve` | POST | User approves a proposed plan | `PlanContext.tsx` line 106 |
| `/api/plan/start` | POST | Start plan generation | `PlanContext.tsx` line 67 |
| `/api/plan-status` | GET | Poll plan execution status | `PlanExecutionController.tsx` line 37 |
| `/api/supervisor/request-judgement` | POST | Trigger Tower evaluation | `supervisor.ts` (server) |

---

## 9. Gaps vs Part 3 Spec

| Part 3 Requirement | Present Now? | What's Missing | Best Repo to Implement |
|---|---|---|---|
| "Why this approach" pre-execution explainer | ❌ No | No component explains strategy before the run starts | UI + Supervisor |
| Behaviour notes on runs | ❌ No | No annotation system for behavioural observations | UI + Supervisor |
| Policy/knob display | ✅ Partial | Display-only; no edit/override capability | UI |
| Tower verdict badges | ✅ Yes | Fully functional with colour coding and score % | — (done) |
| Stop reasons rendered | ✅ Yes | Rendered but sometimes with raw codes, no user-friendly mapping | UI |
| Plan version history view | ⚠️ Minimal | Version badge shown; no timeline, diff, or comparison | UI |
| User knob: "be stricter" | ❌ No | No control exists | UI + Supervisor |
| User knob: "be faster" | ❌ No | No control exists | UI + Supervisor |
| User knob: verification level | ❌ No | `intensity` type exists but no UI toggle | UI |
| User knob: search budget | ❌ No | `GoalWorth.budget` type exists but no UI control | UI + Supervisor |
| User knob: replan ceiling | ❌ No | `max_replans` is display-only (default 3, hardcoded) | UI + Supervisor |
| User knob: stop early toggle | ❌ No | `stop_policy_v1` is extracted but never surfaced | UI + Supervisor |
| Learning dashboard | ⚠️ Partial | `WhatWasLearnedPanel` renders per-run rule updates; no aggregate cross-run dashboard exists | UI |
| Feedback loop (thumbs up/down) | ❌ No | No mechanism to feed user corrections back to learning | UI + Supervisor + Tower |
| Learned rule accept/reject | ❌ No | Rules are read-only in the codebase | UI + Tower |
| Cross-run learning signals | ❌ No | No indicator showing "this run changed a rule" | UI + Tower |
| Belief/confidence evolution | ❌ No | `RuleUpdate.confidence` exists in type but never visualised | UI |

---

## 10. Appendix — Relevant Files

| File Path | Why It Matters |
|---|---|
| `client/src/pages/chat.tsx` | Main chat page; orchestrates SSE streaming, AFR polling, artefact assembly, and `finalizeRunUI()` which builds the data fed to RunResultBubble. |
| `client/src/components/results/RunResultBubble.tsx` | Primary end-user result display; renders status, leads, tower verdict, policy snapshot, stop reasons, and follow-up actions. Defines `PolicySnapshot` and `AppliedPolicy` interfaces. |
| `client/src/components/agent/AgentWorkspace.tsx` | Agent workspace with "Explain last run" dialog; contains `extractPolicySnapshot()` and the "Learning" card that shows `why_short`, `max_replans`, and applied policies. |
| `client/src/components/live-activity-panel.tsx` | 3900+ line panel rendering real-time AFR events; contains `TowerVerdictBadge`, `RunSummaryView`, `TowerJudgementView`, `PlanArtefactView`, `DeliverySummaryView`. |
| `client/src/types/afr.ts` | Core AFR type definitions: `Run`, `GoalWorth`, `Decision`, `StopCondition`, `TowerVerdict`, `RuleUpdate`, `RunBundle`. |
| `client/src/utils/deliveryStatus.ts` | Canonical status resolution (`PASS`/`PARTIAL`/`STOP`/`FAIL`/`UNAVAILABLE`/`ACCEPT_WITH_UNVERIFIED`) with stop reason parsing. |
| `client/src/contexts/PlanContext.tsx` | Plan lifecycle management: start, approve, regenerate. Calls `/api/plan/start` and `/api/plan/approve`. |
| `client/src/contexts/PlanExecutionController.tsx` | Polls `/api/plan-status` to track plan execution progress. |
| `client/src/components/plan-approval-panel.tsx` | UI for user to review and approve agent-generated plans before execution. |
| `client/src/components/my-goals-panel.tsx` | Displays active goals and their current plan status. |
| `client/src/components/tower/WhatJustHappenedPanel.tsx` | "Recent Activity" sheet showing system events (syncs, AI discoveries, user actions). Not Tower-specific despite the filename. |
| `client/src/pages/dev/afr.tsx` | Developer-only AFR browser; lists runs, shows artefacts, judgements. Contains rule-fetching code but no rule editing UI. |
| `client/src/pages/dev/run-trace.tsx` | Developer diagnostic page; reconstructs run timeline, tower verdicts, and lead evidence from artefacts. |
| `client/src/lib/afr-data.ts` | AFR data-fetching utilities: `fetchRuns()`, `fetchRunBundle()`, `fetchRules()`, `fetchRule()`. |
| `client/src/components/results/WhatWasLearnedPanel.tsx` | Renders per-run learned rules with confidence badges and evidence counts. Consumed by `UserResultsView.tsx`. The only component that directly visualises `RuleUpdate` data. |
| `client/src/components/results/CvlArtefactViews.tsx` | Renders constraint extraction, capability checks, verification summaries, and lead verification entries. Shows `budget_used` / `budget_total`. |
| `client/src/components/results/FactoryTimelineView.tsx` | Renders factory simulation timeline; contains `RunConfigurationView` with constraint display (e.g., "Max scrap %"). |
| `client/src/types/agent-tools.ts` | Defines `DeepResearchParams` including `intensity: 'standard' \| 'ultra'` (unused in UI controls). |
| `client/src/utils/taskEvaluationReset.ts` | Dev utility for resetting task progress evaluation; the only "reset" mechanism in the UI codebase. |
| `client/src/components/results/UserResultsView.tsx` | Defines `DeliverySummary` and `DeliveryLead` types; renders lead cards with verification status. |
| `client/src/api/towerClient.ts` | Client for Tower API communication. |
| `client/src/components/GoogleQueryModeToggle.tsx` | Toggle between Google search modes — only existing "knob-like" UI control. |
| `shared/schema.ts` | Drizzle ORM schema; includes `tower_verdict` field definitions used across the stack. |
| `server/lib/decideChatMode.ts` | Intent routing logic; classifies user input and enforces runnability rules. Lists "budget" as a subjective word. |
| `server/routes/afr.ts` | AFR API routes serving runs, artefacts, judgements, and rules to the frontend. |
| `server/routes/supervisor.ts` | Supervisor routes including `request-judgement` endpoint for Tower evaluation. |

---

*End of report.*
