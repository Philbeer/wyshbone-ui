# ✨ One-Click Dev Launcher - Setup Complete

## What Changed

I've created a Windows-safe, one-click dev launcher for the Wyshbone stack.

## New Commands

### Start Everything
```bash
npm run up
```

**What happens:**
1. ✅ Kills any processes on ports 5173, 5001, 3001, 3000 (automatic cleanup)
2. ✅ Waits 1 second for cleanup
3. ✅ Starts all 4 services with color-coded logs:
   - **Frontend** (magenta): http://localhost:5173
   - **Backend** (cyan): http://localhost:5001
   - **Supervisor** (yellow): http://localhost:3001
   - **Tower** (green): http://localhost:3000
4. ✅ Press Ctrl+C to stop everything cleanly

### Stop Everything
```bash
npm run down
```

**What happens:**
- Kills all dev processes
- Clean shutdown
- Safe to run anytime

## Files Created

1. **`scripts/dev-up.js`** - Main launcher (auto-clean + start all)
2. **`scripts/dev-down.js`** - Clean shutdown
3. **`README-DEV.md`** - Developer quick reference
4. **`ONE-CLICK-SETUP.md`** - This file
5. **Updated `package.json`** - Added "up" and "down" commands
6. **Updated `CLAUDE.md`** - Added one-click commands section

## Technical Details

✅ **Windows-safe**: Works with spaces in username (C:\Users\Phil Waite)
✅ **No cmd.exe dependency**: Pure Node.js using spawn/execSync
✅ **Auto-cleanup**: Always kills ports before starting (never blocked)
✅ **Smart process management**: Uses taskkill on Windows for clean shutdown
✅ **Color-coded logs**: Easy to see which service logs what

## How It Works

1. **Port Killing**: Uses `netstat -ano | findstr :PORT` to find PIDs, then `taskkill /F /PID` to kill
2. **Process Spawning**: Uses Node's `spawn()` with shell:true for cross-platform compatibility
3. **No cmd.exe**: All commands use PowerShell-compatible patterns
4. **Path handling**: Uses `resolve()` with `..` for parent directory navigation

## Testing

```bash
# Test shutdown (should show "No services were running")
npm run down

# Test startup (should start all 4 services)
npm run up

# Test manual shutdown (Ctrl+C should cleanly stop all services)
# Then test shutdown command again
npm run down
```

## Existing Commands (Still Available)

```bash
npm run dev          # UI frontend + backend only (no auto-kill)
npm run dev:all      # All services (requires ports free, no auto-kill)
npm run dev:clean    # Just kill ports (doesn't start services)
```

## Phil's Workflow

**Starting work:**
```bash
cd C:\Users\Phil Waite\Documents\GitHub\wyshbone-ui
npm run up
```
☕ Grab coffee while it starts. Everything just works.

**Done for the day:**
Press Ctrl+C or run `npm run down`

**Restarting after changes:**
Press Ctrl+C, then `npm run up` again

## Troubleshooting

**Q: Services won't start?**
A: Make sure wyshbone-supervisor and wyshbone-control-tower exist in parent directory

**Q: Port conflicts?**
A: Run `npm run down` first, then `npm run up`

**Q: Want just one service?**
A: Use individual commands:
- `npm run dev:backend` (just API)
- `npm run dev:ui` (just frontend)
- `cd ../wyshbone-supervisor && npm run dev` (just supervisor)

---

**Status**: ✅ Ready to use
**Next step**: `npm run up`
