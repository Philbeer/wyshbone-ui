#!/usr/bin/env node
/**
 * dev-up.js - One-click dev launcher
 *
 * Automatically:
 * 1. Kills processes on all dev ports (5173, 5001, 5000, 3000)
 * 2. Starts all services
 *
 * Usage: npm run up
 */

import { execSync, spawn } from 'child_process';
import { platform } from 'os';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');

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
console.log('🚀 Wyshbone One-Click Dev Launcher');
console.log('='.repeat(60));
console.log('');

// Step 1: Clean ports
console.log('🧹 Step 1: Freeing ports...\n');

let anyKilled = false;
for (const port of DEV_PORTS) {
  const label = PORT_LABELS[port] || 'Unknown';
  const result = killPort(port);

  if (result.killed) {
    console.log(`   ✅ Port ${port} (${label}) - Freed`);
    anyKilled = true;
  } else {
    console.log(`   ⚪ Port ${port} (${label}) - Already free`);
  }
}

if (anyKilled) {
  console.log('\n   ✨ Ports freed. Waiting 1 second for cleanup...\n');
  await new Promise(resolve => setTimeout(resolve, 1000));
} else {
  console.log('\n   ✨ All ports already free.\n');
}

// Step 2: Start services
console.log('🚀 Step 2: Starting services...\n');

const SERVICES = [
  { name: 'Frontend',   port: 5173, cmd: 'npm', args: ['run', 'dev:ui'],      cwd: ROOT_DIR, color: '\x1b[35m', env: {} },
  { name: 'Backend',    port: 5001, cmd: 'npm', args: ['run', 'dev:backend'], cwd: ROOT_DIR, color: '\x1b[36m', env: {} },
  { name: 'Supervisor', port: 3001, cmd: 'npm', args: ['run', 'dev'],         cwd: resolve(ROOT_DIR, '..', 'wyshbone-supervisor'), color: '\x1b[33m', env: { PORT: '3001' } },
  { name: 'Tower',      port: 3000, cmd: 'npm', args: ['run', 'dev'],         cwd: resolve(ROOT_DIR, '..', 'wyshbone-control-tower'), color: '\x1b[32m', env: {} },
];

const RESET = '\x1b[0m';

console.log('='.repeat(60));
console.log('Services:');
console.log(`   Frontend:   http://localhost:5173`);
console.log(`   Backend:    http://localhost:5001`);
console.log(`   Supervisor: http://localhost:3001`);
console.log(`   Tower:      http://localhost:3000`);
console.log('');
console.log('Press Ctrl+C to stop all services.');
console.log('='.repeat(60));
console.log('');

const children = [];

for (const svc of SERVICES) {
  const prefix = `${svc.color}[${svc.name.padEnd(10)}]${RESET}`;

  const child = spawn(svc.cmd, svc.args, {
    cwd: svc.cwd,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1', ...svc.env },
  });

  children.push({ name: svc.name, process: child });

  child.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      console.log(`${prefix} ${line}`);
    }
  });

  child.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      console.log(`${prefix} ${line}`);
    }
  });

  child.on('exit', (code) => {
    console.log(`${prefix} Process exited with code ${code}`);
  });
}

// Handle Ctrl+C - kill all children
process.on('SIGINT', () => {
  console.log('\n\n🛑 Stopping all services...\n');
  for (const { name, process: child } of children) {
    console.log(`   Stopping ${name}...`);
    if (isWindows()) {
      try {
        execSync(`taskkill /F /T /PID ${child.pid}`, { stdio: 'pipe' });
      } catch {}
    } else {
      child.kill('SIGTERM');
    }
  }
  console.log('\n✨ All services stopped.\n');
  process.exit(0);
});

// Keep the process alive
process.stdin.resume();
