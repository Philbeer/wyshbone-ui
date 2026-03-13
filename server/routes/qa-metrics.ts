import { Router } from "express";
import { getDrizzleDb } from "../storage";
import { sql, inArray, and, eq } from "drizzle-orm";
import { getBehaviourJudgeResults, isSupabaseConfigured } from "../supabase-client";
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
const VALID_TOWER_RESULTS: TowerResult[] = ["PASS", "FAIL", "UNKNOWN", "NOT_APPLICABLE"];
const VALID_BEHAVIOUR_RESULTS: BehaviourResult[] = ["PASS", "FAIL", "UNKNOWN"];
const VALID_QUERY_CLASSES = ["solvable", "website_evidence_required", "clarification_required", "relationship_required", "fictional_or_impossible", "subjective_or_unverifiable"];
const VALID_EXPECTED_MODES = ["deliver_results", "clarify", "honest_refusal", "best_effort_honest"];
const VALID_SOURCES = ["benchmark", "heuristic"] as const;

function statusToScore(status: string, passValues: string[], partialValues: string[] = []): number {
  if (passValues.includes(status)) return 1;
  if (partialValues.includes(status)) return 0.5;
  return 0;
}

export function systemStatusToScore(status: SystemStatus): number {
  return statusToScore(status, ["HEALTHY"], ["DEGRADED"]);
}

export function agentStatusToScore(status: AgentQuality): number {
  return statusToScore(status, ["PASS"], ["PARTIAL"]);
}

export function towerResultToScore(result: TowerResult): number {
  if (result === "NOT_APPLICABLE") return 1;
  return statusToScore(result, ["PASS"], []);
}

export function behaviourResultToScore(result: BehaviourResult): number {
  return statusToScore(result, ["PASS"], []);
}

interface QaRunMetricInput {
  runId: string;
  timestamp: number;
  query: string;
  queryClass?: string;
  expectedMode?: string;
  suiteId?: string;
  packTimestamp?: number;
  benchmarkTestId?: string;
  source: "benchmark" | "heuristic";
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

  const source = (obj.source as string) || "heuristic";
  if (!VALID_SOURCES.includes(source as typeof VALID_SOURCES[number])) return { valid: false, error: `source must be one of: ${VALID_SOURCES.join(", ")}` };

  const queryClass = obj.queryClass as string | undefined;
  if (queryClass && !VALID_QUERY_CLASSES.includes(queryClass)) return { valid: false, error: `queryClass must be one of: ${VALID_QUERY_CLASSES.join(", ")}` };

  const expectedMode = obj.expectedMode as string | undefined;
  if (expectedMode && !VALID_EXPECTED_MODES.includes(expectedMode)) return { valid: false, error: `expectedMode must be one of: ${VALID_EXPECTED_MODES.join(", ")}` };

  if (source === "benchmark") {
    if (!queryClass) return { valid: false, error: "queryClass is required for benchmark source" };
    if (!expectedMode) return { valid: false, error: "expectedMode is required for benchmark source" };
    if (typeof obj.suiteId !== "string" || !obj.suiteId) return { valid: false, error: "suiteId is required for benchmark source" };
    if (typeof obj.packTimestamp !== "number" || obj.packTimestamp <= 0) return { valid: false, error: "packTimestamp must be a positive number for benchmark source" };
    if (typeof obj.benchmarkTestId !== "string" || !obj.benchmarkTestId) return { valid: false, error: "benchmarkTestId is required for benchmark source" };
  }

