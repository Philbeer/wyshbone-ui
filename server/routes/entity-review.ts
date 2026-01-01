/**
 * Entity Review Queue API Routes
 * 
 * Provides endpoints for:
 * - Fetching the review queue (pending entity matches)
 * - Approving reviews (merge or create new)
 * - Rejecting reviews (mark as different)
 * - Getting queue statistics
 */

import { Router, Request, Response } from "express";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { getDrizzleDb } from "../storage";
import { entityReviewQueue, pubsMaster, entitySources } from "@shared/schema";
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
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    // Check for session-based auth via cookie
    const sessionId = req.cookies?.sessionId;
    if (sessionId) {
      const session = await storage.getSession(sessionId);
      if (session) {
        const user = await storage.getUserById(session.userId);
        if (user) {
          return { userId: user.id, userEmail: user.email };
        }
      }
    }
    return null;
  }

  // For Bearer token auth (API keys)
  const token = authHeader.slice(7);
  const session = await storage.getSession(token);
  if (session) {
    const user = await storage.getUserById(session.userId);
    if (user) {
      return { userId: user.id, userEmail: user.email };
    }
  }

  return null;
}

// ============================================
// ROUTER
// ============================================

export function createEntityReviewRouter(storage: IStorage): Router {
  const router = Router();

  /**
   * GET /api/entity-review/queue
   * 
   * Fetch pending reviews for a workspace.
   * 
   * Query params:
   * - workspaceId: Workspace ID (required)
   * - sourceType: Filter by source type (optional)
   * - status: Filter by status (default: pending)
   * - minConfidence: Minimum confidence (optional)
   * - maxConfidence: Maximum confidence (optional)
   */
  router.get("/queue", async (req: Request, res: Response) => {
    try {
      const auth = await getAuthenticatedUserId(req, storage);
      if (!auth) {
        return res.status(401).json({ 
          success: false, 
          error: "Unauthorized - please log in" 
        });
      }

      const workspaceId = parseInt(req.query.workspaceId as string) || parseInt(auth.userId);
      const sourceType = req.query.sourceType as string | undefined;
      const status = (req.query.status as string) || "pending";
      const minConfidence = req.query.minConfidence ? parseFloat(req.query.minConfidence as string) : undefined;
      const maxConfidence = req.query.maxConfidence ? parseFloat(req.query.maxConfidence as string) : undefined;

      const db = getDrizzleDb();

      // Build conditions
      const conditions = [eq(entityReviewQueue.workspaceId, workspaceId)];
      
      if (status) {
        conditions.push(eq(entityReviewQueue.status, status));
      }
      if (sourceType) {
        conditions.push(eq(entityReviewQueue.sourceType, sourceType));
      }
      if (minConfidence !== undefined) {
        conditions.push(gte(entityReviewQueue.confidence, minConfidence));
      }
      if (maxConfidence !== undefined) {
        conditions.push(lte(entityReviewQueue.confidence, maxConfidence));
      }

      // Fetch reviews with possible match data
      const reviews = await db
        .select({
          review: entityReviewQueue,
          possibleMatch: {
            id: pubsMaster.id,
            name: pubsMaster.name,
            postcode: pubsMaster.postcode,
            addressLine1: pubsMaster.addressLine1,
            city: pubsMaster.city,
          },
        })
        .from(entityReviewQueue)
        .leftJoin(pubsMaster, eq(entityReviewQueue.possibleMatchPubId, pubsMaster.id))
        .where(and(...conditions))
        .orderBy(desc(entityReviewQueue.confidence), desc(entityReviewQueue.createdAt))
        .limit(100);

      // Transform to match frontend type
      const result = reviews.map(({ review, possibleMatch }) => ({
        id: review.id,
        workspaceId: review.workspaceId,
        newPubData: review.newPubData as {
          name: string;
          postcode?: string | null;
          phone?: string | null;
          address?: string | null;
        },
        sourceType: review.sourceType,
        sourceId: review.sourceId,
        possibleMatchPubId: review.possibleMatchPubId,
        possibleMatch: possibleMatch?.id ? possibleMatch : null,
        confidence: review.confidence,
        reasoning: review.reasoning,
        status: review.status as "pending" | "resolved",
        reviewedBy: review.reviewedBy,
        reviewedAt: review.reviewedAt?.toISOString() || null,
        reviewDecision: review.reviewDecision,
        createdAt: review.createdAt?.toISOString() || null,
      }));

      res.json({ 
        success: true, 
        reviews: result 
      });

    } catch (error: any) {
      console.error("[entity-review] Queue fetch error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch review queue",
        message: error.message,
      });
    }
  });

  /**
   * GET /api/entity-review/stats
   * 
   * Get review queue statistics.
   */
  router.get("/stats", async (req: Request, res: Response) => {
    try {
      const auth = await getAuthenticatedUserId(req, storage);
      if (!auth) {
        return res.status(401).json({ 
          success: false, 
          error: "Unauthorized - please log in" 
        });
      }

      const workspaceId = parseInt(req.query.workspaceId as string) || parseInt(auth.userId);
      const db = getDrizzleDb();

      // Get counts by status
      const stats = await db
        .select({
          status: entityReviewQueue.status,
          count: sql<number>`count(*)::int`,
        })
        .from(entityReviewQueue)
        .where(eq(entityReviewQueue.workspaceId, workspaceId))
        .groupBy(entityReviewQueue.status);

      // Get counts by source type for pending
      const sourceStats = await db
        .select({
          sourceType: entityReviewQueue.sourceType,
          count: sql<number>`count(*)::int`,
        })
        .from(entityReviewQueue)
        .where(
          and(
            eq(entityReviewQueue.workspaceId, workspaceId),
            eq(entityReviewQueue.status, "pending")
          )
        )
        .groupBy(entityReviewQueue.sourceType);

      const result = {
        byStatus: stats.reduce((acc, { status, count }) => {
          acc[status || 'pending'] = count;
          return acc;
        }, {} as Record<string, number>),
        bySourceType: sourceStats.reduce((acc, { sourceType, count }) => {
          acc[sourceType] = count;
          return acc;
        }, {} as Record<string, number>),
        total: stats.reduce((sum, { count }) => sum + count, 0),
        pending: stats.find(s => s.status === 'pending')?.count || 0,
      };

      res.json({ 
        success: true, 
        stats: result 
      });

    } catch (error: any) {
      console.error("[entity-review] Stats error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch review stats",
        message: error.message,
      });
    }
  });

  /**
   * POST /api/entity-review/:reviewId/approve
   * 
   * Approve a review - either merge with existing or create new.
   * 
   * Body:
   * - decision: "match" (merge with existing) or "new" (create new pub)
   */
  router.post("/:reviewId/approve", async (req: Request, res: Response) => {
    try {
      const auth = await getAuthenticatedUserId(req, storage);
      if (!auth) {
        return res.status(401).json({ 
          success: false, 
          error: "Unauthorized - please log in" 
        });
      }

      const reviewId = parseInt(req.params.reviewId);
      if (isNaN(reviewId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid review ID",
        });
      }

      const { decision } = req.body;
      if (decision !== "match" && decision !== "new") {
        return res.status(400).json({
          success: false,
          error: "Decision must be 'match' or 'new'",
        });
      }

      const db = getDrizzleDb();
      const workspaceId = parseInt(auth.userId);

      // Get the review
      const [review] = await db
        .select()
        .from(entityReviewQueue)
        .where(
          and(
            eq(entityReviewQueue.id, reviewId),
            eq(entityReviewQueue.workspaceId, workspaceId)
          )
        )
        .limit(1);

      if (!review) {
        return res.status(404).json({
          success: false,
          error: "Review not found",
        });
      }

      if (review.status !== "pending") {
        return res.status(400).json({
          success: false,
          error: "Review has already been processed",
        });
      }

      const newPubData = review.newPubData as {
        name: string;
        postcode?: string | null;
        phone?: string | null;
        address?: string | null;
      };

      let resultPubId: number;

      if (decision === "match" && review.possibleMatchPubId) {
        // Merge with existing pub - just link the source
        resultPubId = review.possibleMatchPubId;

        // Add entity source linking this source to the existing pub
        await db.insert(entitySources).values({
          pubId: resultPubId,
          sourceType: review.sourceType,
          sourceId: review.sourceId,
          confidence: review.confidence,
          matchedAt: new Date(),
          matchedBy: "manual_review",
          matchedReasoning: `Manually approved merge: ${review.reasoning || 'User confirmed match'}`,
        });

      } else {
        // Create new pub
        const [newPub] = await db
          .insert(pubsMaster)
          .values({
            name: newPubData.name,
            postcode: newPubData.postcode || null,
            addressLine1: newPubData.address || null,
            phone: newPubData.phone || null,
            workspaceId: workspaceId,
            isCustomer: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        resultPubId = newPub.id;

        // Add entity source
        await db.insert(entitySources).values({
          pubId: resultPubId,
          sourceType: review.sourceType,
          sourceId: review.sourceId,
          confidence: 1.0, // Full confidence since manually verified
          matchedAt: new Date(),
          matchedBy: "manual_review",
          matchedReasoning: "Manually created as new pub",
        });
      }

      // Update the review as resolved
      await db
        .update(entityReviewQueue)
        .set({
          status: "resolved",
          reviewedBy: parseInt(auth.userId),
          reviewedAt: new Date(),
          reviewDecision: decision,
        })
        .where(eq(entityReviewQueue.id, reviewId));

      res.json({ 
        success: true, 
        decision,
        pubId: resultPubId,
        message: decision === "match" 
          ? "Entity merged with existing pub" 
          : "New pub created",
      });

    } catch (error: any) {
      console.error("[entity-review] Approve error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to approve review",
        message: error.message,
      });
    }
  });

  /**
   * POST /api/entity-review/:reviewId/reject
   * 
   * Reject a review - marks as different/not a match.
   */
  router.post("/:reviewId/reject", async (req: Request, res: Response) => {
    try {
      const auth = await getAuthenticatedUserId(req, storage);
      if (!auth) {
        return res.status(401).json({ 
          success: false, 
          error: "Unauthorized - please log in" 
        });
      }

      const reviewId = parseInt(req.params.reviewId);
      if (isNaN(reviewId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid review ID",
        });
      }

      const db = getDrizzleDb();
      const workspaceId = parseInt(auth.userId);

      // Get the review
      const [review] = await db
        .select()
        .from(entityReviewQueue)
        .where(
          and(
            eq(entityReviewQueue.id, reviewId),
            eq(entityReviewQueue.workspaceId, workspaceId)
          )
        )
        .limit(1);

      if (!review) {
        return res.status(404).json({
          success: false,
          error: "Review not found",
        });
      }

      if (review.status !== "pending") {
        return res.status(400).json({
          success: false,
          error: "Review has already been processed",
        });
      }

      // Update the review as rejected
      await db
        .update(entityReviewQueue)
        .set({
          status: "resolved",
          reviewedBy: parseInt(auth.userId),
          reviewedAt: new Date(),
          reviewDecision: "rejected",
        })
        .where(eq(entityReviewQueue.id, reviewId));

      res.json({ 
        success: true, 
        message: "Review rejected - marked as different business",
      });

    } catch (error: any) {
      console.error("[entity-review] Reject error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to reject review",
        message: error.message,
      });
    }
  });

  /**
   * GET /api/entity-review/:reviewId
   * 
   * Get a single review by ID.
   */
  router.get("/:reviewId", async (req: Request, res: Response) => {
    try {
      const auth = await getAuthenticatedUserId(req, storage);
      if (!auth) {
        return res.status(401).json({ 
          success: false, 
          error: "Unauthorized - please log in" 
        });
      }

      const reviewId = parseInt(req.params.reviewId);
      if (isNaN(reviewId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid review ID",
        });
      }

      const db = getDrizzleDb();
      const workspaceId = parseInt(auth.userId);

      // Fetch review with possible match data
      const [result] = await db
        .select({
          review: entityReviewQueue,
          possibleMatch: {
            id: pubsMaster.id,
            name: pubsMaster.name,
            postcode: pubsMaster.postcode,
            addressLine1: pubsMaster.addressLine1,
            city: pubsMaster.city,
          },
        })
        .from(entityReviewQueue)
        .leftJoin(pubsMaster, eq(entityReviewQueue.possibleMatchPubId, pubsMaster.id))
        .where(
          and(
            eq(entityReviewQueue.id, reviewId),
            eq(entityReviewQueue.workspaceId, workspaceId)
          )
        )
        .limit(1);

      if (!result) {
        return res.status(404).json({
          success: false,
          error: "Review not found",
        });
      }

      const { review, possibleMatch } = result;

      res.json({ 
        success: true, 
        review: {
          id: review.id,
          workspaceId: review.workspaceId,
          newPubData: review.newPubData,
          sourceType: review.sourceType,
          sourceId: review.sourceId,
          possibleMatchPubId: review.possibleMatchPubId,
          possibleMatch: possibleMatch?.id ? possibleMatch : null,
          confidence: review.confidence,
          reasoning: review.reasoning,
          status: review.status,
          reviewedBy: review.reviewedBy,
          reviewedAt: review.reviewedAt?.toISOString() || null,
          reviewDecision: review.reviewDecision,
          createdAt: review.createdAt?.toISOString() || null,
        },
      });

    } catch (error: any) {
      console.error("[entity-review] Get error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch review",
        message: error.message,
      });
    }
  });

  return router;
}

