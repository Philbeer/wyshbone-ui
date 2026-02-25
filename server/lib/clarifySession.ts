import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.SUPABASE_DATABASE_URL!);

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
  awaiting_confirmation: boolean;
  created_at: string;
  updated_at: string;
}

const CANCEL_PHRASES = [
  'cancel', 'never mind', 'nevermind', 'stop', 'forget it',
  'forget that', 'abort', 'quit', 'start over', 'reset',
];

const CONFIRM_PHRASES = [
  'yes', 'yeah', 'yep', 'yup', 'ok', 'okay', 'sure',
  'go ahead', 'do it', 'run it', 'go for it', 'confirm',
  'please', 'proceed', 'let\'s go', 'sounds good', 'correct',
];

export async function ensureClarifySessionsTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS clarify_sessions (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      conversation_id TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      original_user_text TEXT NOT NULL,
      entity_type TEXT,
      location TEXT,
      semantic_constraint TEXT,
      pending_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
      answers JSONB NOT NULL DEFAULT '{}'::jsonb,
      clarified_request_text TEXT,
      awaiting_confirmation BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS clarify_sessions_conv_active_idx
    ON clarify_sessions (conversation_id, is_active)
    WHERE is_active = true
  `;
}

export async function getActiveClarifySession(conversationId: string): Promise<ClarifySession | null> {
  const rows = await sql`
    SELECT * FROM clarify_sessions
    WHERE conversation_id = ${conversationId} AND is_active = true
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    is_active: row.is_active,
    original_user_text: row.original_user_text,
    entity_type: row.entity_type,
    location: row.location,
    semantic_constraint: row.semantic_constraint,
    pending_questions: Array.isArray(row.pending_questions) ? row.pending_questions : JSON.parse(row.pending_questions || '[]'),
    answers: typeof row.answers === 'object' && row.answers !== null ? row.answers : JSON.parse(row.answers || '{}'),
    clarified_request_text: row.clarified_request_text,
    awaiting_confirmation: row.awaiting_confirmation,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function createClarifySession(params: {
  conversationId: string;
  originalUserText: string;
  entityType?: string;
  location?: string;
  semanticConstraint?: string;
  pendingQuestions: string[];
}): Promise<ClarifySession> {
  await sql`
    UPDATE clarify_sessions SET is_active = false, updated_at = now()
    WHERE conversation_id = ${params.conversationId} AND is_active = true
  `;

  const rows = await sql`
    INSERT INTO clarify_sessions (
      conversation_id, is_active, original_user_text, entity_type, location,
      semantic_constraint, pending_questions, answers, awaiting_confirmation
    ) VALUES (
      ${params.conversationId}, true, ${params.originalUserText},
      ${params.entityType || null}, ${params.location || null},
      ${params.semanticConstraint || null},
      ${JSON.stringify(params.pendingQuestions)}::jsonb,
      '{}'::jsonb, false
    )
    RETURNING *
  `;
  const row = rows[0];
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    is_active: row.is_active,
    original_user_text: row.original_user_text,
    entity_type: row.entity_type,
    location: row.location,
    semantic_constraint: row.semantic_constraint,
    pending_questions: Array.isArray(row.pending_questions) ? row.pending_questions : JSON.parse(row.pending_questions || '[]'),
    answers: typeof row.answers === 'object' && row.answers !== null ? row.answers : JSON.parse(row.answers || '{}'),
    clarified_request_text: row.clarified_request_text,
    awaiting_confirmation: row.awaiting_confirmation,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function updateClarifySession(sessionId: string, updates: {
  answers?: Record<string, string>;
  pendingQuestions?: string[];
  entityType?: string;
  location?: string;
  semanticConstraint?: string;
  clarifiedRequestText?: string;
  awaitingConfirmation?: boolean;
}): Promise<ClarifySession | null> {
  const setClauses: string[] = ['updated_at = now()'];
  const values: any[] = [];
  let paramIdx = 1;

  if (updates.answers !== undefined) {
    setClauses.push(`answers = $${paramIdx}::jsonb`);
    values.push(JSON.stringify(updates.answers));
    paramIdx++;
  }
  if (updates.pendingQuestions !== undefined) {
    setClauses.push(`pending_questions = $${paramIdx}::jsonb`);
    values.push(JSON.stringify(updates.pendingQuestions));
    paramIdx++;
  }
  if (updates.entityType !== undefined) {
    setClauses.push(`entity_type = $${paramIdx}`);
    values.push(updates.entityType);
    paramIdx++;
  }
  if (updates.location !== undefined) {
    setClauses.push(`location = $${paramIdx}`);
    values.push(updates.location);
    paramIdx++;
  }
  if (updates.semanticConstraint !== undefined) {
    setClauses.push(`semantic_constraint = $${paramIdx}`);
    values.push(updates.semanticConstraint);
    paramIdx++;
  }
  if (updates.clarifiedRequestText !== undefined) {
    setClauses.push(`clarified_request_text = $${paramIdx}`);
    values.push(updates.clarifiedRequestText);
    paramIdx++;
  }
  if (updates.awaitingConfirmation !== undefined) {
    setClauses.push(`awaiting_confirmation = $${paramIdx}`);
    values.push(updates.awaitingConfirmation);
    paramIdx++;
  }

  values.push(sessionId);
  const query = `UPDATE clarify_sessions SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`;
  const rows = await sql(query, values);

  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    is_active: row.is_active,
    original_user_text: row.original_user_text,
    entity_type: row.entity_type,
    location: row.location,
    semantic_constraint: row.semantic_constraint,
    pending_questions: Array.isArray(row.pending_questions) ? row.pending_questions : JSON.parse(row.pending_questions || '[]'),
    answers: typeof row.answers === 'object' && row.answers !== null ? row.answers : JSON.parse(row.answers || '{}'),
    clarified_request_text: row.clarified_request_text,
    awaiting_confirmation: row.awaiting_confirmation,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function closeClarifySession(sessionId: string): Promise<void> {
  await sql`
    UPDATE clarify_sessions SET is_active = false, updated_at = now()
    WHERE id = ${sessionId}
  `;
}

export async function closeAllClarifySessions(conversationId: string): Promise<void> {
  await sql`
    UPDATE clarify_sessions SET is_active = false, updated_at = now()
    WHERE conversation_id = ${conversationId} AND is_active = true
  `;
}

export function isUserCancelling(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  return CANCEL_PHRASES.some(phrase => normalized === phrase || normalized.startsWith(phrase + ' '));
}

export function isUserConfirming(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  return CONFIRM_PHRASES.some(phrase => normalized === phrase || normalized.startsWith(phrase + ' ') || normalized.startsWith(phrase + ',') || normalized.startsWith(phrase + '.'));
}

export interface ClarifyHandlerResult {
  action: 'ask_more' | 'run_supervisor' | 'cancelled';
  message?: string;
  clarifiedRequest?: string;
  entityType?: string;
  location?: string;
}

export async function handleClarifyResponse(
  session: ClarifySession,
  userMessage: string,
): Promise<ClarifyHandlerResult> {
  if (isUserCancelling(userMessage)) {
    await closeClarifySession(session.id);
    return {
      action: 'cancelled',
      message: 'No problem — search cancelled. What else can I help with?',
    };
  }

  const newAnswers = { ...session.answers };
  let entityType = session.entity_type;
  let location = session.location;
  let semanticConstraint = session.semantic_constraint;

  if (session.awaiting_confirmation && isUserConfirming(userMessage)) {
    if (entityType && location) {
      const clarifiedRequest = buildClarifiedRequest(entityType, location, semanticConstraint, newAnswers);
      await updateClarifySession(session.id, {
        clarifiedRequestText: clarifiedRequest,
        awaitingConfirmation: false,
      });
      await closeClarifySession(session.id);
      return {
        action: 'run_supervisor',
        clarifiedRequest,
        entityType: entityType || undefined,
        location: location || undefined,
      };
    }
  }

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
    await updateClarifySession(session.id, {
      answers: newAnswers,
      entityType: entityType || undefined,
      location: location || undefined,
      semanticConstraint: semanticConstraint || undefined,
      clarifiedRequestText: clarifiedRequest,
      pendingQuestions: [],
      awaitingConfirmation: false,
    });
    await closeClarifySession(session.id);
    return {
      action: 'run_supervisor',
      clarifiedRequest,
      entityType: entityType || undefined,
      location: location || undefined,
    };
  }

  const nextQuestions = buildNextQuestions(missingParts, entityType, location);
  await updateClarifySession(session.id, {
    answers: newAnswers,
    entityType: entityType || undefined,
    location: location || undefined,
    semanticConstraint: semanticConstraint || undefined,
    pendingQuestions: nextQuestions,
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
