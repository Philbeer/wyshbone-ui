import { SupervisorTaskData } from './supabase-client';

export interface IntentDetectionResult {
  requiresSupervisor: boolean;
  taskType?: 'find_prospects' | 'analyze_conversation' | 'provide_insights';
  requestData?: SupervisorTaskData;
}

const LEAD_GENERATION_KEYWORDS = [
  // Core actions
  'find lead', 'find prospect', 'search for', 'look for', 'looking for',
  'find business', 'find compan', 'generate lead', 'get lead', 'need lead',
  'show me business', 'show me compan', 'list business', 'list compan',

  // Business types (plural-friendly stems)
  'find shop', 'find restaurant', 'find clinic', 'find dentist', 'find dental',
  'find lawyer', 'find attorney', 'find doctor', 'find salon', 'find gym',
  'find hotel', 'find cafe', 'find coffee', 'find retail', 'find store',
  'find pub', 'find bar', 'find venue', 'find brewery', 'find bakery',
  'find florist', 'find plumber', 'find electrician', 'find mechanic',
  'find garage', 'find nursery', 'find school', 'find church',
  'find office', 'find warehouse', 'find factory', 'find takeaway',

  // Alternative phrasings
  'businesses in', 'companies in', 'shops in', 'restaurants in',
  'pubs in', 'bars in', 'venues in', 'hotels in', 'cafes in',
  'clinics in', 'salons in', 'gyms in', 'stores in',
  'leads for', 'prospects for', 'contacts in',

  // Explicit tool references
  'google places', 'search google', 'places search', 'places api',
];

const ANALYSIS_KEYWORDS = [
  'analyze conversation',
  'analyze this',
  'what insights',
  'insights from',
  'summarize',
  'what have we discussed',
];

export function detectSupervisorIntent(userMessage: string): IntentDetectionResult {
  const normalized = userMessage
    .toLowerCase()
    .replace(/[.,!?;:()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const hasLeadIntent = LEAD_GENERATION_KEYWORDS.some(keyword =>
    normalized.includes(keyword.toLowerCase())
  );

  if (hasLeadIntent) {
    return {
      requiresSupervisor: true,
      taskType: 'find_prospects',
      requestData: {
        user_message: userMessage,
      },
    };
  }

  const hasAnalysisIntent = ANALYSIS_KEYWORDS.some(keyword =>
    normalized.includes(keyword.toLowerCase())
  );

  if (hasAnalysisIntent) {
    return {
      requiresSupervisor: true,
      taskType: 'analyze_conversation',
      requestData: {
        user_message: userMessage,
      },
    };
  }

  const DEMO_KEYWORDS = ['injection moulding demo', 'injection molding demo'];
  const hasDemoIntent = DEMO_KEYWORDS.some(kw => normalized.includes(kw));
  if (hasDemoIntent) {
    return {
      requiresSupervisor: true,
      taskType: 'find_prospects',
      requestData: {
        user_message: userMessage,
        demo: 'injection_moulding',
      },
    };
  }

  const genericFindInLocation = /\bfind\s+(.+?)\s+in\s+([a-z][a-z\s,]+)/i;
  const genericMatch = normalized.match(genericFindInLocation);
  if (genericMatch) {
    return {
      requiresSupervisor: true,
      taskType: 'find_prospects',
      requestData: {
        user_message: userMessage,
      },
    };
  }

  return {
    requiresSupervisor: false,
  };
}
