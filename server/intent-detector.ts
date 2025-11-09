import { SupervisorTaskData } from './supabase-client';

export interface IntentDetectionResult {
  requiresSupervisor: boolean;
  taskType?: 'generate_leads' | 'analyze_conversation' | 'provide_insights';
  requestData?: SupervisorTaskData;
}

const LEAD_GENERATION_KEYWORDS = [
  'find leads',
  'find prospects',
  'search for',
  'look for',
  'find businesses',
  'find companies',
  'generate leads',
  'get leads',
  'need leads',
  'show me businesses',
  'list businesses',
  'find shops',
  'find restaurants',
  'find clinics',
  'find dentists',
  'find lawyers',
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
  const lowerMessage = userMessage.toLowerCase().trim();

  // Check for lead generation intent
  const hasLeadIntent = LEAD_GENERATION_KEYWORDS.some(keyword =>
    lowerMessage.includes(keyword.toLowerCase())
  );

  if (hasLeadIntent) {
    const { businessType, location } = extractBusinessAndLocation(userMessage);

    return {
      requiresSupervisor: true,
      taskType: 'generate_leads',
      requestData: {
        user_message: userMessage,
        search_query: {
          business_type: businessType,
          location: location,
        },
      },
    };
  }

  // Check for analysis intent
  const hasAnalysisIntent = ANALYSIS_KEYWORDS.some(keyword =>
    lowerMessage.includes(keyword.toLowerCase())
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
