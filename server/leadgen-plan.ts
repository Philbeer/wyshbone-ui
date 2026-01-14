// LeadGen Plan structures and utilities for UI-030
// This adds a plan approval step before Supervisor execution
// Now persists to database via storage layer

import { storage } from './storage';
import type { InsertLeadGenPlan, SelectLeadGenPlan } from '../shared/schema';

export interface LeadGenStep {
  id: string;
  type: 'search' | 'enrich' | 'outreach' | 'fallback';
  label: string;
  description: string;
  estimatedTime?: string;
  // Execution state (persisted during plan run)
  stepStatus?: 'pending' | 'running' | 'completed' | 'failed';
  resultSummary?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  leadsCreated?: number; // For search steps: how many leads were saved
}

export interface LeadGenPlan {
  id: string;
  userId: string;  // Plans are keyed by userId for cross-session visibility
  sessionId: string;  // Still track sessionId for reference
  conversationId?: string;
  goal: string;
  steps: LeadGenStep[];
  createdAt: string;
  status: 'pending_approval' | 'approved' | 'rejected' | 'executing' | 'completed' | 'failed';
  supervisorTaskId?: string;
  // Metadata for tool execution
  toolMetadata?: {
    toolName: string;
    toolArgs: any;
    userId: string;
  };
}

// Convert database row to LeadGenPlan interface
function dbRowToPlan(row: SelectLeadGenPlan): LeadGenPlan {
  return {
    id: row.id,
    userId: row.userId,
    sessionId: row.sessionId,
    conversationId: row.conversationId || undefined,
    goal: row.goal,
    steps: row.steps as LeadGenStep[],
    createdAt: new Date(row.createdAt).toISOString(),
    status: row.status as LeadGenPlan['status'],
    supervisorTaskId: row.supervisorTaskId || undefined,
    toolMetadata: row.toolMetadata as LeadGenPlan['toolMetadata'] | undefined,
  };
}

// Convert LeadGenPlan interface to database insert format
function planToDbRow(plan: LeadGenPlan): InsertLeadGenPlan {
  const now = Date.now();
  return {
    id: plan.id,
    userId: plan.userId,
    sessionId: plan.sessionId,
    conversationId: plan.conversationId || null,
    goal: plan.goal,
    steps: plan.steps,
    status: plan.status,
    supervisorTaskId: plan.supervisorTaskId || null,
    toolMetadata: plan.toolMetadata || null,
    createdAt: new Date(plan.createdAt).getTime(),
    updatedAt: now,
  };
}

export async function createLeadGenPlan(
  userId: string,
  sessionId: string,
  goal: string,
  conversationId?: string
): Promise<LeadGenPlan> {
  const planId = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  
  // Generate steps based on the goal
  // This is a simplified version - in production, this would be done by Supervisor (SUP-001)
  const steps: LeadGenStep[] = [
    {
      id: `step_1`,
      type: 'search',
      label: 'Search Wyshbone Global Database',
      description: 'Find businesses matching your criteria',
      estimatedTime: '1-2 minutes'
    },
    {
      id: `step_2`,
      type: 'enrich',
      label: 'Enrich Contact Data',
      description: 'Find verified email addresses and contact details',
      estimatedTime: '2-3 minutes'
    },
    {
      id: `step_3`,
      type: 'outreach',
      label: 'Prepare Outreach',
      description: 'Generate personalized outreach messages',
      estimatedTime: '1 minute'
    }
  ];

  const plan: LeadGenPlan = {
    id: planId,
    userId,
    sessionId,
    conversationId,
    goal,
    steps,
    createdAt: new Date().toISOString(),
    status: 'pending_approval'
  };

  // Persist to database
  try {
    await storage.createLeadGenPlan(planToDbRow(plan));
    console.log(`✅ Created LeadGenPlan: ${planId} for user ${userId}, session ${sessionId}`);
  } catch (error) {
    console.error(`❌ Failed to create LeadGenPlan in database: ${error}`);
    throw error;
  }
  
  return plan;
}

export async function getPlanByUserId(userId: string): Promise<LeadGenPlan | null> {
  // Find the most recent active plan for this user (pending, approved, or executing)
  // Exclude terminal states (completed, failed, rejected) so they don't persist in the UI
  const activeStatuses: LeadGenPlan['status'][] = ['pending_approval', 'approved', 'executing'];
  
  try {
    const plans = await storage.listLeadGenPlans(userId);
    const activePlans = plans
      .filter(p => activeStatuses.includes(p.status as LeadGenPlan['status']))
      .sort((a, b) => b.createdAt - a.createdAt);
    
    return activePlans.length > 0 ? dbRowToPlan(activePlans[0]) : null;
  } catch (error) {
    console.error(`Error getting plan by userId ${userId}:`, error);
    return null;
  }
}

// Deprecated: Keep for backwards compatibility
export async function getPlanBySession(sessionId: string): Promise<LeadGenPlan | null> {
  // Deprecated - plans are now keyed by userId. This function exists for backwards compatibility.
  console.warn('getPlanBySession is deprecated - use getPlanByUserId instead');
  // We can't efficiently query by sessionId with current storage interface
  // Return null for now - callers should migrate to getPlanByUserId
  return null;
}

