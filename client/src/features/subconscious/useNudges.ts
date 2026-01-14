import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { apiRequest, handleApiError } from "@/lib/queryClient";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { SubconNudge, NudgeStatus, NudgeType } from "./types";

/**
 * V1-1.2: useNudges hook with REAL Supabase data from subcon_nudges table.
 * 
 * Architecture:
 * - READS: Direct Supabase queries to the `subcon_nudges` table
 * - WRITES: Actions (dismiss/snooze) go through Supervisor API endpoints
 * - REALTIME: Supabase realtime subscriptions for INSERT/UPDATE/DELETE events
 * 
 * This replaces the previous API-based approach with direct Supabase access
 * for reads, matching the pattern used by useLeads.ts.
 */

/**
 * Supabase row shape from subcon_nudges table.
 * Uses snake_case to match database columns.
 */
interface SubconNudgeRow {
  id: string;
  title: string;
  summary: string;
  created_at: string;
  status: string;
  type: string;
  importance_score?: number;
  lead_id?: string;
  lead_name?: string;
  remind_at?: string;
  metadata?: Record<string, unknown>;
  user_id?: string;
}

/**
 * Maps a Supabase row to the UI SubconNudge type.
 * Handles snake_case → camelCase conversion and type coercion.
 */
function mapSupabaseRowToNudge(row: SubconNudgeRow): SubconNudge {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    createdAt: row.created_at,
    status: row.status as NudgeStatus,
    type: row.type as NudgeType,
    importanceScore: row.importance_score,
    leadId: row.lead_id,
    leadName: row.lead_name,
    remindAt: row.remind_at,
    metadata: row.metadata,
  };
}

/**
 * Sorts nudges by importance (descending) then by creation date (descending).
 * 
 * Sorting logic:
 * - Primary: importanceScore (higher scores first; undefined treated as 0)
 * - Secondary: createdAt (newest first)
 */
function sortNudges(nudges: SubconNudge[]): SubconNudge[] {
  return [...nudges].sort((a, b) => {
    // Primary sort: importanceScore descending (higher = more important)
    const scoreA = a.importanceScore ?? 0;
    const scoreB = b.importanceScore ?? 0;
    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }
    
    // Secondary sort: createdAt descending (newest first)
    const dateA = new Date(a.createdAt).getTime();
    const dateB = new Date(b.createdAt).getTime();
    return dateB - dateA;
  });
}

/**
 * Default snooze duration: 24 hours from now.
 * Returns an ISO string for the remindAt field.
 */
function getDefaultSnoozeTime(): string {
  const date = new Date();
  date.setHours(date.getHours() + 24);
  return date.toISOString();
}

