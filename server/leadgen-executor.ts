// SUP-002: LeadGen Plan Execution System
// This handles step-by-step execution of approved plans with real-time progress tracking

import type { LeadGenPlan, LeadGenStep } from './leadgen-plan.js';

export interface StepProgress {
  stepId: string;
  stepIndex: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface PlanExecution {
  planId: string;
  sessionId: string;
  conversationId?: string;
  goal: string;
  steps: LeadGenStep[];
  currentStepIndex: number;
  stepProgress: StepProgress[];
  status: 'pending' | 'executing' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  error?: string;
}

// In-memory execution state
const executions = new Map<string, PlanExecution>();

/**
 * Start executing an approved plan
 */
export async function startPlanExecution(plan: LeadGenPlan): Promise<PlanExecution> {
  console.log(`🚀 Starting execution for plan ${plan.id}`);
  
  // Initialize execution state
  const execution: PlanExecution = {
    planId: plan.id,
    sessionId: plan.sessionId,
    conversationId: plan.conversationId,
    goal: plan.goal,
    steps: plan.steps,
    currentStepIndex: 0,
    stepProgress: plan.steps.map((step, index) => ({
      stepId: step.id,
      stepIndex: index,
      status: 'pending' as const
    })),
    status: 'executing',
    startedAt: new Date().toISOString()
  };
  
  executions.set(plan.id, execution);
  
  // Start background execution
  executeStepsInBackground(execution).catch(error => {
    console.error(`❌ Plan execution failed for ${plan.id}:`, error);
    execution.status = 'failed';
    execution.error = error.message;
    execution.completedAt = new Date().toISOString();
  });
  
  return execution;
}

/**
 * Background executor that processes steps sequentially
 */
async function executeStepsInBackground(execution: PlanExecution): Promise<void> {
  console.log(`⚙️ Background executor started for plan ${execution.planId}`);
  
  // Import updatePlanStatus to persist state back to leadgen-plan
  const { updatePlanStatus } = await import('./leadgen-plan.js');
  
  for (let i = 0; i < execution.steps.length; i++) {
    const step = execution.steps[i];
    const progress = execution.stepProgress[i];
    
    // Update step status to running
    progress.status = 'running';
    progress.startedAt = new Date().toISOString();
    execution.currentStepIndex = i;
    executions.set(execution.planId, execution);
    
    console.log(`▶️ Executing step ${i + 1}/${execution.steps.length}: ${step.label}`);
    
    try {
      // Execute the step
      await executeStep(step, execution);
      
      // Mark step as completed
      progress.status = 'completed';
      progress.completedAt = new Date().toISOString();
      executions.set(execution.planId, execution);
      
      console.log(`✅ Completed step ${i + 1}/${execution.steps.length}: ${step.label}`);
    } catch (error: any) {
      // Mark step as failed
      progress.status = 'failed';
      progress.error = error.message;
      progress.completedAt = new Date().toISOString();
      executions.set(execution.planId, execution);
      
      console.error(`❌ Step ${i + 1}/${execution.steps.length} failed:`, error);
      
      // Stop execution on failure
      execution.status = 'failed';
      execution.error = `Step ${i + 1} failed: ${error.message}`;
      execution.completedAt = new Date().toISOString();
      executions.set(execution.planId, execution);
      
      // Persist failure status back to plan
      updatePlanStatus(execution.planId, 'failed');
      
      console.log(`💾 Persisted failed status to plan ${execution.planId}`);
      return;
    }
  }
  
  // All steps completed
  execution.status = 'completed';
  execution.completedAt = new Date().toISOString();
  executions.set(execution.planId, execution);
  
  // Persist completion status back to plan
  updatePlanStatus(execution.planId, 'completed');
  
  console.log(`🎉 Plan execution completed for ${execution.planId}`);
  console.log(`💾 Persisted completed status to plan ${execution.planId}`);
}

/**
 * Execute a single step
 */
async function executeStep(step: LeadGenStep, execution: PlanExecution): Promise<void> {
  // Simulate step execution with realistic timing
  const baseDelay = step.type === 'search' ? 3000 : 
                    step.type === 'enrich' ? 4000 : 
                    step.type === 'outreach' ? 2000 : 2500;
  
  // Add some randomness to make it feel more realistic
  const delay = baseDelay + Math.random() * 1000;
  
  console.log(`  ⏱️ Step ${step.label} will take ~${Math.round(delay / 1000)}s`);
  
  await new Promise(resolve => setTimeout(resolve, delay));
  
  // In a real implementation, this would:
  // - Call Google Places API for 'search' steps
  // - Call Hunter.io for 'enrich' steps
  // - Call OpenAI for 'outreach' steps
  // - Update databases with results
  
  console.log(`  ✅ Step ${step.label} completed successfully`);
}

/**
 * Get execution state for a plan
 */
export function getPlanExecution(planId: string): PlanExecution | null {
  return executions.get(planId) || null;
}

/**
 * Get execution by session ID (returns most recent execution regardless of status)
 */
export function getExecutionBySession(sessionId: string): PlanExecution | null {
  const sessionExecutions = Array.from(executions.values())
    .filter(exec => exec.sessionId === sessionId)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  
  return sessionExecutions[0] || null;
}

/**
 * Get execution by conversation ID (returns most recent execution regardless of status)
 */
export function getExecutionByConversation(conversationId: string): PlanExecution | null {
  const conversationExecutions = Array.from(executions.values())
    .filter(exec => exec.conversationId === conversationId)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  
  return conversationExecutions[0] || null;
}

/**
 * Cancel a running execution
 */
export function cancelExecution(planId: string): boolean {
  const execution = executions.get(planId);
  if (!execution || execution.status !== 'executing') {
    return false;
  }
  
  execution.status = 'failed';
  execution.error = 'Execution cancelled by user';
  execution.completedAt = new Date().toISOString();
  executions.set(planId, execution);
  
  console.log(`🛑 Execution cancelled for plan ${planId}`);
  return true;
}

/**
 * Get all executions for debugging
 */
export function getAllExecutions(): PlanExecution[] {
  return Array.from(executions.values());
}
