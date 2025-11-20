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

  // Fetch current plan from backend
  const { data: plan, isLoading, error } = useQuery<LeadGenPlan | null>({
    queryKey: ["/api/plan"],
    enabled: !!user,
    refetchInterval: 5000, // Poll every 5 seconds for plan updates
    staleTime: 3000,
  });

  // Mutation to start a new plan
  const startPlanMutation = useMutation({
    mutationFn: async (goal: string) => {
      console.log(`🚀 usePlanForApproval: startPlanMutation called with goal:`, goal.substring(0, 50) + "...");
      
      const conversationId = localStorage.getItem('currentConversationId') || undefined;
      const response = await apiRequest("POST", "/api/plan/start", {
        goal,
        conversationId,
      });
      const data = await response.json();
      
      console.log(`✅ usePlanForApproval: plan/start response:`, data);
      return data;
    },
    onSuccess: (data) => {
      console.log(`✅ usePlanForApproval: plan created, planId:`, data.plan?.id);
      // Invalidate plan query to refetch the new plan
      queryClient.invalidateQueries({ queryKey: ["/api/plan"] });
    },
    onError: (error) => {
      console.error(`❌ usePlanForApproval: plan start failed:`, error);
    },
  });

  // Mutation to approve a plan
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

  // Mutation to regenerate a plan
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
    planId: plan?.id || null,
    status: plan?.status || 'idle',
    startPlan: (goal: string) => startPlanMutation.mutateAsync(goal),
    approvePlan: (planId: string) => approveMutation.mutateAsync(planId),
    regeneratePlan: (planId: string) => regenerateMutation.mutateAsync(planId),
    starting: startPlanMutation.isPending,
    approving: approveMutation.isPending,
    regenerating: regenerateMutation.isPending,
    error: error ? String(error) : undefined,
  };
}
