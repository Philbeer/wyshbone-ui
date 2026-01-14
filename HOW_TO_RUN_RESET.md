# How to Run Task Evaluation Reset

## Quick Start (Browser Console)

1. **Open your Wyshbone UI** at `http://localhost:5173`

2. **Open Browser Console** (F12 or Ctrl+Shift+I)

3. **Run the reset:**

```javascript
// Import the reset utility
import { runFullAuditAndReset, markTask2AsCompleted } from './src/utils/taskEvaluationReset.ts';

// Run full audit and reset
runFullAuditAndReset();
```

**OR use this quick one-liner:**

```javascript
// Quick reset for Tasks 1 & 3
localStorage.setItem('wyshbone-task-progress', JSON.stringify({
  'p1-t1': {
    status: 'completed',
    completedAt: new Date().toISOString(),
    verifiedBy: 'code-audit-2026-01-04',
    evidence: 'All 5 tools have credentials:include + x-session-id headers'
  },
  'p1-t3': {
    status: 'completed',
    completedAt: new Date().toISOString(),
    verifiedBy: 'code-audit-2026-01-04',
    evidence: 'ResultsPanel.tsx exists with full implementations'
  }
}));
console.log('✅ Tasks 1 & 3 reset to COMPLETED');
console.log('🔄 Refresh page to see changes');
```

4. **Refresh the page** (F5)

5. **Verify Task 2** by answering these questions:

---

## Task 2 Verification Questions

### Have you tested all 5 tools?

**1. Search Google Places (search_google_places)**
   - Have you clicked "Find pubs in Leeds" or similar?
   - Did it execute without 401 errors?
   - Did results appear?

**2. Deep Research**
   - Have you started a research job?
   - Did it start successfully?
   - Did you see the job ID?

**3. Email Finder (batch_contact_finder)**
   - Have you tried finding contacts?
   - Did it find emails?
   - Did results display?

**4. Scheduled Monitor**
   - Have you created a monitor?
   - Did it create successfully?
   - Can you see it in the list?

**5. Get Nudges**
   - Have you used the nudges feature?
   - Did it return suggestions?

### If YES to all:

```javascript
// Mark Task 2 as complete
const progress = JSON.parse(localStorage.getItem('wyshbone-task-progress') || '{}');
progress['p1-t2'] = {
  status: 'completed',
  completedAt: new Date().toISOString(),
  verifiedBy: 'user-verification',
  evidence: 'All 5 tools tested and working'
};
localStorage.setItem('wyshbone-task-progress', JSON.stringify(progress));
console.log('✅ Task 2 marked COMPLETED');
location.reload(); // Refresh page
```

### If NO to any:

Task 2 is **NOT COMPLETE** - you need to test the tools before marking it done.

---

## What Gets Reset

### ✅ Task 1: Fix 401 Auth
**Was:** `pending`
**Now:** `completed` ✅

**Why:** Code audit found auth headers in all 5 tool calls:
- credentials: 'include' ✅
- x-session-id headers ✅
- getSessionId() method ✅
- No 401 issues in code ✅

### ⚠️ Task 2: Test All Tools
**Was:** `pending`
**Now:** Needs USER VERIFICATION ⚠️

**Why:** Tools are implemented in code, but we can't verify TESTING status from code alone.

### ✅ Task 3: Results Display
**Was:** `pending`
**Now:** `completed` ✅

**Why:** Code audit found full results UI:
- ResultsPanel.tsx exists (400+ lines) ✅
- QuickSearchFullView implemented ✅
- DeepResearchFullView implemented ✅
- EmailFinderFullView implemented ✅
- ScheduledMonitorFullView implemented ✅

### ⚪ Task 4: Unify Tool Execution
**Was:** `pending`
**Now:** `pending` (no change) ⚪

**Why:** Status is correct - duplication still exists:
- UI has server/lib/actions.ts
- Supervisor has server/actions/registry.ts (duplicate)
- Task correctly shows as incomplete

---

## Verification

After running the reset:

1. Go to `/dev/progress` in your app
2. Check the 🚀 Work Queue tab
3. You should see:
   - ✅ Task 1: Marked complete
   - ✅ Task 3: Marked complete
   - ⚠️ Task 2: Needs your verification
   - ❌ Task 4: Ready to start (next task!)

---

## Full Report

See `TASK_EVALUATION_REPORT.md` for:
- Complete evidence for each task
- Code locations and line numbers
- Automated check results
- Manual code review findings

---

## Why This Reset Is Necessary

The dashboard had **fake in-progress states** due to:
1. Hardcoded task statuses in taskData.ts
2. No validation of localStorage entries
3. Tasks marked "in-progress" that were never started

This reset:
- ✅ Fixes hardcoded statuses
- ✅ Validates actual code state
- ✅ Removes fake progress
- ✅ Gives you accurate task list
- ✅ Lets you trust the dashboard again

---

## Questions?

If anything is unclear:
1. Check `TASK_EVALUATION_REPORT.md` for full evidence
2. Check `BUG_FIX_AUTO_IN_PROGRESS.md` for bug fix details
3. Check `client/src/utils/taskEvaluationReset.ts` for reset logic

---

## After Reset: Next Steps

1. ✅ Task 1: Complete (verified by code audit)
2. ⚠️ Task 2: Verify testing status
3. ✅ Task 3: Complete (verified by code audit)
4. 🚀 Task 4: Ready to work on! (Unify tool execution)

**Your next task is Task 4: Unify Tool Execution**

This will eliminate the duplicate tool implementations between:
- `wyshbone-ui/server/lib/actions.ts`
- `wyshbone-supervisor/server/actions/registry.ts`

The goal is to have a single source of truth for tool execution that both repos use.
