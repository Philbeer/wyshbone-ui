export interface ChatModeDecision {
  mode: 'CHAT' | 'RUN';
  reason: string;
}

const RUN_KEYWORDS = [
  'google', 'places', 'find', 'search', 'list', 'get me',
  'lookup', 'discover', 'run', 'trigger', 'execute',
  'generate leads', 'lead list', 'prospects', 'venues',
  'pubs', 'restaurants', 'cafes', 'coffee shops', 'hotels',
  'dentists', 'dental', 'salons', 'gyms', 'clinics',
  'businesses in', 'companies in', 'shops in',
  'deep dive', 'deep research', 'investigate',
  'saleshandy', 'batch', 'contacts for',
  'monitor', 'schedule', 'create a monitor',
  'injection moulding demo', 'injection molding demo',
];

const LOCATION_PATTERN = /\bin\s+[a-z][a-z\s]+/i;

const CHAT_OVERRIDE_PATTERNS = [
  /^(hi|hello|hey|thanks|thank you|ok|okay|sure|yes|no)\b/i,
  /^what (is|are|do|does|can|should)\b/i,
  /^how (do|does|can|should|to)\b/i,
  /^(explain|tell me about|describe|summarize|help)\b/i,
];

export function decideChatMode({ userMessage }: { userMessage: string }): ChatModeDecision {
  const normalized = userMessage.toLowerCase().trim();

  for (const pattern of CHAT_OVERRIDE_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        mode: 'CHAT',
        reason: 'Matched conversational pattern override',
      };
    }
  }

  for (const keyword of RUN_KEYWORDS) {
    if (normalized.includes(keyword)) {
      return {
        mode: 'RUN',
        reason: `Matched keyword: "${keyword}"`,
      };
    }
  }

  if (LOCATION_PATTERN.test(userMessage)) {
    return {
      mode: 'RUN',
      reason: 'Matched location pattern (in <Location>)',
    };
  }

  return {
    mode: 'CHAT',
    reason: 'No RUN keywords detected',
  };
}
