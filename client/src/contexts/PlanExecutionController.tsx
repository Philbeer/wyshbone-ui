import { createContext, useContext, ReactNode, useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUser } from './UserContext';
import { authedFetch } from '@/lib/queryClient';

interface ExecutionState {
  isExecuting: boolean;
  shouldPoll: boolean;
  activePlanId: string | null;
  status: 'idle' | 'executing' | 'completed' | 'failed';
  startExecution: (planId: string) => void;
}

const ExecutionContext = createContext<ExecutionState | undefined>(undefined);

interface PlanStatusResponse {
  status: 'executing' | 'completed' | 'failed';
  planId: string;
  goal?: string;
}

export function PlanExecutionProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  
  // Query /api/plan-status to get current execution status
  const { data: statusData } = useQuery<PlanStatusResponse>({
    queryKey: ['/api/plan-status', activePlanId],
    queryFn: async () => {
      if (!activePlanId) throw new Error('No active plan');
      
      console.log(`[EXECUTION_CONTROLLER] fetching status for ${activePlanId}`);
      const response = await authedFetch(`/api/plan-status?planId=${encodeURIComponent(activePlanId)}`);
      if (!response.ok) throw new Error('Failed to fetch plan status');
      const data = await response.json();
      console.log(`[EXECUTION_CONTROLLER] received status: ${data.status}`);
      return data;
    },
    enabled: !!user && !!activePlanId,
    refetchInterval: activePlanId ? 3000 : false,
  });

  const status = statusData?.status || (activePlanId ? 'executing' : 'idle');
  const shouldPoll = status === 'executing';
  
  // Log when status becomes terminal
  useEffect(() => {
    if (statusData && (statusData.status === 'completed' || statusData.status === 'failed')) {
      console.log(`\n========================================`);
      console.log(`🏁 [EXECUTION_CONTROLLER] Execution finished!`);
      console.log(`   Plan: ${activePlanId}`);
      console.log(`   Status: ${statusData.status}`);
      console.log(`========================================\n`);
      // Keep activePlanId so progress widget can show final state
      // It will be cleared when a new plan starts
    }
  }, [statusData, activePlanId]);
  
  const startExecution = useCallback((planId: string) => {
    console.log(`\n========================================`);
    console.log(`▶️ [EXECUTION_CONTROLLER] Starting to poll status for plan ${planId}`);
    console.log(`========================================\n`);
    setActivePlanId(planId);
  }, []);
  
  const value: ExecutionState = {
    isExecuting: status === 'executing',
    shouldPoll,
    activePlanId,
    status,
    startExecution,
  };
  
  console.log(`[EXECUTION_CONTROLLER] state - activePlanId=${activePlanId}, status=${status}, shouldPoll=${shouldPoll}`);
  
  return <ExecutionContext.Provider value={value}>{children}</ExecutionContext.Provider>;
}

export function usePlanExecution() {
  const context = useContext(ExecutionContext);
  if (context === undefined) {
    throw new Error('usePlanExecution must be used within PlanExecutionProvider');
  }
  return context;
}
