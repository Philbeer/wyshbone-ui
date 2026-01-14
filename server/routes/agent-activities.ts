/**
 * Agent Activities API Routes
 * Endpoints for fetching autonomous agent activity logs
 */

import express, { Request, Response } from "express";
import { desc, eq, and, gte } from "drizzle-orm";
import { agentActivities } from "@shared/schema";
import type { Storage } from "../storage";

export const agentActivitiesRouter = (storage: Storage) => {
  const router = express.Router();

  /**
   * GET /api/agent-activities
   * Fetch recent agent activities
   * Query params:
   *   - limit: number (default 10, max 100)
   *   - interestingOnly: boolean (default false)
   *   - since: number (unix timestamp in ms, optional)
   */
  router.get("/api/agent-activities", async (req: Request, res: Response) => {
    try {
      // Get query parameters
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
      const interestingOnly = req.query.interestingOnly === "true";
      const since = req.query.since ? parseInt(req.query.since as string) : undefined;

      // Build query
      let query = storage.db
        .select()
        .from(agentActivities);

      // Apply filters
      const conditions = [];

      if (interestingOnly) {
        conditions.push(eq(agentActivities.interestingFlag, 1));
      }

      if (since !== undefined) {
        conditions.push(gte(agentActivities.timestamp, since));
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      // Execute query
      const activities = await query
        .orderBy(desc(agentActivities.timestamp))
        .limit(limit);

      res.json({
        ok: true,
        activities,
        count: activities.length,
        limit,
        interestingOnly,
        since
      });

    } catch (error) {
      console.error("Error fetching agent activities:", error);
      res.status(500).json({
        ok: false,
        error: "Failed to fetch agent activities",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  /**
   * GET /api/agent-activities/:id
   * Fetch single activity by ID
   */
  router.get("/api/agent-activities/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const activity = await storage.db
        .select()
        .from(agentActivities)
        .where(eq(agentActivities.id, id))
        .limit(1);

      if (activity.length === 0) {
        return res.status(404).json({
          ok: false,
          error: "Activity not found"
        });
      }

      res.json({
        ok: true,
        activity: activity[0]
      });

    } catch (error) {
      console.error("Error fetching activity:", error);
      res.status(500).json({
        ok: false,
        error: "Failed to fetch activity",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  /**
   * GET /api/agent-activities/stats/summary
   * Get activity statistics summary
   */
  router.get("/api/agent-activities/stats/summary", async (req: Request, res: Response) => {
    try {
      const activities = await storage.db
        .select()
        .from(agentActivities);

      const total = activities.length;
      const interesting = activities.filter(a => a.interestingFlag === 1).length;
      const successful = activities.filter(a => a.status === "success").length;
      const failed = activities.filter(a => a.status === "failed").length;
      const pending = activities.filter(a => a.status === "pending").length;

      res.json({
        ok: true,
        stats: {
          total,
          interesting,
          successful,
          failed,
          pending,
          successRate: total > 0 ? Math.round((successful / total) * 100) : 0
        }
      });

    } catch (error) {
      console.error("Error fetching activity stats:", error);
      res.status(500).json({
        ok: false,
        error: "Failed to fetch activity statistics",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  return router;
};
