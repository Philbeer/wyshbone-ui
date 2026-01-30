import { storage } from '../storage';
import { randomUUID } from 'crypto';

export type ActivityRunType = 'deep_research' | 'plan' | 'tool' | 'chat';
export type ActivityStatus = 'started' | 'progress' | 'completed' | 'failed';

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
    });
    
    console.log(`📝 [AFR] Logged activity: ${params.runType}/${params.status} - ${params.label}`);
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
  });
}

export async function logDeepResearchEvent(params: {
  userId: string;
  runId: string;
  status: ActivityStatus;
  label: string;
  error?: string;
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
  });
}

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
