# Wyshbone 3-Stage Architecture Audit

**Date:** 2026-03-08
**Method:** Forensic code analysis — evidence-based, no speculation

---

## Stage 1 — Chat Interpretation Upgrade

**Goal:** Convert messy user language into clean structured missions.

---

### Stage 1 — Implemented

#### 1. Fixed Constraint Taxonomy (Partial — see notes below)
- **Files:** `server/lib/clarifySession.ts` (line 23), `server/lib/decideChatMode.ts` (lines 289–424)
- **Behaviour:** `PendingConstraintDescriptor` defines five constraint types:
  - `subjective` — vague quality terms ("best", "lively", "nicest")
  - `time_predicate` — "opened in the last 6 months"
  - `unverifiable_constraint` — fallback for constraints that cannot be machine-checked
  - `numeric_ambiguity` — "some", "few", "several"
  - `relationship_predicate` — "that work with", "owned by", "run by"
- **Also:** `extractAttributeConstraints()` in `decideChatMode.ts` (line 378) handles concrete attribute constraints ("beer garden", "live music", "disabled access") — matched via regex against a known set of ~30 attribute phrases.
- **Also:** Semantic constraint detection via `hasSemanticConstraint()` (line 298) catches relational clauses ("that work with…", "which provide…").

#### 2. Two-Pass Extraction (Location Only)
- **Files:** `server/lib/decideChatMode.ts` (lines 250–287)
- **Behaviour:** `extractEntityAndLocation()` uses two passes:
  - **Pass 1:** Preposition-based regex (`LOCATION_PATTERN`: `in/near/around X`).
  - **Pass 2:** If no location found, `extractTrailingKnownLocation()` greedily matches the entity-type tail against `KNOWN_LOCATIONS` (~400+ entries built from `server/data/` JSON files + hardcoded cities).
- **Note:** This is a two-pass *regex* extraction, not a two-pass *LLM* extraction. Both passes are deterministic pattern matching.

#### 3. Deterministic Schema Validation Layer
- **Files:** `server/lib/decideChatMode.ts` (lines 461–487)
- **Function:** `isRunnable()` acts as a validation gate. It rejects invalid structures by checking:
  - Entity type present and non-empty
  - Location present and non-empty
  - No unresolved semantic constraints
  - No unresolved time predicates (unless explicit proxy provided)
  - Location exists in `KNOWN_LOCATIONS` (via `isKnownLocation()`)
  - Entity type contains a concrete business noun (via `hasConcreteEntityNoun()`, 150+ noun patterns)
  - No subjective modifiers remain (via `hasSubjectiveModifiers()`)
  - No numeric ambiguity remains (via `hasNumericAmbiguity()`)
  - No unresolved relationship predicates
- **Behaviour:** Invalid inputs route to `CLARIFY_FOR_RUN`; valid inputs route to `RUN_SUPERVISOR`.

#### 4. Regex Used Only for Cleanup / Normalization
- **Files:** `server/lib/decideChatMode.ts` (lines 99–148, 289–403)
- **Behaviour:** Regex is used for:
  - Detecting entity-finding verbs (`ENTITY_FINDING_VERBS`)
  - Extracting locations and entity types from messages
  - Detecting semantic/relationship/time constraints
  - Extracting attribute constraints
  - Sanitizing business types (stripping quantifiers, articles)
- **Assessment:** Regex IS used for interpretation, not just cleanup. The entire `decideChatMode()` function is regex-driven pattern matching for intent classification. There is no LLM involved in the primary extraction path.

#### 5. Structured Mission Object
- **Files:** `server/lib/clarifySession.ts` (lines 30–46), `server/lib/decideChatMode.ts` (lines 6–12, 489–530)
- **Structures produced:**
  - `ChatModeDecision`: `{ mode, reason, entityType?, location?, requestedCount? }`
  - `ClarifySession`: `{ entity_type, location, semantic_constraint, constraint_contract, pending_constraints[], answers, clarified_request_text }`
  - `ClarifyStatePayload`: `{ entityType, location, semanticConstraint, count, missingFields, status, pendingQuestions }`
