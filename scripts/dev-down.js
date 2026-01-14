#!/usr/bin/env node
/**
 * dev-down.js - Stop all dev services
 *
 * Kills processes on all dev ports (5173, 5001, 5000, 3000)
 *
 * Usage: npm run down
 */

import { execSync } from 'child_process';
import { platform } from 'os';

const DEV_PORTS = [5173, 5001, 3001, 3000];

const PORT_LABELS = {
  5173: 'Frontend (Vite)',
  5001: 'UI Backend',
  3001: 'Supervisor',
  3000: 'Tower',
};

function isWindows() {
  return platform() === 'win32';
}

function killPortWindows(port) {
  try {
    const result = execSync(`netstat -ano | findstr :${port}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const pids = new Set();
    const lines = result.trim().split('\n');

    for (const line of lines) {
      if (line.includes('LISTENING')) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && !isNaN(parseInt(pid))) {
          pids.add(pid);
        }
      }
    }

    if (pids.size === 0) {
      return { killed: false };
    }

    const killedPids = [];
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'pipe' });
        killedPids.push(pid);
      } catch {}
    }

    return { killed: killedPids.length > 0, pids: killedPids };
  } catch {
    return { killed: false };
  }
}

function killPortUnix(port) {
  try {
    const result = execSync(`lsof -ti:${port}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const pids = result.trim().split('\n').filter(Boolean);

    if (pids.length === 0) {
      return { killed: false };
    }

    const killedPids = [];
    for (const pid of pids) {
      try {
        execSync(`kill -9 ${pid}`, { stdio: 'pipe' });
        killedPids.push(pid);
      } catch {}
    }

    return { killed: killedPids.length > 0, pids: killedPids };
  } catch {
    return { killed: false };
  }
}

function killPort(port) {
  return isWindows() ? killPortWindows(port) : killPortUnix(port);
}

console.log('\n' + '='.repeat(60));
console.log('🛑 Stopping Wyshbone Development Stack');
console.log('='.repeat(60));
console.log('');

let anyKilled = false;

for (const port of DEV_PORTS) {
  const label = PORT_LABELS[port] || 'Unknown';
  const result = killPort(port);

  if (result.killed) {
    console.log(`   ✅ Port ${port} (${label}) - Stopped`);
    anyKilled = true;
  } else {
    console.log(`   ⚪ Port ${port} (${label}) - Not running`);
  }
}

console.log('');
if (anyKilled) {
  console.log('✨ All services stopped.');
} else {
  console.log('✨ No services were running.');
}
console.log('');
