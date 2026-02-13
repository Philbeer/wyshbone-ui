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
  // Normalize: lowercase, strip punctuation, trim
  const normalized = userMessage
    .toLowerCase()
    .replace(/[.,!?;:()]/g, ' ') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  // Check for lead generation intent (using normalized message)
  const hasLeadIntent = LEAD_GENERATION_KEYWORDS.some(keyword =>
    normalized.includes(keyword.toLowerCase())
  );

  if (hasLeadIntent) {
    const { businessType, location } = extractBusinessAndLocation(userMessage);

    return {
      requiresSupervisor: true,
      taskType: 'find_prospects',
      requestData: {
        user_message: userMessage,
        search_query: {
          business_type: businessType,
          location: location,
        },
      },
    };
  }

  // Check for analysis intent (using normalized message)
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

  // Broad fallback: "find [N] [noun] in [location]" pattern
  const genericFindInLocation = /\bfind\s+(?:\d+\s+)?([a-z]+(?:\s+[a-z]+)?)\s+in\s+([a-z][a-z\s,]+)/i;
  const genericMatch = normalized.match(genericFindInLocation);
  if (genericMatch) {
    return {
      requiresSupervisor: true,
      taskType: 'find_prospects',
      requestData: {
        user_message: userMessage,
        search_query: {
          business_type: genericMatch[1]?.trim(),
          location: genericMatch[2]?.trim(),
        },
      },
    };
  }

  // No Supervisor intent detected
  return {
    requiresSupervisor: false,
  };
}

function extractBusinessAndLocation(message: string): {
  businessType?: string;
  location?: string;
} {
  const lowerMessage = message.toLowerCase();

  // Extract location using common prepositions
  const locationPatterns = [
    /\bin\s+([a-z\s]+?)(?:\s+(?:and|or|,|$))/i,
    /\bat\s+([a-z\s]+?)(?:\s+(?:and|or|,|$))/i,
    /\bnear\s+([a-z\s]+?)(?:\s+(?:and|or|,|$))/i,
    /\baround\s+([a-z\s]+?)(?:\s+(?:and|or|,|$))/i,
  ];

  let location: string | undefined;
  for (const pattern of locationPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      location = match[1].trim();
      break;
    }
  }

  // Extract business type (noun before location or after "find/search for")
  let businessType: string | undefined;

  // Pattern: "find [business type] in [location]"
  const businessPatterns = [
    /(?:find|search\s+for|look\s+for|get|show\s+me|list)\s+([a-z\s]+?)\s+(?:in|at|near|around)/i,
    /([a-z\s]+?)\s+(?:in|at|near|around)\s+/i,
  ];

  for (const pattern of businessPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const extracted = match[1].trim();
      // Filter out common verbs/words
      const skipWords = ['leads', 'prospects', 'businesses', 'companies', 'the', 'some', 'all', 'any'];
      if (!skipWords.includes(extracted.toLowerCase())) {
        businessType = extracted;
        break;
      }
    }
  }

  return {
    businessType,
    location,
  };
}
