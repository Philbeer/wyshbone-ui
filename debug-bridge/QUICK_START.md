# Debug Bridge - Quick Start

## 3-Step Setup (30 seconds)

### Step 1: Start Server (Terminal 1)

```bash
node debug-bridge/simple-server.js
```

You should see:
```
🌉 DEBUG BRIDGE SERVER STARTED
Server running on: http://localhost:9999
```

### Step 2: Add to Your HTML

Open `index.html` and add before closing `</body>`:

```html
<script src="/debug-bridge/browser-capture-script.js"></script>
```

Or paste script contents into browser console.

### Step 3: Check Errors (Terminal 2)

```bash
node debug-bridge/check-browser-errors.js
```

**That's it!** 🎉

---

## Testing the 401 Auth Error

### 1. Open your app
```
http://localhost:5173
```

### 2. Open browser console (F12)

### 3. Click a tool button
Example: "Find pubs in Leeds"

### 4. Check captured errors
```bash
node debug-bridge/check-browser-errors.js
```

If you see 401 errors, you'll get:
```
🔴 401 UNAUTHORIZED ERRORS
==================================================

[1/1] 10:23:45 AM
  URL: http://localhost:5173/api/places/search
  Method: POST
  Message: 🔴 401 UNAUTHORIZED

💡 Auth Debug Tips:
   1. Check if session ID exists in localStorage
   2. Verify credentials: "include" in fetch calls
   3. Check x-session-id header is being sent
```

---

## What to Check if 401 Errors Occur

### 1. Check localStorage

**Browser console:**
```javascript
console.log('Session ID:', localStorage.getItem('wyshbone_sid'));
console.log('Auth:', localStorage.getItem('wyshbone_auth'));
```

**Expected:**
- Session ID should exist
- Auth should exist

**If missing:** You need to log in first!

### 2. Check if headers are being sent

**Browser DevTools → Network Tab:**
1. Click a tool button
2. Find the request (e.g., `/api/places/search`)
3. Click on it
4. Go to "Headers" tab
5. Look for:
   - `x-session-id: <some-value>` ✅
   - `Cookie: ...` ✅

**If missing:** ClaudeService not adding headers (but we verified it is!)

### 3. Check backend is accepting session

**Server logs:**
Look for lines like:
```
Session validation: PASSED ✅
```

or

```
Session validation: FAILED ❌
```

**If failed:** Backend auth middleware rejecting valid sessions

---

## Common Scenarios

### Scenario 1: No errors captured

**Possible causes:**
1. Debug server not running
2. Browser script not loaded
3. No errors actually occurring

**Check:**
```bash
# Is server running?
curl http://localhost:9999/health

# Is script loaded? (in browser console)
console.log(typeof window.sendDebugInfo);
// Should output: "function"
```

### Scenario 2: Server won't start

**Error:** `EADDRINUSE: port 9999 already in use`

**Fix:** Kill existing process:
```bash
# Windows
netstat -ano | findstr :9999
taskkill /PID <PID> /F

# Mac/Linux
lsof -ti:9999 | xargs kill
```

### Scenario 3: CORS errors in browser

**Unlikely** - Server has CORS enabled by default.

**If it happens:**
1. Check server is on port 9999
2. Try http://localhost:9999/health in browser
3. Check browser console for specific error

---

## Manual Testing

### Test 1: Server is working

```bash
curl http://localhost:9999/health
```

Expected:
```json
{
  "status": "ok",
  "uptime": 123,
  "browserMessages": 0,
  "codeMessages": 0
}
```

### Test 2: Can send data

**Browser console:**
```javascript
fetch('http://localhost:9999/browser-data', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'test',
    message: 'Testing debug bridge'
  })
});
```

**Then check:**
```bash
node debug-bridge/check-browser-errors.js
```

Should see: "Testing debug bridge" message

### Test 3: Browser script loaded

**Browser console:**
```javascript
// Should see this in console
// 🌉 Debug Bridge: Capture script loaded

// Test manual logging
window.sendDebugInfo('test', 'Manual test message');
// Should see: ✅ Debug info sent to bridge server
```

---

## Watching Errors in Real-Time

**Terminal 1:**
```bash
node debug-bridge/simple-server.js
```

**Terminal 2:**
```bash
# On Mac/Linux
watch -n 2 "node debug-bridge/check-browser-errors.js"

# On Windows (PowerShell)
while ($true) {
  cls
  node debug-bridge/check-browser-errors.js
  Start-Sleep -Seconds 2
}
```

Now every 2 seconds you'll see the latest errors!

---

## Stopping the Server

Press `Ctrl+C` in the terminal running the server.

You'll see:
```
🛑 Shutting down debug bridge server...
   Captured 5 browser messages
   Captured 0 code messages
✅ Server stopped
```

---

## Web UI

Visit http://localhost:9999 in your browser for a web interface with:
- Live stats
- Direct links to data
- Clear messages button
- API documentation

---

## Next Steps After Setup

1. ✅ Server running
2. ✅ Browser script loaded
3. ✅ Check script works

**Now:**
1. Open your app
2. Trigger the 401 error (click a tool)
3. Run: `node debug-bridge/check-browser-errors.js`
4. See exactly what's failing!

---

## Getting Help

**Check the logs:**
- Server terminal shows incoming requests
- Browser console shows if script loaded
- Check script output shows captured errors

**Read the docs:**
- `README.md` - Full documentation
- Code comments - Implementation details

**Test each component:**
1. Server health: `curl http://localhost:9999/health`
2. Script loaded: `typeof window.sendDebugInfo` in console
3. Can send data: Test with fetch (see above)

---

## Summary

```
1. node debug-bridge/simple-server.js          # Start server
2. Add <script> to HTML                         # Load capture
3. node debug-bridge/check-browser-errors.js   # Check errors
```

**3 commands. 30 seconds. Done.** ✅
