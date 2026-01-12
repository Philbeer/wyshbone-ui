# Wyshbone Development - Quick Start

## One-Click Commands

### Start Everything
```bash
npm run up
```

**What it does:**
1. ✅ Automatically kills any processes on ports 5173, 5001, 3001, 3000
2. ✅ Starts all 4 services:
   - Frontend (Vite): http://localhost:5173
   - Backend (Express): http://localhost:5001
   - Supervisor: http://localhost:3001
   - Tower: http://localhost:3000
3. ✅ Displays color-coded logs from all services
4. ✅ Press Ctrl+C to stop everything

### Stop Everything
```bash
npm run down
```

**What it does:**
- Kills all processes on dev ports
- Safe to run anytime

## How It Works

- ✅ **Windows-safe**: Works with spaces in username
- ✅ **No cmd.exe dependency**: Uses pure Node.js
- ✅ **Auto-cleanup**: Never worry about "port already in use"
- ✅ **One command**: Just `npm run up` and you're ready

## Traditional Commands (still available)

```bash
npm run dev          # UI frontend + backend only
npm run dev:all      # All services (requires ports to be free)
npm run dev:clean    # Just kill ports (doesn't start services)
```

## Troubleshooting

**Q: Port conflicts?**
A: `npm run down` then `npm run up`

**Q: Services not starting?**
A: Check that wyshbone-supervisor and wyshbone-control-tower exist in the parent directory

**Q: Want to start just one service?**
A: Use the traditional commands:
- `npm run dev:backend` - Just the Express API
- `npm run dev:ui` - Just the Vite frontend
- Or cd to ../wyshbone-supervisor and run `npm run dev`
