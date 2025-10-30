import { storage } from './storage';
import { executeMonitorAndNotify } from './monitor-executor';

const POLL_INTERVAL = 60 * 1000; // Check every minute

async function checkAndExecuteMonitors() {
  try {
    const now = Date.now();
    
    // Get all monitors for demo-user (in production, you'd query all users)
    const monitors = await storage.listScheduledMonitors('demo-user');
    
    for (const monitor of monitors) {
      // Check if monitor is active and it's time to run
      if (monitor.isActive === 1 && monitor.nextRunAt && monitor.nextRunAt <= now) {
        console.log(`⏰ Time to run monitor: ${monitor.label} (${monitor.id})`);
        
        try {
          // Execute the monitor and send email if enabled
          await executeMonitorAndNotify(monitor);
          
          // Update monitor after execution
          const updates: any = {
            lastRunAt: now,
          };
          
          // If schedule is "once", deactivate after running
          if (monitor.schedule === 'once') {
            updates.isActive = 0;
            updates.nextRunAt = null;
            console.log(`✅ Monitor "${monitor.label}" ran once and is now inactive`);
          } else {
            // Calculate next run time for recurring schedules
            const nextRun = calculateNextRunTime(monitor);
            updates.nextRunAt = nextRun;
            console.log(`✅ Monitor "${monitor.label}" executed. Next run: ${new Date(nextRun).toLocaleString('en-GB')}`);
          }
          
          await storage.updateScheduledMonitor(monitor.id, updates);
        } catch (error) {
          console.error(`❌ Error executing monitor ${monitor.id}:`, error);
        }
      }
    }
  } catch (error) {
    console.error('❌ Error in monitor worker:', error);
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
  console.log('🔄 Starting monitor background worker (checking every 60 seconds)');
  
  // Run immediately on startup
  checkAndExecuteMonitors();
  
  // Then poll every minute
  setInterval(checkAndExecuteMonitors, POLL_INTERVAL);
}
