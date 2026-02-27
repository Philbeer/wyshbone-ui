export type ChatModeType = 'CHAT_INFO' | 'CLARIFY_FOR_RUN' | 'RUN_SUPERVISOR';

export interface ChatModeDecision {
  mode: ChatModeType;
  reason: string;
  entityType?: string;
  location?: string;
  requestedCount?: number;
}

const ENTITY_FINDING_VERBS = [
  'find', 'list', 'show', 'get', 'locate', 'search for', 'search',
  'look for', 'looking for', 'lookup', 'discover', 'get me',
  'generate leads', 'lead list', 'prospects',
];

const ENTITY_LOCATION_PATTERNS = [
  /(.+?)\s+in\s+([a-z][a-z\s,]+)/i,
  /(.+?)\s+near\s+([a-z][a-z\s,]+)/i,
  /(.+?)\s+around\s+([a-z][a-z\s,]+)/i,
  /(.+?)\s+at\s+([a-z][a-z\s,]+)/i,
];

const ENTITY_NOUN_PATTERNS = [
  /(?:find|list|show|get|locate|search\s+for|search|look\s+for|looking\s+for|lookup|discover|get\s+me)\s+(.+?)(?:\s+(?:in|near|around|at)\s+|$)/i,
  /\b(organisations?|organizations?|charities|charit(?:y|ies)|businesses|companies|shops?|pubs?|bars?|restaurants?|cafes?|coffee\s+shops?|hotels?|dentists?|dental\s+practices?|salons?|gyms?|clinics?|venues?|breweries?|bakeries?|florists?|plumbers?|electricians?|mechanics?|garages?|nurseries?|schools?|churches?|offices?|warehouses?|factories?|takeaways?|stores?|retailers?)\b/i,
];

const ENTITY_DISCOVERY_PATTERNS = [
  /\b(?:organisations?|organizations?|businesses|companies|charities)\s+(?:that|which|who)\b/i,
  /\b(?:places|establishments|outlets)\s+(?:that|which|who|in|near)\b/i,
];

const CHAT_INFO_PATTERNS = [
  /^(hi|hello|hey|thanks|thank you|ok|okay|sure|yes|no)\b/i,
  /^what (is|are|do|does|can|should)\b/i,
  /^how (do|does|can|should|to)\b/i,
  /^(explain|tell me about|describe|summarize|summarise|help)\b/i,
  /^(who is|who are|when did|when was|where is|where are|why)\b/i,
  /^(can you explain|what's the difference|define)\b/i,
];

const LOCATION_PATTERN = /\b(?:in|near|around)\s+([a-z][a-z\s,]+)/i;

const INFORMATIONAL_QUESTION_PREFIXES = [
  /^who (?:is|are|was|were)\b/i,
  /^what (?:is|are|was|were|do|does|can|should)\b/i,
  /^how (?:do|does|can|should|to|many|much)\b/i,
  /^why\b/i,
  /^when\b/i,
  /^where (?:is|are|was|were|do|does|can|should)\b/i,
  /^explain\b/i,
  /^tell me (?:about|what|how|why|when|where)\b/i,
  /^describe\b/i,
  /^define\b/i,
  /^can you explain\b/i,
  /^what's the (?:difference|best|biggest|largest|smallest)\b/i,
];

const QUANTIFIER_PATTERN = /^(?:(\d+)\s+|(?:a|an|some|several|few|many|couple(?:\s+of)?)\s+)/i;
const QUANTIFIER_WORD_MAP: Record<string, number> = {
};

export function sanitizeBusinessType(raw: string): { businessType: string; requestedCount?: number } {
  let working = raw.trim();
  let requestedCount: number | undefined;

  const match = working.match(QUANTIFIER_PATTERN);
  if (match) {
    if (match[1]) {
      requestedCount = parseInt(match[1], 10);
    } else {
      const word = match[0].trim().toLowerCase().replace(/\s+of$/, '');
      if (QUANTIFIER_WORD_MAP[word] !== undefined) {
        requestedCount = QUANTIFIER_WORD_MAP[word];
      }
    }
    working = working.slice(match[0].length).trim();
  }

  if (working.length === 0) {
    working = raw.trim();
    requestedCount = undefined;
  }

  return { businessType: working, requestedCount };
}

function detectEntityIntent(normalized: string): { isEntity: boolean; entityType?: string; location?: string; requestedCount?: number; reason: string } {
  for (const pattern of INFORMATIONAL_QUESTION_PREFIXES) {
    if (pattern.test(normalized)) {
      return { isEntity: false, reason: `Informational question prefix: "${normalized.slice(0, 30)}..."` };
    }
  }

  for (const verbPhrase of ENTITY_FINDING_VERBS) {
    if (normalized.includes(verbPhrase)) {
      const entityInfo = extractEntityAndLocation(normalized);
      return {
        isEntity: true,
        entityType: entityInfo.entityType,
        location: entityInfo.location,
        requestedCount: entityInfo.requestedCount,
        reason: `Entity-finding verb: "${verbPhrase}"`,
      };
    }
  }

  for (const pattern of ENTITY_DISCOVERY_PATTERNS) {
    if (pattern.test(normalized)) {
      const entityInfo = extractEntityAndLocation(normalized);
      return {
        isEntity: true,
        entityType: entityInfo.entityType,
        location: entityInfo.location,
        requestedCount: entityInfo.requestedCount,
        reason: 'Entity discovery pattern (X that/which...)',
      };
    }
  }

  for (const pattern of ENTITY_NOUN_PATTERNS) {
    const match = normalized.match(pattern);
    if (match) {
      const hasLocationContext = LOCATION_PATTERN.test(normalized);
      if (hasLocationContext) {
        const entityInfo = extractEntityAndLocation(normalized);
        const rawEntity = entityInfo.entityType || match[1]?.trim();
        const sanitized = rawEntity ? sanitizeBusinessType(rawEntity) : { businessType: rawEntity };
        return {
          isEntity: true,
          entityType: sanitized.businessType,
          location: entityInfo.location,
          requestedCount: entityInfo.requestedCount || sanitized.requestedCount,
          reason: `Entity noun with location context: "${sanitized.businessType}"`,
        };
      }
    }
  }

  return { isEntity: false, reason: 'No entity-finding intent detected' };
}

function extractEntityAndLocation(message: string): { entityType?: string; location?: string; requestedCount?: number } {
  let location: string | undefined;
  let entityType: string | undefined;
  let requestedCount: number | undefined;

  const locMatch = message.match(LOCATION_PATTERN);
  if (locMatch && locMatch[1]) {
    location = locMatch[1].trim().replace(/[.,!?;:]+$/, '');
  }

  for (const pattern of ENTITY_NOUN_PATTERNS) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const extracted = match[1].trim()
        .replace(/\s+(in|near|around|at)\s+.*$/i, '')
        .replace(/[.,!?;:]+$/, '');
      if (extracted.length > 0 && extracted.length < 100) {
        const sanitized = sanitizeBusinessType(extracted);
        entityType = sanitized.businessType;
        requestedCount = sanitized.requestedCount;
        break;
      }
    }
  }

  return { entityType, location, requestedCount };
}