- **Assessment:** The system produces structured objects with entity, location, and constraints. However, the shape differs from the expected schema (no `mission_mode` field, no typed constraint objects with `operator`/`value` fields like `{ type: "text_compare", field: "name", operator: "contains", value: "swan" }`).

---

### Stage 1 — Partial

#### 1. Fixed Constraint Taxonomy — Incomplete Coverage
- **What exists:** 5 constraint types (`subjective`, `time_predicate`, `unverifiable_constraint`, `numeric_ambiguity`, `relationship_predicate`) plus attribute extraction.
- **What's missing from the expected taxonomy:**
  - `entity/category discovery` — not a named type
  - `location constraint` — handled implicitly (location is a top-level field, not a typed constraint)
  - `text_compare` — no operator-based text comparison constraints
  - `category/class check` — no explicit type
  - `attribute/property check` — attributes are extracted as string arrays, not typed constraint objects
  - `relationship check` — exists as `relationship_predicate` but without operator semantics
  - `time/date` — exists as `time_predicate` but without structured date/range fields
  - `numeric/range` — `numeric_ambiguity` resolves vagueness ("some" → 5) but doesn't support range operators
  - `website_evidence` — no constraint type
  - `contact_extraction` — no constraint type (contact finding is a separate tool, not a constraint)
  - `status_check` — no constraint type
  - `ranking` — no constraint type

#### 2. Two-Pass LLM Extraction — Not LLM-Based
- **What exists:** Two-pass regex extraction for location. Single-pass regex for entity type.
- **What's missing:** Neither pass uses an LLM. The extraction is entirely deterministic regex. There is a `classifyMessage()` LLM call in `server/lib/classifyMessage.ts`, but it is used as a secondary routing gate (post-`decideChatMode`), not for structured field extraction.

#### 3. Structured Mission Object — Shape Mismatch
- **What exists:** `ClarifySession` object with entity, location, semantic constraints, answers.
- **What's missing:**
  - No `mission_mode` field (no "research_now" vs other modes)
  - No typed constraint array with `{ type, field, operator, value }` objects
  - Constraints are stored as free-text strings and descriptors, not as a normalized schema
  - No explicit mapping from user language to a fixed constraint schema with operators

---

### Stage 1 — Missing

#### 1. Two-Pass LLM Extraction
- **Pass 1 (extract meaning):** Does not exist. No LLM is used to extract semantic meaning from the user message.
- **Pass 2 (map to schema):** Does not exist. No LLM maps extracted meaning to a fixed constraint schema.
- The entire extraction pipeline is regex-based.

#### 2. Operator-Based Constraint Schema
- No constraint objects with `operator` fields (`contains`, `equals`, `greater_than`, etc.).
- No `field` specifier on constraints (e.g., `field: "name"`).
- Constraints are identified by type but not structured with comparison operators.

#### 3. `mission_mode` Field
- No concept of `mission_mode` ("research_now", "monitor", etc.) exists in the structured output.
- The 3-way router outputs a `mode` (`CHAT_INFO`, `CLARIFY_FOR_RUN`, `RUN_SUPERVISOR`) but this is a routing decision, not a mission execution mode.

---

## Stage 2 — Planner Upgrade

**Goal:** Deterministic execution plans from structured missions.

---

### Stage 2 — Implemented

#### 1. Planner Reads Structured Mission Object
- **Files:** `server/routes.ts` (lines 1328, 1601, 1697, 1811, 1951 — multiple `createSupervisorTask` call sites), `server/lib/supervisorClient.ts`
- **Behaviour:** When `decideChatMode` returns `RUN_SUPERVISOR` (or a clarify session resolves to `run_supervisor`), the system constructs a `requestData` object containing `search_query` (entity type + location), `scenario`, `constraints`, and `google_query_mode`, then creates a `supervisor_task` in the database. The Supervisor service reads this structured payload.

