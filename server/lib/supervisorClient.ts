/**
 * Supervisor Client
 * 
 * Thin client for delegating long-running jobs to the Supervisor service.
 * UI should route all background job execution through this client.
 * 
 * Environment variables:
 * - SUPERVISOR_BASE_URL: Base URL for Supervisor service (required)
 * - ENABLE_UI_BACKGROUND_WORKERS: If 'true', allow fallback local execution (default: false)
 */

import { logActivity } from './activity-logger';

export interface StartJobRequest {
  jobType: string;
  payload: any;
  requestedBy: 'ui';
  sourceRunId?: string;
}

export interface StartJobResponse {
  jobId: string;
}

export interface JobStatus {
  jobId: string;
  jobType: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress?: number;
  message?: string;
  startedAt?: string;
  endedAt?: string;
}

export interface CancelJobResponse {
  ok: boolean;
}

export interface SupervisorClientOptions {
  userId?: string;
  conversationId?: string;
  clientRequestId?: string;
}

const SUPERVISOR_BASE_URL = process.env.SUPERVISOR_BASE_URL || '';
const ENABLE_UI_BACKGROUND_WORKERS = process.env.ENABLE_UI_BACKGROUND_WORKERS === 'true';

export function isSupervisorConfigured(): boolean {
  return !!SUPERVISOR_BASE_URL && SUPERVISOR_BASE_URL.length > 0;
}

export function isLocalFallbackEnabled(): boolean {
  return ENABLE_UI_BACKGROUND_WORKERS;
}

async function logJobEvent(
  eventType: 'job_queued' | 'delegated_to_supervisor' | 'fallback_ui_execution_started' | 'fallback_ui_execution_completed' | 'fallback_ui_execution_failed' | 'fallback_ui_execution_paused' | 'supervisor_call_failed',
  params: {
    userId: string;
    jobType: string;
    jobId?: string;
    error?: string;
    conversationId?: string;
    clientRequestId?: string;
    metadata?: Record<string, any>;
  }
): Promise<void> {
  const isFallback = eventType.startsWith('fallback_');
  const isFailed = eventType.includes('failed');
  
  await logActivity({
    userId: params.userId,
    runType: 'tool',
    status: isFailed ? 'failed' : 'completed',
    label: `Job: ${params.jobType}${params.jobId ? ` (${params.jobId.slice(0, 8)})` : ''}`,
    actionTaken: eventType,
    conversationId: params.conversationId,
    clientRequestId: params.clientRequestId,
    actionParams: {
      jobType: params.jobType,
      jobId: params.jobId,
    },
    errorMessage: params.error,
    metadata: {
      eventType,
      isFallback,
      supervisorBaseUrl: isSupervisorConfigured() ? '[configured]' : '[not configured]',
      ...params.metadata,
    },
    interestingFlag: isFallback || isFailed ? 1 : 0,
  });
  
  const emoji = isFailed ? '❌' : isFallback ? '⚠️' : '📤';
  console.log(`${emoji} [SUPERVISOR] ${eventType}: ${params.jobType}${params.jobId ? ` jobId=${params.jobId}` : ''}${params.error ? ` error=${params.error}` : ''}`);
}

/**
 * Start a job via Supervisor
 * 
 * @returns { jobId } on success
 * @throws Error if Supervisor is unavailable and fallback is disabled
 */
