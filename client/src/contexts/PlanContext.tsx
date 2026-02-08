import { createContext, useContext, ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/contexts/UserContext";
import { useCurrentRequest } from "@/contexts/CurrentRequestContext";
import { apiRequest, handleApiError } from "@/lib/queryClient";
import { publishEvent } from "@/lib/events";
import { getCurrentVerticalId } from "@/contexts/VerticalContext";

// FAST DEV MODE: Use fast polling in development
const IS_DEV = import.meta.env.MODE === 'development';
const PLAN_POLL_INTERVAL = IS_DEV ? 500 : 5000; // 500ms in dev, 5s in prod

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
  const { setCurrentClientRequestId, setPinnedClientRequestId } = useCurrentRequest();

  // Fetch current plan from backend - expose raw data, no overrides
  const { data: plan, isLoading, error } = useQuery<LeadGenPlan | null>({
    queryKey: ["/api/plan"],
    enabled: !!user,
    refetchInterval: PLAN_POLL_INTERVAL, // Fast in dev, slow in prod
    staleTime: IS_DEV ? 200 : 3000,
  });

  // Mutation to start a new plan
  const startPlanMutation = useMutation({
    mutationFn: async (goal: string) => {
      // UI-16: Include current vertical in plan request
      const verticalId = getCurrentVerticalId();
      console.log(`[PLAN_DEBUG] startPlan called with goal:`, goal.substring(0, 50) + "...", `vertical: ${verticalId}`);
      
      const response = await apiRequest("POST", "/api/plan/start", {
        goal,
        verticalId,
      });
      const data = await response.json();
      
      console.log(`[PLAN_DEBUG] startPlan response:`, data);
      return { data, goal };
    },
    onSuccess: ({ data, goal }) => {
      // Just invalidate - let the backend provide the new plan
      console.log(`[PLAN_DEBUG] startPlan succeeded - invalidating queries`);
      queryClient.invalidateQueries({ queryKey: ["/api/plan"] });

      // Publish event for plan created
      if (data?.plan?.id) {
        publishEvent("PLAN_CREATED", {
          planId: data.plan.id,
          sessionId: data.plan.sessionId,
          goal,
          stepCount: data.plan.steps?.length || 0,
        });
      }
    },
    onError: (error) => {
      handleApiError(error, "start plan");
    },
  });

  // Mutation to approve a plan
  const approveMutation = useMutation({
    mutationFn: async (planId: string) => {
      const clientRequestId = crypto.randomUUID();
      console.log(`[PLAN_CONTEXT] Calling POST /api/plan/approve for planId=${planId}, clientRequestId=${clientRequestId.slice(0, 8)}...`);
      
      // Set clientRequestId in context BEFORE the API call so LiveActivityPanel starts polling immediately
      setCurrentClientRequestId(clientRequestId);
      setPinnedClientRequestId(clientRequestId);
      
      const response = await apiRequest("POST", "/api/plan/approve", { planId, clientRequestId });
      
      // Check HTTP status first
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[PLAN_CONTEXT] HTTP error ${response.status}:`, errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      
      console.log(`[PLAN_CONTEXT] /api/plan/approve response:`, data);
      console.log(`   ok: ${data.ok}`);
      console.log(`   success: ${data.success}`);
      console.log(`   Status: ${data.status}`);
      console.log(`   PlanId: ${data.planId}`);
      
      // Accept response if ok OR success is true (backwards compatibility)
      if (data.ok || data.success) {
        console.log(`✅ [PLAN_CONTEXT] Approval successful, LiveActivityPanel polling with clientRequestId=${clientRequestId.slice(0, 8)}...`);
        return { data, planId, clientRequestId, success: true };
      }
      
      // If we got here, response was 200 but body indicates failure
      console.error(`[PLAN_CONTEXT] Response body indicates failure:`, data);
      throw new Error(data.error || 'Approval failed');
    },
    onSuccess: ({ data, planId }) => {
      console.log(`✅ [PLAN_CONTEXT] Plan approved and execution started on backend`);
      console.log(`   Backend status: ${data.status}`);
      
      // Invalidate plan query so UI updates
      queryClient.invalidateQueries({ queryKey: ["/api/plan"] });

      // Publish event for plan approved
      publishEvent("PLAN_APPROVED", {
        planId,
        sessionId: plan?.sessionId,
      });
    },
    onError: (error) => {
      console.error(`❌ [PLAN_CONTEXT] Approve plan failed:`, error);
      handleApiError(error, "approve plan");
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
      handleApiError(error, "regenerate plan");
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
