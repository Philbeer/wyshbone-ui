import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/contexts/UserContext";
import { apiRequest } from "@/lib/queryClient";
import { useState, useEffect } from "react";

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
  goal: string;
  steps: LeadGenStep[];
  createdAt: string;
  status: 'pending_approval' | 'approved' | 'rejected' | 'executing' | 'completed' | 'failed';
  supervisorTaskId?: string;
}

export function usePlanForApproval() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  
  // Maintain local state for active plan tracking
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<string>('idle');

  // Fetch current plan from backend
  const { data: plan, isLoading, error } = useQuery<LeadGenPlan | null>({
    queryKey: ["/api/plan"],
    enabled: !!user,
    refetchInterval: 5000, // Poll every 5 seconds for plan updates
    staleTime: 3000,
  });

  // Sync local state with plan data from query
  useEffect(() => {
    if (plan) {
      // Update local state when we get a plan from the backend
      setActivePlanId(plan.id);
      setActiveStatus(plan.status);
      console.log('[usePlanForApproval] synced state from query - planId:', plan.id, 'status:', plan.status);
    }
  }, [plan]);

  // Mutation to start a new plan
  const startPlanMutation = useMutation({
    mutationFn: async (goal: string) => {
      console.log(`🚀 usePlanForApproval: startPlanMutation called with goal:`, goal.substring(0, 50) + "...");
      
      const response = await apiRequest("POST", "/api/plan/start", {
        goal,
      });
      const data = await response.json();
      
      console.log(`✅ usePlanForApproval: plan/start response:`, data);
      return data;
    },
    onSuccess: (data) => {
      console.log(`✅ usePlanForApproval: plan created, planId:`, data.plan?.id);
      // Set local state
      if (data.plan) {
        setActivePlanId(data.plan.id);
        setActiveStatus(data.plan.status || 'pending_approval');
        console.log('[usePlanForApproval] set local state after startPlan - planId:', data.plan.id, 'status:', data.plan.status);
      }
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
      return { data, planId };
    },
    onSuccess: ({ planId }) => {
      console.log(`✅ usePlanForApproval: plan approved, setting status to executing for planId: ${planId}`);
      // Keep the planId and set status to executing
      setActivePlanId(planId);
      setActiveStatus('executing');
      console.log('[usePlanForApproval] set local state after approvePlan - planId:', planId, 'status: executing');
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

  console.log('[usePlanForApproval] current state - activePlanId:', activePlanId, 'activeStatus:', activeStatus, 'plan from query:', plan?.id);

  return {
    loading: isLoading,
    plan: plan || null,
    planId: activePlanId, // Use local state instead of plan data
    status: activeStatus,  // Use local state instead of plan data
    startPlan: (goal: string) => startPlanMutation.mutateAsync(goal),
    approvePlan: (planId: string) => approveMutation.mutateAsync(planId),
    regeneratePlan: (planId: string) => regenerateMutation.mutateAsync(planId),
    starting: startPlanMutation.isPending,
    approving: approveMutation.isPending,
    regenerating: regenerateMutation.isPending,
    error: error ? String(error) : undefined,
  };
}
