/**
 * Tower Run Logger Client
 * 
 * Logs all live user runs from Wyshbone UI to Tower backend
 * for monitoring, analytics, and debugging.
 * 
 * SECURITY: ALL authenticated users (demo and regular) have their runs logged.
 * No filtering based on user type, email domain, or demo status.
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
  const enabled = !!TOWER_URL && !!TOWER_API_KEY;
  if (!enabled) {
    console.warn('⚠️ Tower logging DISABLED - missing TOWER_URL or TOWER_API_KEY');
    console.warn('   Set these environment variables to enable run logging for ALL users');
  }
  return enabled;
}

/**
 * Log a run to Tower
 * 
 * SECURITY: This function logs runs for ALL authenticated users without filtering.
 * No checks are performed on userId, userEmail, or demo status.
 */
export async function logRunToTower(runLog: TowerRunLog): Promise<void> {
  if (!isTowerLoggingEnabled()) {
    console.log(`⚠️ Tower logging disabled - skipping log for user ${runLog.userEmail}`);
    return;
  }

  try {
    const endpoint = `${TOWER_URL}/tower/runs/log`;
    
    console.log(`📡 Logging run ${runLog.runId} to Tower (${runLog.status})`);
    console.log(`   User: ${runLog.userEmail} (ID: ${runLog.userId})`);
    console.log(`   Conversation: ${runLog.conversationId}`);
    console.log(`   Mode: ${runLog.mode || 'standard'}`);
    
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
      console.error(`❌ Tower logging failed for user ${runLog.userEmail}: ${response.status} ${errorText}`);
      console.error(`   RunId: ${runLog.runId}, ConversationId: ${runLog.conversationId}`);
      // Don't throw - logging failure shouldn't break the main flow
      return;
    }

    console.log(`✅ Logged run ${runLog.runId} to Tower successfully`);
    console.log(`   User: ${runLog.userEmail} (ALL users are logged equally)`);
  } catch (error: any) {
    console.error(`❌ Tower logging error for run ${runLog.runId}:`, error.message);
    console.error(`   User: ${runLog.userEmail}, ConversationId: ${runLog.conversationId}`);
    // Don't throw - logging failure shouldn't break the main flow
  }
}

/**
 * Create a new run log entry (called at start of chat)
 * 
 * SECURITY: Logs ALL users equally - no filtering by demo status
 */
export async function startRunLog(
  conversationId: string,
  userId: string,
  userEmail: string,
  input: string,
  mode: 'standard' | 'mega' = 'standard'
): Promise<string> {
  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  
  console.log(`🏁 Starting run log for user: ${userEmail} (ID: ${userId})`);
  console.log(`   RunId: ${runId}, ConversationId: ${conversationId}`);
  
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
 * 
 * SECURITY: Logs ALL users equally - no filtering by demo status
 * This function is called for every completed run regardless of user type
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

  console.log(`🏁 Completing run log for user: ${userEmail} (ID: ${userId})`);
  console.log(`   RunId: ${runId}, ConversationId: ${conversationId}`);
  console.log(`   Status: ${status}, Duration: ${durationMs}ms`);
  console.log(`   🔍 ALL authenticated users are logged to Tower (no filtering)`);

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
  
  console.log(`🔧 Tool call logged: ${toolName}`);
}
