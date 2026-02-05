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
