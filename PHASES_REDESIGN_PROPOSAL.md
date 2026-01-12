# Phases System Redesign Proposal

**Date:** 2026-01-09
**Current State:** Dashboard at /dev/progress with outdated task tracking
**Goal:** Real-time, autonomous-friendly development progress system

---

## 📊 Current State Analysis

### Existing Structure
- **Phase 1: Fix Foundation** - 4 tasks (3 completed, 1 pending)
- **Phase 2: Build Autonomous Agent** - 6 tasks (all pending)
- **Phase 3: Add Intelligence** - 6 tasks (all pending)
- **Total:** 16 tasks across 3 phases

### ✅ Completed Tasks (Verified in Codebase)
1. ✅ **p1-t1:** Fix 401 authentication errors (CRITICAL) - **DONE**
2. ✅ **p1-t2:** Test all 5 tools execute correctly (CRITICAL) - **DONE**
3. ✅ **p1-t3:** Fix results display in UI (HIGH) - **DONE**

### Problems Identified
1. ❌ **Work Queue is redundant** - duplicates Phase information
2. ❌ **Progress calculations hardcoded** - Shows 0% despite 75% Phase 1 complete
3. ❌ **No auto-polling** - Dashboard never updates without manual refresh
4. ❌ **Manual testing checkpoints** - Tasks say "MUST_TEST_NOW" requiring human intervention
5. ❌ **No status visibility** - Can't see what's IN_PROGRESS, TESTING, or BLOCKED
6. ❌ **Poor task ordering** - Dependencies not clear, blocking tasks buried
7. ❌ **Obsolete tasks** - Some tasks reference features that don't exist or are already done

---

## 🎯 Proposed Solution: Phases-Only System

### Design Principles
1. **Single Source of Truth:** Phases only, remove Work Queue entirely
2. **Real-Time Updates:** Auto-refresh every 30 seconds
3. **Autonomous-Friendly:** No manual "MUST_TEST_NOW" checkpoints
4. **Clear Visibility:** Always show what's IN_PROGRESS
5. **Accurate Progress:** Calculate completion from actual task statuses
6. **Dependency-Driven:** Order tasks by dependencies + priority

---

## 📋 Reorganized Phase Structure

### Phase 1: Fix Foundation (3 weeks)
**Goal:** Make user-led mode work perfectly
**Current:** 3/4 complete (75%)
**Status:** IN_PROGRESS

#### Completed ✅
1. ✅ **p1-t1:** Fix 401 authentication errors (CRITICAL)
   - Status: COMPLETE
   - Fixed: All 5 tools now send x-session-id headers
   - Verified: Smoke tests show 0 401 errors

2. ✅ **p1-t2:** Test all 5 tools execute correctly (CRITICAL)
   - Status: COMPLETE
   - Verified: All 5 endpoints exist and work
   - Note: get_nudges returns placeholder (empty array)

3. ✅ **p1-t3:** Fix results display in UI (HIGH)
   - Status: COMPLETE
   - Fixed: Added scheduled_monitor and nudges result handlers
   - Verified: All 5 tools display results in ResultsPanel

#### Ready to Work 🚀
4. **p1-t4:** Unify tool execution (HIGH)
   - Status: READY
   - Description: Single /api/tools/execute endpoint for both UI and Supervisor
   - Priority: HIGH
   - Blocked by: None (unblocked by p1-t1, p1-t2, p1-t3)
   - Testing: Autonomous (API tests, integration tests)
   - Files: `server/routes.ts`, `server/lib/actions.ts`
   - Acceptance Criteria:
     * Single endpoint handles all 5 tools
     * UI and Supervisor both use unified endpoint
     * Response format consistent across tools
     * All tools continue working after migration

---

### Phase 2: Build Autonomous Agent (2-3 weeks)
**Goal:** Simple autonomous agent that runs daily without user input
**Current:** 0/6 complete (0%)
**Status:** BLOCKED (waiting for Phase 1)

