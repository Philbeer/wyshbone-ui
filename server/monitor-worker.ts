import { storage } from './storage';
import { executeMonitorAndNotify } from './monitor-executor';
import { shouldSkipDrizzle, recordDbFailure, recordDbSuccess } from './db-utils';

const POLL_INTERVAL = 15 * 1000; // Check every 15 seconds

async function checkAndExecuteMonitors() {
  // Skip Drizzle operations entirely in demo mode or backoff
  // This avoids 20-30 second DNS timeouts
  if (shouldSkipDrizzle()) {
    return; // Skip silently - message logged once in shouldSkipDrizzle
  }

  try {
    const now = Date.now();
    
    // Get all active monitors across all users
    const monitors = await storage.listActiveScheduledMonitors();
    recordDbSuccess(); // DB is working
    
    console.log(`🔍 Checking ${monitors.length} monitors at ${new Date(now).toLocaleTimeString('en-GB')}`);
    
    for (const monitor of monitors) {
      const isActive = monitor.isActive === 1;
      const hasNextRun = monitor.nextRunAt !== null && monitor.nextRunAt !== undefined;
      const isTimeToRun = hasNextRun && monitor.nextRunAt !== null && monitor.nextRunAt <= now;
      
      console.log(`  📊 ${monitor.label}: active=${isActive}, nextRun=${hasNextRun ? new Date(monitor.nextRunAt!).toLocaleString('en-GB') : 'none'}, ready=${isTimeToRun}`);
      
      // Check if monitor is active and it's time to run
      if (isActive && hasNextRun && isTimeToRun && monitor.nextRunAt) {
        console.log(`⏰ Time to run monitor: ${monitor.label} (${monitor.id})`);
        
        try {
          // **FIX: Update nextRunAt IMMEDIATELY to prevent race condition**
          // Without this, the worker can start the same monitor multiple times
          // while the first execution is still running (which takes 30+ seconds)
          const updates: any = {
            lastRunAt: now,
          };
          
          // If schedule is "once", deactivate before running
          if (monitor.schedule === 'once') {
            updates.isActive = 0;
            updates.nextRunAt = null;
          } else {
            // Calculate next run time for recurring schedules
            const nextRun = calculateNextRunTime(monitor);
            updates.nextRunAt = nextRun;
          }
          
          // Update BEFORE executing to prevent duplicate runs
          await storage.updateScheduledMonitor(monitor.id, updates);
          console.log(`🔒 Monitor locked for execution. Next run: ${updates.nextRunAt ? new Date(updates.nextRunAt).toLocaleString('en-GB') : 'none'}`);
          
          // Now execute the monitor (this can take 30+ seconds)
          await executeMonitorAndNotify(monitor as any);
          
          if (monitor.schedule === 'once') {
            console.log(`✅ Monitor "${monitor.label}" ran once and is now inactive`);
          } else {
            console.log(`✅ Monitor "${monitor.label}" executed successfully. Next run: ${new Date(updates.nextRunAt).toLocaleString('en-GB')}`);
          }
        } catch (error) {
          console.error(`❌ Error executing monitor ${monitor.id}:`, error);
        }
      }
    }
  } catch (error: any) {
    recordDbFailure();
    // Only log once per backoff period, not every poll
    if (error.message?.includes('timed out')) {
      console.warn('⚠️ Monitor worker: DB timed out, entering backoff');
    } else {
      console.error('❌ Monitor worker error:', error.message);
    }
  }
}

function calculateNextRunTime(monitor: any): number {
  const now = new Date();
  let nextRun = new Date(now);
  
  // Parse time if provided
  if (monitor.scheduleTime) {
    const [hours, minutes] = monitor.scheduleTime.split(':').map(Number);
    nextRun.setHours(hours, minutes, 0, 0);
  }
  
  // Move to next occurrence based on schedule
  switch (monitor.schedule) {
    case 'hourly':
      // Run every hour from current time
      nextRun = new Date(now.getTime() + 60 * 60 * 1000);
      break;
    case 'daily':
      nextRun.setDate(nextRun.getDate() + 1);
      break;
    case 'weekly':
      nextRun.setDate(nextRun.getDate() + 7);
      break;
    case 'biweekly':
      nextRun.setDate(nextRun.getDate() + 14);
      break;
    case 'monthly':
      nextRun.setMonth(nextRun.getMonth() + 1);
      break;
  }
  
  return nextRun.getTime();
}

export function startMonitorWorker() {
  console.log('🔄 Starting monitor background worker (checking every 15 seconds)');
  
  // Run immediately on startup
  checkAndExecuteMonitors();
  
  // Then poll every 15 seconds
  setInterval(checkAndExecuteMonitors, POLL_INTERVAL);
}
