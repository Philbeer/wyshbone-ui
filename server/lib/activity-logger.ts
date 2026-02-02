import { storage } from '../storage';
import { randomUUID } from 'crypto';
import { runManager, type RunStatus } from './run-manager';

export type ActivityRunType = 'deep_research' | 'plan' | 'tool' | 'chat' | 'user_message' | 'router_decision' | 'run_completed';
export type ActivityStatus = 'started' | 'progress' | 'completed' | 'failed';
export type RouterDecision = 'direct_response' | 'deep_research' | 'supervisor_plan' | 'tool_call';

export interface LogActivityParams {
  userId: string;
  runType: ActivityRunType;
  status: ActivityStatus;
  label: string;
  actionTaken: string;
  conversationId?: string;
  runId?: string;
  actionParams?: Record<string, any>;
  results?: Record<string, any>;
  errorMessage?: string;
  durationMs?: number;
  metadata?: Record<string, any>;
  interestingFlag?: 0 | 1;
  clientRequestId?: string;
  routerDecision?: RouterDecision;
  routerReason?: string;
  parentActivityId?: string;
}

export async function logActivity(params: LogActivityParams): Promise<string> {
  const id = randomUUID();
  const now = Date.now();
  
  try {
    await storage.createAgentActivity({
      id,
      userId: params.userId,
      timestamp: now,
      createdAt: now,
      taskGenerated: params.label,
      actionTaken: params.actionTaken,
      status: mapStatus(params.status),
      conversationId: params.conversationId || null,
      runId: params.runId || null,
      actionParams: params.actionParams || null,
      results: params.results || null,
      errorMessage: params.errorMessage || null,
      durationMs: params.durationMs || null,
      metadata: {
        runType: params.runType,
        ...params.metadata
      },
      interestingFlag: params.interestingFlag ?? (params.status === 'failed' ? 1 : 0),
      clientRequestId: params.clientRequestId || null,
      routerDecision: params.routerDecision || null,
      routerReason: params.routerReason || null,
      parentActivityId: params.parentActivityId || null,
    });
    
    console.log(`📝 [AFR] Logged activity: ${params.runType}/${params.status} - ${params.label}${params.clientRequestId ? ` (crid:${params.clientRequestId.slice(0,8)})` : ''}`);
    return id;
  } catch (err) {
    console.error(`❌ [AFR] Failed to log activity:`, (err as Error).message);
    return id;
  }
}

function mapStatus(status: ActivityStatus): string {
  switch (status) {
    case 'started': return 'pending';
    case 'progress': return 'pending';
    case 'completed': return 'success';
    case 'failed': return 'failed';
    default: return 'pending';
  }
}

export async function logToolCall(params: {
  userId: string;
  toolName: string;
  toolParams: Record<string, any>;
  conversationId?: string;
  runId?: string;
  clientRequestId?: string;
  parentActivityId?: string;
}): Promise<string> {
  return logActivity({
    userId: params.userId,
    runType: 'tool',
    status: 'started',
    label: `Tool: ${params.toolName}`,
    actionTaken: params.toolName,
    conversationId: params.conversationId,
    runId: params.runId,
    actionParams: sanitizeParams(params.toolParams),
    clientRequestId: params.clientRequestId,
    routerDecision: 'tool_call',
    parentActivityId: params.parentActivityId,
  });
}

export async function logToolResult(params: {
  userId: string;
  toolName: string;
  success: boolean;
  results?: Record<string, any>;
  error?: string;
  durationMs?: number;
  conversationId?: string;
  runId?: string;
  clientRequestId?: string;
  parentActivityId?: string;
}): Promise<string> {
  return logActivity({
    userId: params.userId,
    runType: 'tool',
    status: params.success ? 'completed' : 'failed',
    label: `Tool: ${params.toolName}`,
    actionTaken: params.toolName,
    conversationId: params.conversationId,
    runId: params.runId,
    results: params.results,
    errorMessage: params.error,
    durationMs: params.durationMs,
    interestingFlag: params.success ? 0 : 1,
    clientRequestId: params.clientRequestId,
    parentActivityId: params.parentActivityId,
  });
}

export async function logPlanEvent(params: {
  userId: string;
  planId: string;
  status: ActivityStatus;
  label: string;
  stepInfo?: { stepId: string; stepLabel: string };
  error?: string;
  metadata?: Record<string, any>;
  clientRequestId?: string;
  conversationId?: string;
}): Promise<string> {
  return logActivity({
    userId: params.userId,
    runType: 'plan',
    status: params.status,
    label: params.label,
    actionTaken: params.stepInfo ? `step:${params.stepInfo.stepId}` : 'plan_execution',
    runId: params.planId,
    errorMessage: params.error,
    metadata: {
      planId: params.planId,
      ...params.stepInfo,
      ...params.metadata,
    },
    interestingFlag: params.status === 'failed' ? 1 : 0,
    clientRequestId: params.clientRequestId,
    conversationId: params.conversationId,
    routerDecision: 'supervisor_plan',
  });
}

