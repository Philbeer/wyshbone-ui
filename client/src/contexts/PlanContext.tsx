import { createContext, useContext, ReactNode } from "react";
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
  goal: string;
  steps: LeadGenStep[];
  createdAt: string;
  status: 'pending_approval' | 'approved' | 'rejected' | 'executing' | 'completed' | 'failed';
  supervisorTaskId?: string;
}

interface PlanContextValue {
  loading: boolean;
  plan: LeadGenPlan | null;
  planId: string | null;
  status: string;
  startPlan: (goal: string) => Promise<any>;
  approvePlan: (planId: string) => Promise<any>;
  regeneratePlan: (planId: string) => Promise<any>;
  starting: boolean;
  approving: boolean;
  regenerating: boolean;
  error?: string;
}

const PlanContext = createContext<PlanContextValue | undefined>(undefined);

export function PlanProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const queryClient = useQueryClient();

  // Fetch current plan from backend - expose raw data, no overrides
  const { data: plan, isLoading, error } = useQuery<LeadGenPlan | null>({
    queryKey: ["/api/plan"],
    enabled: !!user,
    refetchInterval: 5000, // Poll every 5 seconds for plan updates
    staleTime: 3000,
  });

  // Mutation to start a new plan
  const startPlanMutation = useMutation({
    mutationFn: async (goal: string) => {
      console.log(`[PLAN_DEBUG] startPlan called with goal:`, goal.substring(0, 50) + "...");
      
      const response = await apiRequest("POST", "/api/plan/start", {
        goal,
      });
      const data = await response.json();
      
      console.log(`[PLAN_DEBUG] startPlan response:`, data);
      return data;
    },
    onSuccess: () => {
      // Just invalidate - let the backend provide the new plan
      console.log(`[PLAN_DEBUG] startPlan succeeded - invalidating queries`);
      queryClient.invalidateQueries({ queryKey: ["/api/plan"] });
    },
    onError: (error) => {
      console.error(`[PLAN_DEBUG] startPlan failed:`, error);
    },
  });

  // Mutation to approve a plan
  const approveMutation = useMutation({
    mutationFn: async (planId: string) => {
      console.log(`[PLAN_DEBUG] approvePlan called for planId=${planId}`);
      
      const response = await apiRequest("POST", "/api/plan/approve", { planId });
      const data = await response.json();
      
      console.log(`[PLAN_DEBUG] approvePlan API response:`, data);
      return { data, planId };
    },
    onSuccess: () => {
      // Just invalidate - let the backend update the status
      console.log(`[PLAN_DEBUG] approvePlan succeeded - invalidating queries`);
      queryClient.invalidateQueries({ queryKey: ["/api/plan"] });
    },
    onError: (error) => {
      console.error(`[PLAN_DEBUG] approvePlan failed:`, error);
    },
  });

  // Mutation to regenerate a plan
  const regenerateMutation = useMutation({
    mutationFn: async (planId: string) => {
      console.log(`🔄 PlanContext: regenerateMutation called with planId: ${planId}`);
      
      const response = await apiRequest("POST", "/api/plan/regenerate", { planId });
      const data = await response.json();
      
      console.log(`✅ PlanContext: regenerate response:`, data);
      return data;
    },
    onSuccess: () => {
      console.log(`✅ PlanContext: invalidating plan query after regenerate`);
      // Invalidate plan query to refetch
      queryClient.invalidateQueries({ queryKey: ["/api/plan"] });
    },
    onError: (error) => {
      console.error(`❌ PlanContext: regeneration failed:`, error);
    },
  });

  console.log(`[PLAN_DEBUG] PlanContext - planId=${plan?.id || 'null'}, status=${plan?.status || 'null'}`);

  const value: PlanContextValue = {
    loading: isLoading,
    plan: plan || null,
    planId: plan?.id || null, // Direct from backend, no overrides
    status: plan?.status || 'idle', // Direct from backend, no overrides
    startPlan: (goal: string) => startPlanMutation.mutateAsync(goal),
    approvePlan: (planId: string) => approveMutation.mutateAsync(planId),
    regeneratePlan: (planId: string) => regenerateMutation.mutateAsync(planId),
    starting: startPlanMutation.isPending,
    approving: approveMutation.isPending,
    regenerating: regenerateMutation.isPending,
    error: error ? String(error) : undefined,
  };

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  const context = useContext(PlanContext);
  if (context === undefined) {
    throw new Error('usePlan must be used within a PlanProvider');
  }
  return context;
}
