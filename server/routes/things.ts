/**
 * Things (Events) API Routes
 * 
 * Provides endpoints for:
 * - Fetching upcoming events
 * - Getting events by outlet
 * - Marking events as interested
 * - Marking events as attended
 * - Updating event status
 */

import { Router, Request, Response } from "express";
import { eq, and, gte, desc, asc, sql } from "drizzle-orm";
import { getDrizzleDb } from "../storage";
import { things, pubsMaster, type InsertThing, type SelectThing } from "@shared/schema";
import type { IStorage } from "../storage";

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get authenticated user from request headers
 */
async function getAuthenticatedUserId(
  req: Request,
  storage: IStorage
): Promise<{ userId: string; userEmail: string } | null> {
  // Development fallback: allow URL parameters for testing ONLY
  const urlUserId = (req.query.userId || req.query.user_id || req.query.workspaceId) as string | undefined;
  const urlUserEmail = (req.query.user_email || "dev@test.com") as string;
  
  if (process.env.NODE_ENV === "development" && urlUserId) {
    console.log(`[things] Dev auth: userId=${urlUserId}`);
    return { userId: urlUserId, userEmail: urlUserEmail };
  }

  // Check for session header (used by frontend)
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

  // Check for Bearer token auth
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
  
  // Check for session-based auth via cookie
  const cookieSessionId = req.cookies?.sessionId;
  if (cookieSessionId) {
    const session = await storage.getSession(cookieSessionId);
    if (session) {
      const user = await storage.getUserById(session.userId);
      if (user) {
        return { userId: user.id, userEmail: user.email };
      }
    }
  }

  return null;
}

// ============================================
// ROUTER
// ============================================

