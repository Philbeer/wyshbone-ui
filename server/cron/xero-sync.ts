/**
 * Xero Sync Cron Jobs
 * Handles periodic sync queue processing and backup polling
 */
import cron from 'node-cron';

// Types for the sync functions
type SyncFunction = () => Promise<void>;

interface XeroSyncCronOptions {
  processSyncQueue: SyncFunction;
  backupPollXero: SyncFunction;
  syncQueueInterval?: string; // Cron expression, default: every 5 minutes
  backupPollInterval?: string; // Cron expression, default: every 15 minutes
}

let syncQueueTask: cron.ScheduledTask | null = null;
let backupPollTask: cron.ScheduledTask | null = null;

/**
 * Start the Xero sync cron jobs
 */
export function startXeroSyncCron(options: XeroSyncCronOptions): void {
  const {
    processSyncQueue,
    backupPollXero,
    syncQueueInterval = '*/5 * * * *',  // Every 5 minutes
    backupPollInterval = '*/15 * * * *', // Every 15 minutes
  } = options;

  // Stop any existing tasks
  stopXeroSyncCron();

  console.log('🔄 Starting Xero sync cron jobs...');

  // Process sync queue every 5 minutes
  syncQueueTask = cron.schedule(syncQueueInterval, async () => {
    console.log(`[${new Date().toISOString()}] Running sync queue processor...`);
    try {
      await processSyncQueue();
    } catch (error) {
      console.error('Sync queue processing failed:', error);
    }
  });

  // Backup poll every 15 minutes (catch missed webhooks)
  backupPollTask = cron.schedule(backupPollInterval, async () => {
    console.log(`[${new Date().toISOString()}] Running backup Xero poll...`);
    try {
      await backupPollXero();
    } catch (error) {
      console.error('Backup Xero poll failed:', error);
    }
  });

  console.log('✅ Xero sync cron jobs started');
  console.log(`   - Sync queue: ${syncQueueInterval}`);
  console.log(`   - Backup poll: ${backupPollInterval}`);
}

/**
 * Stop the Xero sync cron jobs
 */
export function stopXeroSyncCron(): void {
  if (syncQueueTask) {
    syncQueueTask.stop();
    syncQueueTask = null;
  }
  if (backupPollTask) {
    backupPollTask.stop();
    backupPollTask = null;
  }
  console.log('⏹️ Xero sync cron jobs stopped');
}

/**
 * Check if cron jobs are running
 */
export function isXeroSyncCronRunning(): boolean {
  return syncQueueTask !== null && backupPollTask !== null;
}









