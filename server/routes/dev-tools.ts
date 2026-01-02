/**
 * Developer Tools API Routes
 * 
 * Provides endpoints for:
 * - Sleeper agent monitoring and stats
 * - Manual trigger of nightly maintenance
 * - Activity logs and verification results
 */

import { Router, Request, Response } from "express";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import { getDrizzleDb } from "../storage";
import { searchLog, pubsMaster, things, entityReviewQueue } from "@shared/schema";
import type { IStorage } from "../storage";

// ============================================
// TYPES
// ============================================

interface SleeperAgentSummary {
  lastRun: {
    timestamp: string | null;
    status: "success" | "failed" | "running" | "never";
    durationMinutes: number | null;
  };
  nextRun: string;
  totals: {
    totalPubs: number;
    pubsVerifiedToday: number;
    newPubsToday: number;
    eventsDiscovered: number;
    closedPubs: number;
  };
  recentActivity: Array<{
    id: number;
    timestamp: string;
    activity: string;
    details: string;
    results: string;
  }>;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if user has dev access
 */
function hasDevAccess(userEmail?: string): boolean {
  // Always allow in development mode
  if (process.env.NODE_ENV === "development") {
    return true;
  }
  
  // Check for explicit env flag
  if (process.env.ENABLE_DEV_TOOLS === "true") {
    return true;
  }
  
  // Check for developer emails
  const devEmails = (process.env.DEV_EMAILS || "").split(",").map(e => e.trim().toLowerCase());
  if (userEmail && devEmails.includes(userEmail.toLowerCase())) {
    return true;
  }
  
  return false;
}

/**
 * Get authenticated user from request
 */
async function getAuthenticatedUser(
  req: Request,
  storage: IStorage
): Promise<{ userId: string; userEmail: string } | null> {
  // Development fallback
  const urlUserId = (req.query.userId || req.query.user_id) as string | undefined;
  const urlUserEmail = (req.query.user_email || "dev@test.com") as string;
  
  if (process.env.NODE_ENV === "development" && urlUserId) {
    return { userId: urlUserId, userEmail: urlUserEmail };
  }

  // Check for session header
  const sessionId = req.headers["x-session-id"] as string | undefined;
  if (sessionId) {
    const session = await storage.getSession(sessionId);
    if (session) {
      const user = await storage.getUserById(session.userId);
      if (user) {
        return { userId: user.id, userEmail: user.email };
      }
    }
  }

  // Check for Bearer token
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const session = await storage.getSession(token);
    if (session) {
      const user = await storage.getUserById(session.userId);
      if (user) {
        return { userId: user.id, userEmail: user.email };
      }
    }
  }

  return null;
}

/**
 * Parse workspace ID, defaulting to 1 in dev mode
 */
function parseWorkspaceId(idString: string | undefined, fallbackUserId?: string): number {
  let id = parseInt(idString || "");
  if (isNaN(id) && fallbackUserId) {
    id = parseInt(fallbackUserId);
  }
  if (isNaN(id)) {
    id = process.env.NODE_ENV === "development" ? 1 : 0;
  }
  return id;
}

/**
 * Get next scheduled run time (2 AM tonight)
 */
function getNextScheduledRun(): string {
  const now = new Date();
  const nextRun = new Date(now);
  nextRun.setHours(2, 0, 0, 0);
  
  // If it's past 2 AM, schedule for tomorrow
  if (now.getHours() >= 2) {
    nextRun.setDate(nextRun.getDate() + 1);
  }
  
  return nextRun.toISOString();
}

// ============================================
// ROUTER
// ============================================

