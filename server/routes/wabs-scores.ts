/**
 * WABS Scores API Routes
 * Endpoints for fetching WABS scores from PostgreSQL task_executions table
 */

import express, { Request, Response } from "express";
import pg from "pg";
const { Pool } = pg;

export const wabsScoresRouter = express.Router();

// PostgreSQL connection for task_executions (same DB as supervisor)
let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    // CRITICAL: Always prefer SUPABASE_DATABASE_URL over DATABASE_URL
    const connectionUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
    if (!connectionUrl) {
      throw new Error("SUPABASE_DATABASE_URL or DATABASE_URL not configured");
    }
    pool = new Pool({ connectionString: connectionUrl });
  }
  return pool;
}

/**
 * GET /api/wabs-scores
 * Fetch recent WABS scores
 * Query params:
 *   - limit: number (default 10, max 100)
 *   - userId: string (optional - filter by user)
 *   - minScore: number (optional - only scores >= this value)
 */
wabsScoresRouter.get("/api/wabs-scores", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
    const userId = req.query.userId as string | undefined;
    const minScore = req.query.minScore ? parseInt(req.query.minScore as string) : undefined;

    let query = `
      SELECT
        task_id,
        user_id,
        wabs_score,
        wabs_signals,
        result,
        created_at
      FROM task_executions
      WHERE wabs_score IS NOT NULL
    `;

    const params: any[] = [];
    let paramCount = 1;

    if (userId) {
      query += ` AND user_id = $${paramCount}`;
      params.push(userId);
      paramCount++;
    }

    if (minScore !== undefined) {
      query += ` AND wabs_score >= $${paramCount}`;
      params.push(minScore);
      paramCount++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount}`;
    params.push(limit);

    const db = getPool();
    const result = await db.query(query, params);

    res.json({
      ok: true,
      scores: result.rows,
      count: result.rows.length,
      limit,
      filters: {
        userId: userId || null,
        minScore: minScore || null,
      },
    });
  } catch (error: any) {
    console.error("Error fetching WABS scores:", error);
    res.status(500).json({
      ok: false,
      error: "Failed to fetch WABS scores",
      message: error.message || "Unknown error",
    });
  }
});

/**
 * GET /api/wabs-scores/:taskId
 * Fetch WABS score for a specific task
 */
wabsScoresRouter.get("/api/wabs-scores/:taskId", async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;

    const query = `
      SELECT
        task_id,
        user_id,
        wabs_score,
        wabs_signals,
        result,
        created_at
      FROM task_executions
      WHERE task_id = $1
    `;

    const db = getPool();
    const result = await db.query(query, [taskId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "WABS score not found for this task",
      });
    }

    res.json({
      ok: true,
      score: result.rows[0],
    });
  } catch (error: any) {
    console.error(`Error fetching WABS score for task ${req.params.taskId}:`, error);
    res.status(500).json({
      ok: false,
      error: "Failed to fetch WABS score",
      message: error.message || "Unknown error",
    });
  }
});

/**
 * GET /api/wabs-scores/stats/summary
 * Get WABS score statistics
 */
wabsScoresRouter.get("/api/wabs-scores/stats/summary", async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string | undefined;

    let query = `
      SELECT
        COUNT(*) as total_tasks,
        AVG(wabs_score) as avg_score,
        MAX(wabs_score) as max_score,
        MIN(wabs_score) as min_score,
        COUNT(CASE WHEN wabs_score >= 70 THEN 1 END) as high_value_count
      FROM task_executions
      WHERE wabs_score IS NOT NULL
    `;

    const params: any[] = [];

    if (userId) {
      query += ` AND user_id = $1`;
      params.push(userId);
    }

    const db = getPool();
    const result = await db.query(query, params);

    res.json({
      ok: true,
      stats: result.rows[0],
    });
  } catch (error: any) {
    console.error("Error fetching WABS stats:", error);
    res.status(500).json({
      ok: false,
      error: "Failed to fetch WABS statistics",
      message: error.message || "Unknown error",
    });
  }
});
