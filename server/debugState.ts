/**
 * Debug State Module
 * 
 * DEV-ONLY: Stores execution debug information in memory for the /api/debug/last-plan endpoint.
 * This helps developers inspect the last plan execution without digging through logs.
 */

export interface DebugPlanState {
  lastPlanId: string | null;
  status: 'pending' | 'approved' | 'executing' | 'completed' | 'failed' | null;
  lastStep: string | null;
  error: string | null;
  leadsInserted: number;
  updatedAt: string;
}

// In-memory debug state
let debugState: DebugPlanState = {
  lastPlanId: null,
  status: null,
  lastStep: null,
  error: null,
  leadsInserted: 0,
  updatedAt: new Date().toISOString(),
};

/**
 * Get the current debug state
 */
export function getDebugState(): DebugPlanState {
  return { ...debugState };
}

/**
 * Update debug state when plan is approved
 */
export function debugOnPlanApproval(planId: string): void {
  debugState = {
    lastPlanId: planId,
    status: 'approved',
    lastStep: null,
    error: null,
    leadsInserted: 0,
    updatedAt: new Date().toISOString(),
  };
  console.log(`🐛 [DEBUG] Plan approved: ${planId}`);
}

/**
 * Update debug state when execution starts
 */
export function debugOnExecutionStart(planId: string): void {
  debugState = {
    ...debugState,
    lastPlanId: planId,
    status: 'executing',
    lastStep: 'Starting execution',
    error: null,
    updatedAt: new Date().toISOString(),
  };
  console.log(`🐛 [DEBUG] Execution started: ${planId}`);
}

/**
 * Update debug state for each execution step
 */
export function debugOnStepProgress(planId: string, stepLabel: string, stepStatus: 'running' | 'completed' | 'failed'): void {
  debugState = {
    ...debugState,
    lastPlanId: planId,
    status: 'executing',
    lastStep: `${stepLabel} (${stepStatus})`,
    updatedAt: new Date().toISOString(),
  };
  console.log(`🐛 [DEBUG] Step progress: ${stepLabel} - ${stepStatus}`);
}

/**
 * Update debug state when leads are persisted
 */
export function debugOnLeadsPersisted(planId: string, insertedCount: number): void {
  debugState = {
    ...debugState,
    lastPlanId: planId,
    leadsInserted: debugState.leadsInserted + insertedCount,
    updatedAt: new Date().toISOString(),
  };
  console.log(`🐛 [DEBUG] Leads persisted: +${insertedCount} (total: ${debugState.leadsInserted})`);
}

/**
 * Update debug state when execution completes successfully
 */
export function debugOnExecutionComplete(planId: string): void {
  debugState = {
    ...debugState,
    lastPlanId: planId,
    status: 'completed',
    lastStep: 'Execution completed',
    updatedAt: new Date().toISOString(),
  };
  console.log(`🐛 [DEBUG] Execution completed: ${planId}`);
}

/**
 * Update debug state when execution fails
 */
export function debugOnExecutionFailure(planId: string, error: string): void {
  debugState = {
    ...debugState,
    lastPlanId: planId,
    status: 'failed',
    error: error,
    updatedAt: new Date().toISOString(),
  };
  console.log(`🐛 [DEBUG] Execution failed: ${planId} - ${error}`);
}

