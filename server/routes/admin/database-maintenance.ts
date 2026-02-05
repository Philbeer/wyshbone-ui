/**
 * Database Maintenance API Routes
 * 
 * Admin-only endpoints for managing the nightly pub database
 * maintenance job.
 * 
 * THIN CLIENT: Jobs are delegated to Supervisor service by default.
 * Local execution only occurs as explicit fallback when ENABLE_UI_BACKGROUND_WORKERS=true.
 */

import { Router, Request, Response } from 'express';
import { IStorage } from '../../storage';
import {
  startDatabaseUpdateJob,
  getJobStatus,
  getAllActiveJobs,
  cancelJob,
  getEstimatedCosts,
  getEstimatedDuration,
  JobSettings
} from '../../lib/database-update-job';
import { supervisorClient } from '../../lib/supervisorClient';

// Admin emails that can access these endpoints
const ADMIN_EMAILS = ['phil@wyshbone.com', 'phil@listersbrewery.com'];

function hasAdminAccess(userEmail?: string): boolean {
  if (process.env.NODE_ENV === 'development') {
    return true;
  }
  if (!userEmail) return false;
  return ADMIN_EMAILS.includes(userEmail.toLowerCase());
}

// Helper to get authenticated user (simplified - should match your auth system)
async function getAuthenticatedUser(
  req: Request,
  storage: IStorage
): Promise<{ userId: string; userEmail: string; workspaceId: number } | null> {
  // Check URL params (dev mode)
  const urlUserId = (req.params.userId || req.query.userId || req.query.user_id) as string | undefined;
  const urlUserEmail = req.query.user_email as string | undefined;
  const urlWorkspaceId = req.query.workspaceId as string | undefined;

  if (process.env.NODE_ENV === 'development' && urlUserId && urlUserEmail) {
    const workspaceId = urlWorkspaceId ? parseInt(urlWorkspaceId, 10) : 1;
    return { userId: urlUserId, userEmail: urlUserEmail, workspaceId };
  }

  // Check session
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

export function createDatabaseMaintenanceRouter(storage: IStorage): Router {
  const router = Router();

  // Middleware to check admin access
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

  // ============================================
  // SETTINGS ENDPOINTS
  // ============================================

  // Get current maintenance settings
  router.get('/settings', requireAdmin, async (req: Request, res: Response) => {
    try {
      // TODO: Load from database
      // For now, return defaults
      const settings = {
        enabled: true,
        pubsPerNight: 2000,
        schedule: 'nightly',
        dataSources: {
          googlePlaces: true,
          whatpubAnalysis: true,
          deepOwnership: false
        },
        lastRun: null,
        nextRun: getNextScheduledRun()
      };

      res.json(settings);
    } catch (error: any) {
      console.error('[database-maintenance] Settings error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Save maintenance settings
  router.post('/settings', requireAdmin, async (req: Request, res: Response) => {
    try {
      const settings = req.body;
      
      // TODO: Save to database
      console.log('[database-maintenance] Saving settings:', settings);

      res.json({ success: true, message: 'Settings saved' });
    } catch (error: any) {
      console.error('[database-maintenance] Save settings error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get database stats
  router.get('/stats', requireAdmin, async (req: Request, res: Response) => {
    try {
      // TODO: Calculate from actual database
      const stats = {
        totalPubs: 88000,
        verifiedPubs: 10000,
        percentComplete: 11.4,
        daysToComplete: 44
      };

      res.json(stats);
    } catch (error: any) {
      console.error('[database-maintenance] Stats error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================
  // JOB CONTROL ENDPOINTS
  // ============================================

  // Get cost estimate before starting
  router.post('/estimate', requireAdmin, async (req: Request, res: Response) => {
    try {
      const settings: JobSettings = req.body;
      
      const costs = getEstimatedCosts(settings);
      const duration = getEstimatedDuration(settings.pubsPerNight);

      res.json({
        success: true,
        costs,
        duration
      });
    } catch (error: any) {
      console.error('[database-maintenance] Estimate error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Start manual job - delegates to Supervisor by default
  router.post('/run-manual', requireAdmin, async (req: Request, res: Response) => {
    try {
      const settings: JobSettings = req.body;
      const auth = (req as any).auth;
      const clientRequestId = `maintenance_${Date.now()}`;

      // Prepare payload for Supervisor
      const payload = {
        workspaceId: auth.workspaceId,
        settings,
        userEmail: auth.userEmail,
      };

      try {
        // Attempt to delegate to Supervisor
        const result = await supervisorClient.startJob('nightly-maintenance', payload, {
          userId: auth.userId,
          clientRequestId,
        });

        if (result.delegatedToSupervisor) {
          // Successfully delegated to Supervisor
          return res.json({
            ok: true,
            delegatedToSupervisor: true,
            supervisorJobId: result.jobId,
            jobType: 'nightly-maintenance',
          });
        }

        // Fallback executed (ENABLE_UI_BACKGROUND_WORKERS=true)
        // Run local job
        const activeJobs = getAllActiveJobs();
        if (activeJobs.length > 0) {
          return res.status(400).json({
            success: false,
            error: 'A job is already running',
            activeJobId: activeJobs[0].id
          });
        }

        const localJobId = await startDatabaseUpdateJob(auth.workspaceId, settings);
        
        // Mark fallback completed
        await supervisorClient.markFallbackCompleted('nightly-maintenance', localJobId, {
          userId: auth.userId,
          clientRequestId,
        });

        return res.json({
          ok: true,
          delegatedToSupervisor: false,
          jobId: localJobId,
          jobType: 'nightly-maintenance',
          warning: 'FALLBACK: executed in UI',
        });

      } catch (delegationError: any) {
        // Supervisor delegation failed and fallback is disabled
        console.error('[database-maintenance] Supervisor delegation failed:', delegationError.message);
        return res.status(503).json({
          error: 'Supervisor unavailable and local fallback is disabled',
          details: delegationError.message,
        });
      }

    } catch (error: any) {
      console.error('[database-maintenance] Start job error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get job status (poll this every 2 seconds)
  router.get('/job/:jobId/status', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const jobState = getJobStatus(jobId);

      if (!jobState) {
        return res.status(404).json({ success: false, error: 'Job not found' });
      }

      res.json({
        success: true,
        job: jobState
      });
    } catch (error: any) {
      console.error('[database-maintenance] Job status error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get all active jobs
  router.get('/jobs/active', requireAdmin, async (req: Request, res: Response) => {
    try {
      const jobs = getAllActiveJobs();
      res.json({
        success: true,
        jobs
      });
    } catch (error: any) {
      console.error('[database-maintenance] Active jobs error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Cancel job
  router.post('/job/:jobId/cancel', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const success = cancelJob(jobId);

      if (!success) {
        return res.status(400).json({
          success: false,
          error: 'Job not running or not found'
        });
      }

      res.json({
        success: true,
        message: 'Cancellation requested. Job will stop after current pub.'
      });
    } catch (error: any) {
      console.error('[database-maintenance] Cancel job error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

// Helper function
function getNextScheduledRun(): string {
  const now = new Date();
  const next = new Date(now);
  next.setHours(2, 0, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next.toISOString();
}

export default createDatabaseMaintenanceRouter;