export interface UseNudgesResult {
  nudges: SubconNudge[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  /** Dismiss a nudge - removes it from the active list */
  dismissNudge: (nudgeId: string) => Promise<void>;
  /** Snooze a nudge - will reappear after remindAt time (defaults to 24h) */
  snoozeNudge: (nudgeId: string, remindAt?: string) => Promise<void>;
  /** Returns true if a mutation is in progress for the given nudge */
  isNudgePending: (nudgeId: string) => boolean;
  /** Whether realtime is connected */
  isRealtimeConnected: boolean;
}

/**
 * useNudges - Hook for fetching and managing nudges from Supabase subcon_nudges table.
 * 
 * Fetches nudges directly from Supabase and provides:
 * - Sorted list of nudges (by importance, then by date)
 * - Loading and error states
 * - Refetch function for retry/refresh
 * - Realtime updates on INSERT/UPDATE/DELETE
 * - Action handlers: dismissNudge, snoozeNudge (via Supervisor API)
 * 
 * Action endpoints (Supervisor):
 *   - POST /api/subcon/nudge/:id/dismiss - Dismiss nudge
 *   - POST /api/subcon/nudge/:id/snooze - Snooze with remindAt
 */
export function useNudges(): UseNudgesResult {
  const [nudges, setNudges] = useState<SubconNudge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [pendingNudgeIds, setPendingNudgeIds] = useState<Set<string>>(new Set());
  const channelRef = useRef<RealtimeChannel | null>(null);

  /**
   * Fetch nudges from Supabase (READ operation - direct Supabase access)
   * Only fetches active nudges (status not 'dismissed' or 'handled')
   */
  const fetchNudges = useCallback(async () => {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      setError(new Error("Supabase not configured. Please check your environment variables."));
      setIsError(true);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setIsError(false);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("subcon_nudges")
        .select("*")
        .not("status", "in", '("dismissed","handled")')
        .order("created_at", { ascending: false });

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      const mappedNudges = (data || []).map(mapSupabaseRowToNudge);
      setNudges(mappedNudges);
    } catch (err) {
      const message = handleApiError(err, "fetch nudges");
      setError(new Error(message));
      setIsError(true);
      setNudges([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Set up realtime subscription for nudge changes.
   * Reflects Supervisor writes and new nudges in real-time.
   */
  const setupRealtimeSubscription = useCallback(() => {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      console.warn("[useNudges] Supabase not configured, skipping realtime");
      return;
    }

    // Clean up existing subscription
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    console.log("[useNudges] Setting up realtime subscription for subcon_nudges table");

    const channel = supabase
      .channel("subcon-nudges-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "subcon_nudges",
        },
        (payload) => {
          console.log("[useNudges] Realtime INSERT:", payload.new);
          const newNudge = mapSupabaseRowToNudge(payload.new as SubconNudgeRow);
          // Only add if not dismissed/handled
          if (newNudge.status !== "dismissed" && newNudge.status !== "handled") {
            setNudges((prev) => [newNudge, ...prev]);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "subcon_nudges",
        },
        (payload) => {
          console.log("[useNudges] Realtime UPDATE:", payload.new);
          const updatedNudge = mapSupabaseRowToNudge(payload.new as SubconNudgeRow);
          
          // If nudge is now dismissed/handled, remove from list
          if (updatedNudge.status === "dismissed" || updatedNudge.status === "handled") {
            setNudges((prev) => prev.filter((nudge) => nudge.id !== updatedNudge.id));
          } else {
            // Otherwise update in place
            setNudges((prev) =>
              prev.map((nudge) => (nudge.id === updatedNudge.id ? updatedNudge : nudge))
            );
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "subcon_nudges",
        },
        (payload) => {
          console.log("[useNudges] Realtime DELETE:", payload.old);
          const deletedId = (payload.old as SubconNudgeRow).id;
          setNudges((prev) => prev.filter((nudge) => nudge.id !== deletedId));
        }
      )
      .subscribe((status) => {
        console.log("[useNudges] Realtime subscription status:", status);
        setIsRealtimeConnected(status === "SUBSCRIBED");
      });

    channelRef.current = channel;
  }, []);

  /**
   * Clean up realtime subscription
   */
  const cleanupRealtimeSubscription = useCallback(() => {
    const supabase = getSupabaseClient();
    if (channelRef.current && supabase) {
      console.log("[useNudges] Cleaning up realtime subscription");
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
      setIsRealtimeConnected(false);
    }
  }, []);

  /**
   * Refetch nudges data
   */
  const refetch = useCallback(() => {
    fetchNudges();
  }, [fetchNudges]);

  /**
   * Dismiss a nudge via Supervisor API.
   * POST /api/subcon/nudge/:id/dismiss
   */
  const dismissNudge = useCallback(async (nudgeId: string): Promise<void> => {
    // Mark as pending
    setPendingNudgeIds((prev) => new Set(prev).add(nudgeId));

    // Optimistic update - remove from UI immediately
    setNudges((prev) => prev.filter((nudge) => nudge.id !== nudgeId));

    try {
      await apiRequest("POST", `/api/subcon/nudge/${nudgeId}/dismiss`, { id: nudgeId });
      console.log("[useNudges] Nudge dismissed via Supervisor:", nudgeId);
      // Realtime subscription will confirm the update from Supabase
    } catch (err) {
      handleApiError(err, "dismiss nudge");
      // Revert optimistic update on error by refetching
      await fetchNudges();
      throw err;
    } finally {
      setPendingNudgeIds((prev) => {
        const next = new Set(prev);
        next.delete(nudgeId);
        return next;
      });
    }
  }, [fetchNudges]);

  /**
   * Snooze a nudge via Supervisor API.
   * POST /api/subcon/nudge/:id/snooze
   * @param nudgeId - The nudge to snooze
   * @param remindAt - Optional ISO date string; defaults to 24 hours from now
   */
  const snoozeNudge = useCallback(async (nudgeId: string, remindAt?: string): Promise<void> => {
    // Mark as pending
    setPendingNudgeIds((prev) => new Set(prev).add(nudgeId));

    // Optimistic update - update status to snoozed and remove from active list
    setNudges((prev) => prev.filter((nudge) => nudge.id !== nudgeId));

    try {
      await apiRequest("POST", `/api/subcon/nudge/${nudgeId}/snooze`, {
        id: nudgeId,
        remind_at: remindAt ?? getDefaultSnoozeTime(),
      });
      console.log("[useNudges] Nudge snoozed via Supervisor:", nudgeId);
      // Realtime subscription will confirm the update from Supabase
    } catch (err) {
      handleApiError(err, "snooze nudge");
      // Revert optimistic update on error by refetching
      await fetchNudges();
      throw err;
    } finally {
      setPendingNudgeIds((prev) => {
        const next = new Set(prev);
        next.delete(nudgeId);
        return next;
      });
    }
  }, [fetchNudges]);

  /**
   * Check if a specific nudge has a pending mutation.
   * Used to disable buttons while an action is in progress.
   */
  const isNudgePending = useCallback((nudgeId: string): boolean => {
    return pendingNudgeIds.has(nudgeId);
  }, [pendingNudgeIds]);

  // Sort nudges: most important/newest first (memoized)
  const sortedNudges = useMemo(() => sortNudges(nudges), [nudges]);

  // Initial fetch and realtime setup
  useEffect(() => {
    fetchNudges();
    setupRealtimeSubscription();

    return () => {
      cleanupRealtimeSubscription();
    };
  }, [fetchNudges, setupRealtimeSubscription, cleanupRealtimeSubscription]);

  return {
    nudges: sortedNudges,
    isLoading,
    isError,
    error,
    refetch,
    dismissNudge,
    snoozeNudge,
    isNudgePending,
    isRealtimeConnected,
  };
}
