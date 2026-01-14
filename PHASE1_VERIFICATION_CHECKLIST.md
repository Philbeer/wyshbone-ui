# Phase 1 Verification Checklist

**Purpose:** Manual verification of Phase 1 task completions
**Estimated Total Time:** 45 minutes
**Date:** 2026-01-04

---

## Task 1: Fix 401 Authentication Errors

**Estimated Time:** 5 minutes
**Status:** ⬜ Not Verified

### Verification Steps

1. **Open Browser Developer Console**
   - [ ] Navigate to http://localhost:5173
   - [ ] Open Developer Tools (F12)
   - [ ] Go to Network tab
   - [ ] Clear console

2. **Execute a Tool**
   - [ ] Click on any tool in the UI (e.g., Search Places)
   - [ ] Fill in required parameters
   - [ ] Submit the tool request

3. **Check Network Request**
   - [ ] Find the POST request in Network tab
   - [ ] Click on the request
   - [ ] Go to "Headers" section

4. **Verify Headers**
   - [ ] ✅ Request Headers include `x-session-id: <some-value>`
   - [ ] ✅ Request Headers include `Cookie: <session-cookie>`
   - [ ] ✅ Request includes `credentials: include` (check in fetch call)

5. **Check Response**
   - [ ] ✅ Response status is 200 OK (not 401)
   - [ ] ✅ Response body contains data (not auth error)

6. **Check Console**
   - [ ] ✅ No 401 errors in console
   - [ ] ✅ No authentication failures logged

### Expected Result
✅ All requests include authentication headers
✅ No 401 errors occur
✅ Tools execute successfully

### If Verification Fails
- Check if session is stored (localStorage or sessionStorage)
- Verify backend session middleware is configured
- Check CORS settings allow credentials

---

## Task 2: Test All 6 Tools Execute Correctly

**Estimated Time:** 30 minutes (5 minutes per tool)
**Status:** ⬜ Not Verified

### Tool 1: search_google_places

- [ ] Navigate to search tool in UI
- [ ] Enter test query: `query: "pubs", location: "London"`
- [ ] Execute tool
- [ ] ✅ Tool returns results (not error)
- [ ] ✅ Results contain places array
- [ ] ✅ Each place has name, address, location

**Alternative: API Test**
```bash
curl -X POST http://localhost:5000/api/tools/execute \
  -H "Content-Type: application/json" \
  -d '{"tool": "search_google_places", "params": {"query": "pubs", "location": "London"}}'
```

**Expected:** `{"ok": true, "data": { "places": [...] }}`

### Tool 2: deep_research

- [ ] Navigate to research tool in UI
- [ ] Enter test topic: `topic: "craft beer trends"`
- [ ] Execute tool
- [ ] ✅ Tool returns results (not error)
- [ ] ✅ Results contain research findings
- [ ] ✅ Data includes insights or summary

**Alternative: API Test**
```bash
curl -X POST http://localhost:5000/api/tools/execute \
  -H "Content-Type: application/json" \
  -d '{"tool": "deep_research", "params": {"topic": "craft beer trends"}}'
```

**Expected:** `{"ok": true, "data": { "findings": [...] }}`

### Tool 3: batch_contact_finder

- [ ] Navigate to contact finder tool in UI
- [ ] Enter test query: `query: "breweries", location: "Manchester"`
- [ ] Execute tool
- [ ] ✅ Tool returns results (not error)
- [ ] ✅ Results contain contacts array
- [ ] ✅ Each contact has email or contact info

**Alternative: API Test**
```bash
curl -X POST http://localhost:5000/api/tools/execute \
  -H "Content-Type: application/json" \
  -d '{"tool": "batch_contact_finder", "params": {"query": "breweries", "location": "Manchester"}}'
```

**Expected:** `{"ok": true, "data": { "contacts": [...] }}`

### Tool 4: draft_email

- [ ] Navigate to email draft tool in UI
- [ ] Enter test params: `recipient: "John", subject: "Hello"`
- [ ] Execute tool
- [ ] ✅ Tool returns results (not error)
- [ ] ✅ Results contain email draft
- [ ] ✅ Draft has subject, body, salutation

**Alternative: API Test**
```bash
curl -X POST http://localhost:5000/api/tools/execute \
  -H "Content-Type: application/json" \
  -d '{"tool": "draft_email", "params": {"recipient": "John", "subject": "Hello"}}'
```

**Expected:** `{"ok": true, "data": { "email": "..." }}`