#### 2. Constraint → Strategy Mapping (Partial)
- **Files:** `server/lib/clarifySession.ts` (lines 373–611)
- **Behaviour:** Each constraint type maps to a fixed set of user-facing options that resolve into a strategy:
  - `subjective` → options: "lively", "quiet", "cosy", "late-night", "live music", "good for food", "beer garden", "dog friendly"
  - `numeric_ambiguity` → options: "3", "5", "10", "all"
  - `relationship_predicate` → options: "official sources only", "best-effort public web", "require 2+ sources", "skip if uncertain"
  - `time_predicate` → requires explicit proxy selection (e.g., "use Companies House data", "use first review date")
- **Assessment:** The mapping is from constraint → resolution options, not from constraint → tool/strategy selection. The chosen option is stored in `answers` and appended to `semantic_constraint`, but does not deterministically select which tools to run.

#### 3. Plan Artefact Persistence
- **Files:** `server/lib/activity-logger.ts` (lines 372, 416, 452 — `persistClarifyGateArtefact`, `persistClarifyResolutionArtefact`, `persistIntentPreviewArtefact`), `server/routes.ts` (lines 1552, 1853, 2189, 2203)
- **Artefacts persisted:**
  - `clarify_gate` — records what triggered clarification (constraint type, pending questions)
  - `clarify_resolution` — records the resolved constraint type and chosen strategy
  - `run_configuration` — records the scenario and constraints used for the run
  - `intent_preview` (diagnostic) — records best-effort parsed intent fields
- **Assessment:** These artefacts record *what* was decided and *which* constraints were resolved. They partially satisfy the "plan artefact explaining why/which constraints/expected outputs" requirement.

#### 4. Tool Selection via ToolRegistry
- **Files:** `server/lib/agent-kernel.ts` (lines 171–250)
- **Behaviour:** The `ToolRegistry` maps action names to execution functions:
  - `SEARCH_PLACES` → Google Places API search
  - `DEEP_RESEARCH` → LLM web research
  - `BATCH_CONTACT_FINDER` → contact discovery pipeline
- **Assessment:** Tool selection in the MEGA kernel is LLM-driven (GPT chooses which tool to invoke), not deterministic from constraints. The Supervisor path delegates to a background executor which runs a fixed pipeline (places search → enrichment → contacts), not a constraint-driven plan.

---

### Stage 2 — Partial

#### 1. Deterministic Tool Selection
- **What exists:** A `ToolRegistry` with fixed tool implementations. The Supervisor runs a fixed pipeline.
- **What's missing:** No constraint-to-tool mapping where specific constraints deterministically select which tools to run. The Supervisor pipeline is always the same: search places → enrich → (optionally) find contacts.

#### 2. Plan Artefact — "Why This Plan"
- **What exists:** Artefacts record constraint types and chosen strategies.
- **What's missing:** No explicit "why this plan" explanation is generated at plan time. The "Run Explanation" feature (`client/src/components/agent/AgentWorkspace.tsx`) generates explanations *after* execution, not before.

#### 3. Plan Artefact — "Expected Outputs"
- **What exists:** `expected_signals` are defined in `server/deepResearch.ts` (lines 128–131) for deep research runs.
- **What's missing:** Expected outputs are hardcoded heuristics ("Outputs a structured list of venues"), not derived from the specific constraints of the mission.

---

### Stage 2 — Missing

#### 1. Deterministic Constraint → Strategy → Tool Pipeline
- No system exists where a specific constraint type (e.g., `text_compare` on `name`) deterministically selects a search strategy and tool chain.
- The planner does not generate a step-by-step execution plan before running.

#### 2. Pre-Execution Plan Document
- No "plan document" is generated before execution that explains what will happen and why.
- The AFR decisions are logged during/after execution, not planned beforehand.

---

## Stage 3 — Strategy Layer

**Goal:** Agent-level behaviour with goals, strategies, success/failure, and Tower judgement.

---

### Stage 3 — Implemented

#### 1. Goal vs Strategy Distinction
- **Files:** `client/src/types/afr.ts` (lines 1–32)
- **Behaviour:**
  - **Goal** = `Run` object: `{ goal_summary, goal_worth: { value, budget, time_horizon, risk }, status }`
  - **Strategy** = `Decision` object: `{ title, choice, why, options_considered[] }`
  - Each Run contains multiple Decisions.