  return {
    valid: true,
    data: {
      runId: obj.runId as string,
      timestamp: obj.timestamp as number,
      query: obj.query as string,
      queryClass: queryClass || undefined,
      expectedMode: expectedMode || undefined,
      suiteId: (obj.suiteId as string) || undefined,
      packTimestamp: typeof obj.packTimestamp === "number" ? obj.packTimestamp : undefined,
      benchmarkTestId: (obj.benchmarkTestId as string) || undefined,
      source: source as "benchmark" | "heuristic",
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
    queryClass: input.queryClass ?? null,
    expectedMode: input.expectedMode ?? null,
    suiteId: input.suiteId ?? null,
    packTimestamp: input.packTimestamp ?? null,
    benchmarkTestId: input.benchmarkTestId ?? null,
    source: input.source,
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
          queryClass: row.queryClass,
          expectedMode: row.expectedMode,
          suiteId: row.suiteId,
          packTimestamp: row.packTimestamp,
          benchmarkTestId: row.benchmarkTestId,
          source: row.source,
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
              queryClass: row.queryClass,
              expectedMode: row.expectedMode,
              suiteId: row.suiteId,
              packTimestamp: row.packTimestamp,
              benchmarkTestId: row.benchmarkTestId,
              source: row.source,
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
              if (lower.includes("pass") || lower.includes("accept")) towerVerdict = "PASS";
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
        else if (isCompleted) systemStatus = "HEALTHY";
        else if (blocked || clarified) systemStatus = "HEALTHY";
        else systemStatus = "BROKEN";

        let agentStatus: AgentQuality;
        if (systemStatus === "BROKEN" || systemStatus === "TIMEOUT") agentStatus = "UNKNOWN";
        else if (blocked || clarified) agentStatus = "PASS";
        else if (discoveryOk && hasDelivery) agentStatus = "PASS";
        else if (discoveryOk && !hasDelivery) agentStatus = "PARTIAL";
        else agentStatus = "FAIL";

        if (blocked || clarified) towerVerdict = "NOT_APPLICABLE";

        const behaviourResult: BehaviourResult = hasDelivery && deliveredCount > 0
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
            source: "heuristic",
            systemStatus,
            agentStatus,
            towerResult: towerVerdict,
            behaviourResult,
            metadata: {
              backfilled: true,
              heuristic: true,
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

  router.post("/reconcile-timeouts", async (req, res) => {
    try {
      const db = getDrizzleDb();
      const limit = Math.min(Math.max(1, Number(req.body?.limit) || 50), MAX_BACKFILL_LIMIT);

      const timeoutRows: any[] = await db.execute(sql`
        SELECT id, run_id, system_status, metadata
        FROM qa_run_metrics
        WHERE system_status = 'TIMEOUT'
          AND run_id IS NOT NULL
        ORDER BY timestamp DESC
        LIMIT ${limit}
      `);

      if (timeoutRows.length === 0) {
        return res.json({ ok: true, reconciled: 0, unchanged: 0, message: "No TIMEOUT rows to reconcile" });
      }

      let reconciled = 0;
      let unchanged = 0;

      for (const row of timeoutRows) {
        const runId = row.run_id;

        const afrRows: any[] = await db.execute(sql`
          SELECT status, terminal_state, error
          FROM agent_runs
          WHERE id = ${runId}
          LIMIT 1
        `);

        if (afrRows.length === 0) {
          unchanged++;
          continue;
        }

        const afr = afrRows[0];
        const ts = afr.terminal_state;

        if (ts === "completed" || ts === "PASS") {
          const artefacts: any[] = await db.execute(sql`
            SELECT type, title, payload_json FROM artefacts
            WHERE run_id = ${runId}
            ORDER BY created_at ASC
          `);

          let towerVerdict: TowerResult = "UNKNOWN";
          let deliveredCount = 0;
          let hasDelivery = false;
          let discoveryOk = false;
          let blocked = false;
          let clarified = false;

          for (const a of artefacts) {
            let payload: any = null;
            try {
              payload = typeof a.payload_json === "string" ? JSON.parse(a.payload_json) : a.payload_json;
            } catch { continue; }

            if (a.type === "tower_judgement") {
              const v = payload?.verdict || payload?.tower_verdict || payload?.pass_fail;
              if (typeof v === "string") {
                const lower = v.toLowerCase();
                if (lower.includes("pass") || lower.includes("accept")) towerVerdict = "PASS";
                else if (lower.includes("fail") || lower.includes("stop") || lower.includes("error")) towerVerdict = "FAIL";
              }
            }
            if (a.type === "delivery_summary") {
              hasDelivery = true;
              deliveredCount = payload?.delivered_exact?.length || payload?.delivered_count || 0;
            }
            if (a.type === "clarify_gate") clarified = true;
            if (a.type === "diagnostic" && typeof a.title === "string" &&
                a.title.toLowerCase().includes("constraint gate") &&
                a.title.toLowerCase().includes("blocked")) {
              blocked = true;
            }
            if (a.type === "search_results" || a.type === "google_places_results") discoveryOk = true;
          }

          const newSystem: SystemStatus = "HEALTHY";
          let newAgent: AgentQuality;
          if (blocked || clarified) newAgent = "PASS";
          else if (discoveryOk && hasDelivery) newAgent = "PASS";
          else if (discoveryOk) newAgent = "PARTIAL";
          else newAgent = "FAIL";

          if (blocked || clarified) towerVerdict = "NOT_APPLICABLE";

          const newBehaviour: BehaviourResult = hasDelivery && deliveredCount > 0
            ? "PASS" : (blocked || clarified) ? "PASS" : "UNKNOWN";

          const existingMeta = (typeof row.metadata === "object" && row.metadata) ? row.metadata : {};
          const newMeta = {
            ...existingMeta,
            reconciled: true,
            reconciled_at: Date.now(),
            previous_system_status: row.system_status,
            poll_expired: true,
            afr_reconciled_status: "completed",
          };

          await db.execute(sql`
            UPDATE qa_run_metrics
            SET system_status = ${newSystem},
                system_score = ${systemStatusToScore(newSystem).toFixed(1)},
                agent_status = ${newAgent},
                agent_score = ${agentStatusToScore(newAgent).toFixed(1)},
                tower_result = ${towerVerdict},
                tower_score = ${towerResultToScore(towerVerdict).toFixed(1)},
                behaviour_result = ${newBehaviour},
                behaviour_score = ${behaviourResultToScore(newBehaviour).toFixed(1)},
                metadata = ${JSON.stringify(newMeta)}::jsonb
            WHERE id = ${row.id}
          `);
          reconciled++;
        } else if (ts === "failed" || ts === "FAIL" || ts === "STOP" || ts === "stopped") {
          const existingMeta = (typeof row.metadata === "object" && row.metadata) ? row.metadata : {};
          const newMeta = {
            ...existingMeta,
            reconciled: true,
            reconciled_at: Date.now(),
            previous_system_status: row.system_status,
            afr_reconciled_status: ts === "failed" || ts === "FAIL" ? "failed" : "stopped",
          };

          const newSystem: SystemStatus = (ts === "stopped" || ts === "STOP") ? "TIMEOUT" : "BROKEN";

          await db.execute(sql`
            UPDATE qa_run_metrics
            SET system_status = ${newSystem},
                system_score = ${systemStatusToScore(newSystem).toFixed(1)},
                metadata = ${JSON.stringify(newMeta)}::jsonb
            WHERE id = ${row.id}
          `);
          reconciled++;
        } else {
          const existingMeta = (typeof row.metadata === "object" && row.metadata) ? row.metadata : {};
          const newMeta = {
            ...existingMeta,
            reconciled: true,
            reconciled_at: Date.now(),
            previous_system_status: row.system_status,
            afr_reconciled_status: "still_running_or_unknown",
          };
          const newSystem: SystemStatus = "DEGRADED";
          await db.execute(sql`
            UPDATE qa_run_metrics
            SET system_status = ${newSystem},
                system_score = ${systemStatusToScore(newSystem).toFixed(1)},
                metadata = ${JSON.stringify(newMeta)}::jsonb
            WHERE id = ${row.id}
          `);
          reconciled++;
        }
      }

      return res.json({ ok: true, reconciled, unchanged, totalChecked: timeoutRows.length });
    } catch (error: any) {
      console.error("[qa-metrics] reconcile-timeouts error:", error?.message || error);
      return res.status(500).json({ ok: false, error: "Failed to reconcile timeouts" });
    }
  });

  router.get("/by-run", async (req, res) => {
    try {
      const runId = req.query.runId as string;
      if (!runId) return res.status(400).json({ ok: false, error: "runId is required" });
      const db = getDrizzleDb();
      const rows = await db.execute(sql`
        SELECT * FROM qa_run_metrics WHERE run_id = ${runId} AND source = 'benchmark' LIMIT 1
      `);
      const row = Array.isArray(rows) ? rows[0] : (rows as any)?.rows?.[0];
      if (!row) return res.json({ ok: true, data: null });
      return res.json({ ok: true, data: row });
    } catch (error: any) {
      console.error("[qa-metrics] by-run error:", error?.message || error);
      return res.status(500).json({ ok: false, error: "Failed to fetch metric" });
    }
  });

  router.post("/by-runs", async (req, res) => {
    try {
      const { runIds } = req.body as { runIds: string[] };
      if (!Array.isArray(runIds) || runIds.length === 0) return res.json({ ok: true, data: {} });
      const db = getDrizzleDb();
      const rows = await db.select().from(qaRunMetrics)
        .where(and(inArray(qaRunMetrics.runId, runIds), eq(qaRunMetrics.source, 'benchmark')))
        .limit(runIds.length);
      const results: Record<string, any> = {};
      for (const r of rows) { results[r.runId] = r; }
      return res.json({ ok: true, data: results });
    } catch (error: any) {
      console.error("[qa-metrics] by-runs error:", error?.message || error);
      return res.status(500).json({ ok: false, error: "Failed to fetch metrics" });
    }
  });

  router.get("/history", async (req, res) => {
    try {
      const db = getDrizzleDb();
      const sourceFilter = req.query.source as string | undefined;
      const rawRows = sourceFilter
        ? await db.execute(sql`
            SELECT * FROM qa_run_metrics
            WHERE source = ${sourceFilter}
            ORDER BY timestamp DESC
            LIMIT 500
          `)
        : await db.execute(sql`
            SELECT * FROM qa_run_metrics
            ORDER BY timestamp DESC
            LIMIT 500
          `);

      const rowsArray: any[] = Array.isArray(rawRows) ? rawRows : (rawRows as any)?.rows ?? [];

      if (rowsArray.length > 0 && isSupabaseConfigured()) {
        const needsJudge = rowsArray;
        if (needsJudge.length > 0) {
          const runIds = needsJudge.map((r: any) => r.run_id).filter(Boolean) as string[];
          if (runIds.length > 0) {
            const judgeMap = await getBehaviourJudgeResults(runIds);
            for (const row of rowsArray) {
              const judge = judgeMap[row.run_id];
              if (judge && (!row.behaviour_result || row.behaviour_result === 'UNKNOWN')) {
                const outcome = (judge.outcome || '').toUpperCase();
                if (outcome) {
                  row.behaviour_result = outcome;
                  row.behaviour_score = outcome === 'PASS' ? '1.0' : '0.0';
                }
              }
            }
          }
        }
      }

      return res.json(rowsArray);
    } catch (error: any) {
      console.error("[qa-metrics] history error:", error?.message || error);
      return res.status(500).json({ error: "Failed to fetch history" });
    }
  });

  return router;
}
