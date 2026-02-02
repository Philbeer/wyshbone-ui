import { storage } from '../storage';
import { randomUUID } from 'crypto';
import type { InsertAgentRun, SelectAgentRun } from '@shared/schema';

export type RunStatus = 'starting' | 'planning' | 'executing' | 'finalizing' | 'completed' | 'failed' | 'stopped';
export type TerminalState = 'completed' | 'failed' | 'stopped';

const TERMINAL_STATUSES: Set<RunStatus> = new Set(['completed', 'failed', 'stopped']);

const ALLOWED_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  starting: ['planning', 'executing', 'failed', 'stopped'],
  planning: ['executing', 'failed', 'stopped'],
  executing: ['finalizing', 'completed', 'failed', 'stopped'],
  finalizing: ['completed', 'failed', 'stopped'],
  completed: [],
  failed: [],
  stopped: [],
};

function isValidTransition(from: RunStatus, to: RunStatus): boolean {
  const allowed = ALLOWED_TRANSITIONS[from];
  return allowed.includes(to);
}

function isTerminalStatus(status: RunStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export interface CreateRunParams {
  clientRequestId: string;
  userId: string;
  conversationId?: string;
  metadata?: Record<string, any>;
}

export interface RunManager {
  createRun(params: CreateRunParams): Promise<SelectAgentRun>;
  getOrCreateRun(params: CreateRunParams): Promise<SelectAgentRun>;
  getRun(id: string): Promise<SelectAgentRun | null>;
  getRunByClientRequestId(clientRequestId: string): Promise<SelectAgentRun | null>;
  getMostRecentRun(userId: string): Promise<SelectAgentRun | null>;
  setUiReady(runId: string): Promise<SelectAgentRun | null>;
  transitionTo(runId: string, status: RunStatus): Promise<SelectAgentRun | null>;
  completeRun(runId: string): Promise<SelectAgentRun | null>;
  failRun(runId: string, error: string): Promise<SelectAgentRun | null>;
  stopRun(runId: string): Promise<SelectAgentRun | null>;
  recordEventTime(runId: string): Promise<SelectAgentRun | null>;
}

async function createRun(params: CreateRunParams): Promise<SelectAgentRun> {
  const now = Date.now();
  const run: InsertAgentRun = {
    id: randomUUID(),
    clientRequestId: params.clientRequestId,
    userId: params.userId,
    conversationId: params.conversationId || null,
    createdAt: now,
    updatedAt: now,
    status: 'starting',
    terminalState: null,
    uiReady: 0,
    lastEventAt: null,
    error: null,
    errorDetails: null,
    metadata: params.metadata || null,
  };
  
  const result = await storage.createAgentRun(run);
  console.log(`🏃 [RunManager] Created run ${result.id} for clientRequestId ${params.clientRequestId.slice(0, 8)}...`);
  return result;
}

async function getOrCreateRun(params: CreateRunParams): Promise<SelectAgentRun> {
  const existing = await storage.getAgentRunByClientRequestId(params.clientRequestId);
  if (existing) {
    console.log(`🏃 [RunManager] Found existing run ${existing.id} for clientRequestId ${params.clientRequestId.slice(0, 8)}...`);
    return existing;
  }
  return createRun(params);
}

async function getRun(id: string): Promise<SelectAgentRun | null> {
  return storage.getAgentRun(id);
}

async function getRunByClientRequestId(clientRequestId: string): Promise<SelectAgentRun | null> {
  return storage.getAgentRunByClientRequestId(clientRequestId);
}

async function getMostRecentRun(userId: string): Promise<SelectAgentRun | null> {
  return storage.getMostRecentAgentRun(userId);
}

async function setUiReady(runId: string): Promise<SelectAgentRun | null> {
  const result = await storage.setAgentRunUiReady(runId, true);
  if (result) {
    console.log(`🏃 [RunManager] Set ui_ready=true for run ${runId}`);
  }
  return result;
}

async function transitionTo(runId: string, status: RunStatus): Promise<SelectAgentRun | null> {
  const currentRun = await storage.getAgentRun(runId);
  if (!currentRun) {
    console.warn(`🏃 [RunManager] Cannot transition: run ${runId} not found`);
    return null;
  }
  
  const currentStatus = currentRun.status as RunStatus;
  
  if (isTerminalStatus(currentStatus)) {
    console.warn(`🏃 [RunManager] Cannot transition: run ${runId} is in terminal state '${currentStatus}'`);
    return currentRun;
  }
  
  if (!isValidTransition(currentStatus, status)) {
    console.warn(`🏃 [RunManager] Invalid transition: run ${runId} from '${currentStatus}' to '${status}'. Allowed: ${ALLOWED_TRANSITIONS[currentStatus].join(', ')}`);
    return currentRun;
  }
  
  let terminalState: TerminalState | null = null;
  if (isTerminalStatus(status)) {
    terminalState = status as TerminalState;
  }
  
  const result = await storage.updateAgentRunStatus(runId, status, terminalState, null);
  if (result) {
    console.log(`🏃 [RunManager] Transitioned run ${runId}: ${currentStatus} → ${status}${terminalState ? ` (terminal)` : ''}`);
  }
  return result;
}

async function completeRun(runId: string): Promise<SelectAgentRun | null> {
  const result = await storage.completeAgentRun(runId);
  if (result) {
    console.log(`✅ [RunManager] Completed run ${runId}`);
  }
  return result;
}

async function failRun(runId: string, error: string): Promise<SelectAgentRun | null> {
  const result = await storage.failAgentRun(runId, error);
  if (result) {
    console.log(`❌ [RunManager] Failed run ${runId}: ${error.slice(0, 100)}`);
  }
  return result;
}

async function stopRun(runId: string): Promise<SelectAgentRun | null> {
  const result = await storage.stopAgentRun(runId);
  if (result) {
    console.log(`⛔ [RunManager] Stopped run ${runId}`);
  }
  return result;
}

async function recordEventTime(runId: string): Promise<SelectAgentRun | null> {
  return storage.updateAgentRun(runId, { lastEventAt: Date.now() });
}

async function ensureTerminalOnError<T>(runId: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    console.error(`❌ [RunManager] Error in run ${runId}, marking as failed:`, error.message);
    await failRun(runId, error.message || 'Unknown error');
    throw error;
  }
}

export const runManager: RunManager = {
  createRun,
  getOrCreateRun,
  getRun,
  getRunByClientRequestId,
  getMostRecentRun,
  setUiReady,
  transitionTo,
  completeRun,
  failRun,
  stopRun,
  recordEventTime,
};

export { ensureTerminalOnError };
