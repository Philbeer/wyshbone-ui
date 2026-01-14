# Debug Bridge

A lightweight debugging system to capture browser errors and send them to a local server for analysis.

**No dependencies required** - uses only built-in Node.js modules.

---

## Quick Start

### 1. Start the Debug Server

```bash
node debug-bridge/simple-server.js
```

Server runs on: http://localhost:9999

### 2. Add Browser Capture Script

Add this to your HTML (e.g., `index.html`):

```html
<!-- Add before closing </body> tag -->
<script src="/debug-bridge/browser-capture-script.js"></script>
```

Or paste the script contents directly into browser console.

### 3. Open Your App and Trigger Errors

Open your app (e.g., http://localhost:5173) and interact with it.

### 4. Check Captured Errors

```bash
node debug-bridge/check-browser-errors.js
```

---

## What Gets Captured

### Browser Errors:
- ❌ `console.error()` calls
- ⚠️ `console.warn()` calls
- 🔴 Network errors (4xx, 5xx responses)
- 🚨 401 Unauthorized errors (highlighted)
- 💥 Unhandled JavaScript errors
- 🔥 Unhandled promise rejections
- 📡 Failed fetch/XHR requests

### Metadata Captured:
- Timestamp
- URL where error occurred
- Stack traces
- Request method
- Request headers
- HTTP status codes

---

## Files

| File | Purpose |
|------|---------|
| `simple-server.js` | HTTP server on port 9999 |
| `browser-capture-script.js` | Browser-side error capture |
| `check-browser-errors.js` | CLI to view captured errors |
| `README.md` | This file |

---

## Usage Examples

### Example 1: Debug 401 Auth Errors

**Terminal 1:**
```bash
node debug-bridge/simple-server.js
```

**Terminal 2 (add to your HTML or console):**
```html
<script src="/debug-bridge/browser-capture-script.js"></script>
```

**Browser:**
- Open your app
- Click a tool button (e.g., "Find pubs in Leeds")
- Trigger the 401 error

**Terminal 3:**
```bash
node debug-bridge/check-browser-errors.js
```

You'll see:
```
🔴 401 UNAUTHORIZED ERRORS
==================================================

[1/1] 10:23:45 AM
  URL: http://localhost:5173/api/places/search
  Method: POST
  Headers: {"Content-Type":"application/json"}
  Message: 🔴 401 UNAUTHORIZED

💡 Auth Debug Tips:
   1. Check if session ID exists in localStorage
   2. Verify credentials: "include" in fetch calls
   3. Check x-session-id header is being sent
   4. Verify backend is accepting session headers
```

### Example 2: Manual Debug Logging

In browser console:

```javascript
// Send custom debug info
window.sendDebugInfo('custom', 'Testing auth flow', {
  sessionId: localStorage.getItem('wyshbone_sid'),
  hasAuth: !!localStorage.getItem('wyshbone_auth'),
  timestamp: new Date().toISOString()
});
```

Then check:
```bash
node debug-bridge/check-browser-errors.js
```

### Example 3: Continuous Monitoring

Watch for errors in real-time:

**Terminal 1:**
```bash
node debug-bridge/simple-server.js
```

**Terminal 2:**
```bash
# Run check every 5 seconds
while true; do
  clear
  node debug-bridge/check-browser-errors.js
  sleep 5
done
```

### Example 4: Test the System

**Terminal 1:**
```bash
node debug-bridge/simple-server.js
```

**Browser console:**
```javascript
// Test sending data
fetch('http://localhost:9999/browser-data', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'test',
    message: 'Hello from browser!',
    url: window.location.href
  })
});
```

**Terminal 2:**
```bash
node debug-bridge/check-browser-errors.js
```

Should see: "Hello from browser!" message

---

## API Reference

### Server Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/browser-data` | Receive browser errors |
| GET | `/browser-data` | Retrieve all browser errors |
| POST | `/code-data` | Receive code debug data |
| GET | `/code-data` | Retrieve code debug data |
| GET | `/health` | Server health check |
| POST | `/clear` | Clear all stored messages |
| GET | `/` | Web UI status page |

### Browser API

After loading `browser-capture-script.js`:

```javascript
// Manual debug logging
window.sendDebugInfo(type, message, data);

// Example
window.sendDebugInfo('auth-check', 'Checking session', {
  hasSession: !!localStorage.getItem('wyshbone_sid'),
  timestamp: Date.now()
});
```

---

## Configuration

### Change Server Port

Edit `simple-server.js`:
```javascript
const PORT = 9999; // Change to your preferred port
```

### Change Max Stored Messages

Edit `simple-server.js`:
```javascript
const MAX_MESSAGES = 50; // Change to store more/less
```

### Change Debug Server URL

Edit `browser-capture-script.js`:
```javascript
const DEBUG_SERVER = 'http://localhost:9999'; // Change URL
```

---

## Troubleshooting

### Error: "Could not connect to debug server"

**Cause:** Debug server not running

**Fix:**
```bash
node debug-bridge/simple-server.js
```

### Error: "CORS error" in browser

**Cause:** Browser blocking cross-origin requests

**Fix:** Server has CORS enabled by default. If still blocked:
1. Check if server is running on port 9999
2. Try accessing http://localhost:9999/health in browser
3. Check browser console for specific CORS error

### No errors captured

**Causes:**
1. Browser capture script not loaded
2. No errors actually occurring
3. Errors happening before script loads

**Fix:**
1. Add script to HTML before other scripts
2. Check browser console for "🌉 Debug Bridge: Capture script loaded"
3. Trigger an error manually: `throw new Error('test')`

### Server shows "socket hang up"

**Cause:** Client disconnected before response sent

**Fix:** This is normal for `navigator.sendBeacon` - data is still captured

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER                               │
│                                                              │
│  1. Error occurs → browser-capture-script.js intercepts     │
│  2. Script sends to http://localhost:9999/browser-data      │
│                                                              │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           │ HTTP POST
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   DEBUG SERVER (Port 9999)                   │
│                                                              │
│  1. Receives error data                                     │
│  2. Stores in memory (max 50)                               │
│  3. Logs to console                                         │
│  4. Provides API to retrieve                                │
│                                                              │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           │ HTTP GET
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│               CHECK SCRIPT (Node.js)                         │
│                                                              │
│  1. Fetches errors from server                              │
│  2. Groups by type                                          │
│  3. Highlights 401 errors                                   │
│  4. Displays in terminal with colors                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Integration with Your App

### Vite/React App

Add to `index.html`:
```html
<!DOCTYPE html>
<html>
  <head>
    <title>Your App</title>
  </head>
  <body>
    <div id="root"></div>

    <!-- Add debug bridge script in development -->
    <script>
      if (import.meta.env.DEV) {
        const script = document.createElement('script');
        script.src = '/debug-bridge/browser-capture-script.js';
        document.body.appendChild(script);
      }
    </script>

    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### Conditional Loading

Only load in development:
```html
<script>
  if (window.location.hostname === 'localhost') {
    const script = document.createElement('script');
    script.src = '/debug-bridge/browser-capture-script.js';
    document.body.appendChild(script);
  }
</script>
```

---

## Web UI

Visit http://localhost:9999 in your browser for a web-based status page with:
- Server statistics
- Message counts
- Direct links to data endpoints
- Clear messages button
- Quick start examples

---

## Best Practices

1. **Always run debug server first**
   ```bash
   node debug-bridge/simple-server.js
   ```

2. **Load capture script early** - Add at top of HTML so it catches all errors

3. **Check errors regularly** - Run check script after testing features

4. **Clear old messages** - Use POST `/clear` to reset between sessions

5. **Use manual logging** - Add `window.sendDebugInfo()` calls in critical code paths

6. **Monitor 401s specifically** - Check script highlights these automatically

---

## Production Use

**DO NOT USE IN PRODUCTION**

This is a development debugging tool only:
- Stores data in memory (lost on restart)
- No authentication
- No rate limiting
- Sends all errors to localhost

For production error tracking, use:
- Sentry
- LogRocket
- Rollbar
- Custom error reporting service

---

## Advantages

✅ **No dependencies** - Uses only Node.js built-ins
✅ **Simple** - 3 files, ~500 lines total
✅ **Fast** - Minimal overhead
✅ **Privacy** - Data never leaves your machine
✅ **Flexible** - Easy to customize
✅ **Cross-browser** - Works in all modern browsers

---

## Next Steps

1. Start the server: `node debug-bridge/simple-server.js`
2. Add script to your HTML
3. Open your app and trigger some errors
4. Check errors: `node debug-bridge/check-browser-errors.js`
5. Debug and fix the issues!

---

## Questions?

Check the code - it's well-commented:
- `simple-server.js` - Server implementation
- `browser-capture-script.js` - Browser capture logic
- `check-browser-errors.js` - CLI display logic
