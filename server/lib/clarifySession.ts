export interface ClarifySession {
  id: string;
  conversation_id: string;
  is_active: boolean;
  original_user_text: string;
  entity_type: string | null;
  location: string | null;
  semantic_constraint: string | null;
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
  'answers' | 'pending_questions' | 'entity_type' | 'location' | 'semantic_constraint' | 'clarified_request_text'
>>): ClarifySession | null {
  const s = sessions.get(conversationId);
  if (!s || !s.is_active) return null;
  if (updates.answers !== undefined) s.answers = updates.answers;
  if (updates.pending_questions !== undefined) s.pending_questions = updates.pending_questions;
  if (updates.entity_type !== undefined) s.entity_type = updates.entity_type;
  if (updates.location !== undefined) s.location = updates.location;
  if (updates.semantic_constraint !== undefined) s.semantic_constraint = updates.semantic_constraint;
  if (updates.clarified_request_text !== undefined) s.clarified_request_text = updates.clarified_request_text;
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

export interface ClarifyHandlerResult {
  action: 'ask_more' | 'run_supervisor' | 'cancelled';
  message?: string;
  clarifiedRequest?: string;
  entityType?: string;
  location?: string;
}

export function handleClarifyResponse(
  session: ClarifySession,
  userMessage: string,
): ClarifyHandlerResult {
  if (isUserCancelling(userMessage)) {
    closeClarifySession(session.conversation_id);
    return {
      action: 'cancelled',
      message: 'No problem — search cancelled. What else can I help with?',
    };
  }

  const newAnswers = { ...session.answers };
  let entityType = session.entity_type;
  let location = session.location;
  let semanticConstraint = session.semantic_constraint;

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
  }
  if (parsed.rawAnswer) {
    const questionIdx = Object.keys(newAnswers).filter(k => k.startsWith('q_')).length;
    newAnswers[`q_${questionIdx}`] = parsed.rawAnswer;
  }

  const missingParts: string[] = [];
  if (!entityType) missingParts.push('entity_type');
  if (!location) missingParts.push('location');

  if (missingParts.length === 0) {
    const clarifiedRequest = buildClarifiedRequest(entityType!, location!, semanticConstraint, newAnswers);
    updateClarifySession(session.conversation_id, {
      answers: newAnswers,
      entity_type: entityType,
      location: location,
      semantic_constraint: semanticConstraint,
      clarified_request_text: clarifiedRequest,
      pending_questions: [],
    });
    closeClarifySession(session.conversation_id);
    return {
      action: 'run_supervisor',
      clarifiedRequest,
      entityType: entityType || undefined,
      location: location || undefined,
    };
  }

  const nextQuestions = buildNextQuestions(missingParts, entityType, location);
  updateClarifySession(session.conversation_id, {
    answers: newAnswers,
    entity_type: entityType,
    location: location,
    semantic_constraint: semanticConstraint,
    pending_questions: nextQuestions,
  });

  const formattedMsg = `Thanks — just a bit more detail needed:\n\n${nextQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;
  return {
    action: 'ask_more',
    message: formattedMsg,
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

  const countMatch = normalized.match(/\b(\d+)\b/);
  if (countMatch) {
    result.count = countMatch[1];
  }

  if (!session.location) {
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
    if (!result.location && !countMatch && normalized.split(/\s+/).length <= 3) {
      result.location = message.trim().replace(/[.,!?;:]+$/, '');
    }
  }

  if (!session.entity_type) {
    const entityPatterns = [
      /(?:find|search|looking for|look for)\s+(.+?)(?:\s+(?:in|near|around)\s|$)/i,
    ];
    for (const pat of entityPatterns) {
      const match = message.match(pat);
      if (match && match[1]) {
        result.entityType = match[1].trim();
        break;
      }
    }
  }

  if (session.semantic_constraint !== null || session.pending_questions.some(q => q.toLowerCase().includes('mean') || q.toLowerCase().includes('clarify') || q.toLowerCase().includes('specify'))) {
    const parts = normalized.split(/[,;]+/).map(s => s.trim()).filter(s => s.length > 0);
    if (parts.length > 0) {
      const nonCountParts = parts.filter(p => !/^\d+$/.test(p));
      if (nonCountParts.length > 0) {
        result.semanticDetail = nonCountParts.join(', ');
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

function buildNextQuestions(missingParts: string[], entityType: string | null, location: string | null): string[] {
  const questions: string[] = [];
  if (missingParts.includes('entity_type')) {
    questions.push('What type of businesses or organisations are you looking for?');
  }
  if (missingParts.includes('location')) {
    questions.push('Which location or area should I search in?');
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

export async function checkDbHealth(): Promise<boolean> {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(process.env.SUPABASE_DATABASE_URL!);
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export function _getSessionsMapForTesting(): Map<string, ClarifySession> {
  return sessions;
}