- **Assessment:** Clear separation exists at the type level. Goals and decisions are persisted in the database (`agent_runs`, `artefacts` tables).

#### 2. Explicit Strategies Stored
- **Files:** `server/deepResearch.ts` (lines 118–139), `server/routes/afr.ts` (lines 149–282)
- **Behaviour:** Decisions are stored as artefacts with `choice` and `why` fields. Example: `{ choice: "Use deep research tool", why: "User asked for research; deep research chosen as fastest first-pass" }`.
- **Persistence:** Stored in the `artefacts` table, surfaced via `/api/afr/runs/:id` endpoint.

#### 3. Success / Failure Conditions
- **Files:** `server/deepResearch.ts` (lines 128–135), `client/src/types/afr.ts` (lines 34–46)
- **Behaviour:**
  - `ExpectedSignal`: metrics indicating success (e.g., "Outputs a structured list of venues/leads")
  - `StopCondition`: failure boundaries (e.g., "If output is only an essay with no structured entities, verdict=REVISE")
  - `Outcome`: `{ outcome_summary, status: 'success' | 'partial' | 'failed', metrics_json }`

#### 4. Ability to Continue / Switch / Stop
- **Files:** `client/src/types/afr.ts` (lines 17, 60–65)
- **Behaviour:**
  - `Run.verdict`: `'continue' | 'revise' | 'abandon'`
  - `TowerVerdict`: `{ verdict: 'continue' | 'revise' | 'abandon', reason }`
- **Assessment:** The three-state model is fully defined in types and used in the `analyzeOutputForAfr()` function (deepResearch.ts line 110) which sets `continue` or `revise` based on output quality heuristics.

#### 5. Tower Judging Strategy Rationality
- **Files:** `server/routes/supervisor.ts` (lines 1–112), `client/src/utils/towerVerdictResolver.ts` (lines 1–148)
- **Behaviour:**
  - **Server-side:** `POST /supervisor/request-judgement` triggers Tower evaluation. It reads the `leads_list` artefact, computes a delivery ratio (delivered/requested), and produces a verdict:
    - ≥80% delivered → `accept`
    - ≥50% delivered → `revise`
    - <50% delivered → `reject`
  - Verdict is persisted as a `tower_judgement` artefact with confidence score.
  - **Client-side:** `resolveAuthoritativeTowerVerdict()` processes multiple tower judgement artefacts, prioritizes `final_delivery` phase verdicts, and computes aggregate pass/fail/mixed status.
  - **Also:** `isTowerTrustFailure()` determines if the overall verdict represents a trust failure.

#### 6. Rule Updates / Learned Strategies
- **Files:** `client/src/types/afr.ts` (lines 67–80), `server/routes/afr.ts`, `server/storage.ts`
- **Behaviour:** `RuleUpdate` type with `{ rule_text, scope, confidence, status, update_type, reason, evidence_run_ids, source }`. Supports create/adjust/retire lifecycle. Surfaced in UI via "What Was Learned" panel.

---

### Stage 3 — Partial

#### 1. Tower Rationality Assessment — Heuristic-Only
- **What exists:** Delivery ratio-based verdicts (accept/revise/reject).
- **What's missing:** No deep rationality assessment of *whether the strategy was appropriate* given the goal and constraints. The Tower checks quantity delivered, not quality or strategic fit.

#### 2. Strategy Switching at Runtime
- **What exists:** Verdict types support `revise` and `abandon`. The `analyzeOutputForAfr()` function can return `revise`.
- **What's missing:** No runtime mechanism to actually switch strategies mid-execution. When `revise` is returned, it is recorded as an artefact but does not trigger re-planning or alternative tool selection. The agent does not autonomously re-run with a different approach.

#### 3. Goal Worth Assessment
- **What exists:** `GoalWorth` type defined: `{ value, budget, time_horizon, risk }`.
- **What's missing:** `goal_worth` is always `null` in the `analyzeOutputForAfr()` function (line 119). No mechanism populates it with real values based on user input or business logic.

