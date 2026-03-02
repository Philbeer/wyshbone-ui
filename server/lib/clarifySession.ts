import { SUBJECTIVE_WORDS } from './decideChatMode';

export interface ConstraintContractData {
  type: string;
  can_execute: boolean;
  explanation?: string;
  why_blocked?: string;
  suggested_rephrase?: string;
  proxy_options?: string[];
  required_inputs_missing?: string[];
  subjective_terms?: string[];
  subjective_options?: string[];
}

export interface ClarifySession {
  id: string;
  conversation_id: string;
  is_active: boolean;
  original_user_text: string;
  entity_type: string | null;
  location: string | null;
  semantic_constraint: string | null;
  semantic_constraint_resolved: boolean;
  constraint_contract: ConstraintContractData | null;
  pending_questions: string[];
  answers: Record<string, string>;
  clarified_request_text: string | null;
  created_at: number;
  updated_at: number;
}

const SESSION_TTL_MS = 30 * 60 * 1000;

const sessions = new Map<string, ClarifySession>();

let gcTimer: ReturnType<typeof setInterval> | null = null;

function startGc() {
  if (gcTimer) return;
  gcTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, s] of sessions) {
      if (now - s.updated_at > SESSION_TTL_MS) {
        sessions.delete(key);
      }
    }
  }, 60_000);
  if (gcTimer && typeof gcTimer === 'object' && 'unref' in gcTimer) {
    (gcTimer as NodeJS.Timeout).unref();
  }
}

startGc();

