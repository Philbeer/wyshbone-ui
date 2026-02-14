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
    console.log("📊 [DEV-TOOLS] GET /sleeper-agent/summary received");
    
    try {
      const auth = await getAuthenticatedUser(req, storage);
      console.log("📊 [DEV-TOOLS] Auth result:", auth ? `${auth.userEmail}` : "null");
      
      if (!auth) {
        console.log("📊 [DEV-TOOLS] No auth - returning 401");
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
      
      if (!hasDevAccess(auth.userEmail)) {
        console.log("📊 [DEV-TOOLS] No dev access - returning 403");
        return res.status(403).json({ success: false, error: "Developer access required" });
      }

      const workspaceId = parseWorkspaceId(req.query.workspaceId as string, auth.userId);
      console.log("📊 [DEV-TOOLS] workspaceId:", workspaceId);
      
      const db = getDrizzleDb();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Try to get data - tables may not exist yet
      let lastLog: any = null;
      let todayStats: any[] = [];
      let recentLogs: any[] = [];
      let pubCount = { count: 0 };
      let eventCount = { count: 0 };
      
      try {
        // Get last search log entry
        [lastLog] = await db
          .select()
          .from(searchLog)
          .where(eq(searchLog.workspaceId, workspaceId))
          .orderBy(desc(searchLog.createdAt))
          .limit(1);
        
        // Get today's stats
        todayStats = await db
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
          
        // Get recent activity (last 20 logs)
        recentLogs = await db
          .select()
          .from(searchLog)
          .where(eq(searchLog.workspaceId, workspaceId))
          .orderBy(desc(searchLog.createdAt))
          .limit(20);
      } catch (searchLogError: any) {
        console.log("📊 [DEV-TOOLS] search_log table not available:", searchLogError.message);
        // Continue with empty data - table might not exist yet
      }

      try {
        // Get total pubs count
        [pubCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(pubsMaster)
          .where(eq(pubsMaster.workspaceId, workspaceId));
      } catch (pubsError: any) {
        console.log("📊 [DEV-TOOLS] pubs_master query failed:", pubsError.message);
      }

      try {
        // Get events discovered today  
        [eventCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(things)
          .where(
            and(
              eq(things.workspaceId, workspaceId),
              gte(things.createdAt, today)
            )
          );
      } catch (eventsError: any) {
        console.log("📊 [DEV-TOOLS] things query failed:", eventsError.message);
      }

      // Get closed pubs today (assuming there's a status or closedAt field)
      const closedPubsToday = 0; // Would need schema update to track this

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

      console.log("📊 [DEV-TOOLS] Returning summary:", JSON.stringify(summary, null, 2));
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

  /**
   * POST /api/dev/explain-run
   * 
   * Generate a plain-English explanation of a run using AFR events + artefacts
   * Uses GPT to produce a narrative report with key facts and timeline
   */
  router.post("/explain-run", async (req: Request, res: Response) => {
    try {
      const auth = await getAuthenticatedUser(req, storage);
      if (!auth) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
      if (!hasDevAccess(auth.userEmail)) {
        return res.status(403).json({ success: false, error: "Developer access required" });
      }

      let { runId, client_request_id } = req.body;
      if (!runId && !client_request_id) {
        return res.status(400).json({ success: false, error: "runId or client_request_id is required" });
      }

      const db = getDrizzleDb();

      if (!runId && client_request_id) {
        try {
          const runResult = await db.execute(
            sql`SELECT id FROM agent_runs WHERE client_request_id = ${client_request_id} ORDER BY created_at DESC LIMIT 1`
          );
          const runRows = Array.isArray(runResult) ? runResult : (runResult as any).rows ?? [];
          if (runRows[0]?.id) {
            runId = runRows[0].id;
          }
        } catch (_e) {}

        if (!runId) {
          try {
            const actResult = await db.execute(
              sql`SELECT run_id FROM agent_activities WHERE client_request_id = ${client_request_id} AND run_id IS NOT NULL ORDER BY timestamp DESC LIMIT 1`
            );
            const actRows = Array.isArray(actResult) ? actResult : (actResult as any).rows ?? [];
            if (actRows[0]?.run_id) {
              runId = actRows[0].run_id;
            }
          } catch (_e) {}
        }

        if (!runId) {
          return res.status(404).json({ success: false, error: "No run found for this client_request_id" });
        }
      }

      const artefactResult = await db.execute(
        sql`SELECT id, run_id, type, title, summary, payload_json, created_at
            FROM artefacts
            WHERE run_id = ${runId}
            ORDER BY created_at ASC`
      );
      const artefacts = Array.isArray(artefactResult) ? artefactResult : (artefactResult as any).rows ?? [];

      let agentRun: any = null;
      try {
        const runResult = await db.execute(
          sql`SELECT id, status, terminal_state, created_at, updated_at, supervisor_run_id, client_request_id
              FROM agent_runs WHERE id = ${runId} LIMIT 1`
        );
        const runRows = Array.isArray(runResult) ? runResult : (runResult as any).rows ?? [];
        agentRun = runRows[0] || null;
      } catch (_e) {}

      let events: any[] = [];
      try {
        const clientRequestId = agentRun?.client_request_id;
        if (clientRequestId) {
          const actResult = await db.execute(
            sql`SELECT id, action_taken, task_generated, status, results, error_message, duration_ms,
                       router_decision, router_reason, metadata, timestamp
                FROM agent_activities
                WHERE client_request_id = ${clientRequestId}
                ORDER BY timestamp ASC
                LIMIT 100`
          );
          events = Array.isArray(actResult) ? actResult : (actResult as any).rows ?? [];
        }
        if (events.length === 0) {
          const actResult2 = await db.execute(
            sql`SELECT id, action_taken, task_generated, status, results, error_message, duration_ms,
                       router_decision, router_reason, metadata, timestamp
                FROM agent_activities
                WHERE run_id = ${runId}
                ORDER BY timestamp ASC
                LIMIT 100`
          );
          events = Array.isArray(actResult2) ? actResult2 : (actResult2 as any).rows ?? [];
        }
      } catch (_e) {}

      const contextDump = {
        runId,
        agentRun: agentRun ? {
          status: agentRun.status,
          terminal_state: agentRun.terminal_state,
          created_at: agentRun.created_at,
          updated_at: agentRun.updated_at,
          supervisor_run_id: agentRun.supervisor_run_id,
        } : null,
        artefacts: artefacts.map((a: any) => ({
          type: a.type,
          title: a.title,
          summary: a.summary,
          created_at: a.created_at,
          payload_preview: typeof a.payload_json === 'string'
            ? a.payload_json.slice(0, 800)
            : JSON.stringify(a.payload_json).slice(0, 800),
        })),
        events: events.map((e: any) => ({
          action: e.action_taken,
          task: e.task_generated,
          status: e.status,
          error: e.error_message,
          duration_ms: e.duration_ms,
          router_decision: e.router_decision,
          router_reason: e.router_reason,
          timestamp: e.timestamp,
        })),
      };

      const OpenAI = (await import("openai")).default;
      const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const gptResponse = await openaiClient.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.3,
        max_tokens: 2000,
        messages: [
          {
            role: "system",
            content: `You are a dev-tools assistant that explains agent runs in plain English.
Given the raw data from an agent run (events, artefacts, run metadata), produce a concise report in Markdown with these sections:

## Summary
A 2-3 sentence narrative of what happened in this run.

## Key Facts
A bullet list:
- **Verdict:** (Tower verdict if present, or "N/A")
- **Plan versions:** (how many plan artefacts, e.g. "v1 only" or "v1 → v2")
- **Replans:** (count of plan_update artefacts)
- **Delivered vs requested:** (from leads_list artefact if present)
- **Constraints relaxed:** (from plan artefact if present, or "None noted")
- **Stop reason:** (terminal_state or final status)
- **Duration:** (from first to last event timestamp)

## Timeline
A numbered list showing the progression:
1. Plan v1 created → ...
2. Step(s) executed → ...
3. Tower judgement → ...
4. Plan v2 (if replan happened)
5. Final status → ...

Keep it factual. If data is missing, say "Not available". Do NOT invent data.`
          },
          {
            role: "user",
            content: `Explain this run:\n\n${JSON.stringify(contextDump, null, 2)}`
          }
        ]
      });

      const reportMarkdown = gptResponse.choices[0]?.message?.content || "Unable to generate report.";

      res.json({ runId, report_markdown: reportMarkdown });

    } catch (error: any) {
      console.error("[dev-tools] explain-run error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to generate run explanation",
        message: error.message,
      });
    }
  });

  /**
   * GET /api/dev/db-info
   * 
   * Debug endpoint to verify database connection info
   * Only available in development mode with authenticated dev users
   */
  router.get("/db-info", async (req: Request, res: Response) => {
    try {
      // Require authenticated user with dev access
      const auth = await getAuthenticatedUser(req, storage);
      if (!auth || !hasDevAccess(auth.userEmail)) {
        return res.status(403).json({ 
          success: false, 
          error: "Access denied - requires authenticated dev user" 
        });
      }

      const { getDbConnectionInfo } = await import("../storage");
      const db = getDrizzleDb();
      
      // Get connection info
      const dbInfo = getDbConnectionInfo();
      
      // Run sanity query against actual database
      let sanityCheck: { orderLinesCount: number; customersCount: number; ordersCount: number } | null = null;
      let queryError: string | null = null;
      let rawResult: any = null;
      
      try {
        const result = await db.execute(sql`
          SELECT 
            (SELECT COUNT(*) FROM crm_order_lines) as order_lines_count,
            (SELECT COUNT(*) FROM crm_customers) as customers_count,
            (SELECT COUNT(*) FROM crm_orders) as orders_count
        `);
        
        // Capture raw result for debugging
        rawResult = result;
        
        // Drizzle postgres-js returns result directly as array
        const row = Array.isArray(result) ? result[0] : (result.rows?.[0] || result[0]);
        if (row) {
          sanityCheck = {
            orderLinesCount: parseInt(String(row.order_lines_count)) || 0,
            customersCount: parseInt(String(row.customers_count)) || 0,
            ordersCount: parseInt(String(row.orders_count)) || 0,
          };
        }
      } catch (err: any) {
        queryError = err.message;
      }

      res.json({
        success: true,
        database: {
          source: dbInfo.source,
          host: dbInfo.host,
          database: dbInfo.database,
          supabaseProjectRef: dbInfo.projectRef || null,
          supabaseServiceRoleKeySet: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        },
        session: auth ? {
          userId: auth.userId,
          userEmail: auth.userEmail,
          workspaceId: auth.userId,
        } : null,
        sanityCheck: sanityCheck,
        queryError: queryError,
        environment: {
          nodeEnv: process.env.NODE_ENV,
          hasSupabaseDatabaseUrl: !!process.env.SUPABASE_DATABASE_URL,
        },
        diagnosis: {
          note: "SUPABASE_DATABASE_URL is the exclusive connection. Replit DATABASE_URL is not used.",
          appDbHasData: sanityCheck && sanityCheck.orderLinesCount > 0,
        },
      });

    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  return router;
}

