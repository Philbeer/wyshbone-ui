/**
 * Sleeper Agent API Routes
 * 
 * Endpoints for AI-powered pub discovery and event discovery.
 * Runs searches in the background and returns job IDs for polling.
 */

import { Router, type Request, type Response } from "express";
import type { IStorage } from "../storage";
import {
  searchGooglePlaces,
  processSleepAgentProspect,
  runSleeperAgentSearch,
  searchGoogleForEvents,
  processEvent,
  runEventDiscovery,
  type SearchLocation,
  type SleeperAgentRunSummary,
  type EventDiscoveryRunSummary,
} from "../lib/sleeper-agent";

// ============================================
// TYPES
// ============================================

interface SleeperAgentJob {
  id: string;
  type: "pub_search" | "event_discovery";
  status: "pending" | "running" | "completed" | "failed";
  workspaceId: string;
  query: string;
  location: string;
  radius?: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: SleeperAgentRunSummary | EventDiscoveryRunSummary;
  error?: string;
  progress?: {
    processed: number;
    total: number;
  };
}

// In-memory job store (would be Redis or DB in production)
const jobStore = new Map<string, SleeperAgentJob>();

// Job history (last 100 jobs per workspace)
const jobHistory = new Map<string, string[]>();

// ============================================
// AUTHENTICATION
// ============================================

