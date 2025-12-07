/**
 * UI-18: Tower API Client for "What just happened?" viewer
 * 
 * Fetches recent Tower runs from the Tower backend for display in the UI.
 * Reuses the TOWER_URL environment variable from the server-side towerClient.
 * 
 * Note: This calls the UI backend which proxies to Tower, since the Tower
 * URL may not be accessible directly from the browser.
 */

/**
 * Summary of a Tower run for display in the UI
 */
export interface TowerRunSummary {
  id: string;
  createdAt: string;
  source: string;      // e.g. "live_user" | "subconscious" | "supervisor" | "plan_executor"
  status: string;      // e.g. "success" | "error" | "running" | "started" | "timeout"
  goal?: string;
  conversationId?: string;
  userEmail?: string;
  summary?: string;    // Short description from inputText or goal_summary
  durationMs?: number;
}

/**
 * Raw response from Tower /tower/runs API
 */
interface TowerRunResponse {
  id: string;
  created_at: string;
  source: string;
  user_identifier?: string | null;
  goal_summary?: string | null;
  status: string;
  meta?: {
    runId?: string;
    conversationId?: string;
    userId?: string;
    userEmail?: string;
    inputText?: string;
    durationMs?: number;
    goal?: string;
    [key: string]: unknown;
  } | null;
}

/**
 * Map raw Tower response to our UI-friendly format
 */
function mapTowerRunToSummary(run: TowerRunResponse): TowerRunSummary {
  const meta = run.meta || {};
  
  // Extract the best available description
  const summary = 
    meta.inputText?.substring(0, 100) ||
    run.goal_summary?.substring(0, 100) ||
    meta.goal?.substring(0, 100) ||
    undefined;
  
  return {
    id: run.id,
    createdAt: run.created_at,
    source: run.source,
    status: run.status,
    goal: meta.goal || run.goal_summary || undefined,
    conversationId: meta.conversationId || undefined,
    userEmail: meta.userEmail || run.user_identifier || undefined,
    summary: summary ? (summary.length >= 100 ? `${summary}...` : summary) : undefined,
    durationMs: meta.durationMs || undefined,
  };
}

/**
 * Fetch recent Tower runs for a specific conversation
 * Falls back to all live_user runs if conversation filtering isn't supported
 */
export async function fetchRecentTowerRunsForConversation(
  conversationId: string,
  limit: number = 10
): Promise<TowerRunSummary[]> {
  try {
    // Call our backend proxy endpoint which talks to Tower
    const response = await fetch(`/api/tower/runs?conversationId=${encodeURIComponent(conversationId)}&limit=${limit}`);
    
    if (!response.ok) {
      console.error(`[TowerClient] Failed to fetch runs for conversation ${conversationId}: ${response.status}`);
      throw new Error(`Tower API returned ${response.status}`);
    }
    
    const runs: TowerRunResponse[] = await response.json();
    return runs.map(mapTowerRunToSummary);
  } catch (error) {
    console.error('[TowerClient] Error fetching conversation runs:', error);
    throw error;
  }
}

/**
 * Fetch recent Tower runs (all sources, most recent first)
 */
export async function fetchRecentTowerRuns(limit: number = 10): Promise<TowerRunSummary[]> {
  try {
    // Call our backend proxy endpoint which talks to Tower
    const response = await fetch(`/api/tower/runs?limit=${limit}`);
    
    if (!response.ok) {
      console.error(`[TowerClient] Failed to fetch recent runs: ${response.status}`);
      throw new Error(`Tower API returned ${response.status}`);
    }
    
    const runs: TowerRunResponse[] = await response.json();
    return runs.map(mapTowerRunToSummary);
  } catch (error) {
    console.error('[TowerClient] Error fetching recent runs:', error);
    throw error;
  }
}

/**
 * Fetch recent live_user runs only
 */
export async function fetchRecentLiveUserRuns(limit: number = 10): Promise<TowerRunSummary[]> {
  try {
    const response = await fetch(`/api/tower/runs/live?limit=${limit}`);
    
    if (!response.ok) {
      console.error(`[TowerClient] Failed to fetch live user runs: ${response.status}`);
      throw new Error(`Tower API returned ${response.status}`);
    }
    
    const runs: TowerRunResponse[] = await response.json();
    return runs.map(mapTowerRunToSummary);
  } catch (error) {
    console.error('[TowerClient] Error fetching live user runs:', error);
    throw error;
  }
}

/**
 * Get the Tower dashboard URL for a run
 * Returns undefined if Tower URL is not configured
 */
export function getTowerDashboardUrl(runId: string): string {
  // The Tower dashboard is at /dashboard and runs can be investigated at /dashboard/investigate
  // For now, return the runs list - can be enhanced later when Tower has direct run links
  return `/api/tower/dashboard?runId=${encodeURIComponent(runId)}`;
}

