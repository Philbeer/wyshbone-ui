import { Router } from "express";
import { getDrizzleDb } from "../storage";
import { sql } from "drizzle-orm";
import {
  qaRunMetrics,
  type InsertQaRunMetric,
  type SystemStatus,
  type AgentQuality,
  type TowerResult,
  type BehaviourResult,
} from "../../shared/schema";

const VALID_SYSTEM_STATUSES: SystemStatus[] = ["HEALTHY", "DEGRADED", "BROKEN", "TIMEOUT"];
const VALID_AGENT_STATUSES: AgentQuality[] = ["PASS", "PARTIAL", "FAIL", "NOT_APPLICABLE", "UNKNOWN"];
const VALID_TOWER_RESULTS: TowerResult[] = ["PASS", "FAIL", "UNKNOWN"];
const VALID_BEHAVIOUR_RESULTS: BehaviourResult[] = ["PASS", "FAIL", "UNKNOWN"];
const VALID_SCORES = [0, 0.5, 1];

function validateScore(val: unknown): val is number {
  return typeof val === "number" && VALID_SCORES.includes(val);
}

function statusToScore(status: string, validValues: readonly string[], passValues: string[], partialValues: string[] = []): number {
  if (passValues.includes(status)) return 1;
  if (partialValues.includes(status)) return 0.5;
  return 0;
}

export function systemStatusToScore(status: SystemStatus): number {
  return statusToScore(status, VALID_SYSTEM_STATUSES, ["HEALTHY"], ["DEGRADED"]);
}

export function agentStatusToScore(status: AgentQuality): number {
  return statusToScore(status, VALID_AGENT_STATUSES, ["PASS"], ["PARTIAL"]);
}

export function towerResultToScore(result: TowerResult): number {
  return statusToScore(result, VALID_TOWER_RESULTS, ["PASS"], []);
}

export function behaviourResultToScore(result: BehaviourResult): number {
  return statusToScore(result, VALID_BEHAVIOUR_RESULTS, ["PASS"], []);
}

interface QaRunMetricInput {
  runId: string;
  timestamp: number;
  query: string;
  systemStatus: SystemStatus;
  agentStatus: AgentQuality;
  towerResult: TowerResult;
  behaviourResult: BehaviourResult;
  metadata?: Record<string, unknown>;
}

function validateMetricInput(input: unknown): { valid: true; data: QaRunMetricInput } | { valid: false; error: string } {
  if (!input || typeof input !== "object") return { valid: false, error: "Input must be an object" };
  const obj = input as Record<string, unknown>;

  if (typeof obj.runId !== "string" || !obj.runId) return { valid: false, error: "runId is required" };
  if (typeof obj.timestamp !== "number" || obj.timestamp <= 0) return { valid: false, error: "timestamp must be a positive number" };
  if (typeof obj.query !== "string" || !obj.query) return { valid: false, error: "query is required" };

  const ss = obj.systemStatus as string;
  if (!VALID_SYSTEM_STATUSES.includes(ss as SystemStatus)) return { valid: false, error: `systemStatus must be one of: ${VALID_SYSTEM_STATUSES.join(", ")}` };

  const as_ = obj.agentStatus as string;
  if (!VALID_AGENT_STATUSES.includes(as_ as AgentQuality)) return { valid: false, error: `agentStatus must be one of: ${VALID_AGENT_STATUSES.join(", ")}` };

  const tr = obj.towerResult as string;
  if (!VALID_TOWER_RESULTS.includes(tr as TowerResult)) return { valid: false, error: `towerResult must be one of: ${VALID_TOWER_RESULTS.join(", ")}` };

  const br = obj.behaviourResult as string;
  if (!VALID_BEHAVIOUR_RESULTS.includes(br as BehaviourResult)) return { valid: false, error: `behaviourResult must be one of: ${VALID_BEHAVIOUR_RESULTS.join(", ")}` };

  return {
    valid: true,
    data: {
      runId: obj.runId as string,
      timestamp: obj.timestamp as number,
      query: obj.query as string,
      systemStatus: ss as SystemStatus,
      agentStatus: as_ as AgentQuality,
      towerResult: tr as TowerResult,
      behaviourResult: br as BehaviourResult,
      metadata: (obj.metadata as Record<string, unknown>) ?? undefined,
    },
  };
}

function inputToInsert(input: QaRunMetricInput): InsertQaRunMetric {
  return {
    runId: input.runId,
    timestamp: input.timestamp,
    query: input.query,
    systemStatus: input.systemStatus,
    agentStatus: input.agentStatus,
    towerResult: input.towerResult,
    behaviourResult: input.behaviourResult,
    systemScore: systemStatusToScore(input.systemStatus).toFixed(1),
    agentScore: agentStatusToScore(input.agentStatus).toFixed(1),
    towerScore: towerResultToScore(input.towerResult).toFixed(1),
    behaviourScore: behaviourResultToScore(input.behaviourResult).toFixed(1),
    metadata: input.metadata ?? null,
  };
}