const SEMANTIC_CONSTRAINT_PATTERNS = [
  /\bthat\s+(?:work|deal|partner|collaborate|operate|specialise|specialize|focus|engage)\b/i,
  /\bwhich\s+(?:work|deal|partner|collaborate|operate|specialise|specialize|focus|engage)\b/i,
  /\bwho\s+(?:work|deal|partner|collaborate|operate|specialise|specialize|focus|engage)\b/i,
  /\bthat\s+(?:are|have|do|provide|offer|support|help|serve)\b/i,
  /\bwhich\s+(?:are|have|do|provide|offer|support|help|serve)\b/i,
];

function hasSemanticConstraint(message: string): boolean {
  return SEMANTIC_CONSTRAINT_PATTERNS.some(p => p.test(message));
}

function isRunnable(entityType?: string, location?: string, message?: string): boolean {
  if (!entityType || entityType.length === 0 || !location || location.length === 0) {
    return false;
  }
  if (message && hasSemanticConstraint(message)) {
    return false;
  }
  return true;
}

export function decideChatMode({ userMessage }: { userMessage: string }): ChatModeDecision {
  const normalized = userMessage.toLowerCase().trim();

  const entityResult = detectEntityIntent(normalized);

  if (entityResult.isEntity) {
    if (isRunnable(entityResult.entityType, entityResult.location, normalized)) {
      return {
        mode: 'RUN_SUPERVISOR',
        reason: entityResult.reason,
        entityType: entityResult.entityType,
        location: entityResult.location,
        requestedCount: entityResult.requestedCount,
      };
    } else {
      const missingParts: string[] = [];
      if (!entityResult.entityType) missingParts.push('entity type');
      if (!entityResult.location) missingParts.push('location');
      if (hasSemanticConstraint(normalized)) missingParts.push('semantic constraint needs clarification');
      return {
        mode: 'CLARIFY_FOR_RUN',
        reason: `${entityResult.reason} — ${missingParts.length > 0 ? 'needs: ' + missingParts.join(', ') : 'needs clarification'}`,
        entityType: entityResult.entityType,
        location: entityResult.location,
        requestedCount: entityResult.requestedCount,
      };
    }
  }

  for (const pattern of CHAT_INFO_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        mode: 'CHAT_INFO',
        reason: 'Matched informational/conversational pattern',
      };
    }
  }

  return {
    mode: 'CHAT_INFO',
    reason: 'No entity-finding intent detected — informational chat',
  };
}
