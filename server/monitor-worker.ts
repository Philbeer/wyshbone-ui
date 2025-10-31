import { storage } from './storage';
import { executeMonitorAndNotify } from './monitor-executor';

const POLL_INTERVAL = 15 * 1000; // Check every 15 seconds

async function checkAndExecuteMonitors() {
  try {
    const now = Date.now();
    
    // Get all monitors for demo-user (in production, you'd query all users)
    const monitors = await storage.listScheduledMonitors('demo-user');
    
    console.log(`🔍 Checking ${monitors.length} monitors at ${new Date(now).toLocaleTimeString('en-GB')}`);
    
    for (const monitor of monitors) {
      const isActive = monitor.isActive === 1;
      const hasNextRun = monitor.nextRunAt !== null && monitor.nextRunAt !== undefined;
      const isTimeToRun = hasNextRun && monitor.nextRunAt <= now;
      
      console.log(`  📊 ${monitor.label}: active=${isActive}, nextRun=${hasNextRun ? new Date(monitor.nextRunAt!).toLocaleString('en-GB') : 'none'}, ready=${isTimeToRun}`);
      
      // Check if monitor is active and it's time to run
      if (isActive && hasNextRun && isTimeToRun && monitor.nextRunAt) {
        console.log(`⏰ Time to run monitor: ${monitor.label} (${monitor.id})`);
        
        try {
          // Execute the monitor and send email if enabled
          await executeMonitorAndNotify(monitor as any);
          
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
  console.log('🔄 Starting monitor background worker (checking every 15 seconds)');
  
  // Run immediately on startup
  checkAndExecuteMonitors();
  
  // Then poll every 15 seconds
  setInterval(checkAndExecuteMonitors, POLL_INTERVAL);
}
