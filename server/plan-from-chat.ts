// Helper to create plans from chat tool calls
// Plans are created and AUTO-EXECUTED immediately - no approval required

import { createLeadGenPlan, updatePlanMetadata, updatePlanStatus } from './leadgen-plan.js';
import type { IStorage } from './storage';
import type { LeadGenStep } from './leadgen-plan.js';
import { storage } from './storage';

interface CreatePlanFromToolCallParams {
  toolName: string;
  toolArgs: any;
  userId: string;
  sessionId: string;
  conversationId: string;
  storage: IStorage;
  clientRequestId?: string;  // AFR correlation: links plan to originating user message
}

export interface PlanCreationResult {
  planId: string;
  message: string;
}

/**
 * Translate a heavy tool call from chat into a structured plan
 * and auto-approve it for execution by Supervisor
 */
export async function createPlanFromToolCall(
  params: CreatePlanFromToolCallParams
): Promise<PlanCreationResult> {
  const { toolName, toolArgs, userId, sessionId, conversationId, storage } = params;
  
  console.log(`🔄 Creating plan from tool call: ${toolName}`);
  
  // Build goal and steps based on the tool type
  let goal = '';
  let steps: LeadGenStep[] = [];
  
  switch (toolName) {
    case 'SEARCH_PLACES':
    case 'search_wyshbone_database': {
      const { query, locationText, location, maxResults = 30 } = toolArgs;
      const loc = locationText || location || 'specified location';
      goal = `Find ${maxResults} ${query} businesses in ${loc}`;
      
      steps = [
        {
          id: 'step_1',
          type: 'search',
          label: 'Search Wyshbone Global Database',
          description: `Search for ${query} in ${loc}`,
          estimatedTime: '1-2 minutes'
        }
      ];
      break;
    }
    
    case 'BATCH_CONTACT_FINDER':
    case 'batch_contact_finder':
    case 'saleshandy_batch_call': {
      const { query, location, targetRole = 'General Manager', limit = 30 } = toolArgs;
      goal = `Find ${limit} ${query} contacts in ${location} targeting ${targetRole}`;
      
      steps = [
        {
          id: 'step_1',
          type: 'search',
          label: 'Search Wyshbone Global Database',
          description: `Find ${query} businesses in ${location}`,
          estimatedTime: '1-2 minutes'
        },
        {
          id: 'step_2',
          type: 'enrich',
          label: 'Find Email Contacts',
          description: `Discover verified emails for ${targetRole} contacts`,
          estimatedTime: '2-3 minutes'
        },
        {
          id: 'step_3',
          type: 'outreach',
          label: 'Prepare Outreach',
          description: 'Generate personalized outreach messages',
          estimatedTime: '1 minute'
        }
      ];
      break;
    }
    
    case 'DEEP_RESEARCH':
    case 'deep_research': {
      const { prompt, topic, label } = toolArgs;
      const researchTopic = prompt || topic || label;
      goal = `Deep research on: ${researchTopic}`;
      
      steps = [
        {
          id: 'step_1',
          type: 'search',
          label: 'Deep Research Analysis',
          description: `Comprehensive research on ${researchTopic}`,
          estimatedTime: '3-5 minutes'
        }
      ];
      break;
    }
    
    case 'CREATE_SCHEDULED_MONITOR':
    case 'create_scheduled_monitor': {
      const { label, schedule = 'weekly' } = toolArgs;
      goal = `Create ${schedule} monitor: ${label}`;
      
      steps = [
        {
          id: 'step_1',
          type: 'search',
          label: 'Create Scheduled Monitor',
          description: `Set up ${schedule} monitoring for ${label}`,
          estimatedTime: '30 seconds'
        }
      ];
      break;
    }
    
    case 'bubble_run_batch': {
      const { business_types, roles, country } = toolArgs;
      const businessType = business_types?.[0] || 'businesses';
      const role = roles?.[0] || 'contacts';
      goal = `Find ${businessType} contacts with ${role} role in ${country || 'specified location'}`;
      
      steps = [
        {
          id: 'step_1',
          type: 'search',
          label: 'Search Wyshbone Global Database',
          description: `Find ${businessType} in ${country || 'specified location'}`,
          estimatedTime: '1-2 minutes'
        },
        {
          id: 'step_2',
          type: 'enrich',
          label: 'Find Email Contacts',
          description: `Discover verified emails for ${role} contacts`,
          estimatedTime: '2-3 minutes'
        }
      ];
      break;
    }
    
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
  
  // Create the plan (starts as pending_approval from createLeadGenPlan)
  // Pass clientRequestId for AFR correlation
  const { clientRequestId } = params;
  const plan = await createLeadGenPlan(userId, sessionId, goal, conversationId, clientRequestId);
  
  // Update the plan with custom steps and tool metadata in database
  const toolMetadata = {
    toolName,
    toolArgs,
    userId
  };
  
  await storage.updateLeadGenPlan(plan.id, {
    steps: steps,
    toolMetadata: toolMetadata
  });
  
  // Update local plan object for logging
  plan.steps = steps;
  plan.toolMetadata = toolMetadata;
  
  // AUTO-EXECUTE: Immediately approve and start execution (no user approval needed)
  console.log(`🚀 Auto-approving and executing plan ${plan.id}...`);
  await updatePlanStatus(plan.id, 'approved');
  plan.status = 'approved'; // Update local copy for execution
  
  // Start execution in background
  try {
    const { startPlanExecution } = await import('./leadgen-executor.js');
    await startPlanExecution(plan); // Pass the full plan object
    console.log(`✅ Plan ${plan.id} auto-started execution`);
  } catch (execError) {
    console.error(`❌ Auto-execution failed for plan ${plan.id}:`, execError);
    // Plan stays in approved state - can be retried
  }
  
  console.log(`✅ Created plan ${plan.id} for tool ${toolName}`);
  console.log(`   📋 Plan details: userId=${userId}, sessionId=${sessionId}, conversationId=${conversationId}`);
  console.log(`   📝 Goal: "${goal}"`);
  console.log(`   🚦 Status: approved → executing (auto-started)`);
  
  // Return a message for the chat stream
  const stepCount = steps.length;
  const modeLabel = stepCount >= 2 ? 'multi-step plan' : 'single action';
  const message = `Got it — I've created a ${modeLabel} and started execution. Check the Live Activity panel for progress.`;
  
  return {
    planId: plan.id,
    message
  };
}
