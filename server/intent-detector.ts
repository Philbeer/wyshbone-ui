import { SupervisorTaskData } from './supabase-client';
import { sanitizeBusinessType } from './lib/decideChatMode';

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
    const { businessType, location, requestedCount } = extractBusinessAndLocation(userMessage);

    return {
      requiresSupervisor: true,
      taskType: 'find_prospects',
      requestData: {
        user_message: userMessage,
        search_query: {
          business_type: businessType,
          location: location,
          requested_count: requestedCount,
        },
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
    const rawEntity = genericMatch[1]?.trim();
    const sanitized = sanitizeBusinessType(rawEntity);
    return {
      requiresSupervisor: true,
      taskType: 'find_prospects',
      requestData: {
        user_message: userMessage,
        search_query: {
          business_type: sanitized.businessType,
          location: genericMatch[2]?.trim(),
          requested_count: sanitized.requestedCount,
        },
      },
    };
  }

  return {
    requiresSupervisor: false,
  };
}

function extractBusinessAndLocation(message: string): {
  businessType?: string;
  location?: string;
  requestedCount?: number;
} {
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

  let businessType: string | undefined;
  let requestedCount: number | undefined;

  const businessPatterns = [
    /(?:find|search\s+for|look\s+for|get|show\s+me|list)\s+([a-z0-9\s]+?)\s+(?:in|at|near|around)/i,
    /([a-z0-9\s]+?)\s+(?:in|at|near|around)\s+/i,
  ];

  for (const pattern of businessPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const extracted = match[1].trim();
      const skipWords = ['leads', 'prospects', 'businesses', 'companies', 'the', 'some', 'all', 'any'];
      if (!skipWords.includes(extracted.toLowerCase())) {
        const sanitized = sanitizeBusinessType(extracted);
        businessType = sanitized.businessType;
        requestedCount = sanitized.requestedCount;
        break;
      }
    }
  }

  return {
    businessType,
    location,
    requestedCount,
  };
}
