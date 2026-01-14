#!/usr/bin/env node
/**
 * dev-clean.js - Kill processes on known dev ports (Windows-friendly)
 * 
 * Ports:
 *   5173 - Frontend (Vite)
 *   5001 - UI Backend (Express)
 *   5000 - Supervisor
 *   3000 - Tower
 * 
 * Usage: node scripts/dev-clean.js
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
    // Find the PID using the port
    const result = execSync(`netstat -ano | findstr :${port}`, { 
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'] 
    });
    
    // Parse PIDs from the netstat output
    const pids = new Set();
    const lines = result.trim().split('\n');
    
    for (const line of lines) {
      // Match LISTENING state (the actual server)
      if (line.includes('LISTENING')) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && !isNaN(parseInt(pid))) {
          pids.add(pid);
        }
      }
    }
    
    if (pids.size === 0) {
      return { killed: false, reason: 'no listener' };
    }
    
    // Kill each PID
    const killedPids = [];
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'pipe' });
        killedPids.push(pid);
      } catch {
        // Process may have already exited
      }
    }
    
    return { killed: killedPids.length > 0, pids: killedPids };
  } catch {
    return { killed: false, reason: 'not in use' };
  }
}

function killPortUnix(port) {
  try {
    // Find the PID using lsof
    const result = execSync(`lsof -ti:${port}`, { 
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'] 
    });
    
    const pids = result.trim().split('\n').filter(Boolean);
    
    if (pids.length === 0) {
      return { killed: false, reason: 'no listener' };
    }
    
    // Kill each PID
    const killedPids = [];
    for (const pid of pids) {
      try {
        execSync(`kill -9 ${pid}`, { stdio: 'pipe' });
        killedPids.push(pid);
      } catch {
        // Process may have already exited
      }
    }
    
    return { killed: killedPids.length > 0, pids: killedPids };
  } catch {
    return { killed: false, reason: 'not in use' };
  }
}

function killPort(port) {
  return isWindows() ? killPortWindows(port) : killPortUnix(port);
}

console.log('\n🧹 dev:clean - Freeing dev ports\n');
console.log(`Platform: ${platform()}`);
console.log('');

let anyKilled = false;

for (const port of DEV_PORTS) {
  const label = PORT_LABELS[port] || 'Unknown';
  const result = killPort(port);
  
  if (result.killed) {
    console.log(`✅ Port ${port} (${label}) - Killed PID(s): ${result.pids.join(', ')}`);
    anyKilled = true;
  } else {
    console.log(`⚪ Port ${port} (${label}) - ${result.reason || 'free'}`);
  }
}

console.log('');
if (anyKilled) {
  console.log('✨ Done! Ports freed.');
} else {
  console.log('✨ All ports were already free.');
}
console.log('');

