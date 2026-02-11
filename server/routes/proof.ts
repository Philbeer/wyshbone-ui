import { Router } from "express";
import { randomUUID } from "crypto";
import { storage } from "../storage";
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

  return router;
}