---

### Stage 3 — Missing

#### 1. Autonomous Strategy Switching
- No code exists that, upon receiving a `revise` verdict, automatically generates an alternative strategy and re-executes.
- The `revise` → re-plan → re-execute loop is not implemented.

#### 2. Goal Worth Population
- No mechanism to calculate or input goal worth (value, budget, time horizon, risk) from user context.

#### 3. Tower Evaluating Strategic Rationality (Beyond Quantity)
- Tower only checks delivery counts. No assessment of:
  - Whether the chosen strategy was the best option
  - Whether constraints were properly addressed
  - Whether the output quality matches the goal

---

## Accidental / Unplanned Pieces

#### 1. CLASSIFY_GATE (Post-Router Secondary Classification)
- **File:** `server/lib/classifyMessage.ts`
- **Behaviour:** After `decideChatMode` returns `CHAT_INFO`, a secondary LLM-based classifier catches monitoring/scheduling intents that regex missed. Uses two-tier classification: fast regex for monitoring verbs, then LLM fallback.
- **Relevance:** This is an embryonic "Pass 2" LLM extraction — but it only reclassifies routing, not structured field extraction.

#### 2. Agent Flight Recorder (AFR) as Forensic Audit Trail
- **Files:** `server/lib/activity-logger.ts`, `server/routes/afr.ts`, `client/src/types/afr.ts`
- **Behaviour:** Comprehensive logging of every decision, artefact, and outcome. Not part of the 3-stage plan but provides the infrastructure needed for Tower judgements and strategy tracking.

#### 3. Deep Research Output Analysis
- **File:** `server/deepResearch.ts` (lines 91–139)
- **Behaviour:** `analyzeOutputForAfr()` performs post-hoc quality analysis of research output using structural heuristics (bullet points, numbered lists, entity markers). This is a primitive "Tower self-assessment" built into the tool itself.

#### 4. Clarify Constraint Contract Pipeline
- **Files:** `server/lib/clarifySession.ts`, `server/lib/decideChatMode.ts`
- **Behaviour:** The multi-turn clarification system with constraint contracts, pending constraint queues, and resolution tracking is a sophisticated pre-execution validation layer that wasn't explicitly in the 3-stage plan but serves Stage 1's validation goals.

#### 5. Follow-Up Reuse System
- **File:** `server/routes.ts` (documented in `replit.md`)
- **Behaviour:** `saveLastSuccessfulIntent()` / `detectFollowupReuse()` allows "now do York" type follow-ups by reusing prior structured intent. This is an implicit memory system that bridges executions.

---

## Completion Summary

| Stage | Estimated Completion | Notes |
|-------|---------------------|-------|
| **Stage 1** | **45%** | Strong validation layer and partial constraint taxonomy exist. Missing: LLM-based extraction (both passes), operator-based constraint schema, mission_mode. Regex handles interpretation, not just cleanup. |
| **Stage 2** | **25%** | Structured mission objects are passed to the Supervisor and artefacts are persisted. Missing: deterministic constraint→tool mapping, pre-execution plan documents, constraint-driven strategy selection. |
| **Stage 3** | **55%** | Goal/strategy types, Tower verdicts, success/failure conditions, and rule updates are all defined and operational. Missing: autonomous strategy switching, goal worth population, deep rationality assessment. |

### Key Gaps

1. **No LLM in extraction** — The biggest Stage 1 gap. All extraction is regex. Adding a two-pass LLM extraction (meaning → schema) would be the highest-impact change.
2. **No operator-based constraint schema** — Constraints are typed strings, not structured `{ type, field, operator, value }` objects.
3. **No pre-execution planner** — The system goes from structured mission → fixed pipeline execution. No intermediate plan document is generated.
4. **Tower is quantity-only** — The Tower checks "did you deliver enough?" not "was your strategy rational?"
5. **No autonomous replanning** — `revise` verdicts are logged but never trigger automatic re-execution with a new strategy.
