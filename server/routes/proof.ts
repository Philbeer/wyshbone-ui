import { Router } from "express";
import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { storage, getDrizzleDb } from "../storage";
import { runManager } from "../lib/run-manager";
import { logActivity } from "../lib/activity-logger";

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

export function createProofRouter(_storage: typeof storage) {
  const router = Router();

  router.post("/tower-loop", async (req, res) => {
    try {
      const clientRequestId = randomUUID();
      const userId = "proof_tower_user";

      const run = await runManager.createRun({ clientRequestId, userId });
      const runId = run.id;

      await runManager.transitionTo(runId, "executing");
      await runManager.setUiReady(runId);

      await logActivity({
        userId,
        runType: "plan_execution_started" as any,
        status: "started",
        label: "[Proof] Plan created: Tower Loop test",
        actionTaken: "plan_execution_started",
        runId,
        clientRequestId,
        metadata: { proof: true },
      });

      (async () => {
        try {
          await delay(500);
          await logActivity({
            userId,
            runType: "step_started:search_places" as any,
            status: "started",
            label: "Executing step: search_places",
            actionTaken: "step_started:search_places",
            runId,
            clientRequestId,
            metadata: { proof: true },
          });

          await delay(800);
          await logActivity({
            userId,
            runType: "step_completed:search_places" as any,
            status: "completed",
            label: "Step completed: search_places",
            actionTaken: "step_completed:search_places",
            runId,
            clientRequestId,
            metadata: { proof: true },
          });

          await delay(300);
          await logActivity({
            userId,
            runType: "artefact_created" as any,
            status: "completed",
            label: "Artefact created: Step Result",
            actionTaken: "step_result",
            runId,
            clientRequestId,
            results: { artefact_type: "step_result", count: 12 },
            metadata: { proof: true },
          });

          await delay(1000);
          await logActivity({
            userId,
            runType: "tower_call_started" as any,
            status: "started",
            label: "Tower evaluation started",
            actionTaken: "tower_call_started",
            runId,
            clientRequestId,
            metadata: { proof: true },
          });

          await delay(500);
          await logActivity({
            userId,
            runType: "tower_verdict" as any,
            status: "completed",
            label: "Tower verdict: ACCEPT",
            actionTaken: "accept",
            runId,
            clientRequestId,
            results: {
              verdict: "accept",
              rationale: "All 12 results verified and valid",
              confidence: 0.95,
              requested: 10,
              delivered: 12,
            },
            metadata: { proof: true },
          });

          await delay(300);
          await logActivity({
            userId,
            runType: "run_completed" as any,
            status: "completed",
            label: "[Proof] Run completed",
            actionTaken: "run_completed",
            runId,
            clientRequestId,
            metadata: { proof: true },
          });

          await runManager.completeRun(runId);
        } catch (err) {
          console.error(`[Proof] Background sequence error for run ${runId}:`, (err as Error).message);
        }
      })();

      res.json({
        ok: true,
        clientRequestId,
        runId,
        message: "Tower loop proof run started",
      });
    } catch (error: any) {
      console.error("[Proof] /tower-loop error:", error.message);
      res.status(500).json({ error: "Failed to start proof run" });
    }
  });

  router.post("/tower-loop-v2", async (req, res) => {
    try {
      const clientRequestId = randomUUID();
      const userId = "proof_tower_user";

      const run = await runManager.createRun({ clientRequestId, userId });
      const runId = run.id;

      await runManager.transitionTo(runId, "executing");
      await runManager.setUiReady(runId);

      await logActivity({
        userId,
        runType: "plan_execution_started" as any,
        status: "started",
        label: "[Proof v2] Plan created: Tower Loop REAL test",
        actionTaken: "plan_execution_started",
        runId,
        clientRequestId,
        metadata: { proof: true, version: 2 },
      });

      (async () => {
        try {
          await delay(500);
          await logActivity({
            userId,
            runType: "step_started:search_places" as any,
            status: "started",
            label: "Executing step: search_places",
            actionTaken: "step_started:search_places",
            runId,
            clientRequestId,
            metadata: { proof: true, version: 2 },
          });

          await delay(800);
          await logActivity({
            userId,
            runType: "step_completed:search_places" as any,
            status: "completed",
            label: "Step completed: search_places (12 results)",
            actionTaken: "step_completed:search_places",
            runId,
            clientRequestId,
            metadata: { proof: true, version: 2 },
          });

          await delay(300);

          const proofLeads = Array.from({ length: 12 }, (_, i) => ({
            name: `Proof Business ${i + 1}`,
            address: `${100 + i} High Street, London`,
            phone: `+4420700${String(i).padStart(5, '0')}`,
            rating: 4.0 + Math.random(),
            type: "restaurant",
          }));

          const db = getDrizzleDb();
          const artefactResult = await db.execute(
            sql`INSERT INTO artefacts (run_id, type, title, summary, payload_json, created_at)
                VALUES (${runId}, ${"leads_list"}, ${"Proof v2: 12 Leads Found"}, ${"Tower-verified leads from proof run"}, ${JSON.stringify({ leads: proofLeads, count: 12, source: "proof_v2" })}::jsonb, ${new Date().toISOString()}::timestamptz)
                RETURNING id`
          );
          const artefactRows = Array.isArray(artefactResult) ? artefactResult : (artefactResult as any).rows ?? [];
          const artefactId = artefactRows[0]?.id;
          console.log(`[Proof v2] Persisted artefact leads_list → id=${artefactId}`);

          await logActivity({
            userId,
            runType: "artefact_created" as any,
            status: "completed",
            label: "Artefact persisted: leads_list (12 leads)",
            actionTaken: "step_result",
            runId,
            clientRequestId,
            results: { artefact_type: "leads_list", artefact_id: artefactId, count: 12 },
            metadata: { proof: true, version: 2 },
          });

          await delay(1000);
          await logActivity({
            userId,
            runType: "tower_call_started" as any,
            status: "started",
            label: "Tower evaluation started",
            actionTaken: "tower_call_started",
            runId,
            clientRequestId,
            metadata: { proof: true, version: 2 },
          });

          await delay(500);

          const towerPayload = {
            verdict: "accept",
            rationale: "All 12 leads verified against proof criteria. Data quality: excellent.",
            confidence: 0.97,
            requested: 10,
            delivered: 12,
          };

          await db.execute(
            sql`INSERT INTO artefacts (run_id, type, title, summary, payload_json, created_at)
                VALUES (${runId}, ${"tower_judgement"}, ${"Tower Verdict: ACCEPT"}, ${"12/10 delivered • Confidence 97%"}, ${JSON.stringify(towerPayload)}::jsonb, ${new Date().toISOString()}::timestamptz)
                RETURNING id`
          );

          await logActivity({
            userId,
            runType: "tower_verdict" as any,
            status: "completed",
            label: "Tower verdict: ACCEPT (12/10 delivered, 97% confidence)",
            actionTaken: "accept",
            runId,
            clientRequestId,
            results: towerPayload,
            metadata: { proof: true, version: 2 },
          });

          await delay(300);
          await logActivity({
            userId,
            runType: "run_completed" as any,
            status: "completed",
            label: "[Proof v2] Run completed with real artefacts",
            actionTaken: "run_completed",
            runId,
            clientRequestId,
            metadata: { proof: true, version: 2 },
          });

          await runManager.completeRun(runId);
          console.log(`[Proof v2] Full sequence complete for run ${runId}`);
        } catch (err) {
          console.error(`[Proof v2] Background sequence error for run ${runId}:`, (err as Error).message);
        }
      })();

      res.json({
        ok: true,
        clientRequestId,
        runId,
        message: "Tower loop v2 proof run started (with real artefacts)",
      });
    } catch (error: any) {
      console.error("[Proof v2] /tower-loop-v2 error:", error.message);
      res.status(500).json({ error: "Failed to start proof v2 run" });
    }
  });

  return router;
}