#### Blocked (Need Phase 1 Complete First) 🔒
1. **p2-t1:** Database schema for agent activities (CRITICAL)
   - Status: BLOCKED
   - Blocked by: p1-t4 (need unified tool execution working first)
   - Description: Tables for agent runs, activities, outcomes, learnings
   - Testing: Autonomous (migration tests, schema validation)
   - Files: `drizzle/migrations/`, `shared/schema.ts`
   - Acceptance Criteria:
     * agent_runs table exists
     * agent_activities table with tool_name, status, result
     * agent_outcomes table for learning
     * Migrations run without errors

2. **p2-t2:** Simple goal generator (CRITICAL)
   - Status: BLOCKED
   - Blocked by: p2-t1 (need database schema)
   - Description: Generate 3-5 daily goals based on user's primary vertical
   - Testing: Autonomous (unit tests for goal generation logic)
   - Files: `server/lib/goal-generator.ts`
   - Acceptance Criteria:
     * Generates 3-5 relevant goals per user
     * Goals match user's vertical (brewery, retail, etc.)
     * Goals stored in agent_runs table
     * Can be triggered via API endpoint

3. **p2-t3:** Task executor (CRITICAL)
   - Status: BLOCKED
   - Blocked by: p2-t2 (need goals to execute)
   - Description: Execute generated goals using unified tool endpoint
   - Testing: Autonomous (integration tests with mocked tools)
   - Files: `server/lib/task-executor.ts`
   - Acceptance Criteria:
     * Takes goal, breaks into tool calls
     * Uses unified /api/tools/execute
     * Logs activities to agent_activities
     * Handles tool errors gracefully

4. **p2-t4:** Email notification system (HIGH)
   - Status: BLOCKED
   - Blocked by: p2-t3 (need executed tasks to notify about)
   - Description: Send daily summary emails with results
   - Testing: Autonomous (email template validation, send test)
   - Files: `server/lib/email-service.ts`
   - Acceptance Criteria:
     * Formats task results into readable email
     * Sends via SendGrid/Postmark
     * Includes success/failure counts
     * Links back to UI for details

5. **p2-t5:** Daily cron job (CRITICAL)
   - Status: BLOCKED
   - Blocked by: p2-t2, p2-t3, p2-t4 (need full pipeline)
   - Description: Scheduled job that runs goal generation → execution → notification
   - Testing: Autonomous (cron scheduling, manual trigger test)
   - Files: `server/cron/daily-agent.ts`
   - Acceptance Criteria:
     * Runs daily at 9am (configurable)
     * Triggers goal generation for all users
     * Executes tasks autonomously
     * Sends notification emails
     * Logs to Tower for monitoring

6. **p2-t6:** Activity Feed UI component (MEDIUM)
   - Status: BLOCKED
   - Blocked by: p2-t3 (need activities to display)
   - Description: Show recent agent activities in UI
   - Testing: Autonomous (component tests, visual regression)
   - Files: `client/src/components/activity/ActivityFeed.tsx`
   - Acceptance Criteria:
     * Displays last 20 agent activities
     * Shows tool name, status, timestamp
     * Updates in real-time via polling
     * Includes success/failure indicators

---

### Phase 3: Add Intelligence (1-2 weeks)
**Goal:** Sophisticated autonomous behaviors with learning and adaptation
**Current:** 0/6 complete (0%)
**Status:** BLOCKED (waiting for Phase 2)

#### Blocked (Need Phase 2 Complete First) 🔒
1. **p3-t1:** Memory system - schema, reader, writer (CRITICAL)
   - Status: BLOCKED
   - Blocked by: All of Phase 2 (need agent running to generate learnings)
   - Description: Capture learnings from agent outcomes, store beliefs
   - Testing: Autonomous (integration tests, belief retrieval tests)
   - Files: `server/lib/memory/`, `drizzle/migrations/`
   - Acceptance Criteria:
     * learnings table exists (outcome_id, learning_text, belief_update)
     * beliefs table exists (key, value, confidence, last_updated)
     * Writer captures successful/failed outcomes
     * Reader retrieves relevant beliefs for decisions

