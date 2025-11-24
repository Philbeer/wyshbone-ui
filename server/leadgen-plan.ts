// LeadGen Plan structures and utilities for UI-030
// This adds a plan approval step before Supervisor execution

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

// In-memory storage for plans (replace with database if needed)
const plans = new Map<string, LeadGenPlan>();

export function createLeadGenPlan(
  sessionId: string,
  goal: string,
  conversationId?: string
): LeadGenPlan {
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
    sessionId,
    conversationId,
    goal,
    steps,
    createdAt: new Date().toISOString(),
    status: 'pending_approval'
  };

  plans.set(planId, plan);
  console.log(`✅ Created LeadGenPlan: ${planId} for session ${sessionId}`);
  
  return plan;
}

export function getPlanBySession(sessionId: string): LeadGenPlan | null {
  // Find the most recent pending_approval plan for this session
  const sessionPlans = Array.from(plans.values())
    .filter(p => p.sessionId === sessionId && p.status === 'pending_approval')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  
  return sessionPlans[0] || null;
}

export function getPlanById(planId: string): LeadGenPlan | null {
  return plans.get(planId) || null;
}

export function approvePlan(planId: string): LeadGenPlan | null {
  const plan = plans.get(planId);
  if (!plan) {
    return null;
  }
  
  plan.status = 'approved';
  plans.set(planId, plan);
  
  console.log(`✅ Plan approved: ${planId}`);
  return plan;
}

export function rejectPlan(planId: string): LeadGenPlan | null {
  const plan = plans.get(planId);
  if (!plan) {
    return null;
  }
  
  plan.status = 'rejected';
  plans.set(planId, plan);
  
  console.log(`❌ Plan rejected: ${planId}`);
  return plan;
}

export function updatePlanStatus(planId: string, status: LeadGenPlan['status'], supervisorTaskId?: string): void {
  const plan = plans.get(planId);
  if (plan) {
    plan.status = status;
    if (supervisorTaskId) {
      plan.supervisorTaskId = supervisorTaskId;
    }
    plans.set(planId, plan);
  }
}