export async function getPlanById(planId: string): Promise<LeadGenPlan | null> {
  try {
    const row = await storage.getLeadGenPlan(planId);
    return row ? dbRowToPlan(row) : null;
  } catch (error) {
    console.error(`Error getting plan ${planId}:`, error);
    return null;
  }
}

export async function approvePlan(planId: string): Promise<LeadGenPlan | null> {
  try {
    const updated = await storage.updateLeadGenPlan(planId, { status: 'approved' });
    if (!updated) {
      return null;
    }
    
    console.log(`✅ Plan approved: ${planId}`);
    return dbRowToPlan(updated);
  } catch (error) {
    console.error(`Error approving plan ${planId}:`, error);
    return null;
  }
}

export async function rejectPlan(planId: string): Promise<LeadGenPlan | null> {
  try {
    const updated = await storage.updateLeadGenPlan(planId, { status: 'rejected' });
    if (!updated) {
      return null;
    }
    
    console.log(`❌ Plan rejected: ${planId}`);
    return dbRowToPlan(updated);
  } catch (error) {
    console.error(`Error rejecting plan ${planId}:`, error);
    return null;
  }
}

export async function updatePlanStatus(
  planId: string, 
  status: LeadGenPlan['status'], 
  supervisorTaskId?: string
): Promise<void> {
  try {
    const updates: Partial<InsertLeadGenPlan> = { status };
    if (supervisorTaskId) {
      updates.supervisorTaskId = supervisorTaskId;
    }
    await storage.updateLeadGenPlan(planId, updates);
  } catch (error) {
    console.error(`Error updating plan status for ${planId}:`, error);
  }
}

// Helper to update plan with custom metadata (for tool execution context)
export async function updatePlanMetadata(
  planId: string,
  toolMetadata: LeadGenPlan['toolMetadata']
): Promise<void> {
  try {
    await storage.updateLeadGenPlan(planId, { toolMetadata });
  } catch (error) {
    console.error(`Error updating plan metadata for ${planId}:`, error);
  }
}

/**
 * Update step progress in the plan (persisted to database)
 * This makes plan execution crash-safe - state is recovered from DB on restart
 */
export async function updateStepProgress(
  planId: string,
  stepId: string,
  update: Partial<Pick<LeadGenStep, 'stepStatus' | 'resultSummary' | 'error' | 'startedAt' | 'completedAt' | 'leadsCreated'>>
): Promise<void> {
  try {
    // Get current plan
    const plan = await getPlanById(planId);
    if (!plan) {
      console.error(`[STEP_PERSIST] Plan ${planId} not found`);
      return;
    }
    
    // Find and update the step
    const updatedSteps = plan.steps.map(step => {
      if (step.id === stepId) {
        return { ...step, ...update };
      }
      return step;
    });
    
    // Persist to database
    await storage.updateLeadGenPlan(planId, { steps: updatedSteps });
    console.log(`💾 [STEP_PERSIST] Updated step ${stepId} in plan ${planId}: ${update.stepStatus || 'update'}`);
  } catch (error) {
    console.error(`❌ [STEP_PERSIST] Error updating step ${stepId} in plan ${planId}:`, error);
  }
}

/**
 * Get plan execution status from the database
 * Returns computed execution state from persisted step data
 */
export async function getPlanExecutionStatus(planId: string): Promise<{
  status: 'pending' | 'executing' | 'completed' | 'failed';
  steps: LeadGenStep[];
  currentStepIndex: number;
  completedSteps: number;
  totalSteps: number;
  goal: string;
  error?: string;
} | null> {
  const plan = await getPlanById(planId);
  if (!plan) return null;
  
  const steps = plan.steps;
  const totalSteps = steps.length;
  
  // Count completed and find current step
  let completedSteps = 0;
  let currentStepIndex = 0;
  let hasFailure = false;
  let errorMessage: string | undefined;
  
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.stepStatus === 'completed') {
      completedSteps++;
    } else if (step.stepStatus === 'failed') {
      hasFailure = true;
      errorMessage = step.error;
      currentStepIndex = i;
      break;
    } else if (step.stepStatus === 'running') {
      currentStepIndex = i;
      break;
    } else if (step.stepStatus === 'pending' || !step.stepStatus) {
      currentStepIndex = i;
      break;
    }
  }
  
  // Determine overall status
  let status: 'pending' | 'executing' | 'completed' | 'failed' = 'pending';
  if (hasFailure) {
    status = 'failed';
  } else if (completedSteps === totalSteps) {
    status = 'completed';
  } else if (completedSteps > 0 || steps.some(s => s.stepStatus === 'running')) {
    status = 'executing';
  } else if (plan.status === 'executing') {
    status = 'executing';
  }
  
  return {
    status,
    steps,
    currentStepIndex,
    completedSteps,
    totalSteps,
    goal: plan.goal,
    error: errorMessage,
  };
}
