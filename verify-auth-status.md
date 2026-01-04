# Auth Status Verification Guide

## Quick Test: Is Auth Working?

### Step 1: Open App and Test

1. Open `http://localhost:5173`
2. Open browser console (F12)
3. Clear console (Ctrl+L)
4. Try **any** tool (e.g., "Find pubs in Leeds")
5. Watch console output

### Step 2: Check Results

#### ✅ AUTH IS WORKING if you see:
```
[QuickSearch] Session ID: present
[QuickSearch] Request starting...
[QuickSearch] Response received
✓ Found 30 places
```

**No 401 errors** = Auth is COMPLETE! ✅

**Action:** Mark task complete:
```javascript
const progress = JSON.parse(localStorage.getItem('wyshbone-task-progress') || '{}');
progress['p1-t1'] = {
  status: 'completed',
  completedAt: new Date().toISOString(),
  verifiedBy: 'user-testing',
  evidence: 'Tested - no 401 errors, tools working'
};
localStorage.setItem('wyshbone-task-progress', JSON.stringify(progress));
location.reload();
```

---

#### ❌ AUTH IS BROKEN if you see:
```
[QuickSearch] Session ID: MISSING
❌ 401 Unauthorized
Error: Authentication failed
```

**Has 401 errors** = Need to debug

---

## Debugging 401 Errors (If They Occur)

If you're seeing 401 errors despite auth code being present, check these:

### Check 1: Is Session ID Available?

**Console:**
```javascript
const auth = localStorage.getItem('wyshbone_auth');
if (!auth) {
  console.error('❌ No auth in localStorage!');
} else {
  const parsed = JSON.parse(auth);
  console.log('Session ID:', parsed.sessionId ? '✅ Present' : '❌ MISSING');
}
```

**If MISSING:** You need to log in first!
1. Go to login page
2. Log in with valid credentials
3. Verify session ID is stored

---

### Check 2: Are Headers Being Sent?

**Console → Network Tab:**
1. Click "Find pubs in Leeds"
2. Look for request to `/api/execute-action` or similar
3. Click the request
4. Check "Request Headers"
5. Look for:
   - `x-session-id: <some-value>` ✅
   - `Cookie: ...` ✅

**If headers missing:** Auth code might not be executing
**If headers present but still 401:** Backend issue (not ClaudeService)

---

### Check 3: Backend Auth Middleware

Check if backend is validating sessions:

**File to check:** `server/auth.ts` or `server/middleware/auth.ts`

**Look for:**
```typescript
// Does this exist?
export function requireAuth(req, res, next) {
  const sessionId = req.headers['x-session-id'];
  // ... validation logic
}
```

**Common issues:**
- Middleware not applied to tool routes
- Session validation rejecting valid sessions
- Session expired but frontend still has old ID

---

### Check 4: Server Logs

**Run server with logging:**
```bash
cd server
npm run dev
```

**Watch for:**
```
GET /api/execute-action
Headers: { 'x-session-id': '<id>' }
Auth: PASSED ✅  OR  Auth: FAILED ❌
```

---

## Summary Decision Tree

```
Is app running?
├─ NO → Start it: npm run dev (client & server)
└─ YES → Test a tool
         ├─ 401 error?
         │  ├─ NO → ✅ Auth is working! Mark task complete
         │  └─ YES → Check session ID in localStorage
         │           ├─ Present → Check headers being sent
         │           │           ├─ Headers sent → Backend issue (not ClaudeService)
         │           │           └─ Headers not sent → ClaudeService bug (unexpected!)
         │           └─ Missing → Need to log in first
```

---

## Most Likely Scenarios

### Scenario 1: Task Is Already Complete (90% chance)
- Auth code exists ✅
- Session ID method exists ✅
- Headers being added ✅
- **You just need to test and verify it works**

### Scenario 2: Not Logged In (8% chance)
- Auth code is fine ✅
- But no session in localStorage
- **Solution:** Log in, then test

### Scenario 3: Backend Issue (2% chance)
- Frontend auth code is correct ✅
- Headers are being sent ✅
- But backend rejecting them
- **Solution:** Fix backend middleware (different task)

---

## Quick Verification Command

Run this in console to check everything:

```javascript
console.log('=== AUTH STATUS CHECK ===');

// Check localStorage
const auth = localStorage.getItem('wyshbone_auth');
if (!auth) {
  console.error('❌ No auth in localStorage - need to log in');
} else {
  const parsed = JSON.parse(auth);
  console.log('✅ Auth present:', {
    sessionId: parsed.sessionId ? 'present' : 'MISSING',
    userId: parsed.userId || 'unknown'
  });
}

// Check ClaudeService code
console.log('\n=== CHECKING CLAUDESERVICE CODE ===');
fetch('/src/services/ClaudeService.ts')
  .then(r => r.text())
  .then(code => {
    const hasCredentials = code.includes("credentials: 'include'");
    const hasSessionHeader = code.includes('x-session-id');
    const hasGetSessionId = code.includes('getSessionId()');

    console.log('Auth code status:');
    console.log('  credentials include:', hasCredentials ? '✅' : '❌');
    console.log('  x-session-id header:', hasSessionHeader ? '✅' : '❌');
    console.log('  getSessionId method:', hasGetSessionId ? '✅' : '❌');

    if (hasCredentials && hasSessionHeader && hasGetSessionId) {
      console.log('\n✅ All auth code is present!');
      console.log('Next: Test a tool and check for 401 errors');
    } else {
      console.log('\n❌ Auth code incomplete!');
    }
  });
```

---

## After Verification

### If Working:
1. Mark task complete (script above)
2. Move to Task 2 (Test all tools)

### If Not Working:
1. Share console output with me
2. Share network request headers
3. We'll debug together

---

**Expected Result:** Task 1 is already complete, you just need to verify and mark it! ✅
