/**
 * Lead Request Context Helper (UI-002)
 * 
 * Manages clarification questions for lead-related requests.
 * Ensures all four key fields are captured before tools are called:
 * - targetRegion: Where to focus
 * - targetPersona: Who to contact
 * - volume: How many leads
 * - timing: When/how fast/how often
 */

import { storage } from "./storage";

export type LeadRequestContext = {
  targetRegion?: string;      // e.g. "UK", "London", "North West", "US East Coast"
  targetPersona?: string;     // e.g. "pub landlords", "buyers", "coffee shop owners"
  volume?: string;            // e.g. "25", "50–100", "a small batch"
  timing?: string;            // e.g. "this week", "ongoing weekly", "one-off now"
};

/**
 * Get the lead request context for a given session.
 * @param sessionId - The session ID to look up
 * @returns The lead request context, or an empty object if not set
 */
export async function getLeadRequestContext(sessionId: string): Promise<LeadRequestContext> {
  return storage.getLeadRequestContext(sessionId);
}

/**
 * Save the lead request context for a session.
 * @param sessionId - The session ID
 * @param context - The lead request context to save
 */
export async function saveLeadRequestContext(sessionId: string, context: LeadRequestContext): Promise<void> {
  return storage.saveLeadRequestContext(sessionId, context);
}

/**
 * Clear the lead request context for a session.
 * @param sessionId - The session ID
 */
export async function clearLeadRequestContext(sessionId: string): Promise<void> {
  return storage.clearLeadRequestContext(sessionId);
}

// List of vague terms that should be treated as "missing" information
const VAGUE_TERMS = [
  'anywhere', 'everywhere', 'anyone', 'everyone', 'lots', 'many', 
  'as many as possible', 'whenever', 'asap', 'soon', 'later', 
  'unspecified', 'tbd', 'any', 'all'
];

/**
 * Check if a field value is missing or too vague to be useful.
 * @param value - The field value to check
 * @returns true if the field should be considered missing
 */
function isFieldMissing(value: string | undefined): boolean {
  if (!value || value.trim().length === 0) {
    return true;
  }
  
  const normalized = value.toLowerCase().trim();
  return VAGUE_TERMS.some(term => normalized === term || normalized.includes(term));
}

/**
 * Get the list of missing or ambiguous fields from a lead request context.
 * @param context - The lead request context to check
 * @returns Array of field names that are missing or too vague
 */
export function getMissingLeadFields(context: LeadRequestContext): Array<keyof LeadRequestContext> {
  const missing: Array<keyof LeadRequestContext> = [];
  
  if (isFieldMissing(context.targetRegion)) {
    missing.push('targetRegion');
  }
  if (isFieldMissing(context.targetPersona)) {
    missing.push('targetPersona');
  }
  if (isFieldMissing(context.volume)) {
    missing.push('volume');
  }
  if (isFieldMissing(context.timing)) {
    missing.push('timing');
  }
  
  return missing;
}

// Question templates for each field (short and sales-friendly)
const QUESTION_TEMPLATES: Record<keyof LeadRequestContext, string> = {
  targetRegion: "Where do you want to focus? (e.g. UK-wide, London, North West, specific cities)",
  targetPersona: "Who exactly are you trying to reach? (e.g. pub owners, bar managers, buyers)",
  volume: "Roughly how many leads do you want in this batch?",
  timing: "When do you want these going out / monitored? (e.g. this week, ongoing, specific dates)"
};

/**
 * Build clarifying questions for missing fields (max 3 questions).
 * Questions are returned in priority order: region, persona, volume, timing.
 * @param missingFields - Array of missing field names
 * @returns Array of question strings (max 3)
 */
export function buildClarifyingQuestions(missingFields: Array<keyof LeadRequestContext>): string[] {
  // Priority order for questions
  const priorityOrder: Array<keyof LeadRequestContext> = [
    'targetRegion',
    'targetPersona',
    'volume',
    'timing'
  ];
  
  // Sort missing fields by priority
  const sortedFields = missingFields.sort((a, b) => {
    return priorityOrder.indexOf(a) - priorityOrder.indexOf(b);
  });
  
  // Take first 3 (max) and build questions
  return sortedFields
    .slice(0, 3)
    .map(field => QUESTION_TEMPLATES[field]);
}

/**
 * Check if this session is currently in clarification mode.
 * @param sessionId - The session ID to check
 * @returns true if clarification is in progress
 */
export async function isAwaitingClarification(sessionId: string): Promise<boolean> {
  return storage.isAwaitingLeadClarification(sessionId);
}

/**
 * Set clarification mode for a session with the list of pending fields.
 * @param sessionId - The session ID
 * @param missingFields - Array of field names that need clarification
 */
export async function setAwaitingClarification(
  sessionId: string, 
  missingFields: Array<keyof LeadRequestContext>
): Promise<void> {
  return storage.setAwaitingLeadClarification(sessionId, missingFields);
}

/**
 * Clear clarification mode for a session.
 * @param sessionId - The session ID
 */
export async function clearAwaitingClarification(sessionId: string): Promise<void> {
  return storage.clearAwaitingLeadClarification(sessionId);
}

/**
 * Get the list of pending fields that need clarification.
 * @param sessionId - The session ID
 * @returns Array of field names awaiting clarification
 */
export async function getPendingClarificationFields(sessionId: string): Promise<Array<keyof LeadRequestContext>> {
  return storage.getPendingLeadClarificationFields(sessionId);
}
