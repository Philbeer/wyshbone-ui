import { Router } from "express";
import { storage } from "../storage";
import type { Run, RuleUpdate, RunBundle } from "../../client/src/types/afr";

export function createAfrRouter(_storage: typeof storage) {
  const router = Router();

  router.get("/runs", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 200, 500);
      const userId = (req.query.userId || req.query.user_id) as string | undefined;
      const showAllUsers = req.query.all === 'true';
      
      const [dbRuns, activities] = await Promise.all([
        storage.listDeepResearchRunsForAfr(limit),
        storage.listAgentActivities(limit, showAllUsers ? undefined : userId)
      ]);

      const deepResearchRuns: Run[] = dbRuns
        .filter(r => showAllUsers || !userId || r.userId === userId)
        .map((r) => ({
          id: r.id,
          created_at: new Date(r.createdAt).toISOString(),
          goal_summary: r.label || r.prompt?.slice(0, 100) || "Untitled Run",
          vertical: "hospitality",
          status: mapDbStatus(r.status),
          goal_worth: null,
          stop_triggered: false,
          score: null,
          verdict: null,
          run_type: "deep_research" as const,
        }));

      const planRuns: Run[] = activities
        .filter(a => {
          const metadata = a.metadata as Record<string, any> | null;
          const runType = metadata?.runType;
          return runType === 'plan';
        })
        .map((a) => {
          const metadata = a.metadata as Record<string, any> | null;
          return {
            id: `activity_${a.id}`,
            created_at: new Date(a.timestamp).toISOString(),
            goal_summary: a.taskGenerated || "Plan Execution",
            vertical: "hospitality",
            status: mapActivityStatus(a.status),
            goal_worth: null,
            stop_triggered: false,
            score: null,
            verdict: null,
            run_type: "plan" as const,
            activity_id: a.id,
            plan_id: metadata?.planId || a.runId,
          };
        });

      const toolRuns: Run[] = activities
        .filter(a => {
          const metadata = a.metadata as Record<string, any> | null;
          const runType = metadata?.runType;
          return runType === 'tool';
        })
        .map((a) => ({
          id: `activity_${a.id}`,
          created_at: new Date(a.timestamp).toISOString(),
          goal_summary: a.taskGenerated || `Tool: ${a.actionTaken}`,
          vertical: "hospitality",
          status: mapActivityStatus(a.status),
          goal_worth: null,
          stop_triggered: false,
          score: null,
          verdict: null,
          run_type: "tool" as const,
          activity_id: a.id,
        }));

      const allRuns = [...deepResearchRuns, ...planRuns, ...toolRuns]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, limit);

      res.json(allRuns);
    } catch (error: any) {
      console.error("AFR /runs error:", error);
      res.status(500).json({ error: "Failed to fetch runs" });
    }
  });

  router.get("/runs/:id", async (req, res) => {
    try {
      const runId = req.params.id;
      
      if (runId.startsWith('activity_')) {
        const activityId = runId.replace('activity_', '');
        const activity = await storage.getAgentActivity(activityId);
        
        if (!activity) {
          return res.status(404).json({ error: "Activity not found" });
        }
        
        const metadata = activity.metadata as Record<string, any> | null;
        const runType = metadata?.runType || 'unknown';
        const results = activity.results as Record<string, any> | null;
        
        const run: Run = {
          id: runId,
          created_at: new Date(activity.timestamp).toISOString(),
          goal_summary: activity.taskGenerated || `${runType}: ${activity.actionTaken}`,
          vertical: "hospitality",
          status: mapActivityStatus(activity.status),
          goal_worth: null,
          stop_triggered: false,
          score: null,
          verdict: null,
          run_type: runType as any,
        };

        const bundle: RunBundle = {
          run,
          decisions: [{
            id: `decision_${activityId}`,
            run_id: runId,
            index: 1,
            title: activity.actionTaken || 'Execute Action',
            choice: runType,
            why: `Executed ${runType}: ${activity.actionTaken}`,
            options_considered: [],
          }],
          expected_signals: [],
          stop_conditions: [],
          outcome: {
            id: `outcome_${activityId}`,
            run_id: runId,
            outcome_summary: results?.note || 
              (activity.errorMessage ? `Failed: ${activity.errorMessage}` : 
               `Completed in ${activity.durationMs || 0}ms`),
            full_output: results ? JSON.stringify(results, null, 2) : 
              (activity.errorMessage || 'No output'),
            metrics_json: results?.count !== undefined ? { count: results.count } : undefined,
          },
          tower_verdict: null,
          related_rule_updates: [],
          goal_worth: null,
          verdict: activity.status === 'success' ? 'continue' as const : 
                   activity.status === 'failed' ? 'abandon' as const : null,
          score: activity.durationMs ? Math.max(0, 100 - Math.floor(activity.durationMs / 100)) : null,
          bundle_present: true,
        };

        return res.json(bundle);
      }
      
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
        run_type: "deep_research",
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
          clientRequestId: a.clientRequestId,
          routerDecision: a.routerDecision,
          routerReason: a.routerReason,
          parentActivityId: a.parentActivityId,
        })),
        count: activities.length
      });
    } catch (error: any) {
      console.error("AFR /activities error:", error);
      res.status(500).json({ error: "Failed to fetch activities" });
    }
  });

  router.get("/timeline", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const userId = req.query.userId as string | undefined;
      
      const activities = await storage.listAgentActivities(limit * 5, userId);
      
      const grouped = new Map<string, {
        clientRequestId: string;
        firstTimestamp: number;
        lastTimestamp: number;
        conversationId: string | null;
        userMessage: string | null;
        routerDecision: string | null;
        events: Array<{
          id: string;
          timestamp: string;
          runType: string;
          label: string;
          action: string;
          status: string;
          runId: string | null;
          durationMs: number | null;
          error: string | null;
        }>;
      }>();

      for (const a of activities) {
        const crid = a.clientRequestId;
        if (!crid) continue;

        const metadata = a.metadata as Record<string, any> | null;
        const runType = metadata?.runType || 'unknown';

        const event = {
          id: a.id,
          timestamp: new Date(a.timestamp).toISOString(),
          runType,
          label: a.taskGenerated,
          action: a.actionTaken,
          status: a.status,
          runId: a.runId,
          durationMs: a.durationMs,
          error: a.errorMessage,
        };

        if (!grouped.has(crid)) {
          grouped.set(crid, {
            clientRequestId: crid,
            firstTimestamp: a.timestamp,
            lastTimestamp: a.timestamp,
            conversationId: a.conversationId,
            userMessage: runType === 'user_message' ? a.taskGenerated : null,
            routerDecision: a.routerDecision || null,
            events: [event],
          });
        } else {
          const group = grouped.get(crid)!;
          group.events.push(event);
          group.firstTimestamp = Math.min(group.firstTimestamp, a.timestamp);
          group.lastTimestamp = Math.max(group.lastTimestamp, a.timestamp);
          if (runType === 'user_message' && !group.userMessage) {
            group.userMessage = a.taskGenerated;
          }
          if (a.routerDecision && !group.routerDecision) {
            group.routerDecision = a.routerDecision;
          }
        }
      }

      const timeline = Array.from(grouped.values())
        .sort((a, b) => b.lastTimestamp - a.lastTimestamp)
        .slice(0, limit)
        .map(g => ({
          ...g,
          firstTimestamp: new Date(g.firstTimestamp).toISOString(),
          lastTimestamp: new Date(g.lastTimestamp).toISOString(),
          eventCount: g.events.length,
          events: g.events.sort((a, b) => 
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          ),
        }));

      res.json({
        timeline,
        count: timeline.length,
        message: 'Activities grouped by client_request_id (correlation ID)'
      });
    } catch (error: any) {
      console.error("AFR /timeline error:", error);
      res.status(500).json({ error: "Failed to fetch timeline" });
    }
  });

  router.post("/cleanup-stale", async (req, res) => {
    try {
      const staleThresholdMs = parseInt(req.body?.staleThresholdMs as string) || 30 * 60 * 1000;
      const cutoffTime = Date.now() - staleThresholdMs;

      const staleRuns = await storage.listDeepResearchRunsForAfr(500);
      const runningRuns = staleRuns.filter(r => 
        (r.status === 'in_progress' || r.status === 'running') && 
        r.createdAt < cutoffTime
      );

      const cleaned: string[] = [];
      for (const run of runningRuns) {
        await storage.updateDeepResearchRun(run.id, {
          status: 'failed',
          error: `Marked as failed: No heartbeat for ${Math.round(staleThresholdMs / 60000)} minutes`,
        });
        cleaned.push(run.id);
      }

      console.log(`🧹 AFR cleanup: Marked ${cleaned.length} stale runs as failed`);
      
      res.json({
        cleaned: cleaned.length,
        runIds: cleaned,
        staleThresholdMs,
        message: `Marked ${cleaned.length} stale "running" entries as failed`
      });
    } catch (error: any) {
      console.error("AFR /cleanup-stale error:", error);
      res.status(500).json({ error: "Failed to cleanup stale runs" });
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

function mapActivityStatus(
  status: string | null
): "pending" | "running" | "completed" | "failed" | "stopped" {
  switch (status) {
    case "success":
    case "completed":
      return "completed";
    case "failed":
    case "error":
      return "failed";
    case "pending":
    case "running":
    case "in_progress":
      return "running";
    default:
      return "pending";
  }
}
