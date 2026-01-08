# Wyshbone Development Guide for Claude Code

## Debug Bridge System

### Overview
This project uses a custom debug bridge to capture browser console errors and network failures in real-time. The bridge runs independently and must be active during debugging sessions.

### Bridge Location & Status

**Server file:** `C:\Users\Phil Waite\Documents\GitHub\wyshbone-ui\debug-bridge\debug-bridge-server.cjs`

**Port:** 9998 (must not conflict with Chrome extension on 9999)

**Check if running:**
```powershell
curl http://localhost:9998/browser-data
```

**Expected response:** JSON with `{"events":[],"count":0,"timestamp":"..."}` or similar

**If you get connection refused:** Bridge is not running

### Starting the Bridge

**YOU HAVE PERMISSION to start/restart the bridge automatically as needed.**

**To start:**
```powershell
cd "C:\Users\Phil Waite\Documents\GitHub\wyshbone-ui\debug-bridge"
start powershell -Command "node debug-bridge-server.cjs"
```

**Alternative (if above fails):**
```powershell
cd "C:\Users\Phil Waite\Documents\GitHub\wyshbone-ui\debug-bridge"
node debug-bridge-server.cjs
```

Note: The `start powershell` approach runs the bridge in a separate window so it doesn't block your terminal.

### Using the Bridge

**Get all events:**
```powershell
curl http://localhost:9998/browser-data
```

**Get only errors:**
```powershell
curl http://localhost:9998/browser-data/errors
```

**The bridge automatically captures:**
- console.error() messages
- Network request failures (fetch)
- Unhandled JavaScript errors
- Unhandled promise rejections

**Browser client script location:** `client/public/debug-bridge-client.js`

This script is loaded by the Wyshbone app and sends errors to the bridge automatically. Only works on localhost for security.

## Development Workflow

### Application Details
- **App URL:** http://localhost:5173 (Vite dev server)
- **Backend API:** http://localhost:5000
- **Database:** Supabase

### Chrome Integration
You have the Chrome extension enabled. You can:
- Open and control browser tabs
- Navigate to localhost:5173
- Interact with the UI (click buttons, fill forms)
- Test imports and features

### Debugging Xero Imports

**Known Issue:** Order and Product imports from Xero may appear to save but don't actually persist to Supabase.

**Likely Cause:** Duplicate checking or unique constraints blocking inserts despite being in different user sessions.

**Where to look:**
1. Supabase table schemas (check for unique constraints)
2. Import logic in the codebase
3. Duplicate detection/handling code
4. Bridge errors during import attempts

**Steps to debug:**
1. Ensure bridge is running
2. Open app at localhost:5173
3. Navigate to import page
4. Trigger the import
5. Check bridge for errors: `curl http://localhost:9998/browser-data/errors`
6. Analyze errors and fix code
7. Restart dev server if needed
8. Test again

## Troubleshooting

### Bridge Won't Start
- Check if port 9998 is already in use: `netstat -ano | findstr :9998`
- If occupied, kill the process: `taskkill /PID <pid> /F`
- Ensure you're in the correct directory
- Check Node.js is installed: `node --version`

### Bridge Stops Randomly
- Node processes can crash if there are unhandled errors
- Check the PowerShell window where bridge is running for error messages
- Restart the bridge (you have permission)

### Chrome Extension Issues
- Ensure Chrome is running (not Brave, Arc, etc.)
- Extension must be version 1.0.36+
- You're authenticated with Pro account
- Native messaging host is installed

### Port Conflicts
- Chrome extension: port 9999
- Debug bridge: port 9998
- Both must be available

If 9999 is occupied: That's the Chrome extension's port, don't kill it!
If 9998 is occupied: Kill it and restart the bridge

## Permissions

**You (Claude Code) have explicit permission to:**
- ✅ Start/restart the debug bridge as needed
- ✅ Open Chrome browser tabs
- ✅ Navigate to localhost URLs
- ✅ Read all project files
- ✅ Modify code files to fix issues
- ✅ Run bash commands necessary for debugging
- ✅ Query the bridge for error data
- ✅ Restart the Vite dev server if needed

**Autonomous operation:** You don't need to ask permission for standard debugging operations. Just inform the user of significant actions.

## File Structure Notes

**Multiple repos:**
- wyshbone-ui (main frontend)
- wyshbone-supervisor
- wyshbone-tower  
- wyshbone-agents

**Current working directory:** wyshbone-ui

## Important Commands

**Start Vite dev server:**
```powershell
npm run dev
```

**Check running processes:**
```powershell
Get-Process | Where-Object {$_.ProcessName -like "*node*"}
```

**Kill all Node processes (CAUTION):**
```powershell
taskkill /IM node.exe /F
```


---

