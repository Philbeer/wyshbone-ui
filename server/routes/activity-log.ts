/**
 * Activity Log API Routes
 * 
 * Provides endpoints for fetching local Wyshbone system activity
 * for the "Recent Activity" panel in the UI.
 */

import { Router, Request, Response } from "express";
import { getDrizzleDb } from "../storage";
import { activityLog } from "../../shared/schema";
import { desc, eq, and, gte } from "drizzle-orm";
import type { IStorage } from "../storage";

// Helper function to get authenticated user (consistent with other routes)
async function getAuthenticatedUser(
  req: Request,
  storage: IStorage
): Promise<{ userId: string; userEmail: string; workspaceId: number } | null> {
  // Development mode: accept URL params
  const urlUserId = (req.params.userId || req.query.userId || req.query.user_id) as string | undefined;
  const urlUserEmail = req.query.user_email as string | undefined;
  const urlWorkspaceId = req.query.workspaceId as string | undefined;

  if (process.env.NODE_ENV === "development" && urlUserId && urlUserEmail) {
    const workspaceId = urlWorkspaceId ? parseInt(urlWorkspaceId, 10) : 1;
    return { 
      userId: urlUserId, 
      userEmail: urlUserEmail,
      workspaceId: isNaN(workspaceId) ? 1 : workspaceId
    };
  }

  // Session-based auth
  const sessionId = req.headers["x-session-id"] as string | undefined;
  if (sessionId) {
    const session = await storage.getSession(sessionId);
    if (session) {
      const user = await storage.getUserById(session.userId);
      if (user) {
        // Get workspace ID from user or default to 1
        const workspaceId = typeof user.id === 'string' ? 1 : parseInt(user.id, 10);
        return { 
          userId: user.id, 
          userEmail: user.email,
          workspaceId: isNaN(workspaceId) ? 1 : workspaceId
        };
      }
    }
  }

  // Bearer token auth
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const apiKey = await storage.getApiKeyByKey(token);
    if (apiKey) {
      const user = await storage.getUserById(apiKey.userId);
      if (user) {
        const workspaceId = typeof user.id === 'string' ? 1 : parseInt(user.id, 10);
        return { 
          userId: user.id, 
          userEmail: user.email,
          workspaceId: isNaN(workspaceId) ? 1 : workspaceId
        };
      }
    }
  }

  return null;
}

export function createActivityLogRouter(storage: IStorage): Router {
  const router = Router();

  /**
   * GET /api/activity-log
   * 
   * Fetch recent activity for the current workspace
   * 
   * Query params:
   * - limit: number of activities to return (default: 20, max: 100)
   * - category: filter by category (system, ai, sync, user)
   * - since: ISO date string to filter activities after
   */
  router.get("/", async (req: Request, res: Response) => {
    try {
      // Try to get authenticated user, fall back to workspace 1 in development
      let workspaceId = 1;
      const auth = await getAuthenticatedUser(req, storage);
      if (auth) {
        workspaceId = auth.workspaceId;
      } else if (process.env.NODE_ENV !== "development") {
        return res.status(401).json({ error: "Unauthorized" });
      }
      // In development mode, allow unauthenticated requests with workspaceId = 1

      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const category = req.query.category as string | undefined;
      const since = req.query.since as string | undefined;

      const db = getDrizzleDb();

      // Build query conditions
      const conditions = [eq(activityLog.workspaceId, workspaceId)];
      
      if (category && ['system', 'ai', 'sync', 'user'].includes(category)) {
        conditions.push(eq(activityLog.category, category));
      }
      
      if (since) {
        const sinceDate = new Date(since);
        if (!isNaN(sinceDate.getTime())) {
          conditions.push(gte(activityLog.createdAt, sinceDate));
        }
      }

      const activities = await db
        .select()
        .from(activityLog)
        .where(and(...conditions))
        .orderBy(desc(activityLog.createdAt))
        .limit(limit);

      res.json({ 
        activities,
        count: activities.length,
        workspaceId
      });
    } catch (error: any) {
      console.error("Failed to fetch activity log:", error);
      res.status(500).json({ error: "Failed to fetch activities" });
    }
  });

  /**
   * GET /api/activity-log/stats
   * 
   * Get activity statistics for the dashboard
   */
  router.get("/stats", async (req: Request, res: Response) => {
    try {
      // Try to get authenticated user, fall back to workspace 1 in development
      let workspaceId = 1;
      const auth = await getAuthenticatedUser(req, storage);
      if (auth) {
        workspaceId = auth.workspaceId;
      } else if (process.env.NODE_ENV !== "development") {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const db = getDrizzleDb();
      
      // Get counts by category for last 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const recentActivities = await db
        .select()
        .from(activityLog)
        .where(and(
          eq(activityLog.workspaceId, workspaceId),
          gte(activityLog.createdAt, oneDayAgo)
        ))
        .orderBy(desc(activityLog.createdAt));

      // Calculate stats
      const stats = {
        total: recentActivities.length,
        byCategory: {
          system: recentActivities.filter(a => a.category === 'system').length,
          ai: recentActivities.filter(a => a.category === 'ai').length,
          sync: recentActivities.filter(a => a.category === 'sync').length,
          user: recentActivities.filter(a => a.category === 'user').length,
        },
        lastActivity: recentActivities[0]?.createdAt || null
      };

      res.json({ stats });
    } catch (error: any) {
      console.error("Failed to fetch activity stats:", error);
      res.status(500).json({ error: "Failed to fetch activity stats" });
    }
  });

  return router;
}

export default createActivityLogRouter;

