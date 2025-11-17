/**
 * Tower Run Logger Client
 * 
 * Logs all live user runs from Wyshbone UI to Tower backend
 * for monitoring, analytics, and debugging.
 */

import type { ChatMessage } from '../../shared/schema';

const TOWER_URL = process.env.TOWER_URL || '';
const TOWER_API_KEY = process.env.TOWER_API_KEY || process.env.EXPORT_KEY || '';

export type RunStatus = 'started' | 'success' | 'error' | 'timeout';

export interface TowerRunLog {
  runId: string;
  conversationId: string;
  userId: string;
  userEmail: string;
  status: RunStatus;
  source: 'live_user';  // Required by Tower backend
  request: {
    inputText: string;
  };
  response?: {
    outputText: string;
  };
  toolCalls?: Array<{
    name: string;
    args: any;
    result?: any;
    error?: string;
  }>;
  error?: string;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  model?: string;
  mode?: 'standard' | 'mega';
}

/**
 * Check if Tower logging is enabled
 */
export function isTowerLoggingEnabled(): boolean {
  return !!TOWER_URL && !!TOWER_API_KEY;
}

/**
 * Log a run to Tower
 */
export async function logRunToTower(runLog: TowerRunLog): Promise<void> {
  if (!isTowerLoggingEnabled()) {
    console.log('⚠️ Tower logging disabled - missing TOWER_URL or TOWER_API_KEY');
    return;
  }

  try {
    const endpoint = `${TOWER_URL}/tower/runs/log`;
    
    console.log(`📡 Logging run ${runLog.runId} to Tower (${runLog.status})`);
    console.log(`📦 Tower payload:`, JSON.stringify(runLog, null, 2));
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOWER_API_KEY}`,
        'X-Source': 'wyshbone-ui',
      },
      body: JSON.stringify(runLog),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Tower logging failed: ${response.status} ${errorText}`);
      // Don't throw - logging failure shouldn't break the main flow
      return;
    }

    console.log(`✅ Logged run ${runLog.runId} to Tower successfully`);
  } catch (error: any) {
    console.error(`❌ Tower logging error for run ${runLog.runId}:`, error.message);
    // Don't throw - logging failure shouldn't break the main flow
  }
}

/**
 * Create a new run log entry (called at start of chat)
 */
export async function startRunLog(
  conversationId: string,
  userId: string,
  userEmail: string,
  input: string,
  mode: 'standard' | 'mega' = 'standard'
): Promise<string> {
  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  
  const runLog: TowerRunLog = {
    runId,
    conversationId,
    userId,
    userEmail,
    status: 'started',
    source: 'live_user',
    request: {
      inputText: input,
    },
    response: {
      outputText: '[generating...]', // Placeholder at start, will be filled when completed
    },
    startedAt: Date.now(),
    mode,
    model: mode === 'mega' ? 'gpt-4o' : 'gpt-4o',
  };

  await logRunToTower(runLog);
  
  return runId;
}

/**
 * Complete a run log entry (called at end of chat)
 */
export async function completeRunLog(
  runId: string,
  conversationId: string,
  userId: string,
  userEmail: string,
  input: string,
  output: string,
  status: 'success' | 'error' | 'timeout',
  startedAt: number,
  toolCalls?: Array<{ name: string; args: any; result?: any; error?: string }>,
  error?: string,
  mode: 'standard' | 'mega' = 'standard'
): Promise<void> {
  const completedAt = Date.now();
  const durationMs = completedAt - startedAt;

  const runLog: TowerRunLog = {
    runId,
    conversationId,
    userId,
    userEmail,
    status,
    source: 'live_user',
    request: {
      inputText: input,
    },
    response: {
      outputText: output,
    },
    toolCalls,
    error,
    startedAt,
    completedAt,
    durationMs,
    mode,
    model: mode === 'mega' ? 'gpt-4o' : 'gpt-4o',
  };

  await logRunToTower(runLog);
}

/**
 * Log a tool call within a run
 */
export function logToolCall(
  toolCalls: Array<{ name: string; args: any; result?: any; error?: string }>,
  toolName: string,
  args: any,
  result?: any,
  error?: string
): void {
  toolCalls.push({
    name: toolName,
    args,
    result,
    error,
  });
}
