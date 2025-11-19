import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/contexts/UserContext";

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

export function usePlanProgress(conversationId?: string): PlanProgress {
  const { user } = useUser();

  const { data, isLoading, error } = useQuery<PlanStatusResponse>({
    queryKey: conversationId ? ["/api/plan-status", conversationId] : ["/api/plan-status"],
    enabled: !!user,
    refetchInterval: 5000, // Poll every 5 seconds
    staleTime: 3000,
  });

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
