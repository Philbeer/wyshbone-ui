import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/contexts/UserContext";
import { apiRequest } from "@/lib/queryClient";

export interface LeadGenStep {
  id: string;
  type: 'search' | 'enrich' | 'outreach' | 'fallback';
  label: string;
  description: string;
  estimatedTime?: string;
}

export interface LeadGenPlan {
  id: string;
  sessionId: string;
  conversationId?: string;
  goal: string;
  steps: LeadGenStep[];
  createdAt: string;
  status: 'pending_approval' | 'approved' | 'rejected' | 'executing' | 'completed' | 'failed';
  supervisorTaskId?: string;
}

export function usePlanForApproval() {
  const { user } = useUser();
  const queryClient = useQueryClient();

  const { data: plan, isLoading, error } = useQuery<LeadGenPlan | null>({
    queryKey: ["/api/plan"],
    enabled: !!user,
    refetchInterval: 5000, // Poll every 5 seconds for plan updates
    staleTime: 3000,
  });

  const approveMutation = useMutation({
    mutationFn: async (planId: string) => {
      return await apiRequest("/api/plan/approve", {
        method: "POST",
        body: JSON.stringify({ planId }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      // Invalidate plan query to refetch
      queryClient.invalidateQueries({ queryKey: ["/api/plan"] });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: async (planId: string) => {
      return await apiRequest("/api/plan/regenerate", {
        method: "POST",
        body: JSON.stringify({ planId }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      // Invalidate plan query to refetch
      queryClient.invalidateQueries({ queryKey: ["/api/plan"] });
    },
  });

  return {
    loading: isLoading,
    plan: plan || null,
    approvePlan: (planId: string) => approveMutation.mutateAsync(planId),
    regeneratePlan: (planId: string) => regenerateMutation.mutateAsync(planId),
    approving: approveMutation.isPending,
    regenerating: regenerateMutation.isPending,
    error: error ? String(error) : undefined,
  };
}
