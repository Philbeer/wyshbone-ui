/**
 * Monitor Worker API Routes
 * 
 * Admin-only endpoint for manually triggering the scheduled monitor worker.
 * 
 * THIN CLIENT: Jobs are delegated to Supervisor service by default.
 * Local execution only occurs as explicit fallback when ENABLE_UI_BACKGROUND_WORKERS=true.
 */

import { Router, Request, Response } from 'express';
import { IStorage } from '../../storage';
import { supervisorClient } from '../../lib/supervisorClient';

const ADMIN_EMAILS = ['phil@wyshbone.com', 'phil@listersbrewery.com'];

function hasAdminAccess(userEmail?: string): boolean {
  if (process.env.NODE_ENV === 'development') {
    return true;
  }
  if (!userEmail) return false;
  return ADMIN_EMAILS.includes(userEmail.toLowerCase());
}

async function getAuthenticatedUser(
  req: Request,
  storage: IStorage
): Promise<{ userId: string; userEmail: string; workspaceId: number } | null> {
  const urlUserId = (req.params.userId || req.query.userId || req.query.user_id) as string | undefined;
  const urlUserEmail = req.query.user_email as string | undefined;
  const urlWorkspaceId = req.query.workspaceId as string | undefined;

  if (process.env.NODE_ENV === 'development' && urlUserId && urlUserEmail) {
    const workspaceId = urlWorkspaceId ? parseInt(urlWorkspaceId, 10) : 1;
    return { userId: urlUserId, userEmail: urlUserEmail, workspaceId };
  }

  const sessionId = req.headers['x-session-id'] as string | undefined;
  if (sessionId) {
    const session = await storage.getSession(sessionId);
    if (session) {
      const user = await storage.getUserById(session.userId);
      if (user) {
        return { userId: user.id, userEmail: user.email, workspaceId: 1 };
      }
    }
  }

  return null;
}

async function runLocalMonitorCheck(): Promise<{ monitorsChecked: number; monitorsExecuted: number }> {
  const { storage } = await import('../../storage');
  const { executeMonitorAndNotify } = await import('../../monitor-executor');
  
  const now = Date.now();
  const monitors = await storage.listActiveScheduledMonitors();
  
  console.log(`🔍 [LOCAL FALLBACK] Checking ${monitors.length} monitors at ${new Date(now).toLocaleTimeString('en-GB')}`);
  
  let executed = 0;
  
  for (const monitor of monitors) {
    const isActive = monitor.isActive === 1;
    const hasNextRun = monitor.nextRunAt !== null && monitor.nextRunAt !== undefined;
    const isTimeToRun = hasNextRun && monitor.nextRunAt !== null && monitor.nextRunAt <= now;
    
    if (isActive && hasNextRun && isTimeToRun && monitor.nextRunAt) {
      console.log(`⏰ Time to run monitor: ${monitor.label} (${monitor.id})`);
      
      try {
        const updates: any = {
          lastRunAt: now,
        };
        
        if (monitor.schedule === 'once') {
          updates.isActive = 0;
          updates.nextRunAt = null;
        } else {
          const nextRun = calculateNextRunTime(monitor);
          updates.nextRunAt = nextRun;
        }
        
        await storage.updateScheduledMonitor(monitor.id, updates);
        await executeMonitorAndNotify(monitor as any);
        executed++;
        
        console.log(`✅ Monitor "${monitor.label}" executed successfully`);
      } catch (error) {
        console.error(`❌ Error executing monitor ${monitor.id}:`, error);
      }
    }
  }
  
  return { monitorsChecked: monitors.length, monitorsExecuted: executed };
}