function generateId(): string {
  return `cs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const CANCEL_PHRASES = [
  'cancel', 'never mind', 'nevermind', 'stop', 'forget it',
  'forget that', 'abort', 'quit', 'start over', 'reset',
];

const BARE_ACKNOWLEDGEMENTS = [
  'yes', 'yeah', 'yep', 'yup', 'ok', 'okay', 'sure',
  'go ahead', 'do it', 'run it', 'go for it', 'confirm',
  'please', 'proceed', 'let\'s go', 'sounds good', 'correct',
  'right', 'alright', 'fine', 'great', 'thanks', 'thank you',
  'yea', 'aye', 'absolutely', 'definitely', 'of course',
];

const RUN_TRIGGER_PHRASES = [
  'search now', 'run now', 'go now', 'start search', 'start now',
  'run search', 'do it now', 'execute', 'search now with defaults',
  'run it now', 'go for it now', 'let\'s search', 'begin search',
  'just search', 'go ahead and search', 'please search', 'search please',
  'run it', 'just run it', 'go ahead and run',
  'please search now', 'search now please', 'run the search',
  'start the search', 'do the search', 'launch search',
];

export function isBareAcknowledgement(message: string): boolean {
  const normalized = message.toLowerCase().trim().replace(/[.,!?;:]+$/, '');
  return BARE_ACKNOWLEDGEMENTS.includes(normalized);
}

function isRunTrigger(message: string): boolean {
  const normalized = message.toLowerCase().trim().replace(/[.,!?;:]+$/, '');
  return RUN_TRIGGER_PHRASES.some(phrase =>
    normalized === phrase || normalized.startsWith(phrase + ' ') || normalized.startsWith(phrase + ',')
  );
}

function allRequiredFieldsPresent(entityType: string | null, location: string | null, semanticConstraint: string | null, semanticConstraintResolved: boolean): boolean {
  if (!entityType || !location) return false;
  if (semanticConstraint && !semanticConstraintResolved) return false;
  return true;
}

export function isMeaningfulClarificationAnswer(message: string, session: ClarifySession): boolean {
  const normalized = message.toLowerCase().trim().replace(/[.,!?;:]+$/, '');
  if (normalized.length === 0) return false;
  if (BARE_ACKNOWLEDGEMENTS.includes(normalized)) return false;
  if (/^\d+$/.test(normalized)) return true;
  return true;
}

export function getActiveClarifySession(conversationId: string): ClarifySession | null {
  const s = sessions.get(conversationId);
  if (!s || !s.is_active) return null;
  if (Date.now() - s.updated_at > SESSION_TTL_MS) {
    sessions.delete(conversationId);
    return null;
  }
  return s;
}

export function createClarifySession(params: {
  conversationId: string;
  originalUserText: string;
  entityType?: string;
  location?: string;
  semanticConstraint?: string;
  constraintContract?: ConstraintContractData | null;
  pendingQuestions: string[];
}): ClarifySession {
  const now = Date.now();
  const session: ClarifySession = {
    id: generateId(),
    conversation_id: params.conversationId,
    is_active: true,
    original_user_text: params.originalUserText,
    entity_type: params.entityType || null,
    location: params.location || null,
    semantic_constraint: params.semanticConstraint || null,
    semantic_constraint_resolved: false,
    constraint_contract: params.constraintContract || null,
    pending_questions: params.pendingQuestions,
    answers: {},
    clarified_request_text: null,
    created_at: now,
    updated_at: now,
  };
  sessions.set(params.conversationId, session);
  return session;
}

export function updateClarifySession(conversationId: string, updates: Partial<Pick<ClarifySession,
  'answers' | 'pending_questions' | 'entity_type' | 'location' | 'semantic_constraint' | 'semantic_constraint_resolved' | 'clarified_request_text' | 'constraint_contract'
>>): ClarifySession | null {
  const s = sessions.get(conversationId);
  if (!s || !s.is_active) return null;
  if (updates.answers !== undefined) s.answers = updates.answers;
  if (updates.pending_questions !== undefined) s.pending_questions = updates.pending_questions;
  if (updates.entity_type !== undefined) s.entity_type = updates.entity_type;
  if (updates.location !== undefined) s.location = updates.location;
  if (updates.semantic_constraint !== undefined) s.semantic_constraint = updates.semantic_constraint;
  if (updates.semantic_constraint_resolved !== undefined) s.semantic_constraint_resolved = updates.semantic_constraint_resolved;
  if (updates.clarified_request_text !== undefined) s.clarified_request_text = updates.clarified_request_text;
  if (updates.constraint_contract !== undefined) s.constraint_contract = updates.constraint_contract;
  s.updated_at = Date.now();
  return s;
}

export function closeClarifySession(conversationId: string): void {
  const s = sessions.get(conversationId);
  if (s) {
    s.is_active = false;
    sessions.delete(conversationId);
  }
}

export function closeAllClarifySessions(conversationId: string): void {
  closeClarifySession(conversationId);
}

export function isUserCancelling(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  return CANCEL_PHRASES.some(phrase => normalized === phrase || normalized.startsWith(phrase + ' '));
}

export interface ClarifyStatePayload {
  entityType: string | null;
  location: string | null;
  semanticConstraint: string | null;
  count: string | null;
  missingFields: string[];
  status: 'gathering' | 'ready';
  pendingQuestions: string[];
  constraint_contract?: ConstraintContractData | null;
}

export interface ClarifyHandlerResult {
  action: 'ask_more' | 'run_supervisor' | 'cancelled';
  message?: string;
  clarifiedRequest?: string;
  entityType?: string;
  location?: string;
  clarifyState?: ClarifyStatePayload;
}

export function buildClarifyStatePayload(session: ClarifySession): ClarifyStatePayload {
  const missingFields: string[] = [];
  if (!session.entity_type) missingFields.push('entity_type');
  if (!session.location) missingFields.push('location');
  if (session.semantic_constraint && !session.semantic_constraint_resolved) missingFields.push('semantic_constraint');

  const cc = session.constraint_contract;
  const blocked = cc && !cc.can_execute;
  const allFilled = missingFields.length === 0 && !blocked;

  return {
    entityType: session.entity_type,
    location: session.location,
    semanticConstraint: session.semantic_constraint,
    count: session.answers['count'] || null,
    missingFields,
    status: allFilled ? 'ready' : 'gathering',
    pendingQuestions: session.pending_questions,
    constraint_contract: cc || undefined,
  };
}

export function handleClarifyResponse(
  session: ClarifySession,
  userMessage: string,
): ClarifyHandlerResult {
  if (isUserCancelling(userMessage)) {
    return {
      action: 'cancelled',
      message: 'No problem — search cancelled. What else can I help with?',
    };
  }

  const requiredAlreadyFilled = allRequiredFieldsPresent(
    session.entity_type, session.location,
    session.semantic_constraint, session.semantic_constraint_resolved
  );

  if (isBareAcknowledgement(userMessage)) {
    if (requiredAlreadyFilled) {
      const clarifiedRequest = buildClarifiedRequest(session.entity_type!, session.location!, session.semantic_constraint, session.answers);
      updateClarifySession(session.conversation_id, {
        clarified_request_text: clarifiedRequest,
        pending_questions: [],
      });
      return {
        action: 'run_supervisor',
        clarifiedRequest,
        entityType: session.entity_type || undefined,
        location: session.location || undefined,
      };
    }
    const rephraseMsg = session.pending_questions.length > 0
      ? `I still need a bit more detail to proceed:\n\n${session.pending_questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
      : `Could you provide more specific information? For example, what type of business and which location?`;
    return {
      action: 'ask_more',
      message: rephraseMsg,
      clarifyState: buildClarifyStatePayload(session),
    };
  }

  if (isRunTrigger(userMessage)) {
    if (requiredAlreadyFilled) {
      const clarifiedRequest = buildClarifiedRequest(session.entity_type!, session.location!, session.semantic_constraint, session.answers);
      updateClarifySession(session.conversation_id, {
        clarified_request_text: clarifiedRequest,
        pending_questions: [],
      });
      return {
        action: 'run_supervisor',
        clarifiedRequest,
        entityType: session.entity_type || undefined,
        location: session.location || undefined,
      };
    }
    const missingLabels: string[] = [];
    if (!session.entity_type) missingLabels.push('what type of business');
    if (!session.location) missingLabels.push('which location');
    const rephraseMsg = `I'd love to search now, but I still need: ${missingLabels.join(' and ')}. Could you provide ${missingLabels.length === 1 ? 'that' : 'those'}?`;
    return {
      action: 'ask_more',
      message: rephraseMsg,
      clarifyState: buildClarifyStatePayload(session),
    };
  }

  if (!isMeaningfulClarificationAnswer(userMessage, session)) {
    const rephraseMsg = session.pending_questions.length > 0
      ? `I still need a bit more detail to proceed:\n\n${session.pending_questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
      : `Could you provide more specific information? For example, what type of business and which location?`;
    return {
      action: 'ask_more',
      message: rephraseMsg,
      clarifyState: buildClarifyStatePayload(session),
    };
  }

  const SUBJECTIVE_OPTION_VALUES = new Set(['lively', 'quiet', 'cosy', 'late-night', 'live music', 'good for food', 'beer garden', 'dog friendly']);
  const normalizedMsg = userMessage.toLowerCase().trim().replace(/[.,!?;:]+$/, '').trim();
  const matchedOption = [...SUBJECTIVE_OPTION_VALUES].find(opt => normalizedMsg === opt || normalizedMsg.startsWith(opt + ' ') || normalizedMsg.endsWith(' ' + opt));
  if (session.constraint_contract && !session.constraint_contract.can_execute && session.constraint_contract.type === 'subjective' && matchedOption) {
    const chosenOption = matchedOption.charAt(0).toUpperCase() + matchedOption.slice(1);
    const cleanedEntityType = session.entity_type
      ? session.entity_type.split(/\s+/).filter(w => {
          return !SUBJECTIVE_WORDS.has(w.toLowerCase());
        }).join(' ')
      : session.entity_type;
    updateClarifySession(session.conversation_id, {
      constraint_contract: { ...session.constraint_contract, can_execute: true, why_blocked: undefined },
      semantic_constraint: chosenOption,
      semantic_constraint_resolved: true,
      entity_type: cleanedEntityType || session.entity_type,
      answers: { ...session.answers, semantic_detail: chosenOption, subjective_choice: chosenOption },
    });
    const updatedSession = getActiveClarifySession(session.conversation_id) || session;
    const allFilled = updatedSession.entity_type && updatedSession.location;
    if (allFilled) {
      const clarifiedRequest = buildClarifiedRequest(updatedSession.entity_type!, updatedSession.location!, chosenOption, updatedSession.answers);
      updateClarifySession(session.conversation_id, {
        clarified_request_text: clarifiedRequest,
        pending_questions: [],
      });
      const finalSession = getActiveClarifySession(session.conversation_id) || updatedSession;
      const summaryMsg = `Got it — I'll search for "${chosenOption}" ${updatedSession.entity_type} in ${updatedSession.location}.\n\nClick **Search now** to proceed.`;
      return {
        action: 'ask_more',
        message: summaryMsg,
        clarifyState: buildClarifyStatePayload(finalSession),
      };
    }
    const nextQuestions = buildNextQuestions(
      [
        ...(updatedSession.entity_type ? [] : ['entity_type']),
        ...(updatedSession.location ? [] : ['location']),
      ],
      updatedSession.entity_type, updatedSession.location, chosenOption
    );
    updateClarifySession(session.conversation_id, { pending_questions: nextQuestions });
    const finalSession = getActiveClarifySession(session.conversation_id) || updatedSession;
    const msg = `Got it — you mean "${chosenOption}". ${nextQuestions.length > 0 ? '\n\n' + nextQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n') : ''}`;
    return {
      action: 'ask_more',
      message: msg,
      clarifyState: buildClarifyStatePayload(finalSession),
    };
  }

  const PROXY_CHOICE_PATTERN = /\buse\s+(?:first\s+)?(?:google\s+review|news\s+mentions|google\s+maps|companies\s+house|website\s+registration|social\s+media)\b/i;
  const RELAX_CERTAINTY_PATTERN = /\bbest[- ]effort\b|\brelax\b|\bapproximate\b|\bacceptable\b/i;
  if ((PROXY_CHOICE_PATTERN.test(userMessage) || RELAX_CERTAINTY_PATTERN.test(userMessage)) && session.constraint_contract && !session.constraint_contract.can_execute) {
    const proxyChoice = userMessage.trim();
    updateClarifySession(session.conversation_id, {
      constraint_contract: { ...session.constraint_contract, can_execute: true, why_blocked: undefined },
      semantic_constraint_resolved: true,
      answers: { ...session.answers, semantic_detail: proxyChoice },
    });
    const updatedSession = getActiveClarifySession(session.conversation_id) || session;
    const allFilled = updatedSession.entity_type && updatedSession.location;
    if (allFilled) {
      const clarifiedRequest = buildClarifiedRequest(updatedSession.entity_type!, updatedSession.location!, updatedSession.semantic_constraint, updatedSession.answers);
      updateClarifySession(session.conversation_id, {
        clarified_request_text: clarifiedRequest,
        pending_questions: [],
      });
      const finalSession = getActiveClarifySession(session.conversation_id) || updatedSession;
      const summaryMsg = `Got it — I'll use "${proxyChoice}" to handle the constraint.\n\nClick **Search now** to proceed.`;
      return {
        action: 'ask_more',
        message: summaryMsg,
        clarifyState: buildClarifyStatePayload(finalSession),
      };
    }
    const nextQuestions = buildNextQuestions(
      [
        ...(updatedSession.entity_type ? [] : ['entity_type']),
        ...(updatedSession.location ? [] : ['location']),
      ],
      updatedSession.entity_type, updatedSession.location, updatedSession.semantic_constraint
    );
    updateClarifySession(session.conversation_id, { pending_questions: nextQuestions });
    const finalSession = getActiveClarifySession(session.conversation_id) || updatedSession;
    const msg = `Got it — I'll use "${proxyChoice}" to handle the constraint.\n\n${nextQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;
    return {
      action: 'ask_more',
      message: msg,
      clarifyState: buildClarifyStatePayload(finalSession),
    };
  }

  const MUST_BE_CERTAIN_PATTERN = /\bmust\s+be\s+certain\b|\bonly\s+guaranteed\b|\bneed\s+certainty\b|\bno\s+guessing\b/i;
  if (MUST_BE_CERTAIN_PATTERN.test(userMessage) && session.semantic_constraint) {
    const constraintLabel = session.semantic_constraint;
    const blockedContract: ConstraintContractData = {
      type: constraintLabel.includes('opened-time predicate') ? 'time_predicate' : 'unverifiable_constraint',
      can_execute: false,
      explanation: `The constraint "${constraintLabel}" cannot be guaranteed from public data sources.`,
      why_blocked: `You selected "must be certain", but this constraint cannot be verified with certainty from available data. Choose a proxy approach, relax the certainty requirement, or change your query.`,
      proxy_options: constraintLabel.includes('opened-time predicate')
        ? ['Use first Google review date as proxy', 'Use news mentions as proxy', 'Use Google Maps listing freshness as proxy', 'Use Companies House incorporation date as proxy']
        : undefined,
    };
    updateClarifySession(session.conversation_id, {
      constraint_contract: blockedContract,
      pending_questions: [],
    });
    const updatedSession = getActiveClarifySession(session.conversation_id) || session;
    const blockMsg = `I understand you need certainty, but unfortunately the constraint "${constraintLabel}" cannot be verified with 100% accuracy from public data sources.\n\nYour options:\n• **Choose a proxy** — use an indirect indicator (e.g. first Google review date) to approximate\n• **Relax certainty** — accept best-effort results that may not all be verified\n• **Change your query** — remove the unverifiable constraint and search without it`;
    return {
      action: 'ask_more',
      message: blockMsg,
      clarifyState: buildClarifyStatePayload(updatedSession),
    };
  }

  const newAnswers = { ...session.answers };
  let entityType = session.entity_type;
  let location = session.location;
  let semanticConstraint = session.semantic_constraint;
  let semanticConstraintResolved = session.semantic_constraint_resolved;

  const parsed = parseAnswerContent(userMessage, session);

  if (parsed.location) {
    location = parsed.location;
    newAnswers['location'] = parsed.location;
  }
  if (parsed.entityType) {
    entityType = parsed.entityType;
    newAnswers['entity_type'] = parsed.entityType;
  }
  if (parsed.count) {
    newAnswers['count'] = parsed.count;
  }
  if (parsed.semanticDetail) {
    semanticConstraint = parsed.semanticDetail;
    newAnswers['semantic_detail'] = parsed.semanticDetail;
    semanticConstraintResolved = true;
  }
  const ATTRIBUTE_RESOLUTION_PATTERN = /\b(?:best[- ]effort|strict\s+filter|skip\s+(?:this\s+)?filter)\b/i;
  if (ATTRIBUTE_RESOLUTION_PATTERN.test(userMessage) && session.constraint_contract && !session.constraint_contract.can_execute) {
    semanticConstraintResolved = true;
    newAnswers['semantic_detail'] = newAnswers['semantic_detail'] || userMessage.trim();
  }
  const shouldClearContract = semanticConstraintResolved && session.constraint_contract && !session.constraint_contract.can_execute;
  if (shouldClearContract) {
    updateClarifySession(session.conversation_id, {
      constraint_contract: { ...session.constraint_contract!, can_execute: true, why_blocked: undefined },
    });
  }
  if (parsed.rawAnswer) {
    const questionIdx = Object.keys(newAnswers).filter(k => k.startsWith('q_')).length;
    newAnswers[`q_${questionIdx}`] = parsed.rawAnswer;
  }

  const missingParts: string[] = [];
  if (!entityType) missingParts.push('entity_type');
  if (!location) missingParts.push('location');
  if (session.semantic_constraint && !semanticConstraintResolved) missingParts.push('semantic_constraint');

  const newDataExtracted = !!(parsed.location || parsed.entityType || parsed.count || parsed.semanticDetail);

  if (missingParts.length === 0) {
    const clarifiedRequest = buildClarifiedRequest(entityType!, location!, semanticConstraint, newAnswers);
    updateClarifySession(session.conversation_id, {
      answers: newAnswers,
      entity_type: entityType,
      location: location,
      semantic_constraint: semanticConstraint,
      semantic_constraint_resolved: semanticConstraintResolved,
      clarified_request_text: clarifiedRequest,
      pending_questions: [],
    });

    const summaryParts: string[] = [];
    summaryParts.push(`**${entityType}** in **${location}**`);
    if (newAnswers['count']) {
      summaryParts[0] = `**${newAnswers['count']}** ${summaryParts[0]}`;
    }
    if (newAnswers['semantic_detail']) {
      summaryParts.push(`(${newAnswers['semantic_detail']})`);
    }
    const summaryMsg = `Got it — I'll search for ${summaryParts.join(' ')}.\n\nClick **Search now** to proceed, or add more details (e.g. number of results).`;
    const updatedSession = getActiveClarifySession(session.conversation_id) || session;
    return {
      action: 'ask_more',
      message: summaryMsg,
      clarifyState: buildClarifyStatePayload(updatedSession),
    };
  }

  const nextQuestions = buildNextQuestions(missingParts, entityType, location, semanticConstraint);
  updateClarifySession(session.conversation_id, {
    answers: newAnswers,
    entity_type: entityType,
    location: location,
    semantic_constraint: semanticConstraint,
    semantic_constraint_resolved: semanticConstraintResolved,
    pending_questions: nextQuestions,
  });

  const updatedSession = getActiveClarifySession(session.conversation_id) || session;
  const formattedMsg = `Thanks — just a bit more detail needed:\n\n${nextQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;
  return {
    action: 'ask_more',
    message: formattedMsg,
    clarifyState: buildClarifyStatePayload(updatedSession),
  };
}

function parseAnswerContent(message: string, session: ClarifySession): {
  location?: string;
  entityType?: string;
  count?: string;
  semanticDetail?: string;
  rawAnswer?: string;
} {
  const normalized = message.toLowerCase().trim();
  const result: {
    location?: string;
    entityType?: string;
    count?: string;
    semanticDetail?: string;
    rawAnswer?: string;
  } = {};

  const TIME_UNIT_PATTERN = /\b\d+\s*(?:months?|years?|weeks?|days?|hours?|minutes?|mins?|yrs?|mos?)\b/i;
  const standaloneCountMatch = normalized.match(/\b(\d+)\b/);
  if (standaloneCountMatch) {
    const numberStr = standaloneCountMatch[0];
    const idxStart = standaloneCountMatch.index ?? 0;
    const surroundingText = normalized.slice(Math.max(0, idxStart - 1), idxStart + numberStr.length + 12);
    if (!TIME_UNIT_PATTERN.test(surroundingText)) {
      result.count = standaloneCountMatch[1];
    }
  }

  const locPatterns = [
    /\bin\s+([a-z][a-z\s,]+)/i,
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)$/,
  ];
  for (const pat of locPatterns) {
    const match = message.match(pat);
    if (match && match[1]) {
      result.location = match[1].trim().replace(/[.,!?;:]+$/, '');
      break;
    }
  }
  if (!session.location && !result.location && !standaloneCountMatch && normalized.split(/\s+/).length <= 3) {
    result.location = message.trim().replace(/[.,!?;:]+$/, '');
  }

  if (!session.entity_type) {
    const entityPatterns = [
      /(?:find|search|looking for|look for)\s+(.+?)(?:\s+(?:in|near|around)\s|$)/i,
    ];
    for (const pat of entityPatterns) {
      const match = message.match(pat);
      if (match && match[1]) {
        let raw = match[1].trim();
        const quantMatch = raw.match(/^(?:(\d+)\s+|(?:a|an|some|several|few|many|couple(?:\s+of)?)\s+)/i);
        if (quantMatch) {
          if (quantMatch[1] && !result.count) {
            result.count = quantMatch[1];
          }
          raw = raw.slice(quantMatch[0].length).trim();
        }
        if (raw.length > 0) {
          result.entityType = raw;
        }
        break;
      }
    }
  }

  if (session.semantic_constraint !== null || session.pending_questions.some(q => q.toLowerCase().includes('mean') || q.toLowerCase().includes('clarify') || q.toLowerCase().includes('specify'))) {
    const isLocationOnly = /^\s*(?:in|near|around)\s+[a-z][a-z\s,]+$/i.test(message.trim());
    if (!isLocationOnly) {
      const parts = normalized.split(/[,;]+/).map(s => s.trim()).filter(s => s.length > 0);
      if (parts.length > 0) {
        const nonCountParts = parts.filter(p => !/^\d+$/.test(p));
        if (nonCountParts.length > 0) {
          result.semanticDetail = nonCountParts.join(', ');
        }
      }
    }
  }

  result.rawAnswer = message.trim();
  return result;
}

function buildClarifiedRequest(entityType: string, location: string, semanticConstraint: string | null, answers: Record<string, string>): string {
  let request = `find ${entityType} in ${location}`;
  if (semanticConstraint || answers['semantic_detail']) {
    const constraint = answers['semantic_detail'] || semanticConstraint;
    request += ` (${constraint})`;
  }
  if (answers['count']) {
    request = `find ${answers['count']} ${entityType} in ${location}`;
    if (semanticConstraint || answers['semantic_detail']) {
      const constraint = answers['semantic_detail'] || semanticConstraint;
      request += ` (${constraint})`;
    }
  }
  return request;
}

function buildNextQuestions(missingParts: string[], entityType: string | null, location: string | null, semanticConstraint?: string | null): string[] {
  const questions: string[] = [];
  if (missingParts.includes('entity_type')) {
    questions.push('What type of businesses or organisations are you looking for?');
  }
  if (missingParts.includes('location')) {
    questions.push('Which location or area should I search in?');
  }
  if (missingParts.includes('semantic_constraint') && semanticConstraint) {
    questions.push(`Could you clarify what you mean by "${semanticConstraint}"? For example, what specific relationship or service are you looking for?`);
  }
  return questions.slice(0, 3);
}

export function buildInitialQuestions(entityType?: string, location?: string, semanticConstraint?: string): string[] {
  const questions: string[] = [];
  if (!entityType) {
    questions.push('What type of businesses or organisations are you looking for?');
  }
  if (!location) {
    questions.push('Which location or area should I search in?');
  }
  if (semanticConstraint) {
    questions.push(`Could you clarify what you mean by "${semanticConstraint}"? For example, what specific relationship or service are you looking for?`);
  }
  return questions.slice(0, 3);
}


export interface LastSuccessfulIntent {
  business_type: string;
  location: string;
  requested_count?: number;
  attributes?: string;
  timestamp: number;
}

const lastIntents = new Map<string, LastSuccessfulIntent>();

const INTENT_TTL_MS = 60 * 60 * 1000;

export function saveLastSuccessfulIntent(conversationId: string, intent: Omit<LastSuccessfulIntent, 'timestamp'>): void {
  if (!intent.business_type || !intent.location) return;
  lastIntents.set(conversationId, { ...intent, timestamp: Date.now() });
}

export function getLastSuccessfulIntent(conversationId: string): LastSuccessfulIntent | null {
  const intent = lastIntents.get(conversationId);
  if (!intent) return null;
  if (Date.now() - intent.timestamp > INTENT_TTL_MS) {
    lastIntents.delete(conversationId);
    return null;
  }
  return intent;
}

export function clearLastSuccessfulIntent(conversationId: string): void {
  lastIntents.delete(conversationId);
}

const FOLLOWUP_REUSE_PATTERNS = [
  /^(?:now\s+)?(?:do|try|check|search|run)\s+(.+)$/i,
  /^(?:same\s+(?:thing|search|query)\s+(?:but|for|in)\s+)(.+)$/i,
  /^(?:okay|ok|and|also|next|then)\s*[,.]?\s*(?:do|try|check|search|run)?\s*(.+)$/i,
  /^(?:how\s+about|what\s+about)\s+(.+)$/i,
  /^(?:and|also|next)\s+(.+)$/i,
  /^(?:repeat\s+(?:for|in|with)\s+)(.+)$/i,
  /^(?:same\s+(?:but|for|in)\s+)(.+)$/i,
];

const SCOPE_CHANGE_SIGNALS = [
  /\b(?:find|search\s+for|look\s+for|looking\s+for)\s+\w+/i,
  /\b(?:instead|different|change|switch)\b/i,
  /\b(?:breweries|restaurants?|cafes?|hotels?|shops?|dentists?|salons?|gyms?|clinics?)\b/i,
];

export function detectFollowupReuse(
  message: string,
  lastIntent: LastSuccessfulIntent,
): { isFollowup: boolean; newLocation?: string; reason?: string } {
  const normalized = message.trim();
  const lower = normalized.toLowerCase();

  for (const pattern of SCOPE_CHANGE_SIGNALS) {
    if (pattern.test(lower)) {
      const entityNounsInMessage = lower.match(/\b(pubs?|bars?|restaurants?|cafes?|coffee\s+shops?|hotels?|dentists?|salons?|gyms?|clinics?|breweries?|bakeries?|florists?|venues?|shops?|stores?|businesses|companies|organisations?|organizations?|charities)\b/i);
      if (entityNounsInMessage) {
        const mentionedEntity = entityNounsInMessage[0].toLowerCase();
        const lastEntity = lastIntent.business_type.toLowerCase();
        if (!lastEntity.includes(mentionedEntity) && !mentionedEntity.includes(lastEntity.replace(/s$/, ''))) {
          return { isFollowup: false, reason: `Scope change detected: "${mentionedEntity}" differs from "${lastIntent.business_type}"` };
        }
      }
    }
  }

  for (const pattern of FOLLOWUP_REUSE_PATTERNS) {
    const match = normalized.match(pattern);
    if (match && match[1]) {
      const remainder = match[1].trim().replace(/[.,!?;:]+$/, '');
      if (remainder.length > 0 && remainder.length < 60) {
        const locationCandidate = remainder
          .replace(/^(?:in|near|around|for)\s+/i, '')
          .trim();
        if (locationCandidate.length > 0 && locationCandidate.split(/\s+/).length <= 5) {
          return {
            isFollowup: true,
            newLocation: locationCandidate,
            reason: `Follow-up reuse: replacing location "${lastIntent.location}" with "${locationCandidate}"`,
          };
        }
      }
    }
  }

  const inMatch = normalized.match(/^(?:in|near|around)\s+([a-zA-Z][a-zA-Z\s,]+)$/i);
  if (inMatch && inMatch[1]) {
    return {
      isFollowup: true,
      newLocation: inMatch[1].trim().replace(/[.,!?;:]+$/, ''),
      reason: `Follow-up reuse: bare location directive`,
    };
  }

  return { isFollowup: false };
}

export type ClarifyInputClass = 'EXECUTE' | 'META_TRUST' | 'NEW_TASK' | 'CHAT_INFO' | 'REFINE';

const META_TRUST_PATTERNS = [
  /\b(?:guaranteed|guarantee|accurate|accuracy|how\s+sure|confidence|confident|reliable|reliability)\b/i,
  /\b(?:where\s+(?:does?|do|is|are)\s+(?:this|the|that|these)\s+(?:data|info|information|results?)\s+(?:come|from))/i,
  /\b(?:can\s+i\s+trust|trust\s+(?:this|these|the|that))\b/i,
  /\b(?:how\s+(?:reliable|accurate|trustworthy|confident)\b)/i,
  /\b(?:source\s+of\s+(?:the\s+)?(?:data|information|results?))\b/i,
  /\b(?:is\s+(?:this|that|the)\s+(?:data|info|information)\s+(?:accurate|reliable|correct))\b/i,
  /\b(?:what\s+is|who\s+(?:is|are)|tell\s+me\s+about)\s+wyshbone\b/i,
  /\b(?:can|does|will|would|could)\s+(?:it|wyshbone|this|the\s+(?:system|tool|app|platform|bot))\s+(?:lie|make\s+(?:things?|stuff|it)\s+up|hallucinate|fabricate|invent|deceive)\b/i,
  /\b(?:is|are)\s+(?:it|wyshbone|this)\s+(?:honest|truthful|trustworthy|biased)\b/i,
  /\bhow\s+does\s+(?:wyshbone|this\s+(?:system|tool|app|platform|bot))\s+(?:work|function|operate)\b/i,
  /\bcan\s+(?:i|we)\s+trust\s+(?:it|wyshbone|this)\b/i,
];

const CHAT_INFO_PATTERNS = [
  /^(?:can\s+you\s+help\s+(?:me\s+)?with)\b/i,
  /^(?:how\s+(?:do|can|should)\s+i)\b/i,
  /^(?:what\s+(?:should|can|do)\s+i\s+(?:do|try|use))\b/i,
  /^(?:tell\s+me\s+(?:about|how|more))\b/i,
  /^(?:i\s+(?:need|want)\s+(?:help|advice|tips|guidance))\b/i,
  /^(?:any\s+(?:tips|advice|suggestions?|ideas?))\b/i,
  /^(?:explain|describe|what\s+(?:is|are)\s+(?:the\s+)?(?:best|good))\b/i,
  /\b(?:help\s+me\s+(?:with|understand|improve|grow|plan))\b/i,
  /\b(?:advice\s+(?:on|for|about))\b/i,
  /\b(?:how\s+to\s+(?:sell|market|grow|improve|increase|boost|generate|get\s+more))\b/i,
];

const ENTITY_NOUN_PATTERN = /\b(pubs?|bars?|restaurants?|cafes?|coffee\s+shops?|hotels?|dentists?|salons?|gyms?|clinics?|breweries?|bakeries?|florists?|venues?|shops?|stores?|businesses|companies|organisations?|organizations?|charities|electricians?|plumbers?|solicitors?|accountants?|butchers?|hairdressers?|mechanics?|vets?|veterinar(?:y|ians?)|nurseries|pharmacies|estate\s+agents?|letting\s+agents?)\b/i;

const SEARCH_VERB_PATTERN = /\b(?:find|search|look\s+for|looking\s+for|get\s+me|show\s+me|locate|discover)\b/i;

export function isMetaTrustQuestion(message: string): boolean {
  const normalized = message.toLowerCase().trim().replace(/[.,!?;:]+$/, '');
  return META_TRUST_PATTERNS.some(pat => pat.test(normalized));
}

export function classifyClarifyInput(message: string, session: ClarifySession): ClarifyInputClass {
  const normalized = message.toLowerCase().trim().replace(/[.,!?;:]+$/, '');

  if (isRunTrigger(message)) return 'EXECUTE';
  if (isBareAcknowledgement(message)) return 'EXECUTE';
  if (isUserCancelling(message)) return 'REFINE';

  for (const pat of META_TRUST_PATTERNS) {
    if (pat.test(normalized)) return 'META_TRUST';
  }

  if (/^new\s+question\s*:/i.test(normalized)) return 'NEW_TASK';

  if (session.entity_type) {
    const entityMatch = normalized.match(ENTITY_NOUN_PATTERN);
    if (entityMatch) {
      const mentioned = entityMatch[0].toLowerCase().replace(/s$/, '');
      const current = session.entity_type.toLowerCase().replace(/s$/, '');
      if (mentioned !== current && !current.includes(mentioned) && !mentioned.includes(current)) {
        return 'NEW_TASK';
      }
    }
  }

  const hasChatInfoPattern = CHAT_INFO_PATTERNS.some(pat => pat.test(normalized));
  if (hasChatInfoPattern && !SEARCH_VERB_PATTERN.test(normalized)) {
    return 'CHAT_INFO';
  }

  return 'REFINE';
}

export function _getSessionsMapForTesting(): Map<string, ClarifySession> {
  return sessions;
}

export function _getIntentsMapForTesting(): Map<string, LastSuccessfulIntent> {
  return lastIntents;
}