### Tool 5: get_nudges

- [ ] Navigate to nudges tool in UI (if exposed)
- [ ] Execute tool with user ID
- [ ] ✅ Tool returns results (not error)
- [ ] ✅ Results contain nudges array (may be empty)

**Alternative: API Test**
```bash
curl -X POST http://localhost:5000/api/tools/execute \
  -H "Content-Type: application/json" \
  -d '{"tool": "get_nudges", "params": {"userId": "test-user", "limit": 10}}'
```

**Expected:** `{"ok": true, "data": { "nudges": [...] }}`

### Tool 6: create_scheduled_monitor

- [ ] Navigate to scheduled monitor tool in UI
- [ ] Enter test params: `label: "Test Monitor", schedule: "daily"`
- [ ] Execute tool
- [ ] ✅ Tool returns results (not error)
- [ ] ✅ Results contain monitor ID
- [ ] ✅ Monitor is created successfully

**Alternative: API Test**
```bash
curl -X POST http://localhost:5000/api/tools/execute \
  -H "Content-Type: application/json" \
  -d '{"tool": "create_scheduled_monitor", "params": {"label": "Test", "schedule": "daily"}}'
```

**Expected:** `{"ok": true, "data": { "monitorId": "..." }}`

### Summary Check

- [ ] ✅ All 6 tools tested
- [ ] ✅ All 6 tools return data (not errors)
- [ ] ✅ No crashes or exceptions
- [ ] ✅ Response format consistent across tools

---

## Task 3: Fix Results Display in UI

**Estimated Time:** 10 minutes
**Status:** ⬜ Not Verified

### Verification Steps

1. **Execute Search Tool**
   - [ ] Open UI in browser
   - [ ] Navigate to Search Places tool
   - [ ] Enter query: `"pubs"`, location: `"London"`
   - [ ] Click Execute

2. **Check Results Panel**
   - [ ] ✅ Right panel opens or updates
   - [ ] ✅ Panel shows "Quick Search Results" or similar title
   - [ ] ✅ Results display in QuickSearchFullView
   - [ ] ✅ Each result has: name, address, map link

3. **Execute Research Tool**
   - [ ] Navigate to Deep Research tool
   - [ ] Enter topic: `"craft beer market"`
   - [ ] Click Execute

4. **Check Research Results**
   - [ ] ✅ Results panel updates to DeepResearchFullView
   - [ ] ✅ Research findings display
   - [ ] ✅ Data is formatted and readable

5. **Execute Contact Finder**
   - [ ] Navigate to Batch Contact Finder
   - [ ] Enter query and location
   - [ ] Click Execute

6. **Check Contact Results**
   - [ ] ✅ Results panel updates to EmailFinderFullView
   - [ ] ✅ Contacts display with emails
   - [ ] ✅ Data is formatted in table or cards

7. **Execute Scheduled Monitor**
   - [ ] Navigate to Create Monitor tool
   - [ ] Enter monitor details
   - [ ] Click Execute

8. **Check Monitor Results**
   - [ ] ✅ Results panel updates to ScheduledMonitorFullView
   - [ ] ✅ Monitor configuration displays
   - [ ] ✅ Success message shown

### Negative Test

9. **Test Empty Results**
   - [ ] Execute a search with no results
   - [ ] ✅ Panel shows "No results found" (not "No Output Available")
   - [ ] ✅ Empty state is user-friendly

### Expected Result
✅ All tool results display correctly in appropriate views
✅ No "No Output Available" errors (unless truly no data)
✅ Views render cleanly without layout issues

### If Verification Fails
- Check if ResultsPanel is imported in App.tsx
- Verify ResultsPanelContext is wrapping app
- Check browser console for React errors
- Inspect ResultsPanel component rendering

---

## Task 4: Unify Tool Execution (Eliminate Duplication)

**Estimated Time:** N/A (requires refactoring first)
**Status:** ❌ Not Complete (Duplication Confirmed)

### Pre-Refactoring Check ✅ DONE

- [x] ✅ Confirmed UI implementation exists (server/lib/actions.ts)
- [x] ✅ Confirmed Supervisor duplication exists (server/actions/executors.ts, registry.ts)
- [x] ✅ Verified Supervisor does NOT call UI endpoint
- [x] ✅ Documented duplication in audit report

### Post-Refactoring Verification (After Implementation)

#### Step 1: Verify Supervisor Refactoring

