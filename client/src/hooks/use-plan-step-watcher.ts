/**
 * Hook to watch for plan step/completion and trigger callbacks
 * 
 * Use cases:
 * - Auto-refresh leads when places_search step completes
 * - Refetch data when plan fully completes
 */

import { useEffect, useRef } from 'react';
import { usePlanProgress } from './use-plan-progress';
import { usePlanExecution } from '@/contexts/PlanExecutionController';

export interface StepCompletionCallback {
  /** Step type to watch for (e.g., 'search', 'places_search') */
  stepType: string;
  /** Callback when step completes */
  onComplete: () => void;
}

/**
 * Watch for plan step completions and trigger callbacks
 * 
 * @example
 * usePlanStepWatcher([
 *   { stepType: 'search', onComplete: () => refetchLeads() },
 *   { stepType: 'places_search', onComplete: () => refetchLeads() }
 * ]);
 */
export function usePlanStepWatcher(callbacks: StepCompletionCallback[]) {
  const { activePlanId, shouldPoll } = usePlanExecution();
  const progress = usePlanProgress(activePlanId, shouldPoll);
  
  // Track which step completions we've already triggered
  const triggeredRef = useRef<Set<string>>(new Set());
  
  // Reset triggered set when plan changes
  useEffect(() => {
    if (activePlanId) {
      triggeredRef.current = new Set();
    }
  }, [activePlanId]);
  
  // Watch for step completions
  useEffect(() => {
    if (!progress.steps || progress.steps.length === 0) return;
    
    for (const step of progress.steps) {
      // Only trigger for completed steps
      if (step.status !== 'completed') continue;
      
      // Create unique key for this step completion
      const completionKey = `${activePlanId}-${step.id}`;
      if (triggeredRef.current.has(completionKey)) continue;
      
      // Check if any callback matches this step type
      const matchingCallbacks = callbacks.filter(
        cb => cb.stepType === step.type || 
              cb.stepType === 'search' && step.type === 'places_search' ||
              cb.stepType === 'places_search' && step.type === 'search'
      );
      
      for (const callback of matchingCallbacks) {
        console.log(`[STEP_WATCHER] Step "${step.type}" completed, triggering callback for "${callback.stepType}"`);
        triggeredRef.current.add(completionKey);
        callback.onComplete();
      }
    }
  }, [progress.steps, activePlanId, callbacks]);
}

/**
 * Watch for plan completion (success or failure) and trigger callback
 */
export function usePlanCompletionWatcher(onComplete: () => void) {
  const { activePlanId, status } = usePlanExecution();
  const prevStatusRef = useRef<string | null>(null);
  const triggeredRef = useRef<Set<string>>(new Set());
  
  useEffect(() => {
    // Only trigger when status transitions TO completed/failed FROM executing
    if (!activePlanId) return;
    
    const completionKey = `${activePlanId}-completion`;
    
    if (
      (status === 'completed' || status === 'failed') &&
      prevStatusRef.current === 'executing' &&
      !triggeredRef.current.has(completionKey)
    ) {
      console.log(`[PLAN_WATCHER] Plan ${activePlanId} completed with status: ${status}`);
      triggeredRef.current.add(completionKey);
      onComplete();
    }
    
    prevStatusRef.current = status;
  }, [activePlanId, status, onComplete]);
  
  // Reset when plan changes
  useEffect(() => {
    if (activePlanId) {
      prevStatusRef.current = null;
    }
  }, [activePlanId]);
}

/**
 * Convenience hook to refresh leads when search step completes OR when plan completes
 */
export function useRefreshLeadsOnSearch(refetchLeads: () => void) {
  // Refresh on search step completion
  usePlanStepWatcher([
    { stepType: 'search', onComplete: refetchLeads },
    { stepType: 'places_search', onComplete: refetchLeads }
  ]);
  
  // Also refresh when entire plan completes (as backup)
  usePlanCompletionWatcher(refetchLeads);
}