2. **p3-t2:** Failure categorization (HIGH)
   - Status: BLOCKED
   - Blocked by: p3-t1 (need memory system to store patterns)
   - Description: Classify failures (temporary, fixable, strategy issue)
   - Testing: Autonomous (classification accuracy tests)
   - Files: `server/lib/failure-classifier.ts`
   - Acceptance Criteria:
     * Categorizes failures into 4 types: temporary, data issue, strategy problem, external
     * Stores classification in agent_outcomes
     * Suggests retry vs. escalate vs. adapt
     * Uses Claude to analyze error patterns

3. **p3-t3:** Error reaction logic (HIGH)
   - Status: BLOCKED
   - Blocked by: p3-t2 (need failure categorization)
   - Description: Automatic retry, escalation, or strategy change
   - Testing: Autonomous (reaction decision tests)
   - Files: `server/lib/error-reactor.ts`
   - Acceptance Criteria:
     * Temporary failures → auto-retry with backoff
     * Data issues → log and skip
     * Strategy problems → trigger replan
     * External failures → notify user
     * All reactions logged to Tower

4. **p3-t4:** Planner replan API (HIGH)
   - Status: BLOCKED
   - Blocked by: p3-t3 (triggered by error reactions)
   - Description: Generate new plan when strategy fails
   - Testing: Autonomous (replan generation tests)
   - Files: `server/lib/replanner.ts`
   - Acceptance Criteria:
     * Takes failed goal + failure reason
     * Generates alternative approach
     * Stores new plan in agent_runs
     * Resumes execution automatically
     * Learns from failed strategy

5. **p3-t5:** DAG mutation engine (MEDIUM)
   - Status: BLOCKED
   - Blocked by: p3-t4 (uses replan API)
   - Description: Modify plan graph based on outcomes
   - Testing: Autonomous (DAG manipulation tests)
   - Files: `server/lib/dag-mutator.ts`
   - Acceptance Criteria:
     * Represents plan as directed acyclic graph
     * Can add/remove/reorder steps
     * Maintains dependencies
     * Validates modified DAG
     * Stores mutations for learning

6. **p3-t6:** Strategy evaluator (MEDIUM)
   - Status: BLOCKED
   - Blocked by: p3-t1, p3-t5 (needs memory + DAG)
   - Description: Compare strategy variants, pick best
   - Testing: Autonomous (evaluation tests, A/B comparison)
   - Files: `server/lib/strategy-evaluator.ts`
   - Acceptance Criteria:
     * Tracks success rate per strategy variant
     * Compares outcomes (leads found, emails sent, ROI)
     * Selects winning strategy
     * Updates beliefs with winning pattern
     * Explains strategy choice

---

## 🔄 New Task Status Workflow

### Status Values
- **READY** - No blockers, can start immediately
- **IN_PROGRESS** - Currently being worked on (only 1 task at a time)
- **TESTING** - Implementation done, running tests
- **BLOCKED** - Waiting on dependencies
- **COMPLETE** - Done, archived but visible

### Status Transitions
```
BLOCKED → READY (when blocker completes)
READY → IN_PROGRESS (when work starts)
IN_PROGRESS → TESTING (when implementation done)
TESTING → COMPLETE (when tests pass)
TESTING → IN_PROGRESS (if tests fail, fix and retry)
```

### Autonomous Workflow
1. Claude picks next READY task (top of phase)
2. Marks task IN_PROGRESS
3. Implements solution
4. Marks task TESTING
5. Runs autonomous tests (API, browser automation, integration)
6. If tests pass → COMPLETE
7. If tests fail → back to IN_PROGRESS, fix, retry
8. Move to next READY task

---

## 📊 Progress Calculation

### Per-Phase Formula
```
phase.completion = (completed_tasks / total_tasks) * 100
```

**Example (Phase 1):**
- Total: 4 tasks
- Completed: 3 tasks
- Progress: (3 / 4) * 100 = **75%**

### Overall Completion Formula
```
overall_completion = (
  (phase1_completion * phase1_weight) +
  (phase2_completion * phase2_weight) +
  (phase3_completion * phase3_weight)
) / (phase1_weight + phase2_weight + phase3_weight)
```

