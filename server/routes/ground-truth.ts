import { Router } from "express";
import { getDrizzleDb } from "../storage";
import { eq } from "drizzle-orm";
import { groundTruthRecords } from "../../shared/schema";

export function createGroundTruthRouter(): Router {
  const router = Router();

  router.use((req, res, next) => {
    const isDev = process.env.NODE_ENV !== "production";
    const hasExportKey = req.headers["x-export-key"] === process.env.EXPORT_KEY;
    const hasDemoAuth = !!(req.query.user_id || req.headers["x-user-id"]);
    if (isDev || hasExportKey || hasDemoAuth) return next();
    return res.status(403).json({ ok: false, error: "Forbidden" });
  });

  router.get("/", async (_req, res) => {
    try {
      const db = getDrizzleDb();
      const records = await db.select().from(groundTruthRecords).orderBy(groundTruthRecords.queryId);
      return res.json({ ok: true, records });
    } catch (err: any) {
      console.error("[ground-truth] list error:", err?.message || err);
      return res.status(500).json({ ok: false, error: "Failed to list ground truth records" });
    }
  });

  router.get("/:queryId", async (req, res) => {
    try {
      const db = getDrizzleDb();
      const rows = await db.select().from(groundTruthRecords).where(eq(groundTruthRecords.queryId, req.params.queryId));
      if (rows.length === 0) return res.status(404).json({ ok: false, error: "Not found" });
      return res.json({ ok: true, record: rows[0] });
    } catch (err: any) {
      console.error("[ground-truth] get error:", err?.message || err);
      return res.status(500).json({ ok: false, error: "Failed to get ground truth record" });
    }
  });

  router.post("/", async (req, res) => {
    try {
      const db = getDrizzleDb();
      const { queryId, queryText, queryClass, trueUniverse, deliveryAssessment, expectedBjOutcome, reasoning, notes } = req.body;

      if (!queryId || !queryText || !queryClass || !expectedBjOutcome) {
        return res.status(400).json({ ok: false, error: "queryId, queryText, queryClass, and expectedBjOutcome are required" });
      }

      await db.insert(groundTruthRecords).values({
        queryId,
        queryText,
        queryClass,
        trueUniverse: trueUniverse ?? [],
        deliveryAssessment: deliveryAssessment ?? {},
        expectedBjOutcome,
        reasoning: reasoning ?? null,
        notes: notes ?? null,
      }).onConflictDoUpdate({
        target: groundTruthRecords.queryId,
        set: {
          queryText,
          queryClass,
          trueUniverse: trueUniverse ?? [],
          deliveryAssessment: deliveryAssessment ?? {},
          expectedBjOutcome,
          reasoning: reasoning ?? null,
          notes: notes ?? null,
        },
      });

      const rows = await db.select().from(groundTruthRecords).where(eq(groundTruthRecords.queryId, queryId));
      return res.json({ ok: true, record: rows[0] });
    } catch (err: any) {
      console.error("[ground-truth] upsert error:", err?.message || err);
      return res.status(500).json({ ok: false, error: "Failed to save ground truth record" });
    }
  });

  router.delete("/:queryId", async (req, res) => {
    try {
      const db = getDrizzleDb();
      await db.delete(groundTruthRecords).where(eq(groundTruthRecords.queryId, req.params.queryId));
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[ground-truth] delete error:", err?.message || err);
      return res.status(500).json({ ok: false, error: "Failed to delete ground truth record" });
    }
  });

  return router;
}
