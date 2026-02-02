import { Router } from "express";
import { storage } from "../storage";
import type { Run, RuleUpdate, RunBundle } from "../../client/src/types/afr";

// Stream event type for the Live Activity Panel
interface StreamEvent {
  id: string;
  ts: string;
  type: string;
  summary: string;
  details: {
    runType?: string;
    action?: string | null;
    task?: string | null;
    error?: string | null;
    durationMs?: number | null;
    results?: string | null;
    label?: string | null;
    prompt?: string | null;
    mode?: string | null;
    outputPreview?: string | null;
  };
  status: 'pending' | 'running' | 'completed' | 'failed';
  run_id: string | null;
  client_request_id: string | null;
  router_decision?: string | null;
  router_reason?: string | null;
}

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
        verdict: (bundleData?.verdict as "continue" | "revise" | "abandon" | null) || null,
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

  // GET /stream - Unified activity stream for a specific client_request_id (Live Activity Panel)
  // CRITICAL: Terminal state is determined ONLY by agent_runs.terminal_state
  // NEVER infer terminal state from events - this was the source of the "Completed" bug
  router.get("/stream", async (req, res) => {
    try {
      const clientRequestId = req.query.client_request_id as string | undefined;
      const userId = (req.query.userId || req.query.user_id) as string | undefined;
      
      if (!clientRequestId && !userId) {
        return res.json({ 
          events: [], 
          status: 'idle',
          is_terminal: false,
          terminal_state: null,
          ui_ready: false,
          message: 'No active request. Provide client_request_id or userId.'
        });
      }

      // Fetch the run record first - this is the authoritative source for status
      let agentRun = clientRequestId 
        ? await storage.getAgentRunByClientRequestId(clientRequestId)
        : userId 
          ? await storage.getMostRecentAgentRun(userId)
          : null;

      // Determine effective client_request_id
      const effectiveClientRequestId = clientRequestId || agentRun?.clientRequestId;

      // Fetch activities for this request or user's most recent request
      const activities = await storage.listAgentActivities(100, userId);
      
      // Filter by client_request_id if provided
      let relevantActivities = effectiveClientRequestId 
        ? activities.filter(a => a.clientRequestId === effectiveClientRequestId)
        : activities;

      // If no specific client_request_id, get the most recent one
      if (!effectiveClientRequestId && relevantActivities.length > 0) {
        const mostRecentWithCrid = relevantActivities.find(a => a.clientRequestId);
        if (mostRecentWithCrid?.clientRequestId) {
          relevantActivities = activities.filter(a => 
            a.clientRequestId === mostRecentWithCrid.clientRequestId
          );
          // Also try to fetch the run record for backwards compatibility
          if (!agentRun) {
            agentRun = await storage.getAgentRunByClientRequestId(mostRecentWithCrid.clientRequestId);
          }
        }
      }

      // Also fetch any deep research runs for this client_request_id
      let deepResearchRuns: any[] = [];
      if (effectiveClientRequestId) {
        const allRuns = await storage.listDeepResearchRunsForAfr(50);
        deepResearchRuns = allRuns.filter(r => r.clientRequestId === effectiveClientRequestId);
      }

      // Build the unified event stream
      const events: StreamEvent[] = [];

      // Add activity events
      for (const a of relevantActivities) {
        const metadata = a.metadata as Record<string, any> | null;
        const runType = metadata?.runType || 'unknown';
        const results = a.results as Record<string, any> | null;

        events.push({
          id: a.id,
          ts: new Date(a.timestamp).toISOString(),
          type: mapRunTypeToEventType(runType, a.actionTaken),
          summary: buildEventSummary(runType, a.actionTaken, a.taskGenerated, results),
          details: {
            runType,
            action: a.actionTaken,
            task: a.taskGenerated,
            error: a.errorMessage,
            durationMs: a.durationMs,
            results: results ? JSON.stringify(results).slice(0, 500) : null,
          },
          status: mapActivityStatusToEventStatus(a.status),
          run_id: a.runId,
          client_request_id: a.clientRequestId,
          router_decision: a.routerDecision,
          router_reason: a.routerReason,
        });
      }

      // Add deep research run events
      for (const r of deepResearchRuns) {
        events.push({
          id: `dr_${r.id}`,
          ts: new Date(r.createdAt).toISOString(),
          type: r.status === 'completed' ? 'deep_research_completed' : 
                r.status === 'failed' ? 'run_failed' : 
                r.status === 'running' || r.status === 'in_progress' ? 'deep_research_started' : 
                'deep_research_started',
          summary: r.status === 'completed' 
            ? `Deep research completed: ${r.label || r.prompt?.slice(0, 50) || 'Research'}`
            : r.status === 'failed'
            ? `Deep research failed: ${r.error?.slice(0, 100) || 'Unknown error'}`
            : `Deep research started: ${r.label || r.prompt?.slice(0, 50) || 'Research'}`,
          details: {
            label: r.label,
            prompt: r.prompt?.slice(0, 200),
            mode: r.mode,
            error: r.error,
            outputPreview: r.outputText?.slice(0, 300),
          },
          status: mapDbStatusToEventStatus(r.status),
          run_id: r.id,
          client_request_id: r.clientRequestId,
          router_decision: r.routerDecision,
          router_reason: r.routerReason,
        });
      }

      // Sort events chronologically (oldest first for timeline display)
      events.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

      // AUTHORITATIVE STATUS FROM RUN RECORD
      // If we have a run record, use it for status - NEVER infer from events
      let overallStatus: 'idle' | 'routing' | 'planning' | 'executing' | 'finalizing' | 'completed' | 'failed' | 'stopped' = 'idle';
      let isTerminal = false;
      let terminalState: 'completed' | 'failed' | 'stopped' | null = null;
      let uiReady = false;

      if (agentRun) {
        // RUN RECORD EXISTS - Use authoritative status
        overallStatus = agentRun.status as typeof overallStatus;
        uiReady = agentRun.uiReady === 1;
        
        // Terminal state comes ONLY from the run record
        if (agentRun.terminalState) {
          isTerminal = true;
          terminalState = agentRun.terminalState as 'completed' | 'failed' | 'stopped';
        }
      } else {
        // BACKWARDS COMPATIBILITY: No run record (older requests)
        // Fall back to event-based inference but be conservative
        const hasRunning = events.some(e => e.status === 'running');
        const hasFailed = events.some(e => e.status === 'failed');
        
        if (events.length === 0) {
          overallStatus = 'idle';
        } else if (hasRunning) {
          const runningEvents = events.filter(e => e.status === 'running');
          const lastRunning = runningEvents[runningEvents.length - 1];
          if (lastRunning?.type.includes('router')) {
            overallStatus = 'routing';
          } else if (lastRunning?.type.includes('plan')) {
            overallStatus = 'planning';
          } else {
            overallStatus = 'executing';
          }
          uiReady = true; // If we have events, assume UI is ready
        } else if (hasFailed) {
          overallStatus = 'failed';
          isTerminal = true;
          terminalState = 'failed';
          uiReady = true;
        } else {
          // For old requests without run records: DON'T assume completed
          // Just show executing until we have a run record
          overallStatus = 'executing';
          uiReady = true;
        }
      }

      // Get the user's message (title)
      const userMessageEvent = events.find(e => e.type === 'user_message_received');
      const requestTitle = userMessageEvent?.details?.task || 
        events[0]?.summary || 
        'Processing request...';

      res.json({
        client_request_id: effectiveClientRequestId || null,
        title: requestTitle,
        status: overallStatus,
        is_terminal: isTerminal,
        terminal_state: terminalState,
        ui_ready: uiReady,
        run_id: agentRun?.id || null,
        events,
        event_count: events.length,
        last_updated: agentRun?.updatedAt 
          ? new Date(agentRun.updatedAt).toISOString()
          : events.length > 0 
            ? events[events.length - 1].ts 
            : new Date().toISOString(),
        last_event_at: agentRun?.lastEventAt 
          ? new Date(agentRun.lastEventAt).toISOString()
          : null,
      });
    } catch (error: any) {
      console.error("AFR /stream error:", error);
      // Graceful degradation - return empty stream instead of 500
      res.json({ 
        events: [], 
        status: 'idle',
        is_terminal: false,
        terminal_state: null,
        ui_ready: false,
        error: error.message,
        message: 'Failed to fetch activity stream'
      });
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

// Helper functions for the activity stream

function mapRunTypeToEventType(runType: string, action: string | null): string {
  switch (runType) {
    case 'user_message':
      return 'user_message_received';
    case 'router':
    case 'routing':
      return 'router_decision';
    case 'plan':
    case 'planning':
      return action?.includes('create') ? 'plan_created' : 
             action?.includes('approve') ? 'plan_approved' :
             action?.includes('reject') ? 'plan_rejected' : 'plan_updated';
    case 'tool':
    case 'tool_call':
      return action?.includes('complete') || action?.includes('finish') ? 
             'tool_call_completed' : 'tool_call_started';
    case 'deep_research':
      return 'deep_research_started';
    case 'supervisor':
      return 'supervisor_plan';
    case 'direct_response':
      return 'direct_response';
    case 'stream':
      return 'streaming_response';
    default:
      return action || 'unknown_event';
  }
}

function buildEventSummary(
  runType: string, 
  action: string | null, 
  task: string | null,
  results: Record<string, any> | null
): string {
  switch (runType) {
    case 'user_message':
      return `Message received: "${task?.slice(0, 60) || 'User message'}${task && task.length > 60 ? '...' : ''}"`;
    case 'router':
    case 'routing':
      return `Router decision: ${action || 'processing'}`;
    case 'plan':
    case 'planning':
      if (action?.includes('create')) return 'Created execution plan';
      if (action?.includes('approve')) return 'Plan approved by user';
      if (action?.includes('reject')) return 'Plan rejected by user';
      return `Plan: ${action || 'updating'}`;
    case 'tool':
    case 'tool_call':
      const toolName = action?.replace(/_/g, ' ') || 'Tool';
      const resultNote = results?.note || results?.count !== undefined ? 
        ` (${results.count || 0} results)` : '';
      return action?.includes('complete') || action?.includes('finish') ?
        `Completed: ${toolName}${resultNote}` :
        `Started: ${toolName}`;
    case 'deep_research':
      return `Deep research: ${task?.slice(0, 50) || 'analyzing'}`;
    case 'supervisor':
      return 'Supervisor creating plan';
    case 'direct_response':
      return 'Direct response (no tools needed)';
    case 'stream':
      return 'Streaming AI response';
    default:
      return task?.slice(0, 60) || action || 'Processing';
  }
}

function mapActivityStatusToEventStatus(
  status: string | null
): 'pending' | 'running' | 'completed' | 'failed' {
  switch (status) {
    case 'success':
    case 'completed':
      return 'completed';
    case 'failed':
    case 'error':
      return 'failed';
    case 'pending':
      return 'pending';
    case 'running':
    case 'in_progress':
      return 'running';
    default:
      return 'pending';
  }
}

function mapDbStatusToEventStatus(
  dbStatus: string
): 'pending' | 'running' | 'completed' | 'failed' {
  switch (dbStatus) {
    case 'queued':
      return 'pending';
    case 'in_progress':
    case 'running':
      return 'running';
    case 'completed':
      return 'completed';
    case 'failed':
    case 'stopped':
      return 'failed';
    default:
      return 'pending';
  }
}
