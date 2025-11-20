import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/contexts/UserContext";
import { addDevAuthParams } from "@/lib/queryClient";

export interface PlanProgress {
  loading: boolean;
  error?: string;
  goal: string | null;
  planId: string | null;
  totalSteps: number;
  completedSteps: number;
  currentStep?: {
    id: string;
    label: string;
    status: "pending" | "running" | "completed" | "failed";
  } | null;
  lastUpdatedAt?: string;
  percentComplete: number;
}

interface PlanStatusResponse {
  goal: string | null;
  planId: string | null;
  totalSteps: number;
  completedSteps: number;
  currentStep?: {
    id: string;
    label: string;
    status: "pending" | "running" | "completed" | "failed";
  } | null;
  lastUpdatedAt: string;
}

export function usePlanProgress(planId: string | null, isActive: boolean): PlanProgress {
  const { user } = useUser();

  console.log(`[PLAN_PROGRESS_DEBUG] hook called - planId=${planId}, isActive=${isActive}, enabled=${!!user && !!planId && isActive}`);

  const { data, isLoading, error } = useQuery<PlanStatusResponse>({
    queryKey: ["/api/plan-status", planId],
    queryFn: async () => {
      if (!planId) {
        throw new Error("No planId provided");
      }
      
      // Build URL with planId query parameter
      const url = addDevAuthParams(`/api/plan-status?planId=${encodeURIComponent(planId)}`);
      console.log(`[PLAN_PROGRESS_DEBUG] fetching /api/plan-status for planId=${planId}, url=${url}`);
      
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`[PLAN_PROGRESS_DEBUG] fetch failed - status=${response.status}, statusText=${response.statusText}`);
        throw new Error(`Failed to fetch plan status: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log(`[PLAN_PROGRESS_DEBUG] received response - status=${data.status}, completedSteps=${data.completedSteps}, totalSteps=${data.totalSteps}, currentStep=${data.currentStep?.label || 'none'}`);
      return data;
    },
    enabled: !!user && !!planId && isActive,
    refetchInterval: isActive ? 5000 : false, // Poll every 5 seconds only when active
    staleTime: 3000,
  });

  if (isActive && planId) {
    console.log(`[PLAN_PROGRESS_DEBUG] polling status - isLoading=${isLoading}, hasData=${!!data}, error=${error ? String(error) : 'none'}`);
  }

  // Calculate percent complete
  const percentComplete = data?.totalSteps
    ? Math.round((data.completedSteps / data.totalSteps) * 100)
    : 0;

  return {
    loading: isLoading,
    error: error ? String(error) : undefined,
    goal: data?.goal || null,
    planId: data?.planId || null,
    totalSteps: data?.totalSteps || 0,
    completedSteps: data?.completedSteps || 0,
    currentStep: data?.currentStep || null,
    lastUpdatedAt: data?.lastUpdatedAt,
    percentComplete,
  };
}