export async function logDeepResearchEvent(params: {
  userId: string;
  runId: string;
  status: ActivityStatus;
  label: string;
  error?: string;
  clientRequestId?: string;
  conversationId?: string;
}): Promise<string> {
  return logActivity({
    userId: params.userId,
    runType: 'deep_research',
    status: params.status,
    label: params.label,
    actionTaken: 'deep_research',
    runId: params.runId,
    errorMessage: params.error,
    metadata: { deepResearchRunId: params.runId },
    interestingFlag: params.status === 'failed' ? 1 : 0,
    clientRequestId: params.clientRequestId,
    conversationId: params.conversationId,
    routerDecision: 'deep_research',
  });
}

export async function logUserMessageReceived(params: {
  userId: string;
  conversationId: string;
  clientRequestId: string;
  rawUserText: string;
}): Promise<{ activityId: string; runId: string }> {
  const run = await runManager.getOrCreateRun({
    clientRequestId: params.clientRequestId,
    userId: params.userId,
    conversationId: params.conversationId,
    metadata: { 
      userMessagePreview: params.rawUserText.slice(0, 100),
      timestamp: new Date().toISOString(),
    },
  });

  const activityId = await logActivity({
    userId: params.userId,
    runType: 'user_message',
    status: 'completed',
    label: `User: ${params.rawUserText.slice(0, 80)}${params.rawUserText.length > 80 ? '...' : ''}`,
    actionTaken: 'user_message_received',
    conversationId: params.conversationId,
    clientRequestId: params.clientRequestId,
    actionParams: { rawUserText: params.rawUserText.slice(0, 500) },
    metadata: {
      messageLength: params.rawUserText.length,
      timestamp: new Date().toISOString(),
      agentRunId: run.id,
    },
  });

  return { activityId, runId: run.id };
}

export async function logRouterDecision(params: {
  userId: string;
  conversationId: string;
  clientRequestId: string;
  decision: RouterDecision;
  reason: string;
  signals?: Record<string, any>;
}): Promise<string> {
  const run = await runManager.getRunByClientRequestId(params.clientRequestId);
  if (run) {
    await runManager.setUiReady(run.id);
    const newStatus: RunStatus = params.decision === 'supervisor_plan' ? 'planning' : 'executing';
    await runManager.transitionTo(run.id, newStatus);
  }

  return logActivity({
    userId: params.userId,
    runType: 'router_decision',
    status: 'completed',
    label: `Router: ${params.decision}`,
    actionTaken: 'router_decision',
    conversationId: params.conversationId,
    clientRequestId: params.clientRequestId,
    routerDecision: params.decision,
    routerReason: params.reason,
    actionParams: params.signals,
    metadata: {
      decision: params.decision,
      reason: params.reason,
      signals: params.signals,
      agentRunId: run?.id,
    },
  });
}

export async function logRunCompleted(params: {
  userId: string;
  conversationId: string;
  clientRequestId: string;
}): Promise<string> {
  const run = await runManager.getRunByClientRequestId(params.clientRequestId);
  if (run && !run.terminalState) {
    await runManager.completeRun(run.id);
  }

  return logActivity({
    userId: params.userId,
    runType: 'run_completed',
    status: 'completed',
    label: 'Run completed',
    actionTaken: 'run_completed',
    conversationId: params.conversationId,
    clientRequestId: params.clientRequestId,
    metadata: {
      agentRunId: run?.id,
      timestamp: new Date().toISOString(),
    },
  });
}

export async function logRunFailed(params: {
  userId: string;
  conversationId: string;
  clientRequestId: string;
  error: string;
}): Promise<string> {
  const run = await runManager.getRunByClientRequestId(params.clientRequestId);
  if (run && !run.terminalState) {
    await runManager.failRun(run.id, params.error);
  }

  return logActivity({
    userId: params.userId,
    runType: 'run_completed',
    status: 'failed',
    label: 'Run failed',
    actionTaken: 'run_failed',
    conversationId: params.conversationId,
    clientRequestId: params.clientRequestId,
    errorMessage: params.error,
    metadata: {
      agentRunId: run?.id,
      timestamp: new Date().toISOString(),
    },
  });
}

export async function transitionRunToExecuting(clientRequestId: string): Promise<void> {
  const run = await runManager.getRunByClientRequestId(clientRequestId);
  if (run && run.status !== 'executing' && run.status !== 'completed' && run.status !== 'failed' && run.status !== 'stopped') {
    await runManager.transitionTo(run.id, 'executing');
  }
}

export async function transitionRunToFinalizing(clientRequestId: string): Promise<void> {
  const run = await runManager.getRunByClientRequestId(clientRequestId);
  if (run && run.status === 'executing') {
    await runManager.transitionTo(run.id, 'finalizing');
  }
}

export { runManager };

function sanitizeParams(params: Record<string, any>): Record<string, any> {
  const safe: Record<string, any> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key.toLowerCase().includes('key') || 
        key.toLowerCase().includes('secret') ||
        key.toLowerCase().includes('password') ||
        key.toLowerCase().includes('token')) {
      safe[key] = '[REDACTED]';
    } else if (typeof value === 'string' && value.length > 500) {
      safe[key] = value.substring(0, 500) + '...[truncated]';
    } else {
      safe[key] = value;
    }
  }
  return safe;
}