export function createThingsRouter(storage: IStorage): Router {
  const router = Router();

  /**
   * GET /api/things/upcoming
   * 
   * Fetch upcoming events for a workspace.
   * 
   * Query params:
   * - workspaceId: Workspace ID (required)
   * - limit: Max results (default 20)
   */
  router.get("/upcoming", async (req: Request, res: Response) => {
    try {
      const auth = await getAuthenticatedUserId(req, storage);
      if (!auth) {
        return res.status(401).json({ 
          success: false, 
          error: "Unauthorized - please log in" 
        });
      }

      const workspaceId = parseInt(req.query.workspaceId as string) || parseInt(auth.userId);
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

      const db = getDrizzleDb();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Fetch upcoming events with outlet data
      const upcomingThings = await db
        .select({
          thing: things,
          outlet: {
            id: pubsMaster.id,
            name: pubsMaster.name,
            postcode: pubsMaster.postcode,
            city: pubsMaster.city,
          },
        })
        .from(things)
        .leftJoin(pubsMaster, eq(things.outletId, pubsMaster.id))
        .where(
          and(
            eq(things.workspaceId, workspaceId),
            // Include events that haven't ended yet
            sql`${things.endDate} >= ${today.toISOString()} OR (${things.endDate} IS NULL AND ${things.startDate} >= ${today.toISOString()}) OR ${things.status} IN ('upcoming', 'happening_now')`
          )
        )
        .orderBy(
          desc(things.relevanceScore),
          asc(things.startDate)
        )
        .limit(limit);

      // Transform to match frontend type
      const result = upcomingThings.map(({ thing, outlet }) => ({
        ...thing,
        outlet: outlet?.id ? outlet : null,
      }));

      res.json({ 
        success: true, 
        things: result 
      });

    } catch (error: any) {
      console.error("[things] Upcoming events error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch upcoming events",
        message: error.message,
      });
    }
  });

  /**
   * GET /api/things/outlet/:outletId
   * 
   * Fetch events for a specific outlet.
   */
  router.get("/outlet/:outletId", async (req: Request, res: Response) => {
    try {
      const auth = await getAuthenticatedUserId(req, storage);
      if (!auth) {
        return res.status(401).json({ 
          success: false, 
          error: "Unauthorized - please log in" 
        });
      }

      const outletId = parseInt(req.params.outletId);
      if (isNaN(outletId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid outlet ID",
        });
      }

      const db = getDrizzleDb();
      const workspaceId = parseInt(auth.userId);

      // Fetch all events for this outlet
      const outletThings = await db
        .select()
        .from(things)
        .where(
          and(
            eq(things.workspaceId, workspaceId),
            eq(things.outletId, outletId)
          )
        )
        .orderBy(desc(things.startDate));

      res.json({ 
        success: true, 
        things: outletThings 
      });

    } catch (error: any) {
      console.error("[things] Outlet events error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch outlet events",
        message: error.message,
      });
    }
  });

  /**
   * PATCH /api/things/:thingId/interested
   * 
   * Mark/unmark an event as interested.
   */
  router.patch("/:thingId/interested", async (req: Request, res: Response) => {
    try {
      const auth = await getAuthenticatedUserId(req, storage);
      if (!auth) {
        return res.status(401).json({ 
          success: false, 
          error: "Unauthorized - please log in" 
        });
      }

      const thingId = parseInt(req.params.thingId);
      if (isNaN(thingId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid thing ID",
        });
      }

      const { interested } = req.body;
      if (typeof interested !== "boolean") {
        return res.status(400).json({
          success: false,
          error: "interested must be a boolean",
        });
      }

      const db = getDrizzleDb();
      const workspaceId = parseInt(auth.userId);

      // Update the thing
      const updated = await db
        .update(things)
        .set({
          userInterested: interested,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(things.id, thingId),
            eq(things.workspaceId, workspaceId)
          )
        )
        .returning();

      if (updated.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Event not found",
        });
      }

      res.json({ 
        success: true, 
        thing: updated[0] 
      });

    } catch (error: any) {
      console.error("[things] Mark interested error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update event interest",
        message: error.message,
      });
    }
  });

  /**
   * PATCH /api/things/:thingId/attended
   * 
   * Mark/unmark an event as attended.
   */
  router.patch("/:thingId/attended", async (req: Request, res: Response) => {
    try {
      const auth = await getAuthenticatedUserId(req, storage);
      if (!auth) {
        return res.status(401).json({ 
          success: false, 
          error: "Unauthorized - please log in" 
        });
      }

      const thingId = parseInt(req.params.thingId);
      if (isNaN(thingId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid thing ID",
        });
      }

      const { attended } = req.body;
      if (typeof attended !== "boolean") {
        return res.status(400).json({
          success: false,
          error: "attended must be a boolean",
        });
      }

      const db = getDrizzleDb();
      const workspaceId = parseInt(auth.userId);

      // Update the thing
      const updated = await db
        .update(things)
        .set({
          userAttended: attended,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(things.id, thingId),
            eq(things.workspaceId, workspaceId)
          )
        )
        .returning();

      if (updated.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Event not found",
        });
      }

      res.json({ 
        success: true, 
        thing: updated[0] 
      });

    } catch (error: any) {
      console.error("[things] Mark attended error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update event attendance",
        message: error.message,
      });
    }
  });

  /**
   * PATCH /api/things/:thingId/status
   * 
   * Update the status of an event.
   */
  router.patch("/:thingId/status", async (req: Request, res: Response) => {
    try {
      const auth = await getAuthenticatedUserId(req, storage);
      if (!auth) {
        return res.status(401).json({ 
          success: false, 
          error: "Unauthorized - please log in" 
        });
      }

      const thingId = parseInt(req.params.thingId);
      if (isNaN(thingId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid thing ID",
        });
      }

      const { status } = req.body;
      const validStatuses = ["upcoming", "happening_now", "completed", "cancelled"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
        });
      }

      const db = getDrizzleDb();
      const workspaceId = parseInt(auth.userId);

      // Update the thing
      const updated = await db
        .update(things)
        .set({
          status,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(things.id, thingId),
            eq(things.workspaceId, workspaceId)
          )
        )
        .returning();

      if (updated.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Event not found",
        });
      }

      res.json({ 
        success: true, 
        thing: updated[0] 
      });

    } catch (error: any) {
      console.error("[things] Update status error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update event status",
        message: error.message,
      });
    }
  });

  /**
   * GET /api/things/:thingId
   * 
   * Get a single event by ID.
   */
  router.get("/:thingId", async (req: Request, res: Response) => {
    try {
      const auth = await getAuthenticatedUserId(req, storage);
      if (!auth) {
        return res.status(401).json({ 
          success: false, 
          error: "Unauthorized - please log in" 
        });
      }

      const thingId = parseInt(req.params.thingId);
      if (isNaN(thingId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid thing ID",
        });
      }

      const db = getDrizzleDb();
      const workspaceId = parseInt(auth.userId);

      // Fetch the thing with outlet data
      const result = await db
        .select({
          thing: things,
          outlet: {
            id: pubsMaster.id,
            name: pubsMaster.name,
            postcode: pubsMaster.postcode,
            city: pubsMaster.city,
          },
        })
        .from(things)
        .leftJoin(pubsMaster, eq(things.outletId, pubsMaster.id))
        .where(
          and(
            eq(things.id, thingId),
            eq(things.workspaceId, workspaceId)
          )
        )
        .limit(1);

      if (result.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Event not found",
        });
      }

      const { thing, outlet } = result[0];

      res.json({ 
        success: true, 
        thing: {
          ...thing,
          outlet: outlet?.id ? outlet : null,
        }
      });

    } catch (error: any) {
      console.error("[things] Get thing error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch event",
        message: error.message,
      });
    }
  });

  return router;
}