- [ ] Navigate to ../wyshbone-supervisor/
- [ ] Check `server/lib/toolClient.ts` exists
- [ ] Verify toolClient.ts has `callTool()` function
- [ ] Confirm function calls UI endpoint: `http://localhost:5173/api/tools/execute`

#### Step 2: Verify Duplicate Files Removed

- [ ] ✅ `server/actions/executors.ts` deleted or empty
- [ ] ✅ `server/actions/registry.ts` deleted or empty
- [ ] Run: `find ../wyshbone-supervisor/server/actions -name "*.ts" | wc -l`
- [ ] ✅ Expected: 0 (or only non-tool files remain)

#### Step 3: Test End-to-End

1. **Start UI Server**
   ```bash
   cd wyshbone-ui
   npm run dev
   # Verify running on http://localhost:5173
   ```

2. **Start Supervisor**
   ```bash
   cd ../wyshbone-supervisor
   npm run dev
   # Verify no startup errors
   ```

3. **Test Supervisor Tool Call**
   - [ ] Supervisor makes HTTP call to UI
   - [ ] UI endpoint receives request
   - [ ] Tool executes successfully
   - [ ] Result returns to Supervisor
   - [ ] ✅ No errors in either console

4. **Verify No Duplication**
   - [ ] ✅ Supervisor has NO local tool implementations
   - [ ] ✅ Supervisor calls UI for all tool executions
   - [ ] ✅ Single source of truth maintained

### Expected Result
✅ Supervisor calls UI endpoint for all tools
✅ No duplicate tool code exists
✅ Single implementation in UI serves both apps

### If Verification Fails
- Check UI server is running and accessible from Supervisor
- Verify network requests in Supervisor console
- Check CORS settings allow Supervisor → UI calls
- Ensure toolClient.ts handles errors properly

---

## Additional Verification: Tower Integration

**Estimated Time:** 5 minutes
**Status:** ⬜ Not Verified (Optional)

### Check Tower Logging

1. **Verify Tower Client**
   - [ ] Check `server/lib/towerClient.ts` exists
   - [ ] Verify `TOWER_URL` environment variable set
   - [ ] Verify `TOWER_API_KEY` environment variable set

2. **Test Logging**
   - [ ] Execute a tool
   - [ ] Check if Tower logging attempted
   - [ ] Verify log sent to Tower backend (if accessible)

3. **Expected Behavior**
   - [ ] If Tower configured: Logs sent successfully
   - [ ] If Tower not configured: Logs skipped silently (no errors)

---

## Additional Verification: Agent Activities Schema

**Estimated Time:** 5 minutes
**Status:** ⬜ Not Verified (Optional)

### Check Database Schema

1. **Verify Migration Applied**
   ```bash
   psql $DATABASE_URL -c "\d agent_activities"
   ```
   - [ ] ✅ Table exists
   - [ ] ✅ All 15 columns present

2. **Test API Endpoints**
   ```bash
   # Test fetch activities
   curl http://localhost:5000/api/agent-activities

   # Test stats
   curl http://localhost:5000/api/agent-activities/stats/summary
   ```
   - [ ] ✅ Endpoints return valid responses
   - [ ] ✅ No 404 or 500 errors

3. **Test UI Component**
   - [ ] Open UI in browser
   - [ ] Navigate to Activity Feed (if exposed)
   - [ ] ✅ Activity Feed renders
   - [ ] ✅ Shows activities (or empty state if none)

---

## Final Summary Checklist

### Phase 1 Tasks

- [ ] **Task 1:** Authentication verified (5 min) ✅
- [ ] **Task 2:** All 6 tools tested (30 min) ✅
- [ ] **Task 3:** Results display verified (10 min) ✅
- [ ] **Task 4:** Tool unification complete ❌ (requires refactoring)

### Additional Components

- [ ] Tower integration checked (optional)
- [ ] Agent activities schema verified (optional)

### Total Time

**Required:** 45 minutes (Tasks 1-3)
**Optional:** +10 minutes (Tower + Activities)
**Total:** 45-55 minutes

---

## Sign-Off

**Verifier:** ________________________

**Date:** ________________________

**Phase 1 Status:**
- [ ] ✅ All verified and complete
- [ ] ⚠️ Mostly complete (Task 4 pending)
- [ ] ❌ Issues found (document below)

**Issues Found:**

```
(Document any issues here)
```

**Ready for Phase 2:**
- [ ] YES - All tasks verified
- [ ] NO - Complete Task 4 first

---

**Next Step:** Complete Task 4 refactoring, then re-run this checklist! 🚀