export async function startJob(
  jobType: string,
  payload: any,
  options: SupervisorClientOptions = {}
): Promise<{ jobId: string; delegatedToSupervisor: boolean }> {
  const { userId = 'system', conversationId, clientRequestId } = options;
  
  if (!isSupervisorConfigured()) {
    console.warn('[SUPERVISOR] SUPERVISOR_BASE_URL not configured');
    
    if (isLocalFallbackEnabled()) {
      await logJobEvent('fallback_ui_execution_started', {
        userId,
        jobType,
        conversationId,
        clientRequestId,
        metadata: { reason: 'SUPERVISOR_BASE_URL not configured' },
      });
      
      return {
        jobId: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        delegatedToSupervisor: false,
      };
    }
    
    throw new Error('Supervisor not configured and local fallback is disabled (ENABLE_UI_BACKGROUND_WORKERS=false)');
  }
  
  try {
    await logJobEvent('job_queued', {
      userId,
      jobType,
      conversationId,
      clientRequestId,
    });
    
    const response = await fetch(`${SUPERVISOR_BASE_URL}/api/supervisor/jobs/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jobType,
        payload,
        requestedBy: 'ui',
        sourceRunId: clientRequestId,
      } satisfies StartJobRequest),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Supervisor returned ${response.status}: ${errorText}`);
    }
    
    const result: StartJobResponse = await response.json();
    
    await logJobEvent('delegated_to_supervisor', {
      userId,
      jobType,
      jobId: result.jobId,
      conversationId,
      clientRequestId,
    });
    
    return {
      jobId: result.jobId,
      delegatedToSupervisor: true,
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    await logJobEvent('supervisor_call_failed', {
      userId,
      jobType,
      error: errorMessage,
      conversationId,
      clientRequestId,
    });
    
    if (isLocalFallbackEnabled()) {
      console.warn(`[SUPERVISOR] Supervisor call failed, falling back to local execution: ${errorMessage}`);
      
      await logJobEvent('fallback_ui_execution_started', {
        userId,
        jobType,
        conversationId,
        clientRequestId,
        metadata: { reason: `Supervisor error: ${errorMessage}` },
      });
      
      return {
        jobId: `local_fallback_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        delegatedToSupervisor: false,
      };
    }
    
    throw new Error(`Failed to delegate job to Supervisor: ${errorMessage}. Local fallback is disabled.`);
  }
}

/**
 * Get job status from Supervisor
 */
export async function getJob(jobId: string): Promise<JobStatus> {
  if (!isSupervisorConfigured()) {
    throw new Error('Supervisor not configured (SUPERVISOR_BASE_URL not set)');
  }
  
  const response = await fetch(`${SUPERVISOR_BASE_URL}/api/supervisor/jobs/${jobId}`);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get job status: ${response.status} - ${errorText}`);
  }
  
  return response.json();
}

/**
 * Cancel a running job via Supervisor
 */
export async function cancelJob(jobId: string): Promise<CancelJobResponse> {
  if (!isSupervisorConfigured()) {
    throw new Error('Supervisor not configured (SUPERVISOR_BASE_URL not set)');
  }
  
  const response = await fetch(`${SUPERVISOR_BASE_URL}/api/supervisor/jobs/${jobId}/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to cancel job: ${response.status} - ${errorText}`);
  }
  
  return response.json();
}

/**
 * Mark fallback execution as completed (call this after local execution finishes)
 */
export async function markFallbackCompleted(
  jobType: string,
  jobId: string,
  options: SupervisorClientOptions = {}
): Promise<void> {
  const { userId = 'system', conversationId, clientRequestId } = options;
  
  await logJobEvent('fallback_ui_execution_completed', {
    userId,
    jobType,
    jobId,
    conversationId,
    clientRequestId,
  });
}

/**
 * Mark fallback execution as failed (call this if local execution fails)
 */
export async function markFallbackFailed(
  jobType: string,
  jobId: string,
  error: string,
  options: SupervisorClientOptions = {}
): Promise<void> {
  const { userId = 'system', conversationId, clientRequestId } = options;
  
  await logJobEvent('fallback_ui_execution_failed', {
    userId,
    jobType,
    jobId,
    error,
    conversationId,
    clientRequestId,
  });
}

/**
 * Mark fallback execution as paused (call this if local execution pauses/cancels)
 */
export async function markFallbackPaused(
  jobType: string,
  jobId: string,
  reason: string,
  options: SupervisorClientOptions = {}
): Promise<void> {
  const { userId = 'system', conversationId, clientRequestId } = options;
  
  await logJobEvent('fallback_ui_execution_paused', {
    userId,
    jobType,
    jobId,
    conversationId,
    clientRequestId,
    metadata: { reason },
  });
}

/**
 * Log job_queued event for local fallback execution
 */
export async function logLocalJobQueued(
  jobType: string,
  jobId: string,
  options: SupervisorClientOptions = {}
): Promise<void> {
  const { userId = 'system', conversationId, clientRequestId } = options;
  
  await logJobEvent('job_queued', {
    userId,
    jobType,
    jobId,
    conversationId,
    clientRequestId,
    metadata: { executionMode: 'local_fallback' },
  });
}

/**
 * Log fallback_ui_execution_started event (called when local fallback begins)
 */
export async function logFallbackStarted(
  jobType: string,
  jobId: string,
  options: SupervisorClientOptions = {}
): Promise<void> {
  const { userId = 'system', conversationId, clientRequestId } = options;
  
  await logJobEvent('fallback_ui_execution_started', {
    userId,
    jobType,
    jobId,
    conversationId,
    clientRequestId,
  });
}

export const supervisorClient = {
  startJob,
  getJob,
  cancelJob,
  isSupervisorConfigured,
  isLocalFallbackEnabled,
  markFallbackCompleted,
  markFallbackFailed,
  markFallbackPaused,
  logLocalJobQueued,
  logFallbackStarted,
};
