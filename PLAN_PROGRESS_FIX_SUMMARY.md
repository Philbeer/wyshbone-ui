# Plan Approval & Progress Polling - Bug Fix Summary

## What Was Wrong

The UI was not polling `/api/plan-status` after approving a plan, leaving users unable to see execution progress. The root cause was a **state management issue** in the `usePlanForApproval` hook.

### The Problem Flow

1. User clicks "Start Working On This Goal" → Plan created with status `'pending_approval'`
2. User clicks "Approve Plan" → Backend changes plan status to `'approved'` then `'executing'`
3. **ISSUE**: The `/api/plan` endpoint **only returns plans with status `'pending_approval'`**
4. After approval, `/api/plan` returns `null` (plan no longer pending approval)
5. The `usePlanForApproval` hook derived `planId` and `status` directly from the query data:
   - `planId: plan?.id || null` → becomes `null`
   - `status: plan?.status || 'idle'` → becomes `'idle'`
6. The `ProgressWidget` checks `isActive = status === 'executing'` → becomes `false`
7. `usePlanProgress` never activates polling because `isActive` is `false`

## What Was Changed

### 1. Frontend: `client/src/hooks/use-plan-for-approval.ts`

**Added local state management** to persist `planId` and `status` independently of query data:

```typescript
// NEW: Local state for active plan tracking
const [activePlanId, setActivePlanId] = useState<string | null>(null);
const [activeStatus, setActiveStatus] = useState<string>('idle');

// NEW: Sync state when plan data arrives
useEffect(() => {
  if (plan) {
    setActivePlanId(plan.id);
    setActiveStatus(plan.status);
  }
}, [plan]);
```

**Updated `startPlan` mutation** to capture planId immediately:

```typescript
onSuccess: (data) => {
  if (data.plan) {
    setActivePlanId(data.plan.id);
    setActiveStatus(data.plan.status || 'pending_approval');
  }
  queryClient.invalidateQueries({ queryKey: ["/api/plan"] });
}
```

**Updated `approvePlan` mutation** to maintain planId and set status to 'executing':

```typescript
mutationFn: async (planId: string) => {
  const response = await apiRequest("POST", "/api/plan/approve", { planId });
  const data = await response.json();
  return { data, planId }; // Return planId along with response
},
onSuccess: ({ planId }) => {
  // Keep planId and set status to executing
  setActivePlanId(planId);
  setActiveStatus('executing');
  queryClient.invalidateQueries({ queryKey: ["/api/plan"] });
}
```

**Updated return values** to use local state:

```typescript
return {
  planId: activePlanId,  // Use local state instead of plan?.id
  status: activeStatus,   // Use local state instead of plan?.status
  // ... other values
};
```

### 2. Backend: `server/routes.ts`

**Added `planId` query parameter support** to `/api/plan-status` endpoint:

```typescript
// NEW: Support planId query parameter
const { getPlanExecution } = await import('./leadgen-executor.js');

const planId = req.query.planId as string | undefined;
const conversationId = req.query.conversationId as string | undefined;

// Try planId first, then conversationId, then session
let execution = planId 
  ? getPlanExecution(planId)
  : conversationId 
    ? getExecutionByConversation(conversationId) 
    : getExecutionBySession(sessionId);
```

This enables the frontend to poll progress using: `GET /api/plan-status?planId=<plan-id>`

## How the Fix Works

### Complete Flow After Fix

1. **Start Plan**:
   - User clicks "Start Working On This Goal"
   - POST `/api/plan/start` returns plan with `id` and status `'pending_approval'`
   - Hook sets `activePlanId = plan.id` and `activeStatus = 'pending_approval'`
   - Plan Approval Panel displays

2. **Approve Plan**:
   - User clicks "Approve Plan"
   - POST `/api/plan/approve` called with stored `planId`
   - On success, hook sets `activeStatus = 'executing'` **while keeping `activePlanId`**
   - Plan Approval Panel hides (status no longer `'pending_approval'`)

3. **Progress Polling Activates**:
   - `ProgressWidget` sees `planId !== null` and `status === 'executing'`
   - Sets `isActive = true`
   - `usePlanProgress(planId, isActive)` starts polling every 5 seconds
   - Makes requests to: `GET /api/plan-status?planId=<stored-plan-id>`

4. **Progress Updates Display**:
   - Progress widget shows current step, completion percentage, status
   - Polling continues until plan status becomes `'completed'` or `'failed'`

## How to Test & Verify

### Step-by-Step Testing

1. **Open DevTools → Network tab** and filter for "plan"

2. **Enter a goal** in the "My Goal" panel (right side):
   - Example: "Find 50 pubs in West Sussex"
   - Click "Start Working On This Goal"

3. **Verify plan creation**:
   - Network: See `POST /api/plan/start` with 200 response
   - Console: Look for `[usePlanForApproval] set local state after startPlan`
   - UI: Plan Approval panel appears with steps

4. **Click "Approve Plan"**:
   - Network: See `POST /api/plan/approve` with 200 response
   - Console: Look for `[usePlanForApproval] set local state after approvePlan - planId: <id>, status: executing`
   - UI: Toast shows "Plan Approved"

5. **Verify progress polling starts**:
   - Network: See repeating `GET /api/plan-status?planId=<actual-plan-id>` every 5 seconds
   - Console: Look for `[usePlanProgress] fetching progress for planId=<id>`
   - UI: Progress card updates from "No active plan running" to show actual progress

6. **Watch execution**:
   - Progress bar updates as steps complete
   - Current step shows with spinner/checkmark
   - When all steps complete, status shows "completed"

### Expected Console Logs

```javascript
// After starting plan
[usePlanForApproval] set local state after startPlan - planId: plan_xxx, status: pending_approval

// After approving plan  
[usePlanForApproval] set local state after approvePlan - planId: plan_xxx, status: executing
📊 ProgressWidget: planId: plan_xxx, status: executing, isActive: true

// During execution (every 5s)
[usePlanProgress] fetching progress for planId=plan_xxx from /api/plan-status?planId=plan_xxx
✅ usePlanProgress: received progress data: { totalSteps: 3, completedSteps: 1, ... }
```

## Files Modified

1. `client/src/hooks/use-plan-for-approval.ts` - Added local state management
2. `server/routes.ts` - Added planId query parameter support to `/api/plan-status`

## Key Improvements

✅ Plan progress now visible to users during execution  
✅ Backend polling activates correctly after approval  
✅ State persists even when plan is no longer "pending approval"  
✅ Network requests show active polling every 5 seconds  
✅ Progress widget displays real-time step updates  
✅ Clean separation between "plan for approval" and "plan execution" states
