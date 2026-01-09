# Order Status Field - Fix & Investigation

## Issue Summary
**Problem:** Order Status dropdown changes don't persist when clicking "Update Order"
- User changes status from "Confirmed" → "Draft"
- Dialog closes (appears successful)
- Reopening order shows status reverted to "Confirmed"
- No error message shown
- No error in debug bridge logs

## Code Changes Made

### 1. Added Debug Logging - Frontend (`client/src/pages/crm/orders.tsx`)

**Location:** Lines 406-415 (onSubmit function)
```typescript
const onSubmit = (formValues: OrderFormValues) => {
  console.log('[DEBUG] Form submission values:', JSON.stringify(formValues, null, 2));
  console.log('[DEBUG] Status field in submission:', formValues.status);
  if (editingOrder) {
    console.log('[DEBUG] Updating order:', editingOrder.id);
    updateMutation.mutate({ id: editingOrder.id, ...formValues });
  } else {
    createMutation.mutate(formValues);
  }
};
```

**Location:** Lines 860-864 (Status Select onChange)
```typescript
<Select
  onValueChange={(value) => {
    console.log('[DEBUG] Status changed to:', value);
    field.onChange(value);
  }}
  value={field.value || "draft"}
>
```

### 2. Added Debug Logging - Backend (`server/routes.ts`)

**Location:** Lines 8978-8989 (PATCH /api/crm/orders/:id)
```typescript
// VALIDATION: Validate partial update using Zod schema (omit immutable fields)
console.log('[DEBUG] Order PATCH request body:', JSON.stringify(req.body, null, 2));
const validationResult = insertCrmOrderSchema.partial().omit({ id: true, workspaceId: true, createdAt: true }).safeParse(req.body);
if (!validationResult.success) {
  return res.status(400).json({
    error: "Validation failed",
    details: validationResult.error.errors
  });
}

const data = validationResult.data;
console.log('[DEBUG] Validated order data:', JSON.stringify(data, null, 2));
console.log('[DEBUG] Status field in data:', data.status);
```

**Location:** Lines 9007-9015 (Before database update)
```typescript
const updatePayload = {
  ...data,
  syncStatus: 'pending',
  updatedAt: Date.now(),
};
console.log('[DEBUG] Sending to updateCrmOrder:', JSON.stringify(updatePayload, null, 2));
const order = await storage.updateCrmOrder(id, updatePayload);
console.log('[DEBUG] Updated order returned:', JSON.stringify(order, null, 2));
console.log('[DEBUG] Status field in returned order:', order?.status);
```

## Test Plan

### Step 1: Open Browser Console
1. Open DevTools (F12)
2. Navigate to Console tab
3. Clear console

### Step 2: Edit Order Status
1. Go to http://localhost:5173/auth/crm/orders
2. Click edit on INV-0003
3. Change Status from "Confirmed" to "Draft"
4. Click "Update Order"

### Step 3: Check Console Logs
Look for these log messages in sequence:

**Frontend logs (should appear):**
```
[DEBUG] Status changed to: draft
[DEBUG] Form submission values: { ... "status": "draft" ... }
[DEBUG] Status field in submission: draft
[DEBUG] Updating order: ord_xxxx
```

**Backend logs (check terminal/server console):**
```
[DEBUG] Order PATCH request body: { ... "status": "draft" ... }
[DEBUG] Validated order data: { ... "status": "draft" ... }
[DEBUG] Status field in data: draft
[DEBUG] Sending to updateCrmOrder: { ... "status": "draft" ... }
[DEBUG] Updated order returned: { ... "status": "draft" ... }
[DEBUG] Status field in returned order: draft
```

### Step 4: Verify Persistence
1. Close the order dialog
2. Reopen the same order
3. Check if status is now "Draft"

## Possible Root Causes

Based on the logging, we can diagnose:

### Scenario A: Frontend Not Capturing Change
**Symptoms:** `[DEBUG] Status changed to: draft` does NOT appear
**Cause:** Select component not triggering onChange
**Fix:** Check Radix UI Select component version/configuration

### Scenario B: Frontend Not Submitting Status
**Symptoms:** `Status changed to: draft` appears, but `status` field missing from form submission
**Cause:** Form not tracking status field properly
**Fix:** Check form.watch() or form.getValues() to see if status is in form state

### Scenario C: Backend Not Receiving Status
**Symptoms:** Frontend logs show status, but `PATCH request body` doesn't include status
**Cause:** API request transformation stripping status field
**Fix:** Check apiRequest() function in lib/queryClient.ts

### Scenario D: Backend Validation Failing
**Symptoms:** Request body has status, but validated data doesn't
**Cause:** Zod schema rejecting status field
**Fix:** Check insertCrmOrderSchema in shared/schema.ts

### Scenario E: Database Not Updating
**Symptoms:** All logs show "draft", but reopening shows "confirmed"
**Cause:** Database update failing silently or query cache not invalidating
**Fix:** Check storage.updateCrmOrder() implementation and query invalidation

### Scenario F: Query Cache Issue
**Symptoms:** Database updated but UI shows old data
**Cause:** React Query cache not invalidating properly
**Fix:** Check queryClient.invalidateQueries() call

## Expected Outcome

After running the test, you should see logs at each step. If ANY step is missing status="draft", that's where the bug is.

## Cleanup

After identifying the root cause, remove the console.log() statements or wrap them in a debug flag:
```typescript
if (import.meta.env.DEV) {
  console.log('[DEBUG] ...');
}
```

## Database Schema Verification

Confirm the `status` field exists and accepts these values:
```sql
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'crm_orders' AND column_name = 'status';
```

Expected:
- Column: status
- Type: text
- Default: 'draft'

## Next Steps

1. ✅ Debug logging added
2. ⏳ Run test plan to identify root cause
3. ⏳ Implement specific fix based on findings
4. ⏳ Remove debug logging
5. ⏳ Verify fix works
6. ⏳ Test other order fields to ensure no regression