function calculateNextRunTime(monitor: any): number {
  const now = new Date();
  let nextRun = new Date(now);
  
  if (monitor.scheduleTime) {
    const [hours, minutes] = monitor.scheduleTime.split(':').map(Number);
    nextRun.setHours(hours, minutes, 0, 0);
  }
  
  switch (monitor.schedule) {
    case 'hourly':
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

export function createMonitorsRouter(storage: IStorage): Router {
  const router = Router();

  const requireAdmin = async (req: Request, res: Response, next: Function) => {
    const auth = await getAuthenticatedUser(req, storage);
    if (!auth) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    if (!hasAdminAccess(auth.userEmail)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    (req as any).auth = auth;
    next();
  };

  /**
   * POST /api/admin/monitors/run-manual
   * 
   * Manually trigger the monitor worker to check and execute due monitors.
   * This delegates to the Supervisor service by default.
   * 
   * Response (delegated):
   * {
   *   ok: true,
   *   delegatedToSupervisor: true,
   *   supervisorJobId: "sup_xxx",
   *   jobType: "monitor-worker"
   * }
   * 
   * Response (fallback):
   * {
   *   ok: true,
   *   delegatedToSupervisor: false,
   *   jobId: "local_fallback_xxx",
   *   jobType: "monitor-worker",
   *   warning: "FALLBACK: executed in UI",
   *   result: { monitorsChecked: N, monitorsExecuted: M }
   * }
   */
  router.post('/run-manual', requireAdmin, async (req: Request, res: Response) => {
    try {
      const auth = (req as any).auth;
      const clientRequestId = `monitor_${Date.now().toString(36)}`;

      const payload = {
        workspaceId: auth.workspaceId,
        userEmail: auth.userEmail,
        triggeredAt: Date.now(),
      };

      try {
        const result = await supervisorClient.startJob('monitor-worker', payload, {
          userId: auth.userId,
          clientRequestId,
        });

        if (result.delegatedToSupervisor) {
          return res.json({
            ok: true,
            delegatedToSupervisor: true,
            supervisorJobId: result.jobId,
            jobType: 'monitor-worker',
            message: 'Monitor worker delegated to Supervisor',
          });
        }

        const localResult = await runLocalMonitorCheck();
        const localJobId = result.jobId || `local_fallback_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        await supervisorClient.markFallbackCompleted('monitor-worker', localJobId, {
          userId: auth.userId,
          clientRequestId,
        });

        return res.json({
          ok: true,
          delegatedToSupervisor: false,
          jobId: localJobId,
          jobType: 'monitor-worker',
          warning: 'FALLBACK: executed in UI',
          message: 'Monitor worker completed (local fallback)',
          result: localResult,
        });

      } catch (delegationError: any) {
        console.error('[monitor-worker] Supervisor delegation failed:', delegationError.message);
        return res.status(503).json({
          error: 'Supervisor unavailable and local fallback is disabled',
          details: delegationError.message,
        });
      }

    } catch (error: any) {
      console.error('[monitor-worker] Run manual error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/admin/monitors/run-executor
   * 
   * Manually trigger the monitor executor to execute a specific monitor or all due monitors.
   * This delegates to the Supervisor service by default.
   * 
   * NOTE: Unlike monitor-worker, there is NO local fallback for monitor-executor.
   * If Supervisor fails and fallback is enabled, we still return 503 because no local
   * executor function exists in this UI codebase.
   * 
   * Request body (optional):
   * {
   *   monitorId?: string  // Execute specific monitor, or all due monitors if omitted
   * }
   * 
   * Response (delegated):
   * {
   *   ok: true,
   *   delegatedToSupervisor: true,
   *   supervisorJobId: "sup_xxx",
   *   jobType: "monitor-executor"
   * }
   * 
   * Response (503 - no fallback available):
   * {
   *   error: "Supervisor unavailable and no local fallback exists for monitor-executor",
   *   details: "..."
   * }
   */
  router.post('/run-executor', requireAdmin, async (req: Request, res: Response) => {
    try {
      const auth = (req as any).auth;
      const clientRequestId = `executor_${Date.now().toString(36)}`;
      const { monitorId } = req.body || {};

      const payload = {
        workspaceId: auth.workspaceId,
        userEmail: auth.userEmail,
        triggeredAt: Date.now(),
        monitorId: monitorId || null,
      };

      // Log job_queued event
      console.log(`📝 [AFR] Logged activity: tool/started - Job: monitor-executor (crid:${clientRequestId})`);
      console.log(`📤 [SUPERVISOR] job_queued: monitor-executor`);

      try {
        const result = await supervisorClient.startJob('monitor-executor', payload, {
          userId: auth.userId,
          clientRequestId,
        });

        if (result.delegatedToSupervisor) {
          // Explicit delegated_to_supervisor log
          console.log(`✅ [SUPERVISOR] delegated_to_supervisor: monitor-executor jobId=${result.jobId}`);
          console.log(`📝 [AFR] Logged activity: tool/completed - Job: monitor-executor delegated (crid:${clientRequestId})`);
          
          return res.json({
            ok: true,
            delegatedToSupervisor: true,
            supervisorJobId: result.jobId,
            jobType: 'monitor-executor',
            message: 'Monitor executor delegated to Supervisor',
          });
        }

        // Fallback was triggered but monitor-executor has NO local implementation
        // This is a special case: even with ENABLE_UI_BACKGROUND_WORKERS=true,
        // we cannot run monitor-executor locally because it doesn't exist in UI codebase
        console.log(`📝 [AFR] Logged activity: tool/failed - Job: monitor-executor no local fallback (crid:${clientRequestId})`);
        console.log(`⚠️ [SUPERVISOR] no_local_fallback: monitor-executor - fallback was enabled but no local executor exists`);
        
        return res.status(503).json({
          error: 'Supervisor unavailable and no local fallback exists for monitor-executor',
          details: 'Supervisor delegation returned fallback mode, but monitor-executor has no local implementation in the UI codebase. Only Supervisor can execute monitors.',
          fallbackEnabled: true,
          localFallbackExists: false,
        });

      } catch (delegationError: any) {
        // Supervisor call failed
        console.log(`📝 [AFR] Logged activity: tool/failed - Job: monitor-executor (crid:${clientRequestId})`);
        console.error(`❌ [SUPERVISOR] supervisor_call_failed: monitor-executor error=${delegationError.message}`);
        console.error('[monitor-executor] Supervisor delegation failed:', delegationError.message);
        
        // Check if fallback is enabled
        const fallbackEnabled = process.env.ENABLE_UI_BACKGROUND_WORKERS === 'true';
        
        if (fallbackEnabled) {
          // Fallback is enabled, but there's no local executor implementation
          console.log(`⚠️ [SUPERVISOR] fallback_ui_execution_started: monitor-executor (checking for local impl)`);
          console.log(`❌ [SUPERVISOR] fallback_ui_execution_failed: monitor-executor - no local implementation exists`);
          console.log(`📝 [AFR] Logged activity: tool/failed - Job: monitor-executor no local impl (crid:${clientRequestId})`);
          
          return res.status(503).json({
            error: 'Supervisor unavailable and no local fallback exists for monitor-executor',
            details: `Failed to delegate job to Supervisor: ${delegationError.message}. Local fallback is enabled, but monitor-executor has no local implementation.`,
            fallbackEnabled: true,
            localFallbackExists: false,
          });
        }
        
        // Fallback is disabled - standard 503
        return res.status(503).json({
          error: 'Supervisor unavailable and local fallback is disabled',
          details: `Failed to delegate job to Supervisor: ${delegationError.message}. Local fallback is disabled.`,
          fallbackEnabled: false,
        });
      }

    } catch (error: any) {
      console.error('[monitor-executor] Run executor error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/admin/monitors/status
   * 
   * Get the current status of scheduled monitors.
   */
  router.get('/status', requireAdmin, async (req: Request, res: Response) => {
    try {
      const monitors = await storage.listActiveScheduledMonitors();
      
      const now = Date.now();
      const status = monitors.map(m => ({
        id: m.id,
        label: m.label,
        isActive: m.isActive === 1,
        schedule: m.schedule,
        nextRunAt: m.nextRunAt ? new Date(m.nextRunAt).toISOString() : null,
        isDue: m.nextRunAt ? m.nextRunAt <= now : false,
      }));

      res.json({
        ok: true,
        totalMonitors: monitors.length,
        activeMonitors: monitors.filter(m => m.isActive === 1).length,
        dueMonitors: monitors.filter(m => m.isActive === 1 && m.nextRunAt && m.nextRunAt <= now).length,
        monitors: status,
      });
    } catch (error: any) {
      console.error('[monitor-worker] Status error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}
