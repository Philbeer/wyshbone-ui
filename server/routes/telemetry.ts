import { Router } from "express";
import { getDrizzleDb } from "../storage";
import { sql } from "drizzle-orm";

const ALLOWED_EVENTS = new Set([
  "accept_results",
  "retry_same_constraints",
  "widen_area_clicked",
  "best_effort_clicked",
  "export_csv",
  "copy_contact",
  "mark_wrong",
]);

export function createTelemetryRouter() {
  const router = Router();

  router.post("/", async (req, res) => {
    try {
      const { run_id, event_type, payload } = req.body;

      if (!run_id || !event_type) {
        return res.status(400).json({ error: "run_id and event_type are required" });
      }

      if (!ALLOWED_EVENTS.has(event_type)) {
        return res.status(400).json({ error: `Unknown event_type: ${event_type}` });
      }

      const sessionId = req.headers["x-session-id"] as string | undefined;
      const userId = (req as any).userId || null;

      const db = getDrizzleDb();
      const result = await db.execute(
        sql`INSERT INTO telemetry_events (run_id, event_type, user_id, session_id, payload)
            VALUES (${run_id}, ${event_type}, ${userId}, ${sessionId || null}, ${JSON.stringify(payload || {})}::jsonb)
            RETURNING id`
      );

      const rows = Array.isArray(result) ? result : (result as any).rows ?? [];
      const id = rows[0]?.id;

      console.log(`[Telemetry] ${event_type} for run=${run_id} → id=${id}`);
      res.status(201).json({ ok: true, id });
    } catch (error: any) {
      console.error("[Telemetry] Error:", error.message);
      res.status(500).json({ error: "Failed to record telemetry event" });
    }
  });

  return router;
}