const MAX_BACKFILL_LIMIT = 500;

export function createQaMetricsRouter(): Router {
  const router = Router();

  router.use((req, res, next) => {
    const isDev = process.env.NODE_ENV !== "production";
    const hasExportKey = req.headers["x-export-key"] === process.env.EXPORT_KEY;
    const hasDemoAuth = !!(req.query.user_id || req.headers["x-user-id"]);

    if (isDev || hasExportKey || hasDemoAuth) {
      return next();
    }
    return res.status(403).json({ ok: false, error: "Forbidden" });
  });

  router.post("/persist", async (req, res) => {
    try {
      const db = getDrizzleDb();
      const validation = validateMetricInput(req.body);
      if (!validation.valid) {
        return res.status(400).json({ ok: false, error: validation.error });
      }

      const row = inputToInsert(validation.data);

      await db.insert(qaRunMetrics).values(row).onConflictDoUpdate({
        target: qaRunMetrics.runId,
        set: {
          timestamp: row.timestamp,
          query: row.query,
          systemStatus: row.systemStatus,
          agentStatus: row.agentStatus,
          towerResult: row.towerResult,
          behaviourResult: row.behaviourResult,
          systemScore: row.systemScore,
          agentScore: row.agentScore,
          towerScore: row.towerScore,
          behaviourScore: row.behaviourScore,
          metadata: row.metadata,
        },
      });

      return res.json({ ok: true, runId: validation.data.runId });
    } catch (error: any) {
      console.error("[qa-metrics] persist error:", error?.message || error);
      return res.status(500).json({ ok: false, error: "Failed to persist metric" });
    }
  });

  router.post("/backfill", async (req, res) => {
    try {
      const db = getDrizzleDb();
      const { results } = req.body as { results: unknown[] };

      if (!Array.isArray(results) || results.length === 0) {
        return res.status(400).json({ ok: false, error: "results must be a non-empty array" });
      }

      let inserted = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const item of results) {
        const validation = validateMetricInput(item);
        if (!validation.valid) {
          skipped++;
          errors.push(`runId=${(item as any)?.runId || "unknown"}: ${validation.error}`);
          continue;
        }

        try {
          const row = inputToInsert(validation.data);
          await db.insert(qaRunMetrics).values(row).onConflictDoUpdate({
            target: qaRunMetrics.runId,
            set: {
              timestamp: row.timestamp,
              query: row.query,
              systemStatus: row.systemStatus,
              agentStatus: row.agentStatus,
              towerResult: row.towerResult,
              behaviourResult: row.behaviourResult,
              systemScore: row.systemScore,
              agentScore: row.agentScore,
              towerScore: row.towerScore,
              behaviourScore: row.behaviourScore,
              metadata: row.metadata,
            },
          });
          inserted++;
        } catch (err: any) {
          skipped++;
          errors.push(`runId=${validation.data.runId}: ${err?.message || "insert failed"}`);
        }
      }

      return res.json({ ok: true, inserted, skipped, errors: errors.length > 0 ? errors : undefined });
    } catch (error: any) {
      console.error("[qa-metrics] backfill error:", error?.message || error);
      return res.status(500).json({ ok: false, error: "Failed to run backfill" });
    }
  });

  router.post("/backfill-from-afr", async (req, res) => {
    try {
      const db = getDrizzleDb();

      const runs: any[] = await db.execute(sql`
        SELECT r.id AS run_id, r.created_at, r.status, r.terminal_state, r.error,
               r.supervisor_run_id
        FROM agent_runs r
        WHERE r.terminal_state IS NOT NULL
        ORDER BY r.created_at DESC
        LIMIT ${Math.min(Math.max(1, Number(req.body?.limit) || 100), MAX_BACKFILL_LIMIT)}
      `);

      if (runs.length === 0) {
        return res.json({ ok: true, inserted: 0, skipped: 0, message: "No completed AFR runs found" });
      }

      let inserted = 0;
      let skipped = 0;

      for (const run of runs) {
        const runId = run.run_id;

        const existingCheck: any[] = await db.execute(
          sql`SELECT 1 FROM qa_run_metrics WHERE run_id = ${runId} LIMIT 1`
        );
        if (existingCheck.length > 0) {
          skipped++;
          continue;
        }

        const lookupIds = [runId];
        if (run.supervisor_run_id) lookupIds.push(run.supervisor_run_id);

        const artefacts: any[] = await db.execute(sql`
          SELECT type, title, payload_json, created_at
          FROM artefacts
          WHERE run_id = ANY(${lookupIds})
          ORDER BY created_at ASC
        `);

        if (artefacts.length === 0) {
          skipped++;
          continue;
        }

        let towerVerdict: TowerResult = "UNKNOWN";
        let deliveredCount = 0;
        let blocked = false;
        let clarified = false;
        let hasDelivery = false;
        let discoveryOk = false;
        let executionFail = false;
        let discoveryFail = false;
        let verificationPass = false;
        let queryText = "";

        for (const a of artefacts) {
          let payload: any = null;
          try {
            payload = typeof a.payload_json === "string" ? JSON.parse(a.payload_json) : a.payload_json;
          } catch {
            continue;
          }

          if (a.type === "tower_judgement") {
            const v = payload?.verdict || payload?.tower_verdict || payload?.pass_fail;
            if (typeof v === "string") {
              const lower = v.toLowerCase();
              if (lower.includes("pass")) towerVerdict = "PASS";
              else if (lower.includes("fail") || lower.includes("stop") || lower.includes("error")) towerVerdict = "FAIL";
            }
          }

          if (a.type === "delivery_summary") {
            hasDelivery = true;
            deliveredCount = payload?.delivered_exact?.length || payload?.delivered_count || 0;
            if (payload?.query) queryText = payload.query;
          }

          if (a.type === "clarify_gate") clarified = true;

          if (a.type === "diagnostic" && typeof a.title === "string" &&
              a.title.toLowerCase().includes("constraint gate") &&
              a.title.toLowerCase().includes("blocked")) {
            blocked = true;
          }

          if (a.type === "search_results" || a.type === "google_places_results") {
            discoveryOk = true;
          }

          if (a.type === "verification_results") {
            const vResult = payload?.pass || payload?.verified;
            if (vResult) verificationPass = true;
          }

          if (a.type === "execution_error" || (a.type === "diagnostic" && typeof a.title === "string" && a.title.toLowerCase().includes("execution error"))) {
            executionFail = true;
          }

          if (a.type === "discovery_failure" || (a.type === "search_results" && payload?.results?.length === 0)) {
            discoveryFail = true;
          }

          if (payload?.query && !queryText) queryText = payload.query;
          if (payload?.search_query && !queryText) queryText = payload.search_query;
        }

        if (!queryText) {
          const activities: any[] = await db.execute(sql`
            SELECT task_generated FROM agent_activities
            WHERE run_id = ${runId}
            ORDER BY timestamp ASC
            LIMIT 1
          `);
          if (activities.length > 0 && activities[0].task_generated) {
            queryText = activities[0].task_generated;
          }
        }

        if (!queryText) queryText = `AFR run ${runId}`;

        const isFailed = run.terminal_state === "failed";
        const isCompleted = run.terminal_state === "completed";

        let systemStatus: SystemStatus;
        if (run.terminal_state === "stopped") systemStatus = "TIMEOUT";
        else if (isFailed && run.error) systemStatus = "BROKEN";
        else if (executionFail || discoveryFail) systemStatus = "DEGRADED";
        else if (isCompleted) systemStatus = "HEALTHY";
        else systemStatus = "BROKEN";

        let agentStatus: AgentQuality;
        if (systemStatus === "BROKEN" || systemStatus === "TIMEOUT") agentStatus = "UNKNOWN";
        else if (blocked || clarified) agentStatus = "NOT_APPLICABLE";
        else if (discoveryOk && hasDelivery && towerVerdict === "PASS") agentStatus = "PASS";
        else if (discoveryOk && hasDelivery) agentStatus = "PARTIAL";
        else if (isCompleted && towerVerdict === "PASS") agentStatus = "PASS";
        else if (isCompleted) agentStatus = "PARTIAL";
        else agentStatus = "FAIL";

        const behaviourResult: BehaviourResult = towerVerdict === "PASS" && hasDelivery
          ? "PASS"
          : (blocked || clarified)
            ? "PASS"
            : isFailed
              ? "FAIL"
              : "UNKNOWN";

        try {
          const row = inputToInsert({
            runId,
            timestamp: run.created_at,
            query: queryText,
            systemStatus,
            agentStatus,
            towerResult: towerVerdict,
            behaviourResult,
            metadata: {
              backfilled: true,
              terminalState: run.terminal_state,
              supervisorRunId: run.supervisor_run_id,
              deliveredCount,
              blocked,
              clarified,
              artefactCount: artefacts.length,
            },
          });

          await db.insert(qaRunMetrics).values(row).onConflictDoNothing();
          inserted++;
        } catch {
          skipped++;
        }
      }

      return res.json({ ok: true, inserted, skipped, totalRuns: runs.length });
    } catch (error: any) {
      console.error("[qa-metrics] backfill-from-afr error:", error?.message || error);
      return res.status(500).json({ ok: false, error: "Failed to backfill from AFR" });
    }
  });

  router.get("/history", async (_req, res) => {
    try {
      const db = getDrizzleDb();
      const rows = await db.execute(sql`
        SELECT * FROM qa_run_metrics
        ORDER BY timestamp DESC
        LIMIT 500
      `);
      return res.json(rows);
    } catch (error: any) {
      console.error("[qa-metrics] history error:", error?.message || error);
      return res.status(500).json({ error: "Failed to fetch history" });
    }
  });

  return router;
}