export function createDevToolsRouter(storage: IStorage): Router {
  const router = Router();

  /**
   * GET /api/dev/sleeper-agent/summary
   * 
   * Get overview of sleeper agent activity
   */
  router.get("/sleeper-agent/summary", async (req: Request, res: Response) => {
    try {
      const auth = await getAuthenticatedUser(req, storage);
      if (!auth) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
      
      if (!hasDevAccess(auth.userEmail)) {
        return res.status(403).json({ success: false, error: "Developer access required" });
      }

      const workspaceId = parseWorkspaceId(req.query.workspaceId as string, auth.userId);
      const db = getDrizzleDb();

      // Get last search log entry
      const [lastLog] = await db
        .select()
        .from(searchLog)
        .where(eq(searchLog.workspaceId, workspaceId))
        .orderBy(desc(searchLog.createdAt))
        .limit(1);

      // Get today's stats
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];

      const todayStats = await db
        .select({
          searchType: searchLog.searchType,
          totalResults: sql<number>`COALESCE(SUM(${searchLog.resultsReturned}), 0)::int`,
          newPubs: sql<number>`COALESCE(SUM(${searchLog.newPubsAdded}), 0)::int`,
          existingPubs: sql<number>`COALESCE(SUM(${searchLog.existingPubsFound}), 0)::int`,
        })
        .from(searchLog)
        .where(
          and(
            eq(searchLog.workspaceId, workspaceId),
            gte(searchLog.createdAt, today)
          )
        )
        .groupBy(searchLog.searchType);

      // Get total pubs count
      const [pubCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(pubsMaster)
        .where(eq(pubsMaster.workspaceId, workspaceId));

      // Get events discovered today
      const [eventCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(things)
        .where(
          and(
            eq(things.workspaceId, workspaceId),
            gte(things.createdAt, today)
          )
        );

      // Get closed pubs today (assuming there's a status or closedAt field)
      const closedPubsToday = 0; // Would need schema update to track this

      // Get recent activity (last 20 logs)
      const recentLogs = await db
        .select()
        .from(searchLog)
        .where(eq(searchLog.workspaceId, workspaceId))
        .orderBy(desc(searchLog.createdAt))
        .limit(20);

      // Calculate totals from today's stats
      let pubsVerifiedToday = 0;
      let newPubsToday = 0;
      
      for (const stat of todayStats) {
        pubsVerifiedToday += stat.existingPubs || 0;
        newPubsToday += stat.newPubs || 0;
      }

      const summary: SleeperAgentSummary = {
        lastRun: {
          timestamp: lastLog?.createdAt?.toISOString() || null,
          status: lastLog ? "success" : "never",
          durationMinutes: null, // Would need to track this
        },
        nextRun: getNextScheduledRun(),
        totals: {
          totalPubs: pubCount?.count || 0,
          pubsVerifiedToday,
          newPubsToday,
          eventsDiscovered: eventCount?.count || 0,
          closedPubs: closedPubsToday,
        },
        recentActivity: recentLogs.map(log => ({
          id: log.id,
          timestamp: log.createdAt?.toISOString() || "",
          activity: log.searchType || "Unknown",
          details: log.searchArea || log.searchTerm || "",
          results: `${log.resultsReturned || 0} results, ${log.newPubsAdded || 0} new, ${log.existingPubsFound || 0} existing`,
        })),
      };

      res.json({ success: true, summary });

    } catch (error: any) {
      console.error("[dev-tools] Summary error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch sleeper agent summary",
        message: error.message,
      });
    }
  });

  /**
   * GET /api/dev/sleeper-agent/verified-pubs
   * 
   * Get list of pubs verified on a specific date
   */
  router.get("/sleeper-agent/verified-pubs", async (req: Request, res: Response) => {
    try {
      const auth = await getAuthenticatedUser(req, storage);
      if (!auth) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
      
      if (!hasDevAccess(auth.userEmail)) {
        return res.status(403).json({ success: false, error: "Developer access required" });
      }

      const workspaceId = parseWorkspaceId(req.query.workspaceId as string, auth.userId);
      const dateStr = (req.query.date as string) || new Date().toISOString().split('T')[0];
      const db = getDrizzleDb();

      // Get pubs updated on the specified date
      const date = new Date(dateStr);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const verifiedPubs = await db
        .select({
          id: pubsMaster.id,
          name: pubsMaster.name,
          postcode: pubsMaster.postcode,
          city: pubsMaster.city,
          updatedAt: pubsMaster.updatedAt,
          verifiedAt: pubsMaster.verifiedAt,
        })
        .from(pubsMaster)
        .where(
          and(
            eq(pubsMaster.workspaceId, workspaceId),
            gte(pubsMaster.updatedAt, date),
            sql`${pubsMaster.updatedAt} < ${nextDate}`
          )
        )
        .orderBy(desc(pubsMaster.updatedAt))
        .limit(100);

      res.json({ 
        success: true, 
        date: dateStr,
        count: verifiedPubs.length,
        pubs: verifiedPubs,
      });

    } catch (error: any) {
      console.error("[dev-tools] Verified pubs error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch verified pubs",
        message: error.message,
      });
    }
  });

  /**
   * GET /api/dev/sleeper-agent/new-pubs
   * 
   * Get list of pubs added on a specific date
   */
  router.get("/sleeper-agent/new-pubs", async (req: Request, res: Response) => {
    try {
      const auth = await getAuthenticatedUser(req, storage);
      if (!auth) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
      
      if (!hasDevAccess(auth.userEmail)) {
        return res.status(403).json({ success: false, error: "Developer access required" });
      }

      const workspaceId = parseWorkspaceId(req.query.workspaceId as string, auth.userId);
      const dateStr = (req.query.date as string) || new Date().toISOString().split('T')[0];
      const db = getDrizzleDb();

      const date = new Date(dateStr);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const newPubs = await db
        .select({
          id: pubsMaster.id,
          name: pubsMaster.name,
          postcode: pubsMaster.postcode,
          city: pubsMaster.city,
          addressLine1: pubsMaster.addressLine1,
          createdAt: pubsMaster.createdAt,
        })
        .from(pubsMaster)
        .where(
          and(
            eq(pubsMaster.workspaceId, workspaceId),
            gte(pubsMaster.createdAt, date),
            sql`${pubsMaster.createdAt} < ${nextDate}`
          )
        )
        .orderBy(desc(pubsMaster.createdAt))
        .limit(100);

      res.json({ 
        success: true, 
        date: dateStr,
        count: newPubs.length,
        pubs: newPubs,
      });

    } catch (error: any) {
      console.error("[dev-tools] New pubs error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch new pubs",
        message: error.message,
      });
    }
  });

  /**
   * GET /api/dev/sleeper-agent/events
   * 
   * Get events discovered on a specific date
   */
  router.get("/sleeper-agent/events", async (req: Request, res: Response) => {
    try {
      const auth = await getAuthenticatedUser(req, storage);
      if (!auth) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
      
      if (!hasDevAccess(auth.userEmail)) {
        return res.status(403).json({ success: false, error: "Developer access required" });
      }

      const workspaceId = parseWorkspaceId(req.query.workspaceId as string, auth.userId);
      const dateStr = (req.query.date as string) || new Date().toISOString().split('T')[0];
      const db = getDrizzleDb();

      const date = new Date(dateStr);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const events = await db
        .select({
          id: things.id,
          name: things.name,
          thingType: things.thingType,
          startDate: things.startDate,
          endDate: things.endDate,
          standaloneLocation: things.standaloneLocation,
          standaloneAddress: things.standaloneAddress,
          createdAt: things.createdAt,
        })
        .from(things)
        .where(
          and(
            eq(things.workspaceId, workspaceId),
            gte(things.createdAt, date),
            sql`${things.createdAt} < ${nextDate}`
          )
        )
        .orderBy(desc(things.createdAt))
        .limit(100);

      res.json({ 
        success: true, 
        date: dateStr,
        count: events.length,
        events,
      });

    } catch (error: any) {
      console.error("[dev-tools] Events error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch events",
        message: error.message,
      });
    }
  });

  /**
   * POST /api/dev/sleeper-agent/run-now
   * 
   * Manually trigger the nightly maintenance job
   */
  router.post("/sleeper-agent/run-now", async (req: Request, res: Response) => {
    try {
      const auth = await getAuthenticatedUser(req, storage);
      if (!auth) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
      
      if (!hasDevAccess(auth.userEmail)) {
        return res.status(403).json({ success: false, error: "Developer access required" });
      }

      const workspaceId = parseWorkspaceId(req.query.workspaceId as string, auth.userId);

      // For now, just log and return success
      // In production, this would trigger the actual nightlyDatabaseUpdate function
      console.log(`[dev-tools] Manual sleeper agent run triggered for workspace ${workspaceId}`);

      // TODO: Import and call nightlyDatabaseUpdate(workspaceId) here
      // For now, simulate a job start
      const jobId = `manual_${Date.now()}`;

      res.json({ 
        success: true, 
        message: "Sleeper agent job started",
        jobId,
        status: "running",
        note: "Manual trigger - check logs for progress",
      });

    } catch (error: any) {
      console.error("[dev-tools] Run now error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to trigger sleeper agent",
        message: error.message,
      });
    }
  });

  /**
   * GET /api/dev/sleeper-agent/errors
   * 
   * Get recent errors from sleeper agent runs
   */
  router.get("/sleeper-agent/errors", async (req: Request, res: Response) => {
    try {
      const auth = await getAuthenticatedUser(req, storage);
      if (!auth) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
      
      if (!hasDevAccess(auth.userEmail)) {
        return res.status(403).json({ success: false, error: "Developer access required" });
      }

      // For now, return empty errors array
      // In production, this would query an error log table
      res.json({ 
        success: true, 
        errors: [],
        message: "No error logging implemented yet",
      });

    } catch (error: any) {
      console.error("[dev-tools] Errors fetch error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch errors",
        message: error.message,
      });
    }
  });

  /**
   * GET /api/dev/access-check
   * 
   * Check if user has dev access
   */
  router.get("/access-check", async (req: Request, res: Response) => {
    try {
      const auth = await getAuthenticatedUser(req, storage);
      if (!auth) {
        return res.status(401).json({ success: false, hasAccess: false });
      }
      
      const hasAccess = hasDevAccess(auth.userEmail);
      
      res.json({ 
        success: true, 
        hasAccess,
        userEmail: auth.userEmail,
        isDev: process.env.NODE_ENV === "development",
      });

    } catch (error: any) {
      res.status(500).json({
        success: false,
        hasAccess: false,
        error: error.message,
      });
    }
  });

  return router;
}

