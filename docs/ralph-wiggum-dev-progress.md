# Ralph Wiggum Dev Progress Harness

**Location:** `client/src/components/dev-dashboard/PhaseProgress.tsx`

## Purpose

Developer harness for manual verification of microtask completion. Named after Ralph Wiggum's "I'm helping!" energy — simple, observable, human-in-the-loop execution with explicit verification gates.

## What It Is

A UI-only scaffolding system for breaking down development tasks into verifiable microtasks.

**Current Features (UI-only, client-side state):**

1. **Collapsible Tree Hierarchy**
   - Phase → Epic → Task → Microtask
   - Expand/collapse at each level
   - State preserved during navigation

2. **Wyshbone-Relevant Microtask Templates**
   - Order fulfillment dashboard
   - Customer engagement A/B testing
   - Brewery pricing calculator
   - Multi-brewery analytics dashboard
   - Generates 4-6 meaningful microtasks per task

3. **Explicit Verification Flow**
   ```
   IDLE → RUNNING → PENDING_VERIFY → VERIFIED
   ```
   - **Start**: Requires success criteria (human-observable, e.g., "Widget shows 3 cards with counts")
   - **Submit Evidence**: Requires evidence note (what you observed)
   - **Verify**: Checkbox "I observed the success criteria" + shows both success criteria and evidence
   - Cannot reach VERIFIED without all three: success criteria + evidence + explicit verification

4. **One Microtask at a Time Enforcement**
   - Only one microtask can be RUNNING or PENDING_VERIFY at any given time
   - Start buttons disabled for all other microtasks when one is active
   - Prevents parallel work, forces sequential focus

## What It Is NOT

- **Not autonomous**: No LLM-driven execution, no code generation, no automatic retries
- **Not connected to backend**: All state in React component, no API calls, no persistence
- **Not a workflow engine**: Just a UI harness for human developers to track manual work
- **Not production**: Developer tool only, not for end users

## State Transitions

```
                  ┌─────────────────────────────────┐
                  │          SUCCESS               │
                  │  (human-observable,           │
START  ────────>  │   e.g., "Widget renders")     │
(idle)            └─────────────────────────────────┘
                              │
                              │ Enter criteria
                              ▼
                  ┌─────────────────────────────────┐
                  │         RUNNING                 │
                  │  (human executes microtask)    │
                  └─────────────────────────────────┘
                              │
                              │ Submit evidence
                              ▼
                  ┌─────────────────────────────────┐
                  │      PENDING_VERIFY             │
                  │  (waiting for human review)    │
                  └─────────────────────────────────┘
                              │
                              │ Check "I observed"
                              ▼
                  ┌─────────────────────────────────┐
                  │        VERIFIED                 │
                  │  (done, criteria met)          │
                  └─────────────────────────────────┘
```

## Planned Ladder (Next Steps)

### Phase 1: Backend Wiring (Current Branch Scope)
- Wire "Start" to `POST /api/workflow/continue` to find next incomplete microtask
- Wire "Submit Evidence" to `POST /api/workflow/mark` with status + evidence
- Enforce one-at-a-time via backend state (not just UI)
- Persist microtask state to workflow ledger YAML

### Phase 2: Minimal Autonomy
- Single retry on failure (human approves before retry)
- Success criteria validation (basic pattern matching)
- Auto-verify if evidence matches expected patterns

### Phase 3: Full Autonomous Loop (Future)
- LLM-driven code generation for microtasks
- Automatic retries with learning
- Multi-agent coordination
- End-to-end autonomous task execution

## Files

- **UI Component**: `client/src/components/dev-dashboard/PhaseProgress.tsx`
- **Backend Routes**: `server/routes.ts` (`/api/workflow/continue`, `/api/workflow/mark`)
- **Workflow Ledger**: `../thoughts/ledgers/WORKFLOW-wyshbone.md` (YAML format)