**Weights:**
- Phase 1: 40% (foundation critical)
- Phase 2: 35% (autonomous operation)
- Phase 3: 25% (intelligence layer)

**Current Calculation:**
```
overall = (75% * 0.4) + (0% * 0.35) + (0% * 0.25)
overall = 30% + 0% + 0%
overall = 30%
```

---

## ⏱️ Auto-Polling Implementation

### Polling Strategy
- **Interval:** 30 seconds
- **Method:** React useEffect with setInterval
- **What Updates:**
  - Task statuses (from taskData.ts)
  - Phase completion percentages
  - Current IN_PROGRESS task
  - Last updated timestamp

### Code Pattern
```typescript
useEffect(() => {
  const pollInterval = setInterval(async () => {
    const freshData = await getDevProgressData(true); // force refresh
    setData(freshData);
    setLastUpdated(new Date());
  }, 30000); // 30 seconds

  return () => clearInterval(pollInterval);
}, []);
```

---

## 🎨 UI Improvements

### Phase Card Enhancements
- **Status Badge:** IN_PROGRESS / BLOCKED / COMPLETE
- **Progress Bar:** Accurate percentage based on task completion
- **Current Task Highlight:** Yellow border on IN_PROGRESS task
- **Completion Archive:** Expandable "View Completed (3)" section
- **Blocked Task Indicator:** Red lock icon + "Blocked by: [task]" tooltip

### Task Card Structure
```
┌─────────────────────────────────────────────┐
│ 🚀 IN_PROGRESS │ CRITICAL                   │ ← Status + Priority
├─────────────────────────────────────────────┤
│ Unify tool execution (p1-t4)                │ ← Title
│                                             │
│ Single /api/tools/execute endpoint for     │ ← Description
│ both UI and Supervisor                      │
│                                             │
│ ✅ No blockers                              │ ← Dependencies
│ 📝 Testing: Autonomous (API tests)          │ ← Testing Method
│ 📂 Files: server/routes.ts, actions.ts     │ ← Affected Files
│                                             │
│ [View Details] [Mark Complete]             │ ← Actions
└─────────────────────────────────────────────┘
```

### Recent Completions Section
```
✅ Recently Completed (Last 5)
────────────────────────────────
✅ Fix results display in UI (15 min ago)
✅ Test all 5 tools execute correctly (2 hours ago)
✅ Fix 401 authentication errors (3 hours ago)
```

---

## 🧪 Testing Strategy Changes

### Old (Manual Checkpoints)
```
safetyLevel: 'MUST_TEST_NOW'
humanVerification: {
  whatToCheck: [
    'Open browser DevTools (F12)',
    'Click "Console" tab',
    'Click any tool button',
    'Watch the console output'
  ]
}
```

### New (Autonomous Testing)
```
testing: {
  method: 'autonomous',
  approaches: [
    'API integration tests via Playwright',
    'Browser automation with Chrome extension',
    'Unit tests for core logic',
    'Smoke tests for regression detection'
  ],
  acceptance: [
    'All API endpoints return 200 OK',
    'No console errors in browser',
    'Tool results display correctly',
    'Regression tests pass'
  ]
}
```

### Testing Tools Available
- ✅ **Playwright** - Already configured for smoke tests
- ✅ **Chrome Extension** - Browser automation available
- ✅ **Vitest** - Unit testing framework
- ✅ **Debug Bridge** - Real-time error capture

---

## 📝 Changes Summary

### What's Being Removed
1. ❌ **Work Queue Tab** - Redundant with Phases
2. ❌ **"MUST_TEST_NOW" checkpoints** - Replaced with autonomous testing
3. ❌ **Manual verification steps** - Automated where possible
4. ❌ **Hardcoded progress values** - Now calculated dynamically

### What's Being Added
1. ✅ **Auto-polling (30s)** - Dashboard updates automatically
2. ✅ **Status tracking** - READY/IN_PROGRESS/TESTING/BLOCKED/COMPLETE
3. ✅ **Current task indicator** - Always shows what's being worked on
4. ✅ **Completion archive** - Recent completions visible
5. ✅ **Accurate progress** - Calculated from actual task statuses
6. ✅ **Clear dependencies** - "Blocked by:" shown explicitly
7. ✅ **Autonomous testing** - Methods specified for each task

