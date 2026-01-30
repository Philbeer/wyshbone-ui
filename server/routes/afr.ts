import { Router } from "express";
import { storage } from "../storage";
import type { Run, RuleUpdate, RunBundle } from "../../client/src/types/afr";

export function createAfrRouter(_storage: typeof storage) {
  const router = Router();

  router.get("/runs", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 200, 500);
      const dbRuns = await storage.listDeepResearchRunsForAfr(limit);

      const runs: Run[] = dbRuns.map((r) => ({
        id: r.id,
        created_at: new Date(r.createdAt).toISOString(),
        goal_summary: r.label || r.prompt?.slice(0, 100) || "Untitled Run",
        vertical: "hospitality",
        status: mapDbStatus(r.status),
        goal_worth: null,
        stop_triggered: false,
        score: null,
        verdict: null,
      }));

      res.json(runs);
    } catch (error: any) {
      console.error("AFR /runs error:", error);
      res.status(500).json({ error: "Failed to fetch runs" });
    }
  });

  router.get("/runs/:id", async (req, res) => {
    try {
      const runId = req.params.id;
      
      const [dbRun, afrBundle, relatedRuleUpdates] = await Promise.all([
        storage.getDeepResearchRun(runId),
        storage.getAfrRunBundle(runId),
        storage.getAfrRuleUpdatesByEvidenceRunId(runId)
      ]);

      if (!dbRun) {
        return res.status(404).json({ error: "Run not found" });
      }

      const bundleData = afrBundle?.bundle as {
        goal_worth?: string | null;
        decisions?: any[];
        expected_signals?: any[];
        stop_conditions?: any[];
        verdict?: string | null;
        score?: number | null;
        tower_verdict?: string | null;
      } | null;

      const run: Run = {
        id: dbRun.id,
        created_at: new Date(dbRun.createdAt).toISOString(),
        goal_summary: dbRun.label || dbRun.prompt?.slice(0, 100) || "Untitled Run",
        vertical: "hospitality",
        status: mapDbStatus(dbRun.status),
        goal_worth: bundleData?.goal_worth || null,
        stop_triggered: false,
        score: bundleData?.score || null,
        verdict: bundleData?.verdict || null,
      };

      const bundle: RunBundle = {
        run,
        decisions: bundleData?.decisions || [],
        expected_signals: bundleData?.expected_signals || [],
        stop_conditions: bundleData?.stop_conditions || [],
        outcome: dbRun.outputText
          ? {
              id: `outcome_${runId}`,
              run_id: runId,
              outcome_summary: dbRun.outputText.slice(0, 500),
              full_output: dbRun.outputText,
              metrics_json: undefined,
            }
          : null,
        tower_verdict: bundleData?.tower_verdict || null,
        related_rule_updates: relatedRuleUpdates.map((r) => ({
          id: r.id,
          created_at: r.createdAt?.toISOString() || new Date().toISOString(),
          updated_at: r.updatedAt?.toISOString() || new Date().toISOString(),
          rule_text: r.ruleText,
          scope: r.scope,
          confidence: r.confidence as "low" | "med" | "high",
          status: r.status as "active" | "disabled" | "invalid",
          update_type: r.updateType as "create" | "adjust" | "retire",
          reason: r.reason || null,
          evidence_run_ids: r.evidenceRunIds || [],
          source: r.source as "human" | "agent" | "hybrid",
          supersedes_rule_id: r.supersedesRuleId || null,
        })),
        goal_worth: bundleData?.goal_worth || null,
        verdict: bundleData?.verdict || null,
        score: bundleData?.score || null,
        bundle_present: !!afrBundle,
      };

      res.json(bundle);
    } catch (error: any) {
      console.error("AFR /runs/:id error:", error);
      res.status(500).json({ error: "Failed to fetch run bundle" });
    }
  });

  router.get("/rules", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 200, 500);
      const dbRules = await storage.listAfrRuleUpdates(limit);

      const rules: RuleUpdate[] = dbRules.map((r) => ({
        id: r.id,
        created_at: r.createdAt?.toISOString() || new Date().toISOString(),
        updated_at: r.updatedAt?.toISOString() || new Date().toISOString(),
        rule_text: r.ruleText,
        scope: r.scope,
        confidence: r.confidence as "low" | "med" | "high",
        status: r.status as "active" | "disabled" | "invalid",
        update_type: r.updateType as "create" | "adjust" | "retire",
        reason: r.reason || null,
        evidence_run_ids: r.evidenceRunIds || [],
        source: r.source as "human" | "agent" | "hybrid",
        supersedes_rule_id: r.supersedesRuleId || null,
      }));

      res.json(rules);
    } catch (error: any) {
      const rootCause = error?.cause?.message || error?.message || "Unknown error";
      console.error("AFR /rules error:", error?.message, error?.stack);
      res.status(500).json({ 
        error: "Failed to fetch rules", 
        detail: rootCause 
      });
    }
  });

  router.get("/rules/:id", async (req, res) => {
    try {
      const ruleId = req.params.id;
      const dbRule = await storage.getAfrRuleUpdate(ruleId);

      if (!dbRule) {
        return res.status(404).json({ error: "Rule not found" });
      }

      const rule: RuleUpdate = {
        id: dbRule.id,
        created_at: dbRule.createdAt?.toISOString() || new Date().toISOString(),
        updated_at: dbRule.updatedAt?.toISOString() || new Date().toISOString(),
        rule_text: dbRule.ruleText,
        scope: dbRule.scope,
        confidence: dbRule.confidence as "low" | "med" | "high",
        status: dbRule.status as "active" | "disabled" | "invalid",
        update_type: dbRule.updateType as "create" | "adjust" | "retire",
        reason: dbRule.reason || null,
        evidence_run_ids: dbRule.evidenceRunIds || [],
        source: dbRule.source as "human" | "agent" | "hybrid",
        supersedes_rule_id: dbRule.supersedesRuleId || null,
      };

      res.json(rule);
    } catch (error: any) {
      console.error("AFR /rules/:id error:", error);
      res.status(500).json({ error: "Failed to fetch rule" });
    }
  });

  // Agent Activities endpoint - unified log of all agent executions
  router.get("/activities", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 200, 500);
      const userId = req.query.userId as string | undefined;
      
      const activities = await storage.listAgentActivities(limit, userId);
      
      res.json({
        activities: activities.map(a => ({
          id: a.id,
          userId: a.userId,
          timestamp: new Date(a.timestamp).toISOString(),
          runType: (a.metadata as any)?.runType || 'unknown',
          label: a.taskGenerated,
          action: a.actionTaken,
          status: a.status,
          runId: a.runId,
          conversationId: a.conversationId,
          durationMs: a.durationMs,
          error: a.errorMessage,
          interestingFlag: a.interestingFlag,
        })),
        count: activities.length
      });
    } catch (error: any) {
      console.error("AFR /activities error:", error);
      res.status(500).json({ error: "Failed to fetch activities" });
    }
  });

  return router;
}

function mapDbStatus(
  dbStatus: string
): "pending" | "running" | "completed" | "failed" | "stopped" {
  switch (dbStatus) {
    case "queued":
      return "pending";
    case "in_progress":
    case "running":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "stopped":
      return "stopped";
    default:
      return "pending";
  }
}
