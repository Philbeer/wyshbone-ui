# Bug Fix: Auto-Marking Tasks as In-Progress

## The Problem

Tasks were being automatically marked as "in-progress" when they shouldn't be, causing:
- Tasks showing "You're working on this!" when user hasn't started them
- Multiple tasks marked in-progress when user only started 1-2
- Fake timestamps ("Started 20 minutes ago" on untouched tasks)
- In-progress tasks at wrong position in list

## Root Cause

Tasks had hardcoded `status: 'in-progress'` in the task data (`taskData.ts`):
- `p1-t1`: status: 'blocked' (should be 'pending')
- `p1-t2`: status: 'in-progress' (should be 'pending')
- `p1-t3`: status: 'in-progress' (should be 'pending')

The task status should come from localStorage (user's actual progress), not from hardcoded data.

## Fixes Applied

### 1. Fixed Hardcoded Statuses (taskData.ts)
**Changed:**
- Line 92: `status: 'blocked'` → `status: 'pending'`
- Line 183: `status: 'in-progress'` → `status: 'pending'`
- Line 301: `status: 'in-progress'` → `status: 'pending'`

**Why:** Task definitions should have `status: 'pending'` by default. The actual status comes from localStorage via `getTaskStatus()`.

### 2. Added Cleanup Function (taskProgressService.ts)
**Added:** `cleanupInvalidTaskStates()` function (lines 203-236)

**What it does:**
- Scans localStorage for tasks marked 'in-progress' without `startedAt` timestamp
- Removes invalid entries (tasks never actually started)
- Logs cleanup actions to console
- Returns count of cleaned tasks

**When called:** On WorkQueue component mount (line 56)

### 3. Fixed Task Ordering (workQueueService.ts)
**Changed:** Line 169 ordering from:
```typescript
// WRONG: Ready tasks appear first
return [...sortedReady, ...inProgress, ...sortedBlocked, ...complete];
```

To:
```typescript
// CORRECT: In-progress tasks appear FIRST
return [...sortedInProgress, ...sortedReady, ...sortedBlocked, ...complete];
```

**Why:** Users should finish what they started before starting new tasks.

**Added:** Sorting in-progress tasks by startedAt timestamp (lines 128-136):
```typescript
const sortedInProgress = inProgress.sort((a, b) => {
  const aTime = aProgress?.startedAt ? new Date(aProgress.startedAt).getTime() : 0;
  const bTime = bProgress?.startedAt ? new Date(bProgress.startedAt).getTime() : 0;
  return bTime - aTime; // Most recent first
});
```

### 4. Added Debug Logging (taskProgressService.ts)
**Added:** Debug logging to `updateTaskStatus()` (lines 56-62)

**What it logs:**
- Task ID
- New status
- Additional data
- Stack trace showing where the call came from

**Why:** Makes it easy to track down any future auto-marking bugs.

## Files Modified

1. **client/src/services/taskData.ts**
   - Fixed 3 hardcoded statuses (lines 92, 183, 301)

2. **client/src/services/taskProgressService.ts**
   - Added `cleanupInvalidTaskStates()` function
   - Added debug logging to `updateTaskStatus()`

3. **client/src/services/workQueueService.ts**
   - Fixed task ordering (in-progress first)
   - Added in-progress task sorting by time
   - Added `getTaskProgress` import

4. **client/src/components/dev-dashboard/WorkQueue.tsx**
   - Added `cleanupInvalidTaskStates` import
   - Call cleanup function on mount

## Expected Behavior After Fix

### ✅ Initial page load:
- No in-progress tasks (unless user actually started them)
- All tasks either: ready, blocked, or complete
- Invalid localStorage entries cleaned up automatically

### ✅ User clicks "Generate Prompt":
- **ONLY** that task becomes in-progress
- Task moves to position #1
- All other ready tasks stay "ready"
- Timestamp is recorded with actual time

### ✅ User refreshes page:
- In-progress task still in-progress (from localStorage)
- In-progress task still at position #1
- All other tasks unchanged
- No auto-marking happens

### ✅ User marks task complete:
- Task becomes complete
- Task moves to bottom
- Next ready task stays "ready" (doesn't auto-start)
- Queue reorders automatically

## Testing Steps

1. **Clear localStorage:**
   ```javascript
   localStorage.removeItem('wyshbone-task-progress');
   ```

2. **Refresh page** - verify no tasks are in-progress

3. **Click "Generate Prompt"** on one task - verify:
   - ONLY that task becomes in-progress
   - It moves to position #1
   - Timestamp is correct
   - Console shows debug log

4. **Refresh page** - verify:
   - In-progress task stays in-progress
   - No other tasks auto-mark

5. **Mark task complete** - verify:
   - It moves to bottom
   - Next ready task stays "ready"

## Acceptance Criteria

- ✅ Tasks only become in-progress when "Generate Prompt" clicked
- ✅ No auto-marking on page load
- ✅ No auto-marking when task becomes ready
- ✅ In-progress tasks appear at top of list (positions 1-N)
- ✅ Ready tasks appear after in-progress
- ✅ Only 1-2 tasks in-progress at a time (what user is actually working on)
- ✅ "You're working on this!" only shows for actually-started tasks
- ✅ Timestamps only exist for actually-started tasks
- ✅ Cleanup function removes invalid in-progress states
- ✅ Page refresh preserves correct state

## Key Insight

**The bug was NOT in the logic code - it was in the DATA.**

The handleGeneratePrompt function was working correctly. The problem was hardcoded statuses in taskData.ts that overrode the localStorage status when no localStorage entry existed.

**The fix ensures:**
1. Task definitions are always 'pending' by default
2. Actual status comes from localStorage (user actions)
3. Invalid localStorage entries are cleaned up
4. In-progress tasks appear first (finish what you started!)
5. Debug logging tracks all status changes
