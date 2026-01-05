/**
 * Profile completion calculator
 * Calculates percentage of profile completeness for better AI personalization
 */

export interface ProfileCompletionResult {
  percentage: number;
  missingFields: string[];
  completedFields: string[];
}

export interface UserProfile {
  companyName?: string | null;
  companyDomain?: string | null;
  roleHint?: string | null;
  primaryObjective?: string | null;
  targetMarkets?: string[] | null;
  productsOrServices?: string[] | null;
}

export interface CrmSettings {
  industryVertical?: string | null;
}

/**
 * Calculate profile completion percentage
 * Weights:
 * - Company name: 20%
 * - Company domain: 15%
 * - Role hint: 15%
 * - Primary objective: 20%
 * - Industry vertical (CRM settings): 15%
 * - Target markets: 10%
 * - Products/services: 5%
 */
export function calculateProfileCompletion(
  user: UserProfile,
  crmSettings?: CrmSettings
): ProfileCompletionResult {
  const completedFields: string[] = [];
  const missingFields: string[] = [];
  let totalScore = 0;

  // Company name (20%)
  if (user.companyName && user.companyName.trim().length > 0) {
    totalScore += 20;
    completedFields.push("Company name");
  } else {
    missingFields.push("Company name");
  }

  // Company domain (15%)
  if (user.companyDomain && user.companyDomain.trim().length > 0) {
    totalScore += 15;
    completedFields.push("Company domain");
  } else {
    missingFields.push("Company domain");
  }

  // Role hint (15%)
  if (user.roleHint && user.roleHint.trim().length > 0) {
    totalScore += 15;
    completedFields.push("Your role");
  } else {
    missingFields.push("Your role");
  }

  // Primary objective (20%)
  if (user.primaryObjective && user.primaryObjective.trim().length > 0) {
    totalScore += 20;
    completedFields.push("Primary goal");
  } else {
    missingFields.push("Primary goal");
  }

  // Industry vertical from CRM settings (15%)
  if (crmSettings?.industryVertical && crmSettings.industryVertical !== "generic") {
    totalScore += 15;
    completedFields.push("Industry vertical");
  } else {
    missingFields.push("Industry vertical");
  }

  // Target markets (10%)
  if (user.targetMarkets && user.targetMarkets.length > 0) {
    totalScore += 10;
    completedFields.push("Target markets");
  } else {
    missingFields.push("Target markets");
  }

  // Products/services (5%)
  if (user.productsOrServices && user.productsOrServices.length > 0) {
    totalScore += 5;
    completedFields.push("Products/services");
  } else {
    missingFields.push("Products/services");
  }

  return {
    percentage: totalScore,
    completedFields,
    missingFields,
  };
}

/**
 * Get a friendly message based on completion percentage
 */
export function getCompletionMessage(percentage: number): string {
  if (percentage === 100) {
    return "Your profile is complete! This helps us provide better AI assistance.";
  } else if (percentage >= 80) {
    return "Your profile is almost complete. Add a few more details for even better results.";
  } else if (percentage >= 50) {
    return "You're halfway there! Complete your profile for personalized AI insights.";
  } else if (percentage >= 20) {
    return "Let's build your profile. More details mean smarter AI assistance.";
  } else {
    return "Complete your profile to unlock personalized AI features.";
  }
}
