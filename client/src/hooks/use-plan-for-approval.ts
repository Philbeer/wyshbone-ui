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
      console.log(`🔄 usePlanForApproval: approveMutation called with planId: ${planId}`);
      
      const response = await apiRequest("POST", "/api/plan/approve", { planId });
      const data = await response.json();
      
      console.log(`✅ usePlanForApproval: approval response:`, data);
      return data;
    },
    onSuccess: () => {
      console.log(`✅ usePlanForApproval: invalidating plan query`);
      // Invalidate plan query to refetch
      queryClient.invalidateQueries({ queryKey: ["/api/plan"] });
    },
    onError: (error) => {
      console.error(`❌ usePlanForApproval: approval failed:`, error);
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: async (planId: string) => {
      console.log(`🔄 usePlanForApproval: regenerateMutation called with planId: ${planId}`);
      
      const response = await apiRequest("POST", "/api/plan/regenerate", { planId });
      const data = await response.json();
      
      console.log(`✅ usePlanForApproval: regenerate response:`, data);
      return data;
    },
    onSuccess: () => {
      console.log(`✅ usePlanForApproval: invalidating plan query after regenerate`);
      // Invalidate plan query to refetch
      queryClient.invalidateQueries({ queryKey: ["/api/plan"] });
    },
    onError: (error) => {
      console.error(`❌ usePlanForApproval: regeneration failed:`, error);
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