### What's Being Updated
1. 🔄 **Task ordering** - Dependency-driven (blockers first)
2. 🔄 **Progress calculation** - Dynamic, not hardcoded
3. 🔄 **Phase UI** - Enhanced with status badges, progress bars
4. 🔄 **Task definitions** - Testing methods, acceptance criteria
5. 🔄 **Phases Tab** - Primary interface (no more Work Queue)

---

## 🚀 Implementation Plan

### Step 1: Update Task Definitions (30 min)
- Add `testing` field to each task
- Remove `safetyLevel: 'MUST_TEST_NOW'`
- Add clear `acceptanceCriteria`
- Specify `blockedBy` dependencies

### Step 2: Add Status Tracking (45 min)
- Extend PhaseTask interface with new statuses
- Add status transition validation
- Create status update API endpoint

### Step 3: Implement Auto-Polling (30 min)
- Add setInterval to progress.tsx
- Force refresh every 30 seconds
- Update UI state on poll

### Step 4: Enhance Phase UI (1 hour)
- Add status badges
- Highlight IN_PROGRESS tasks
- Create completion archive section
- Add blocked task indicators

### Step 5: Remove Work Queue (15 min)
- Remove WorkQueue component import
- Remove "queue" tab from Tabs
- Update default tab to "phases"

### Step 6: Update Progress Calculation (30 min)
- Replace hardcoded values with dynamic calculation
- Use weighted formula for overall completion
- Update phase completion from task statuses

### Total Estimated Time: ~3.5 hours

---

## ✅ Acceptance Criteria for Redesign

1. ✅ **Dashboard auto-refreshes** - Polls every 30 seconds, updates visible
2. ✅ **Progress is accurate** - Phase 1 shows 75%, not 0%
3. ✅ **Work Queue removed** - Only Phases tab exists
4. ✅ **Current task visible** - IN_PROGRESS task highlighted
5. ✅ **Completions archived** - Can see recently completed tasks
6. ✅ **Dependencies clear** - Blocked tasks show "Blocked by: [task]"
7. ✅ **No manual checkpoints** - All tasks specify autonomous testing
8. ✅ **Autonomous workflow** - Claude can pick task, work, test, complete autonomously

---

## 🎯 Success Metrics

### Before
- ❌ Progress: 0% (incorrect)
- ❌ Update frequency: Manual only
- ❌ Tasks needing human testing: 16/16
- ❌ Visibility of current work: None
- ❌ Time to understand blockers: 5+ min

### After
- ✅ Progress: 30% (accurate)
- ✅ Update frequency: Every 30 seconds
- ✅ Tasks needing human testing: 0/16
- ✅ Visibility of current work: Always shown
- ✅ Time to understand blockers: Instant

---

## 💬 User Experience

### Before (Manual)
```
User: "What's the progress on Phase 1?"
Dashboard: "0% complete" (spinning icon stuck)
Reality: 3/4 tasks done (75%)

User: "What's blocking Phase 2?"
Dashboard: *scrolls through Work Queue, reads task descriptions*
Time: 5 minutes to figure out

User: "Is the auth fix done?"
Dashboard: *manual git log search to confirm*
Time: 2 minutes
```

### After (Autonomous)
```
User: Opens /dev/progress
Dashboard:
  Phase 1: 75% complete (3/4 tasks) ✅
  Currently Working: Unify tool execution (p1-t4) 🚀
  Phase 2: Blocked by p1-t4
  Last Updated: 12 seconds ago

User: *Sees real-time progress without asking*
Time: Instant

User: *Returns 5 minutes later*
Dashboard:
  Phase 1: 100% complete ✅
  Currently Working: Database schema (p2-t1) 🚀
  Last Updated: 3 seconds ago
```

---

**Status:** Ready for Review
**Next Step:** Get approval, then implement in ~3.5 hours
