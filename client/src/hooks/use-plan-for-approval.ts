// This file is deprecated - use usePlan from PlanContext instead
// Kept for backwards compatibility during migration
import { usePlan } from "@/contexts/PlanContext";

export type { LeadGenStep, LeadGenPlan } from "@/contexts/PlanContext";

export function usePlanForApproval() {
  return usePlan();
}