async function getAuthenticatedUserId(
  req: Request,
  storage: IStorage
): Promise<{ userId: string; userEmail: string } | null> {
  // Development fallback: allow URL parameters for testing ONLY
  const urlUserId = (req.params.userId || req.query.userId || req.query.user_id) as string | undefined;
  const urlUserEmail = req.query.user_email as string | undefined;
  
  if (process.env.NODE_ENV === "development" && urlUserId && urlUserEmail) {
    console.warn(`⚠️ DEV MODE: Using URL auth for ${urlUserEmail} - DISABLE IN PRODUCTION`);
    return { userId: urlUserId, userEmail: urlUserEmail };
  }
  
  // Production path: validate session
  const sessionId = req.headers["x-session-id"] as string | undefined;
  if (!sessionId) {
    return null;
  }
  
  try {
    const session = await storage.getSession(sessionId);
    if (!session) {
      return null;
    }
    return {
      userId: session.userId,
      userEmail: session.userEmail,
    };
  } catch (error) {
    console.error("Session validation error:", error);
    return null;
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function generateJobId(): string {
  return `sa_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function addJobToHistory(workspaceId: string, jobId: string): void {
  const history = jobHistory.get(workspaceId) || [];
  history.unshift(jobId);
  // Keep only last 100 jobs
  if (history.length > 100) {
    history.pop();
  }
  jobHistory.set(workspaceId, history);
}

function getWorkspaceJobs(workspaceId: string, limit: number = 20): SleeperAgentJob[] {
  const history = jobHistory.get(workspaceId) || [];
  return history
    .slice(0, limit)
    .map(id => jobStore.get(id))
    .filter((job): job is SleeperAgentJob => job !== undefined);
}

// ============================================
// ROUTE FACTORY
// ============================================

export function createSleeperAgentRouter(storage: IStorage): Router {
  const router = Router();

  // ==========================================
  // POST /search - Trigger pub search
  // ==========================================
  /**
   * Start a pub discovery search in a location.
   * 
   * Request body:
   * {
   *   query: string;        // e.g., "pubs", "freehouses", "independent pubs"
   *   location: string;     // e.g., "Brighton, UK", "Manchester"
   *   radius?: number;      // meters, default 5000 (5km)
   *   notifyByEmail?: boolean; // send email notifications
   * }
   * 
   * Response: 202 Accepted with job ID
   */
  router.post("/search", async (req: Request, res: Response) => {
    try {
      // 1. Authenticate
      const auth = await getAuthenticatedUserId(req, storage);
      if (!auth) {
        return res.status(401).json({
          success: false,
          error: "Unauthorized",
          message: "Please log in to use the sleeper agent",
        });
      }

      // 2. Validate request
      const { query, location, radius, notifyByEmail } = req.body;
      
      if (!query || typeof query !== "string") {
        return res.status(400).json({
          success: false,
          error: "Invalid request",
          message: "query is required",
        });
      }
      
      if (!location || typeof location !== "string") {
        return res.status(400).json({
          success: false,
          error: "Invalid request",
          message: "location is required",
        });
      }

      // 3. Check for running jobs (prevent duplicates)
      const runningJobs = getWorkspaceJobs(auth.userId, 10).filter(
        j => j.status === "running" || j.status === "pending"
      );
      
      if (runningJobs.length >= 2) {
        return res.status(429).json({
          success: false,
          error: "Too many concurrent jobs",
          message: "Please wait for existing searches to complete",
          runningJobs: runningJobs.map(j => ({ id: j.id, type: j.type, status: j.status })),
        });
      }

      // 4. Create job
      const jobId = generateJobId();
      const job: SleeperAgentJob = {
        id: jobId,
        type: "pub_search",
        status: "pending",
        workspaceId: auth.userId,
        query: query.trim(),
        location: location.trim(),
        radius: radius || 5000,
        createdAt: new Date(),
      };
      
      jobStore.set(jobId, job);
      addJobToHistory(auth.userId, jobId);

      console.log(`🔍 [sleeper-agent] Starting pub search job ${jobId}: "${query}" in ${location}`);

      // 5. Start async search
      runPubSearchJob(
        jobId,
        query.trim(),
        location.trim(),
        radius || 5000,
        auth.userId,
        notifyByEmail ? auth.userEmail : undefined
      ).catch(error => {
        console.error(`❌ [sleeper-agent] Job ${jobId} failed:`, error);
        const failedJob = jobStore.get(jobId);
        if (failedJob) {
          failedJob.status = "failed";
          failedJob.error = error.message;
          failedJob.completedAt = new Date();
        }
      });

      // 6. Return immediately
      res.status(202).json({
        success: true,
        jobId,
        message: "Pub search started",
        pollUrl: `/api/sleeper-agent/jobs/${jobId}`,
      });

    } catch (error: any) {
      console.error("[sleeper-agent] Search endpoint error:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
        message: error.message,
      });
    }
  });

  // ==========================================
  // POST /events - Trigger event discovery
  // ==========================================
  /**
   * Start an event discovery search.
   * 
   * Request body:
   * {
   *   query: string;        // e.g., "beer festival", "craft beer expo"
   *   location: string;     // e.g., "UK", "London", "South East England"
   *   notifyByEmail?: boolean;
   * }
   * 
   * Response: 202 Accepted with job ID
   */
  router.post("/events", async (req: Request, res: Response) => {
    try {
      // 1. Authenticate
      const auth = await getAuthenticatedUserId(req, storage);
      if (!auth) {
        return res.status(401).json({
          success: false,
          error: "Unauthorized",
          message: "Please log in to use event discovery",
        });
      }

      // 2. Validate request
      const { query, location, notifyByEmail } = req.body;
      
      if (!query || typeof query !== "string") {
        return res.status(400).json({
          success: false,
          error: "Invalid request",
          message: "query is required (e.g., 'beer festival', 'craft beer expo')",
        });
      }
      
      if (!location || typeof location !== "string") {
        return res.status(400).json({
          success: false,
          error: "Invalid request",
          message: "location is required (e.g., 'UK', 'London')",
        });
      }

      // 3. Check for running jobs
      const runningJobs = getWorkspaceJobs(auth.userId, 10).filter(
        j => j.status === "running" || j.status === "pending"
      );
      
      if (runningJobs.length >= 2) {
        return res.status(429).json({
          success: false,
          error: "Too many concurrent jobs",
          message: "Please wait for existing searches to complete",
        });
      }

      // 4. Create job
      const jobId = generateJobId();
      const job: SleeperAgentJob = {
        id: jobId,
        type: "event_discovery",
        status: "pending",
        workspaceId: auth.userId,
        query: query.trim(),
        location: location.trim(),
        createdAt: new Date(),
      };
      
      jobStore.set(jobId, job);
      addJobToHistory(auth.userId, jobId);

      console.log(`🎉 [sleeper-agent] Starting event discovery job ${jobId}: "${query}" in ${location}`);

      // 5. Start async search
      runEventDiscoveryJob(
        jobId,
        query.trim(),
        location.trim(),
        auth.userId,
        notifyByEmail ? auth.userEmail : undefined
      ).catch(error => {
        console.error(`❌ [sleeper-agent] Event job ${jobId} failed:`, error);
        const failedJob = jobStore.get(jobId);
        if (failedJob) {
          failedJob.status = "failed";
          failedJob.error = error.message;
          failedJob.completedAt = new Date();
        }
      });

      // 6. Return immediately
      res.status(202).json({
        success: true,
        jobId,
        message: "Event discovery started",
        pollUrl: `/api/sleeper-agent/jobs/${jobId}`,
      });

    } catch (error: any) {
      console.error("[sleeper-agent] Events endpoint error:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
        message: error.message,
      });
    }
  });

  // ==========================================
  // GET /jobs/:jobId - Get job status
  // ==========================================
  /**
   * Get the status and results of a job.
   * 
   * Response:
   * {
   *   job: SleeperAgentJob;
   * }
   */
  router.get("/jobs/:jobId", async (req: Request, res: Response) => {
    try {
      // 1. Authenticate
      const auth = await getAuthenticatedUserId(req, storage);
      if (!auth) {
        return res.status(401).json({
          success: false,
          error: "Unauthorized",
        });
      }

      // 2. Get job
      const { jobId } = req.params;
      const job = jobStore.get(jobId);
      
      if (!job) {
        return res.status(404).json({
          success: false,
          error: "Job not found",
          message: `No job with ID: ${jobId}`,
        });
      }

      // 3. Verify ownership
      if (job.workspaceId !== auth.userId) {
        return res.status(403).json({
          success: false,
          error: "Access denied",
          message: "You don't have access to this job",
        });
      }

      // 4. Return job status
      res.json({
        success: true,
        job: {
          id: job.id,
          type: job.type,
          status: job.status,
          query: job.query,
          location: job.location,
          radius: job.radius,
          createdAt: job.createdAt,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
          progress: job.progress,
          error: job.error,
          result: job.result ? {
            // Summary only (not full results array for large jobs)
            ...(job.type === "pub_search" ? {
              searchedCount: (job.result as SleeperAgentRunSummary).searchedCount,
              newPubs: (job.result as SleeperAgentRunSummary).newPubs,
              existingCustomers: (job.result as SleeperAgentRunSummary).existingCustomers,
              existingProspects: (job.result as SleeperAgentRunSummary).existingProspects,
              errors: (job.result as SleeperAgentRunSummary).errors,
            } : {
              eventsFound: (job.result as EventDiscoveryRunSummary).eventsFound,
              newEvents: (job.result as EventDiscoveryRunSummary).newEvents,
              updatedEvents: (job.result as EventDiscoveryRunSummary).updatedEvents,
              errors: (job.result as EventDiscoveryRunSummary).errors,
            }),
            startedAt: job.result.startedAt,
            completedAt: job.result.completedAt,
          } : undefined,
        },
      });

    } catch (error: any) {
      console.error("[sleeper-agent] Job status error:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
        message: error.message,
      });
    }
  });

  // ==========================================
  // GET /jobs/:jobId/results - Get full results
  // ==========================================
  /**
   * Get the full results of a completed job.
   */
  router.get("/jobs/:jobId/results", async (req: Request, res: Response) => {
    try {
      // 1. Authenticate
      const auth = await getAuthenticatedUserId(req, storage);
      if (!auth) {
        return res.status(401).json({
          success: false,
          error: "Unauthorized",
        });
      }

      // 2. Get job
      const { jobId } = req.params;
      const job = jobStore.get(jobId);
      
      if (!job) {
        return res.status(404).json({
          success: false,
          error: "Job not found",
        });
      }

      // 3. Verify ownership
      if (job.workspaceId !== auth.userId) {
        return res.status(403).json({
          success: false,
          error: "Access denied",
        });
      }

      // 4. Check if completed
      if (job.status !== "completed") {
        return res.status(400).json({
          success: false,
          error: "Job not completed",
          status: job.status,
          message: job.status === "failed" ? job.error : "Job is still running",
        });
      }

      // 5. Return full results
      res.json({
        success: true,
        job: {
          id: job.id,
          type: job.type,
          query: job.query,
          location: job.location,
        },
        result: job.result,
      });

    } catch (error: any) {
      console.error("[sleeper-agent] Job results error:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
        message: error.message,
      });
    }
  });

  // ==========================================
  // GET /runs - List recent runs
  // ==========================================
  /**
   * Get recent sleeper agent runs for the current user.
   * 
   * Query params:
   *   limit?: number (default 20, max 100)
   *   type?: "pub_search" | "event_discovery"
   */
  router.get("/runs", async (req: Request, res: Response) => {
    try {
      // 1. Authenticate
      const auth = await getAuthenticatedUserId(req, storage);
      if (!auth) {
        return res.status(401).json({
          success: false,
          error: "Unauthorized",
        });
      }

      // 2. Parse query params
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const type = req.query.type as "pub_search" | "event_discovery" | undefined;

      // 3. Get jobs
      let jobs = getWorkspaceJobs(auth.userId, limit);
      
      if (type) {
        jobs = jobs.filter(j => j.type === type);
      }

      // 4. Return list
      res.json({
        success: true,
        runs: jobs.map(job => ({
          id: job.id,
          type: job.type,
          status: job.status,
          query: job.query,
          location: job.location,
          createdAt: job.createdAt,
          completedAt: job.completedAt,
          summary: job.result ? (
            job.type === "pub_search" ? {
              searchedCount: (job.result as SleeperAgentRunSummary).searchedCount,
              newPubs: (job.result as SleeperAgentRunSummary).newPubs,
            } : {
              eventsFound: (job.result as EventDiscoveryRunSummary).eventsFound,
              newEvents: (job.result as EventDiscoveryRunSummary).newEvents,
            }
          ) : undefined,
          error: job.error,
        })),
        total: jobs.length,
      });

    } catch (error: any) {
      console.error("[sleeper-agent] Runs list error:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
        message: error.message,
      });
    }
  });

  // ==========================================
  // POST /cancel/:jobId - Cancel a running job
  // ==========================================
  router.post("/cancel/:jobId", async (req: Request, res: Response) => {
    try {
      // 1. Authenticate
      const auth = await getAuthenticatedUserId(req, storage);
      if (!auth) {
        return res.status(401).json({
          success: false,
          error: "Unauthorized",
        });
      }

      // 2. Get job
      const { jobId } = req.params;
      const job = jobStore.get(jobId);
      
      if (!job) {
        return res.status(404).json({
          success: false,
          error: "Job not found",
        });
      }

      // 3. Verify ownership
      if (job.workspaceId !== auth.userId) {
        return res.status(403).json({
          success: false,
          error: "Access denied",
        });
      }

      // 4. Check if cancellable
      if (job.status !== "pending" && job.status !== "running") {
        return res.status(400).json({
          success: false,
          error: "Cannot cancel",
          message: `Job is already ${job.status}`,
        });
      }

      // 5. Mark as cancelled (note: actual cancellation depends on job implementation)
      job.status = "failed";
      job.error = "Cancelled by user";
      job.completedAt = new Date();

      res.json({
        success: true,
        message: "Job cancelled",
        jobId,
      });

    } catch (error: any) {
      console.error("[sleeper-agent] Cancel error:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
        message: error.message,
      });
    }
  });

  // ==========================================
  // GET /stats - Get sleeper agent statistics
  // ==========================================
  router.get("/stats", async (req: Request, res: Response) => {
    try {
      // 1. Authenticate
      const auth = await getAuthenticatedUserId(req, storage);
      if (!auth) {
        return res.status(401).json({
          success: false,
          error: "Unauthorized",
        });
      }

      // 2. Calculate stats from job history
      const jobs = getWorkspaceJobs(auth.userId, 100);
      
      const stats = {
        totalRuns: jobs.length,
        pubSearches: jobs.filter(j => j.type === "pub_search").length,
        eventDiscoveries: jobs.filter(j => j.type === "event_discovery").length,
        completedRuns: jobs.filter(j => j.status === "completed").length,
        failedRuns: jobs.filter(j => j.status === "failed").length,
        totalPubsDiscovered: 0,
        totalEventsDiscovered: 0,
        lastRunAt: jobs[0]?.createdAt || null,
      };

      // Sum up discoveries from completed jobs
      for (const job of jobs) {
        if (job.status === "completed" && job.result) {
          if (job.type === "pub_search") {
            stats.totalPubsDiscovered += (job.result as SleeperAgentRunSummary).newPubs || 0;
          } else {
            stats.totalEventsDiscovered += (job.result as EventDiscoveryRunSummary).newEvents || 0;
          }
        }
      }

      res.json({
        success: true,
        stats,
      });

    } catch (error: any) {
      console.error("[sleeper-agent] Stats error:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
        message: error.message,
      });
    }
  });

  // ==========================================
  // POST /nightly-update - Manually trigger nightly update
  // ==========================================
  /**
   * Manually trigger the nightly database update.
   * Useful for testing or on-demand refreshes.
   * 
   * This is a long-running operation and runs asynchronously.
   */
  router.post("/nightly-update", async (req: Request, res: Response) => {
    try {
      // 1. Authenticate
      const auth = await getAuthenticatedUserId(req, storage);
      if (!auth) {
        return res.status(401).json({
          success: false,
          error: "Unauthorized",
        });
      }

      // 2. Import and trigger nightly update
      const { triggerNightlyUpdate } = await import("../cron/nightly-maintenance");
      
      // Convert userId to number
      const workspaceIdNum = parseInt(auth.userId);
      if (isNaN(workspaceIdNum)) {
        return res.status(400).json({
          success: false,
          error: "Invalid workspace ID",
        });
      }

      // 3. Run asynchronously (don't wait)
      triggerNightlyUpdate(workspaceIdNum).catch(error => {
        console.error("[sleeper-agent] Nightly update failed:", error);
      });

      // 4. Return immediately
      res.status(202).json({
        success: true,
        message: "Nightly database update started",
        note: "This is a long-running operation. Check server logs for progress.",
      });

    } catch (error: any) {
      console.error("[sleeper-agent] Nightly update trigger error:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
        message: error.message,
      });
    }
  });

  return router;
}

// ============================================
// BACKGROUND JOB RUNNERS
// ============================================

/**
 * Run a pub search job in the background.
 */
async function runPubSearchJob(
  jobId: string,
  query: string,
  location: string,
  radius: number,
  workspaceId: string,
  userEmail?: string
): Promise<void> {
  const job = jobStore.get(jobId);
  if (!job) return;

  try {
    // Mark as running
    job.status = "running";
    job.startedAt = new Date();

    console.log(`▶️ [sleeper-agent] Job ${jobId} running...`);

    // Convert workspaceId to number (assuming it's stored as string)
    const workspaceIdNum = parseInt(workspaceId);
    if (isNaN(workspaceIdNum)) {
      throw new Error(`Invalid workspace ID: ${workspaceId}`);
    }

    // Run the search
    const result = await runSleeperAgentSearch(
      query,
      { locationText: location },
      workspaceIdNum,
      userEmail,
      radius
    );

    // Mark as completed
    job.status = "completed";
    job.completedAt = new Date();
    job.result = result;

    console.log(`✅ [sleeper-agent] Job ${jobId} completed: ${result.newPubs} new pubs, ${result.existingCustomers} customers`);

  } catch (error: any) {
    // Mark as failed
    job.status = "failed";
    job.completedAt = new Date();
    job.error = error.message;

    console.error(`❌ [sleeper-agent] Job ${jobId} failed:`, error.message);
    throw error;
  }
}

/**
 * Run an event discovery job in the background.
 */
async function runEventDiscoveryJob(
  jobId: string,
  query: string,
  location: string,
  workspaceId: string,
  userEmail?: string
): Promise<void> {
  const job = jobStore.get(jobId);
  if (!job) return;

  try {
    // Mark as running
    job.status = "running";
    job.startedAt = new Date();

    console.log(`▶️ [sleeper-agent] Event job ${jobId} running...`);

    // Convert workspaceId to number
    const workspaceIdNum = parseInt(workspaceId);
    if (isNaN(workspaceIdNum)) {
      throw new Error(`Invalid workspace ID: ${workspaceId}`);
    }

    // Run the search
    const result = await runEventDiscovery(
      query,
      location,
      workspaceIdNum,
      userEmail
    );

    // Mark as completed
    job.status = "completed";
    job.completedAt = new Date();
    job.result = result;

    console.log(`✅ [sleeper-agent] Event job ${jobId} completed: ${result.newEvents} new events`);

  } catch (error: any) {
    // Mark as failed
    job.status = "failed";
    job.completedAt = new Date();
    job.error = error.message;

    console.error(`❌ [sleeper-agent] Event job ${jobId} failed:`, error.message);
    throw error;
  }
}

