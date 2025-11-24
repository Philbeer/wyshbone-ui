import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { usePlan } from "./PlanContext";

interface ExecutionState {
  isExecuting: boolean;
  shouldPoll: boolean;
}

const ExecutionContext = createContext<ExecutionState | undefined>(undefined);

export function PlanExecutionProvider({ children }: { children: ReactNode }) {
  const { plan, status } = usePlan();
  const lastSeenStatusRef = useRef<string>('idle');
  
  // Derive shouldPoll directly from status - no state needed!
  const shouldPoll = status === 'executing';
  
  // Track status transitions for logging (optional)
  useEffect(() => {
    if (status !== lastSeenStatusRef.current) {
      console.log(`[EXECUTION_CONTROLLER] status transition: ${lastSeenStatusRef.current} → ${status}, shouldPoll: ${shouldPoll}`);
      lastSeenStatusRef.current = status;
    }
  }, [status, shouldPoll]);
  
  const value: ExecutionState = {
    isExecuting: status === 'executing',
    shouldPoll,
  };
  
  console.log(`[EXECUTION_CONTROLLER] state - status=${status}, planId=${plan?.id || 'null'}, shouldPoll=${shouldPoll}`);
  
  return <ExecutionContext.Provider value={value}>{children}</ExecutionContext.Provider>;
}

export function usePlanExecution() {
  const context = useContext(ExecutionContext);
  if (context === undefined) {
    throw new Error('usePlanExecution must be used within a PlanExecutionProvider');
  }
  return context;
}
