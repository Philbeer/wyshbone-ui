import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authedFetch, apiRequest } from "@/lib/queryClient";
import { isDemoMode } from "@/hooks/useDemoMode";
import { demoNudges as demoNudgesData } from "@/demo/demoData";
import type { SubconNudge, NudgeStatus, NudgeType } from "./types";

/**
 * Backend DTO shape from Supervisor /api/subconscious/nudges endpoint.
 * This may differ from the UI-side SubconNudge type (e.g., snake_case vs camelCase).
 */
interface NudgeDTO {
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
}

/**
 * Maps a backend NudgeDTO to the UI SubconNudge type.
 * Handles snake_case → camelCase conversion and type coercion.
 */
function mapNudgeFromDTO(dto: NudgeDTO): SubconNudge {
  return {
    id: dto.id,
    title: dto.title,
    summary: dto.summary,
    createdAt: dto.created_at,
    status: dto.status as NudgeStatus,
    type: dto.type as NudgeType,
    importanceScore: dto.importance_score,
    leadId: dto.lead_id,
    leadName: dto.lead_name,
    remindAt: dto.remind_at,
    metadata: dto.metadata,
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
 * Fetches nudges from the Supervisor API.
 */
async function fetchNudges(): Promise<SubconNudge[]> {
  const response = await authedFetch("/api/subconscious/nudges");
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch nudges: ${response.status} ${text || response.statusText}`);
  }
  
  const data = await response.json();
  
  // Backend may return { nudges: [...] } or just an array
  const nudgeDTOs: NudgeDTO[] = Array.isArray(data) ? data : (data.nudges ?? []);
  
  return nudgeDTOs.map(mapNudgeFromDTO);
}

/** Query key for nudges - used for cache invalidation */
const NUDGES_QUERY_KEY = ["/api/subconscious/nudges"];

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
  /** UI-20: Whether we're showing demo data */
  isDemoData: boolean;
}

/**
 * useNudges - Hook for fetching and managing nudges from the Subconscious Engine.
 * 
 * Fetches nudges from GET /api/subconscious/nudges and provides:
 * - Sorted list of nudges (by importance, then by date)
 * - Loading and error states
 * - Refetch function for retry/refresh
 * - Action handlers: dismissNudge, snoozeNudge
 * 
 * UI-20: In demo mode, returns demo nudges and handles actions locally.
 * 
 * The Supervisor endpoints (SUP-10-13) provide:
 *   - GET /api/subconscious/nudges - List nudges
 *   - POST /api/subconscious/nudges/:id/handle - Mark as handled
 *   - POST /api/subconscious/nudges/:id/dismiss - Dismiss nudge
 *   - POST /api/subconscious/nudges/:id/snooze - Snooze with remindAt
 */
export function useNudges(): UseNudgesResult {
  const queryClient = useQueryClient();
  const inDemoMode = isDemoMode();
  
  // UI-20: Local state for demo mode nudges (allows dismiss/snooze without backend)
  const [demoNudges, setDemoNudges] = useState<SubconNudge[]>(demoNudgesData);
  
  const {
    data: rawNudges,
    isLoading: apiIsLoading,
    isError,
    error,
    refetch: queryRefetch,
  } = useQuery<SubconNudge[], Error>({
    queryKey: NUDGES_QUERY_KEY,
    queryFn: fetchNudges,
    // UI-20: Disable query in demo mode
    enabled: !inDemoMode,
    // Nudges may update frequently; allow some refetch on focus
    staleTime: 30_000, // Consider data stale after 30 seconds
    refetchOnWindowFocus: true,
  });
  
  // UI-20: In demo mode, use demo nudges; loading is instant
  const isLoading = inDemoMode ? false : apiIsLoading;

  // Sort nudges: most important/newest first
  // UI-20: Use demo nudges in demo mode
  const nudges = useMemo(() => {
    const source = inDemoMode ? demoNudges : (rawNudges ?? []);
    return sortNudges(source);
  }, [rawNudges, demoNudges, inDemoMode]);

  // Wrap refetch for a cleaner API
  const refetch = useCallback(() => {
    queryRefetch();
  }, [queryRefetch]);

  /**
   * Mutation: Dismiss a nudge
   * POST /api/subconscious/nudges/:id/dismiss
   */
  const dismissMutation = useMutation({
    mutationFn: async (nudgeId: string) => {
      await apiRequest("POST", `/api/subconscious/nudges/${nudgeId}/dismiss`);
    },
    onSuccess: () => {
      // Refetch the nudges list to reflect the change
      queryClient.invalidateQueries({ queryKey: NUDGES_QUERY_KEY });
    },
  });

  /**
   * Mutation: Snooze a nudge
   * POST /api/subconscious/nudges/:id/snooze
   * Body: { remind_at: ISO string }
   */
  const snoozeMutation = useMutation({
    mutationFn: async ({ nudgeId, remindAt }: { nudgeId: string; remindAt: string }) => {
      await apiRequest("POST", `/api/subconscious/nudges/${nudgeId}/snooze`, {
        remind_at: remindAt,
      });
    },
    onSuccess: () => {
      // Refetch the nudges list to reflect the change
      queryClient.invalidateQueries({ queryKey: NUDGES_QUERY_KEY });
    },
  });

  /**
   * Dismiss a nudge - wrapper around the mutation.
   * UI-20: In demo mode, just update local state.
   */
  const dismissNudge = useCallback(async (nudgeId: string): Promise<void> => {
    if (inDemoMode) {
      // Demo mode: update local state
      setDemoNudges(prev => prev.filter(n => n.id !== nudgeId));
      return;
    }
    await dismissMutation.mutateAsync(nudgeId);
  }, [dismissMutation, inDemoMode]);

  /**
   * Snooze a nudge - wrapper around the mutation.
   * UI-20: In demo mode, just update local state.
   * @param nudgeId - The nudge to snooze
   * @param remindAt - Optional ISO date string; defaults to 24 hours from now
   */
  const snoozeNudge = useCallback(async (nudgeId: string, remindAt?: string): Promise<void> => {
    if (inDemoMode) {
      // Demo mode: update local state to show snoozed status
      setDemoNudges(prev => prev.map(n => 
        n.id === nudgeId 
          ? { ...n, status: 'snoozed' as NudgeStatus, remindAt: remindAt ?? getDefaultSnoozeTime() }
          : n
      ));
      return;
    }
    await snoozeMutation.mutateAsync({
      nudgeId,
      remindAt: remindAt ?? getDefaultSnoozeTime(),
    });
  }, [snoozeMutation, inDemoMode]);

  /**
   * Check if a specific nudge has a pending mutation.
   * Used to disable buttons while an action is in progress.
   */
  const isNudgePending = useCallback((nudgeId: string): boolean => {
    // Check if this specific nudge is being mutated
    const dismissPending = dismissMutation.isPending && dismissMutation.variables === nudgeId;
    const snoozePending = snoozeMutation.isPending && snoozeMutation.variables?.nudgeId === nudgeId;
    return dismissPending || snoozePending;
  }, [dismissMutation.isPending, dismissMutation.variables, snoozeMutation.isPending, snoozeMutation.variables]);

  return {
    nudges,
    isLoading,
    isError: inDemoMode ? false : isError,
    error: inDemoMode ? null : (error ?? null),
    refetch,
    dismissNudge,
    snoozeNudge,
    isNudgePending,
    isDemoData: inDemoMode,
  };
}
