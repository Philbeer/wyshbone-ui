import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/contexts/UserContext";
import { addDevAuthParams, buildApiUrl } from "@/lib/queryClient";
import { useRef, useEffect } from "react";

export interface PlanStepProgress {
  id: string;
  type: string;
  status: "pending" | "executing" | "completed" | "failed";
  label?: string;
  resultSummary?: string;
}

export interface PlanProgress {
  loading: boolean;
  error?: string;
  goal: string | null;
  planId: string | null;
  totalSteps: number;
  completedSteps: number;
  currentStep?: PlanStepProgress | null;
  status: "idle" | "pending_approval" | "executing" | "completed" | "failed";
  steps: PlanStepProgress[];
  lastUpdatedAt?: string;
  percentComplete: number;
}

interface PlanStatusResponse {
  goal: string | null;
  planId: string | null;
  totalSteps: number;
  completedSteps: number;
  currentStep?: PlanStepProgress | null;
  status?: "idle" | "pending_approval" | "executing" | "completed" | "failed";
  steps?: PlanStepProgress[];
  lastUpdatedAt: string;
}

export function usePlanProgress(planId: string | null, isActive: boolean): PlanProgress {
  const { user } = useUser();
  
  // Retain last successful data snapshot even when polling stops
  const lastDataRef = useRef<PlanStatusResponse | null>(null);
  const lastPlanIdRef = useRef<string | null>(null);

  console.log(`[PLAN_PROGRESS_DEBUG] hook called - planId=${planId}, isActive=${isActive}, enabled=${!!user && !!planId && isActive}`);

  const { data, isLoading, error } = useQuery<PlanStatusResponse>({
    queryKey: ["/api/plan-status", planId],
    queryFn: async () => {
      if (!planId) {
        throw new Error("No planId provided");
      }
      
      // Build URL with planId query parameter
      const url = buildApiUrl(addDevAuthParams(`/api/plan-status?planId=${encodeURIComponent(planId)}`));
      console.log(`[PLAN_PROGRESS_DEBUG] fetching /api/plan-status for planId=${planId}, url=${url}`);
      
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`[PLAN_PROGRESS_DEBUG] fetch failed - status=${response.status}, statusText=${response.statusText}`);
        throw new Error(`Failed to fetch plan status: ${response.statusText}`);
      }
      
      const responseData = await response.json();
      console.log(`[PLAN_PROGRESS_DEBUG] received response - status=${responseData.status}, completedSteps=${responseData.completedSteps}, totalSteps=${responseData.totalSteps}, currentStep=${responseData.currentStep?.label || 'none'}`);
      return responseData;
    },
    enabled: !!user && !!planId && isActive,
    refetchInterval: isActive ? 5000 : false, // Poll every 5 seconds only when active
    staleTime: 3000,
  });

  // Update snapshot when we get new data
  useEffect(() => {
    if (data) {
      lastDataRef.current = data;
      console.log(`[PLAN_PROGRESS_DEBUG] updated snapshot - totalSteps=${data.totalSteps}, completedSteps=${data.completedSteps}`);
    }
  }, [data]);

  // Clear snapshot only when planId changes to a different non-null plan
  // When planId becomes null (plan completed), retain the snapshot so terminal plans can show their summaries
  useEffect(() => {
    if (planId !== lastPlanIdRef.current) {
      // Only clear snapshot if we're switching to a new plan (not null)
      if (planId !== null) {
        console.log(`[PLAN_PROGRESS_DEBUG] clearing snapshot - planId changed from ${lastPlanIdRef.current} to ${planId}`);
        lastDataRef.current = null;
      }
      lastPlanIdRef.current = planId;
    }
  }, [planId]);

  if (isActive && planId) {
    console.log(`[PLAN_PROGRESS_DEBUG] polling status - isLoading=${isLoading}, hasData=${!!data}, error=${error ? String(error) : 'none'}`);
  }

  // Use current data if available, otherwise use last snapshot
  const currentData = data || lastDataRef.current;

  // Calculate percent complete
  const percentComplete = currentData?.totalSteps
    ? Math.round((currentData.completedSteps / currentData.totalSteps) * 100)
    : 0;

  return {
    loading: isLoading,
    error: error ? String(error) : undefined,
    goal: currentData?.goal || null,
    planId: currentData?.planId || null,
    totalSteps: currentData?.totalSteps || 0,
    completedSteps: currentData?.completedSteps || 0,
    currentStep: currentData?.currentStep || null,
    status: currentData?.status || "idle",
    steps: currentData?.steps || [],
    lastUpdatedAt: currentData?.lastUpdatedAt,
    percentComplete,
  };
}
