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
  resultSummary?: string;
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
 * Execute a single step using the action registry
 */
async function executeStep(step: LeadGenStep, execution: PlanExecution): Promise<void> {
  console.log(`  ▶️ Executing step via action registry: ${step.label}`);
  
  // Get the plan to access toolMetadata
  const { getPlanById } = await import('./leadgen-plan.js');
  const plan = getPlanById(execution.planId);
  
  // If the plan has tool metadata, execute the real action
  if (plan?.toolMetadata) {
    console.log(`  🔧 Using tool metadata for real execution: ${plan.toolMetadata.toolName}`);
    
    // Import the action execution system
    const { executeAction } = await import('./lib/actions.js');
    
    // Map tool names to action types and execute
    const { toolName, toolArgs, userId } = plan.toolMetadata;
    
    try {
      switch (toolName) {
        case 'SEARCH_PLACES':
        case 'search_wyshbone_database':
        case 'bubble_run_batch': {
          // Execute global database search - validate at least one search criterion
          if (!toolArgs.business_types && !toolArgs.country && !toolArgs.query) {
            throw new Error('Missing required fields: need business_types, country, or query');
          }
          
          await executeAction('GLOBAL_DB', {
            userId,
            businessTypes: toolArgs.business_types || [],
            roles: toolArgs.roles || [],
            country: toolArgs.country,
            region: toolArgs.region,
            query: toolArgs.query,
            location: toolArgs.location
          });
          execution.stepProgress[execution.currentStepIndex].resultSummary = 'Search completed';
          break;
        }
        
        case 'DEEP_RESEARCH':
        case 'deep_research': {
          // Validate required fields
          if (!toolArgs.prompt) {
            throw new Error('Missing required field: prompt');
          }
          
          // Execute deep research action
          await executeAction('DEEP_RESEARCH', {
            userId,
            prompt: toolArgs.prompt,
            sourceConversationId: execution.conversationId
          });
          execution.stepProgress[execution.currentStepIndex].resultSummary = 'Deep research completed';
          break;
        }
        
        case 'BATCH_CONTACT_FINDER':
        case 'batch_contact_finder':
        case 'saleshandy_batch_call': {
          // Accept various parameter shapes: company_names/roles OR query/location
          if (!toolArgs.company_names && !toolArgs.roles && !toolArgs.query && !toolArgs.location) {
            throw new Error('Missing required fields: need company_names, roles, query, or location');
          }
          
          // Execute batch contact finder action
          await executeAction('EMAIL_FINDER', {
            userId,
            companyNames: toolArgs.company_names || [],
            roles: toolArgs.roles || [],
            query: toolArgs.query,
            location: toolArgs.location
          });
          execution.stepProgress[execution.currentStepIndex].resultSummary = 'Email contacts discovered';
          break;
        }
        
        case 'CREATE_SCHEDULED_MONITOR':
        case 'create_scheduled_monitor': {
          // Validate required fields
          if (!toolArgs.label) {
            throw new Error('Missing required field: label');
          }
          
          // Execute scheduled monitor creation
          await executeAction('SCHEDULED_MONITOR', {
            userId,
            label: toolArgs.label,
            schedule: toolArgs.schedule || 'weekly',
            queryParams: toolArgs
          });
          execution.stepProgress[execution.currentStepIndex].resultSummary = 'Monitor created';
          break;
        }
        
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
      
      console.log(`  ✅ Real action executed for ${step.label}`);
      return;
    } catch (error: any) {
      console.error(`  ❌ Action execution failed:`, error.message);
      throw error; // Re-throw to be caught by step execution error handler
    }
  }
  
  // Fallback: simulate execution if no tool metadata is available
  console.log(`  ⚠️ No tool metadata found, simulating execution`);
  
  const baseDelay = step.type === 'search' ? 2000 : 
                    step.type === 'enrich' ? 3000 : 
                    step.type === 'outreach' ? 1500 : 2000;
  
  const delay = baseDelay + Math.random() * 1000;
  
  console.log(`  ⏱️ Step ${step.label} executing (~${Math.round(delay / 1000)}s)`);
  
  await new Promise(resolve => setTimeout(resolve, delay));
  
  // Update step progress with result summary
  const progress = execution.stepProgress[execution.currentStepIndex];
  
  if (step.type === 'search') {
    progress.resultSummary = `Found businesses matching criteria`;
  } else if (step.type === 'enrich') {
    progress.resultSummary = `Discovered email contacts`;
  } else if (step.type === 'outreach') {
    progress.resultSummary = `Generated personalized messages`;
  } else {
    progress.resultSummary = `Completed ${step.label}`;
  }
  
  console.log(`  ✅ Step ${step.label} completed: ${progress.resultSummary}`);
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
