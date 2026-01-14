#!/usr/bin/env node
/**
 * dev-all.js - Start all dev services with fixed ports
 *
 * Services:
 *   5173 - Frontend (Vite)
 *   5001 - UI Backend (Express)
 *   3001 - Supervisor
 *   3000 - Tower
 *
 * If any port is busy, prints an error and suggests running dev:clean.
 * Usage: node scripts/dev-all.js
 */

import { spawn, execSync } from 'child_process';
import { platform } from 'os';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');

const SERVICES = [
  { name: 'Frontend',   port: 5173, cmd: 'npm', args: ['run', 'dev:ui'],        cwd: ROOT_DIR, color: '\x1b[35m' },  // magenta
  { name: 'Backend',    port: 5001, cmd: 'npm', args: ['run', 'dev:backend'],   cwd: ROOT_DIR, color: '\x1b[36m' },  // cyan
  { name: 'Supervisor', port: 3001, cmd: 'npm', args: ['run', 'dev'],           cwd: resolve(ROOT_DIR, '..', 'wyshbone-supervisor'), color: '\x1b[33m', env: { PORT: '3001' } },  // yellow
  { name: 'Tower',      port: 3000, cmd: 'npm', args: ['run', 'dev'],           cwd: resolve(ROOT_DIR, '..', 'wyshbone-control-tower'), color: '\x1b[32m' },  // green
];

const RESET = '\x1b[0m';

function isWindows() {
  return platform() === 'win32';
}

function isPortInUse(port) {
  try {
    if (isWindows()) {
      const result = execSync(`netstat -ano | findstr :${port}`, { 
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'] 
      });
      return result.includes('LISTENING');
    } else {
      execSync(`lsof -ti:${port}`, { stdio: ['pipe', 'pipe', 'pipe'] });
      return true;
    }
  } catch {
    return false;
  }
}

// Check all ports first
console.log('\n🔍 Checking ports...\n');

const busyPorts = [];
for (const svc of SERVICES) {
  const inUse = isPortInUse(svc.port);
  if (inUse) {
    console.log(`❌ Port ${svc.port} (${svc.name}) is BUSY`);
    busyPorts.push(svc);
  } else {
    console.log(`✅ Port ${svc.port} (${svc.name}) is free`);
  }
}

if (busyPorts.length > 0) {
  console.log('\n' + '='.repeat(60));
  console.log('❌ Cannot start dev server - ports are in use!');
  console.log('='.repeat(60));
  console.log('\nRun this to free the ports:');
  console.log('\n   npm run dev:clean\n');
  console.log('Then try again:');
  console.log('\n   npm run dev:all\n');
  process.exit(1);
}

// All ports free - start services
console.log('\n' + '='.repeat(60));
console.log('🚀 Starting Wyshbone Development Stack');
console.log('='.repeat(60));
console.log('');
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
    env: { ...process.env, FORCE_COLOR: '1', ...(svc.env || {}) },
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
      // Windows needs taskkill to kill the process tree
      try {
        execSync(`taskkill /F /T /PID ${child.pid}`, { stdio: 'pipe' });
      } catch {
        // Process may have already exited
      }
    } else {
      child.kill('SIGTERM');
    }
  }
  console.log('\n✨ All services stopped.\n');
  process.exit(0);
});

// Keep the process alive
process.stdin.resume();

