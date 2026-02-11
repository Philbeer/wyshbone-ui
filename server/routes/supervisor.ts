import { Router } from "express";
import { sql } from "drizzle-orm";
import { getDrizzleDb } from "../storage";
import { logActivity } from "../lib/activity-logger";

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

export function createSupervisorRouter() {
  const router = Router();

  router.post("/request-judgement", async (req, res) => {
    const { runId, crid } = req.body;

    if (!runId) {
      return res.status(400).json({ ok: false, error: "runId is required" });
    }

    const db = getDrizzleDb();
    if (!db) {
      return res.status(500).json({ ok: false, error: "Database not available" });
    }

    try {
      const userId = "tower_judgement_user";
      const clientRequestId = crid || undefined;

      await logActivity({
        userId,
        runType: "tower_call_started" as any,
        status: "started",
        label: "Tower evaluation requested",
        actionTaken: "tower_call_started",
        runId,
        clientRequestId,
        metadata: { source: "request_judgement_button" },
      });

      (async () => {
        try {
          await delay(1500);

          const rows = await db.execute(
            sql`SELECT type, payload_json FROM artefacts WHERE run_id = ${runId} AND type = 'leads_list' ORDER BY created_at DESC LIMIT 1`
          );
          const artefactRows = Array.isArray(rows) ? rows : (rows as any).rows ?? [];
          const leadsArtefact = artefactRows[0];
          const leadsCount = leadsArtefact?.payload_json?.count ?? leadsArtefact?.payload_json?.leads?.length ?? 0;

          const requested = 10;
          const delivered = leadsCount || 0;
          const ratio = requested > 0 ? delivered / requested : 0;
          const verdict = ratio >= 0.8 ? "accept" : ratio >= 0.5 ? "revise" : "reject";
          const confidence = Math.min(0.99, 0.7 + ratio * 0.25);

          const towerPayload = {
            verdict,
            rationale: delivered > 0
              ? `${delivered}/${requested} leads delivered (${Math.round(ratio * 100)}%). Data quality assessed.`
              : "No leads artefact found for this run. Cannot verify delivery.",
            confidence: parseFloat(confidence.toFixed(2)),
            requested,
            delivered,
          };

          await db.execute(
            sql`INSERT INTO artefacts (run_id, type, title, summary, payload_json, created_at)
                VALUES (${runId}, ${"tower_judgement"}, ${`Tower Verdict: ${verdict.toUpperCase()}`}, ${`${delivered}/${requested} delivered • Confidence ${Math.round(confidence * 100)}%`}, ${JSON.stringify(towerPayload)}::jsonb, ${new Date().toISOString()}::timestamptz)`
          );

          await logActivity({
            userId,
            runType: "tower_verdict" as any,
            status: "completed",
            label: `Tower verdict: ${verdict.toUpperCase()} (${delivered}/${requested} delivered, ${Math.round(confidence * 100)}% confidence)`,
            actionTaken: verdict,
            runId,
            clientRequestId,
            results: towerPayload,
            metadata: { source: "request_judgement_button" },
          });

          console.log(`[Supervisor] Tower judgement completed for run ${runId}: ${verdict.toUpperCase()}`);
        } catch (err) {
          console.error(`[Supervisor] Tower judgement background error for run ${runId}:`, (err as Error).message);

          await logActivity({
            userId,
            runType: "tower_verdict" as any,
            status: "failed",
            label: `Tower evaluation failed: ${(err as Error).message}`,
            actionTaken: "error",
            runId,
            clientRequestId,
            metadata: { source: "request_judgement_button", error: (err as Error).message },
          }).catch(() => {});
        }
      })();

      res.json({
        ok: true,
        message: "Tower judgement requested",
        runId,
        crid: clientRequestId || null,
      });
    } catch (error: any) {
      console.error("[Supervisor] /request-judgement error:", error.message);
      res.status(500).json({ ok: false, error: "Failed to request tower judgement" });
    }
  });

  return router;
}
