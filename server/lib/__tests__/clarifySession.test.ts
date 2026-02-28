import {
  getActiveClarifySession,
  createClarifySession,
  handleClarifyResponse,
  closeAllClarifySessions,
  buildInitialQuestions,
  isMeaningfulClarificationAnswer,
  saveLastSuccessfulIntent,
  getLastSuccessfulIntent,
  detectFollowupReuse,
  buildClarifyStatePayload,
  classifyClarifyInput,
  isMetaTrustQuestion,
  _getSessionsMapForTesting,
  _getIntentsMapForTesting,
} from '../clarifySession';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  const result = fn();
  if (result instanceof Promise) {
    return result.then(() => {
      passed++;
      console.log(`PASS: ${name}`);
    }).catch((e: any) => {
      failed++;
      console.error(`FAIL: ${name} — ${e.message}`);
    });
  }
  try {
    passed++;
    console.log(`PASS: ${name}`);
  } catch (e: any) {
    failed++;
    console.error(`FAIL: ${name} — ${e.message}`);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

function cleanup() {
  const map = _getSessionsMapForTesting();
  map.clear();
  const intents = _getIntentsMapForTesting();
  intents.clear();
}

async function runAll() {
  cleanup();

  await test('T1: "find pubs" → CLARIFY_FOR_RUN, no DB touch, session created in-memory', () => {
    const session = createClarifySession({
      conversationId: 'conv-t1',
      originalUserText: 'find pubs',
      entityType: 'pubs',
      pendingQuestions: buildInitialQuestions('pubs', undefined),
    });
    assert(session.id.startsWith('cs_'), 'Session ID should start with cs_');
    assert(session.entity_type === 'pubs', 'Entity type should be pubs');
    assert(session.location === null, 'Location should be null');
    assert(session.pending_questions.length > 0, 'Should have pending questions');
    assert(session.pending_questions.some(q => q.toLowerCase().includes('location')), 'Should ask for location');
    assert(session.semantic_constraint_resolved === false, 'semantic_constraint_resolved should default to false');

    const active = getActiveClarifySession('conv-t1');
    assert(active !== null, 'Session should be retrievable');
    assert(active!.id === session.id, 'Same session should be returned');
  });

  cleanup();

  await test('T2: reply "in Leeds" shows confirmation (ask_more) — session stays open', () => {
    createClarifySession({
      conversationId: 'conv-t2',
      originalUserText: 'find pubs',
      entityType: 'pubs',
      pendingQuestions: buildInitialQuestions('pubs', undefined),
    });

    const session = getActiveClarifySession('conv-t2');
    assert(session !== null, 'Session should exist');

    const result = handleClarifyResponse(session!, 'in Leeds');
    assert(result.action === 'ask_more', `Expected ask_more (confirmation), got ${result.action}`);
    assert(result.message!.includes('Search now'), 'Should prompt user to confirm with "Search now"');
    assert(result.message!.toLowerCase().includes('pubs'), 'Should include entity type in confirmation');
    assert(result.message!.toLowerCase().includes('leeds'), 'Should include location in confirmation');

    const updatedSession = getActiveClarifySession('conv-t2');
    assert(updatedSession !== null, 'Session must remain open');
    assert(updatedSession!.location === 'Leeds', 'Location should be stored');

    const confirmResult = handleClarifyResponse(updatedSession!, 'Search now');
    assert(confirmResult.action === 'run_supervisor', `Expected run_supervisor after confirm, got ${confirmResult.action}`);
    assert(confirmResult.clarifiedRequest!.toLowerCase().includes('leeds'), 'Clarified request should include Leeds');
    assert(confirmResult.clarifiedRequest!.toLowerCase().includes('pubs'), 'Clarified request should include pubs');
  });

  cleanup();

  await test('T3: semantic constraint → CLARIFY asks questions, never fails', () => {
    const session = createClarifySession({
      conversationId: 'conv-t3',
      originalUserText: 'find organisations that work with local authorities in blackpool',
      entityType: 'organisations',
      location: 'blackpool',
      semanticConstraint: 'that work with local authorities',
      pendingQuestions: buildInitialQuestions('organisations', 'blackpool', 'that work with local authorities'),
    });
    assert(session.pending_questions.length > 0, 'Should have questions for semantic constraint');
    assert(session.pending_questions.some(q => q.includes('local authorities')), 'Should ask about semantic constraint');

    const active = getActiveClarifySession('conv-t3');
    assert(active !== null, 'Session should exist');
  });

  cleanup();

  await test('T5: new entity request during clarification closes old session', () => {
    createClarifySession({
      conversationId: 'conv-t5',
      originalUserText: 'find pubs',
      entityType: 'pubs',
      pendingQuestions: buildInitialQuestions('pubs', undefined),
    });

    const old = getActiveClarifySession('conv-t5');
    assert(old !== null, 'Old session should exist');

    closeAllClarifySessions('conv-t5');

    const afterClose = getActiveClarifySession('conv-t5');
    assert(afterClose === null, 'Session should be closed');

    const newSession = createClarifySession({
      conversationId: 'conv-t5',
      originalUserText: 'find charities in London',
      entityType: 'charities',
      location: 'London',
      pendingQuestions: [],
    });
    assert(newSession.entity_type === 'charities', 'New session should have charities entity');
    assert(newSession.original_user_text === 'find charities in London', 'New session should have new request');
  });

  cleanup();

  await test('T6: cancellation returns cancelled action — session stays open for caller to close', () => {
    createClarifySession({
      conversationId: 'conv-t6',
      originalUserText: 'find pubs',
      entityType: 'pubs',
      pendingQuestions: buildInitialQuestions('pubs', undefined),
    });

    const session = getActiveClarifySession('conv-t6');
    const result = handleClarifyResponse(session!, 'cancel');
    assert(result.action === 'cancelled', 'Should be cancelled');

    const stillActive = getActiveClarifySession('conv-t6');
    assert(stillActive !== null, 'Session must remain open — caller (routes.ts) closes it');
  });

  cleanup();

  await test('T7: multi-turn — missing both entity and location', () => {
    createClarifySession({
      conversationId: 'conv-t7',
      originalUserText: 'find some businesses',
      pendingQuestions: buildInitialQuestions(undefined, undefined),
    });

    const session = getActiveClarifySession('conv-t7');
    assert(session !== null, 'Session should exist');
    assert(session!.entity_type === null, 'No entity type yet');
    assert(session!.location === null, 'No location yet');

    const r1 = handleClarifyResponse(session!, 'Manchester');
    assert(r1.action === 'ask_more', `Expected ask_more after location only, got ${r1.action}`);
  });

  cleanup();

  await test('T8: handleClarifyResponse is synchronous (no DB) — session stays open', () => {
    createClarifySession({
      conversationId: 'conv-t8',
      originalUserText: 'find pubs',
      entityType: 'pubs',
      pendingQuestions: buildInitialQuestions('pubs', undefined),
    });

    const session = getActiveClarifySession('conv-t8');
    const result = handleClarifyResponse(session!, 'in Bristol');
    assert(!(result instanceof Promise), 'handleClarifyResponse should not return a Promise');
    assert(result.action === 'ask_more', 'Should show confirmation (ask_more) when all fields filled');

    const updatedSession = getActiveClarifySession('conv-t8');
    assert(updatedSession !== null, 'Session must remain open');

    const confirmResult = handleClarifyResponse(updatedSession!, 'yes');
    assert(confirmResult.action === 'run_supervisor', 'Should transition to run_supervisor after confirmation');
  });

  cleanup();

  await test('T9: TTL — session with old timestamp is expired', () => {
    const map = _getSessionsMapForTesting();
    map.set('conv-ttl', {
      id: 'cs_old',
      conversation_id: 'conv-ttl',
      is_active: true,
      original_user_text: 'find pubs',
      entity_type: 'pubs',
      location: null,
      semantic_constraint: null,
      semantic_constraint_resolved: false,
      pending_questions: ['Where?'],
      answers: {},
      clarified_request_text: null,
      created_at: Date.now() - 31 * 60 * 1000,
      updated_at: Date.now() - 31 * 60 * 1000,
    });

    const result = getActiveClarifySession('conv-ttl');
    assert(result === null, 'Expired session should return null');
    assert(!map.has('conv-ttl'), 'Expired session should be cleaned from map');
  });

  cleanup();

  await test('T10: "yes" during clarification stays in CLARIFY_FOR_RUN (ask_more)', () => {
    createClarifySession({
      conversationId: 'conv-t10',
      originalUserText: 'find organisations that work with local authorities in blackpool',
      entityType: 'organisations',
      location: 'blackpool',
      semanticConstraint: 'that work with local authorities',
      pendingQuestions: buildInitialQuestions('organisations', 'blackpool', 'that work with local authorities'),
    });

    const session = getActiveClarifySession('conv-t10');
    assert(session !== null, 'Session should exist');

    const result = handleClarifyResponse(session!, 'yes');
    assert(result.action === 'ask_more', `Expected ask_more for bare "yes", got ${result.action}`);
    assert(result.message !== undefined, 'Should have a follow-up message');

    const stillActive = getActiveClarifySession('conv-t10');
    assert(stillActive !== null, 'Session should still be active after bare yes');
  });

  cleanup();

  await test('T11: bare acknowledgements are not meaningful answers', () => {
    const dummySession: any = {
      entity_type: 'pubs',
      location: null,
      pending_questions: ['Where?'],
    };
    const bareWords = ['yes', 'ok', 'sure', 'yeah', 'sounds good', 'go ahead', 'please', 'correct'];
    for (const word of bareWords) {
      assert(!isMeaningfulClarificationAnswer(word, dummySession), `"${word}" should NOT be meaningful`);
    }
    assert(isMeaningfulClarificationAnswer('in Leeds', dummySession), '"in Leeds" SHOULD be meaningful');
    assert(isMeaningfulClarificationAnswer('Manchester', dummySession), '"Manchester" SHOULD be meaningful');
    assert(isMeaningfulClarificationAnswer('pubs that serve food', dummySession), '"pubs that serve food" SHOULD be meaningful');
  });

  cleanup();

  await test('T12: sufficient semantic clarification transitions to RUN_SUPERVISOR', () => {
    createClarifySession({
      conversationId: 'conv-t12',
      originalUserText: 'find organisations that work with local authorities in blackpool',
      entityType: 'organisations',
      location: 'blackpool',
      semanticConstraint: 'that work with local authorities',
      pendingQuestions: buildInitialQuestions('organisations', 'blackpool', 'that work with local authorities'),
    });

    const session = getActiveClarifySession('conv-t12');
    const result = handleClarifyResponse(session!, 'I mean organisations that have contracts or partnerships with local councils');
    assert(result.action === 'ask_more', `Expected ask_more (confirmation) after sufficient clarification, got ${result.action}`);
    assert(result.message!.includes('Search now'), 'Should prompt user to confirm');
    assert(result.message!.toLowerCase().includes('organisations'), 'Should include entity type in confirmation');
    assert(result.message!.toLowerCase().includes('blackpool'), 'Should include location in confirmation');

    const updated = getActiveClarifySession('conv-t12');
    const confirmResult = handleClarifyResponse(updated!, 'search now');
    assert(confirmResult.action === 'run_supervisor', 'Should transition to run_supervisor after confirmation');
    assert(confirmResult.clarifiedRequest!.includes('organisations'), 'Should include entity type');
    assert(confirmResult.clarifiedRequest!.includes('blackpool'), 'Should include location');
  });

  cleanup();

  await test('T13: clarifySession module has no DB imports (static audit)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(process.cwd(), 'server/lib/clarifySession.ts');
    const source = fs.readFileSync(filePath, 'utf8');

    assert(!source.includes('import { neon }'), 'Core module should not import neon');
    assert(!source.includes('from "@neondatabase'), 'Core module should not reference @neondatabase');
    assert(!source.includes('buildContextWithFacts'), 'Core module should not reference buildContextWithFacts');
    assert(!source.includes('SYSTEM_PROMPT'), 'Core module should not reference SYSTEM_PROMPT');
    assert(!source.includes('saveMessage'), 'Core module should not reference saveMessage');
    assert(!source.includes('createSupervisorTask'), 'Core module should not reference createSupervisorTask');
  });

  cleanup();

  await test('T14: empty string is not a meaningful answer', () => {
    const dummySession: any = {
      entity_type: 'pubs',
      location: null,
      pending_questions: ['Where?'],
    };
    assert(!isMeaningfulClarificationAnswer('', dummySession), 'Empty string should NOT be meaningful');
    assert(!isMeaningfulClarificationAnswer('   ', dummySession), 'Whitespace should NOT be meaningful');
    assert(!isMeaningfulClarificationAnswer('ok.', dummySession), '"ok." should NOT be meaningful');
  });

  cleanup();

  await test('T15: "find pubs" → "in leeds" → confirmation → "search now" → run_supervisor, session stays open until caller closes', () => {
    createClarifySession({
      conversationId: 'conv-t15',
      originalUserText: 'find pubs',
      entityType: 'pubs',
      pendingQuestions: buildInitialQuestions('pubs', undefined),
    });

    const session = getActiveClarifySession('conv-t15');
    assert(session !== null, 'Session should exist');

    const result = handleClarifyResponse(session!, 'in Leeds');
    assert(result.action === 'ask_more', 'Should show confirmation first');

    const updated = getActiveClarifySession('conv-t15');
    const confirmResult = handleClarifyResponse(updated!, 'search now');
    assert(confirmResult.action === 'run_supervisor', 'Should return run_supervisor after confirmation');

    const beforeClose = getActiveClarifySession('conv-t15');
    assert(beforeClose !== null, 'Session MUST be alive before caller closes it');

    closeAllClarifySessions('conv-t15');

    const afterClose = getActiveClarifySession('conv-t15');
    assert(afterClose === null, 'Session should be gone after caller closes it');
  });

  cleanup();

  await test('T16: DB failure scenario — session preserved for retry', () => {
    createClarifySession({
      conversationId: 'conv-t16',
      originalUserText: 'find pubs',
      entityType: 'pubs',
      pendingQuestions: buildInitialQuestions('pubs', undefined),
    });

    const session = getActiveClarifySession('conv-t16');
    const result = handleClarifyResponse(session!, 'in Manchester');
    assert(result.action === 'ask_more', 'Should show confirmation first');

    const updated = getActiveClarifySession('conv-t16');
    const confirmResult = handleClarifyResponse(updated!, 'search now');
    assert(confirmResult.action === 'run_supervisor', 'Should return run_supervisor after confirmation');

    const stillActive = getActiveClarifySession('conv-t16');
    assert(stillActive !== null, 'Session must survive — simulates DB failure where caller does NOT close');
    assert(stillActive!.entity_type === 'pubs', 'Entity type preserved');
    assert(stillActive!.location === 'Manchester' || stillActive!.answers['location'] === 'Manchester', 'Location preserved');
  });

  cleanup();

  await test('T16b: bare number "5" is treated as count slot-fill, not re-ask', () => {
    createClarifySession({
      conversationId: 'conv-t16b',
      originalUserText: 'find pubs with live music',
      entityType: 'pubs with live music',
      location: 'Arundel',
      pendingQuestions: [],
    });

    const session = getActiveClarifySession('conv-t16b');
    assert(session !== null, 'Session should exist');

    const result = handleClarifyResponse(session!, '5');
    assert(result.action === 'ask_more', `Expected ask_more (confirmation with count), got ${result.action}`);
    assert(result.message!.includes('5'), 'Confirmation should include the count 5');
    assert(result.message!.toLowerCase().includes('pubs with live music'), 'Should NOT re-ask for entity type');
    assert(result.message!.toLowerCase().includes('arundel'), 'Should NOT re-ask for location');
    assert(result.message!.includes('Search now'), 'Should offer Search now confirmation');

    const updated = getActiveClarifySession('conv-t16b');
    assert(updated!.answers['count'] === '5', 'Count should be stored in answers');
  });

  cleanup();

  await test('T16c: full slot-fill flow — "Find pubs" → "Arundel" → "5" → "Search now" never re-asks', () => {
    createClarifySession({
      conversationId: 'conv-t16c',
      originalUserText: 'find pubs with live music',
      entityType: 'pubs with live music',
      pendingQuestions: buildInitialQuestions('pubs with live music', undefined),
    });

    const s1 = getActiveClarifySession('conv-t16c')!;
    const r1 = handleClarifyResponse(s1, 'Arundel');
    assert(r1.action === 'ask_more', 'Step 1: Should show confirmation after location fill');
    assert(r1.message!.toLowerCase().includes('arundel'), 'Step 1: Should include arundel');

    const s2 = getActiveClarifySession('conv-t16c')!;
    const r2 = handleClarifyResponse(s2, '5');
    assert(r2.action === 'ask_more', 'Step 2: Should show updated confirmation with count');
    assert(r2.message!.includes('5'), 'Step 2: Should include count 5');
    assert(r2.message!.toLowerCase().includes('arundel'), 'Step 2: Should still have arundel');
    assert(r2.message!.toLowerCase().includes('pubs with live music'), 'Step 2: Should still have entity type');

    const s3 = getActiveClarifySession('conv-t16c')!;
    const r3 = handleClarifyResponse(s3, 'Search now');
    assert(r3.action === 'run_supervisor', 'Step 3: Should trigger run_supervisor');
    assert(r3.clarifiedRequest!.includes('5'), 'Step 3: Count in clarified request');
    assert(r3.clarifiedRequest!.toLowerCase().includes('arundel'), 'Step 3: Location in clarified request');
    assert(r3.clarifiedRequest!.toLowerCase().includes('pubs with live music'), 'Step 3: Entity in clarified request');
  });

  cleanup();

  await test('T17: semantic constraint blocks auto-transition even with entity+location present', () => {
    createClarifySession({
      conversationId: 'conv-t17',
      originalUserText: 'find organisations that work with local authorities in blackpool',
      entityType: 'organisations',
      location: 'blackpool',
      semanticConstraint: 'that work with local authorities',
      pendingQuestions: buildInitialQuestions('organisations', 'blackpool', 'that work with local authorities'),
    });

    const session = getActiveClarifySession('conv-t17');
    assert(session !== null, 'Session should exist');
    assert(session!.semantic_constraint_resolved === false, 'Semantic constraint not resolved yet');

    const result = handleClarifyResponse(session!, 'in blackpool');
    assert(result.action === 'ask_more', `Expected ask_more because semantic constraint unresolved, got ${result.action}`);
    assert(result.message!.includes('local authorities'), 'Should re-ask about semantic constraint');

    const stillActive = getActiveClarifySession('conv-t17');
    assert(stillActive !== null, 'Session should still be active');
    assert(stillActive!.semantic_constraint_resolved === false, 'Semantic constraint still unresolved');
  });

  cleanup();

  await test('T18: bare acknowledgements do not resolve semantic constraint', () => {
    createClarifySession({
      conversationId: 'conv-t18',
      originalUserText: 'find organisations that work with local authorities in blackpool',
      entityType: 'organisations',
      location: 'blackpool',
      semanticConstraint: 'that work with local authorities',
      pendingQuestions: buildInitialQuestions('organisations', 'blackpool', 'that work with local authorities'),
    });

    const session = getActiveClarifySession('conv-t18');
    const bareWords = ['yes', 'ok', 'sure', 'go ahead'];
    for (const word of bareWords) {
      const r = handleClarifyResponse(session!, word);
      assert(r.action === 'ask_more', `"${word}" should not resolve semantic constraint — expected ask_more, got ${r.action}`);
    }

    const stillActive = getActiveClarifySession('conv-t18');
    assert(stillActive !== null, 'Session should still be active');
    assert(stillActive!.semantic_constraint_resolved === false, 'Semantic constraint still unresolved after bare words');
  });

  cleanup();

  await test('T19: follow-up reuse — "now do York" after successful run', () => {
    saveLastSuccessfulIntent('conv-t19', {
      business_type: 'pubs with live music',
      location: 'Arundel',
      requested_count: 5,
    });

    const intent = getLastSuccessfulIntent('conv-t19');
    assert(intent !== null, 'Intent should be stored');

    const r1 = detectFollowupReuse('now do York', intent!);
    assert(r1.isFollowup === true, '"now do York" should be detected as followup');
    assert(r1.newLocation === 'York', `Location should be York, got ${r1.newLocation}`);

    const r2 = detectFollowupReuse('same thing but Leeds', intent!);
    assert(r2.isFollowup === true, '"same thing but Leeds" should be followup');
    assert(r2.newLocation === 'Leeds', `Location should be Leeds, got ${r2.newLocation}`);

    const r3 = detectFollowupReuse('okay, try Manchester', intent!);
    assert(r3.isFollowup === true, '"okay, try Manchester" should be followup');
    assert(r3.newLocation === 'Manchester', `Location should be Manchester, got ${r3.newLocation}`);

    const r4 = detectFollowupReuse('how about Bristol', intent!);
    assert(r4.isFollowup === true, '"how about Bristol" should be followup');
    assert(r4.newLocation === 'Bristol', `Location should be Bristol, got ${r4.newLocation}`);
  });

  cleanup();

  await test('T20: follow-up reuse — scope change blocks reuse', () => {
    saveLastSuccessfulIntent('conv-t20', {
      business_type: 'pubs with live music',
      location: 'Arundel',
      requested_count: 5,
    });

    const intent = getLastSuccessfulIntent('conv-t20')!;

    const r1 = detectFollowupReuse('now find breweries in York', intent);
    assert(r1.isFollowup === false, '"now find breweries in York" should NOT be a followup (scope change)');

    const r2 = detectFollowupReuse('find restaurants in Leeds', intent);
    assert(r2.isFollowup === false, '"find restaurants in Leeds" should NOT be a followup (different entity)');
  });

  cleanup();

  await test('T21: follow-up reuse — intent TTL expiry', () => {
    const intents = _getIntentsMapForTesting();
    intents.set('conv-t21', {
      business_type: 'pubs',
      location: 'Arundel',
      timestamp: Date.now() - (61 * 60 * 1000),
    });

    const expired = getLastSuccessfulIntent('conv-t21');
    assert(expired === null, 'Intent older than 1 hour should be expired');
  });

  cleanup();

  await test('T22: follow-up reuse — bare location directive', () => {
    saveLastSuccessfulIntent('conv-t22', {
      business_type: 'pubs',
      location: 'Arundel',
      requested_count: 10,
    });

    const intent = getLastSuccessfulIntent('conv-t22')!;
    const r = detectFollowupReuse('in Sheffield', intent);
    assert(r.isFollowup === true, '"in Sheffield" should be followup');
    assert(r.newLocation === 'Sheffield', `Location should be Sheffield, got ${r.newLocation}`);
  });

  cleanup();

  await test('T23: "12 months" must NOT extract 12 as result count', () => {
    createClarifySession({
      conversationId: 'conv-t23',
      originalUserText: 'find pubs',
      entityType: 'pubs',
      pendingQuestions: buildInitialQuestions('pubs', undefined),
    });

    const s1 = getActiveClarifySession('conv-t23')!;
    const r1 = handleClarifyResponse(s1, 'in Leeds');
    assert(r1.action === 'ask_more', 'Step 1: confirm after location');

    const s2 = getActiveClarifySession('conv-t23')!;
    const r2 = handleClarifyResponse(s2, 'established in the last 12 months');
    assert(r2.action === 'ask_more', 'Step 2: ask_more after semantic detail');
    assert(!s2.answers['count'] || s2.answers['count'] !== '12',
      '"12 months" must NOT set count to 12');

    const s3 = getActiveClarifySession('conv-t23')!;
    assert(s3.answers['count'] === undefined || s3.answers['count'] !== '12',
      'After "12 months", count slot must remain empty or not be 12');
  });

  cleanup();

  await test('T24: typed "search now" with missing fields gives clear error, not silent fallthrough', () => {
    createClarifySession({
      conversationId: 'conv-t24',
      originalUserText: 'find pubs',
      entityType: 'pubs',
      pendingQuestions: buildInitialQuestions('pubs', undefined),
    });

    const session = getActiveClarifySession('conv-t24')!;
    const result = handleClarifyResponse(session, 'search now');
    assert(result.action === 'ask_more', 'Should be ask_more when fields missing');
    assert(result.message!.toLowerCase().includes('need'), 'Should tell user what is missing');
    assert(result.message!.toLowerCase().includes('location'), 'Should mention location is missing');
  });

  cleanup();

  await test('T25: clarifyState is returned in ask_more results', () => {
    createClarifySession({
      conversationId: 'conv-t25',
      originalUserText: 'find pubs',
      entityType: 'pubs',
      pendingQuestions: buildInitialQuestions('pubs', undefined),
    });

    const session = getActiveClarifySession('conv-t25')!;
    const r1 = handleClarifyResponse(session, 'in Leeds');
    assert(r1.clarifyState !== undefined, 'ask_more result should include clarifyState');
    assert(r1.clarifyState!.entityType === 'pubs', 'clarifyState should have entityType');
    assert(r1.clarifyState!.location === 'Leeds', 'clarifyState should have location');
    assert(r1.clarifyState!.status === 'ready', 'Status should be ready when all fields filled');
    assert(r1.clarifyState!.missingFields.length === 0, 'No missing fields');
  });

  cleanup();

  await test('T26: clarifyState with missing fields shows gathering status', () => {
    createClarifySession({
      conversationId: 'conv-t26',
      originalUserText: 'find some businesses',
      pendingQuestions: buildInitialQuestions(undefined, undefined),
    });

    const session = getActiveClarifySession('conv-t26')!;
    const state = buildClarifyStatePayload(session);
    assert(state.status === 'gathering', 'Status should be gathering when fields missing');
    assert(state.missingFields.includes('entity_type'), 'Should list entity_type as missing');
    assert(state.missingFields.includes('location'), 'Should list location as missing');
    assert(state.entityType === null, 'entityType should be null');
    assert(state.location === null, 'location should be null');
  });

  cleanup();

  await test('T27: standalone count "50" IS extracted as count', () => {
    createClarifySession({
      conversationId: 'conv-t27',
      originalUserText: 'find pubs',
      entityType: 'pubs',
      location: 'Leeds',
      pendingQuestions: [],
    });

    const session = getActiveClarifySession('conv-t27')!;
    const result = handleClarifyResponse(session, '50');
    assert(result.action === 'ask_more', 'Should confirm with count');

    const updated = getActiveClarifySession('conv-t27')!;
    assert(updated.answers['count'] === '50', 'Standalone 50 should be extracted as count');
  });

  cleanup();

  await test('T28: "cafes in bristol" during pubs clarify → NEW_TASK', () => {
    createClarifySession({
      conversationId: 'conv-t28',
      originalUserText: 'find pubs',
      entityType: 'pubs',
      pendingQuestions: buildInitialQuestions('pubs', undefined),
    });

    const session = getActiveClarifySession('conv-t28')!;
    const cls = classifyClarifyInput('cafes in bristol', session);
    assert(cls === 'NEW_TASK', `Expected NEW_TASK, got ${cls}`);
  });

  cleanup();

  await test('T29: "find restaurants in York" during pubs clarify → NEW_TASK', () => {
    createClarifySession({
      conversationId: 'conv-t29',
      originalUserText: 'find pubs',
      entityType: 'pubs',
      pendingQuestions: buildInitialQuestions('pubs', undefined),
    });

    const session = getActiveClarifySession('conv-t29')!;
    const cls = classifyClarifyInput('find restaurants in York', session);
    assert(cls === 'NEW_TASK', `Expected NEW_TASK, got ${cls}`);
  });

  cleanup();

  await test('T30: "are these results guaranteed correct" during clarify → META_TRUST', () => {
    createClarifySession({
      conversationId: 'conv-t30',
      originalUserText: 'find pubs',
      entityType: 'pubs',
      pendingQuestions: buildInitialQuestions('pubs', undefined),
    });

    const session = getActiveClarifySession('conv-t30')!;
    const cls = classifyClarifyInput('are these results guaranteed correct', session);
    assert(cls === 'META_TRUST', `Expected META_TRUST, got ${cls}`);
  });

  cleanup();

  await test('T31: "can i trust this data" during clarify → META_TRUST', () => {
    createClarifySession({
      conversationId: 'conv-t31',
      originalUserText: 'find pubs',
      entityType: 'pubs',
      pendingQuestions: buildInitialQuestions('pubs', undefined),
    });

    const session = getActiveClarifySession('conv-t31')!;
    const cls = classifyClarifyInput('can i trust this data', session);
    assert(cls === 'META_TRUST', `Expected META_TRUST, got ${cls}`);
  });

  cleanup();

  await test('T32: "search now" during clarify → EXECUTE', () => {
    createClarifySession({
      conversationId: 'conv-t32',
      originalUserText: 'find pubs',
      entityType: 'pubs',
      location: 'Leeds',
      pendingQuestions: [],
    });

    const session = getActiveClarifySession('conv-t32')!;
    const cls = classifyClarifyInput('search now', session);
    assert(cls === 'EXECUTE', `Expected EXECUTE, got ${cls}`);
  });

  cleanup();

  await test('T33: "in Leeds" during pubs clarify → REFINE (same entity)', () => {
    createClarifySession({
      conversationId: 'conv-t33',
      originalUserText: 'find pubs',
      entityType: 'pubs',
      pendingQuestions: buildInitialQuestions('pubs', undefined),
    });

    const session = getActiveClarifySession('conv-t33')!;
    const cls = classifyClarifyInput('in Leeds', session);
    assert(cls === 'REFINE', `Expected REFINE, got ${cls}`);
  });

  cleanup();

  await test('T34: "pubs in Manchester" during pubs clarify → REFINE (same entity)', () => {
    createClarifySession({
      conversationId: 'conv-t34',
      originalUserText: 'find pubs',
      entityType: 'pubs',
      pendingQuestions: buildInitialQuestions('pubs', undefined),
    });

    const session = getActiveClarifySession('conv-t34')!;
    const cls = classifyClarifyInput('pubs in Manchester', session);
    assert(cls === 'REFINE', `Expected REFINE, got ${cls}`);
  });

  cleanup();

  await test('T35: "new question: what about dentists" during clarify → NEW_TASK', () => {
    createClarifySession({
      conversationId: 'conv-t35',
      originalUserText: 'find pubs',
      entityType: 'pubs',
      pendingQuestions: buildInitialQuestions('pubs', undefined),
    });

    const session = getActiveClarifySession('conv-t35')!;
    const cls = classifyClarifyInput('new question: what about dentists', session);
    assert(cls === 'NEW_TASK', `Expected NEW_TASK, got ${cls}`);
  });

  cleanup();

  await test('T36: META_TRUST does not alter session slots', () => {
    createClarifySession({
      conversationId: 'conv-t36',
      originalUserText: 'find pubs',
      entityType: 'pubs',
      location: 'Leeds',
      pendingQuestions: [],
    });

    const session = getActiveClarifySession('conv-t36')!;
    const cls = classifyClarifyInput('how reliable is this data', session);
    assert(cls === 'META_TRUST', `Expected META_TRUST, got ${cls}`);
    const afterSession = getActiveClarifySession('conv-t36')!;
    assert(afterSession.entity_type === 'pubs', 'entity_type should still be pubs');
    assert(afterSession.location === 'Leeds', 'location should still be Leeds');
    assert(afterSession.is_active === true, 'session should still be active');
  });

  cleanup();

  await test('T37: "yes" during clarify → EXECUTE', () => {
    createClarifySession({
      conversationId: 'conv-t37',
      originalUserText: 'find pubs',
      entityType: 'pubs',
      location: 'Leeds',
      pendingQuestions: [],
    });

    const session = getActiveClarifySession('conv-t37')!;
    const cls = classifyClarifyInput('yes', session);
    assert(cls === 'EXECUTE', `Expected EXECUTE, got ${cls}`);
  });

  cleanup();

  await test('T38: "cancel" during clarify → REFINE (cancel handled inside handleClarifyResponse)', () => {
    createClarifySession({
      conversationId: 'conv-t38',
      originalUserText: 'find pubs',
      entityType: 'pubs',
      pendingQuestions: buildInitialQuestions('pubs', undefined),
    });

    const session = getActiveClarifySession('conv-t38')!;
    const cls = classifyClarifyInput('cancel', session);
    assert(cls === 'REFINE', `Expected REFINE, got ${cls} — cancel should route through handleClarifyResponse`);
  });

  cleanup();

  await test('T39: isMetaTrustQuestion detects trust questions standalone (no session needed)', () => {
    assert(isMetaTrustQuestion('are these results guaranteed correct') === true, 'guaranteed → true');
    assert(isMetaTrustQuestion('how accurate is this data') === true, 'accurate → true');
    assert(isMetaTrustQuestion('can I trust this data') === true, 'trust → true');
    assert(isMetaTrustQuestion('how reliable are the results') === true, 'reliable → true');
    assert(isMetaTrustQuestion('where does this data come from') === true, 'where from → true');
    assert(isMetaTrustQuestion('find pubs in Leeds') === false, 'search query → false');
    assert(isMetaTrustQuestion('in Manchester') === false, 'location → false');
    assert(isMetaTrustQuestion('search now') === false, 'run trigger → false');
  });

  cleanup();

  await test('T40: META_TRUST during active clarify session does not mutate session', () => {
    createClarifySession({
      conversationId: 'conv-t40',
      originalUserText: 'find pubs',
      entityType: 'pubs',
      location: 'Leeds',
      pendingQuestions: [],
    });

    const sessionBefore = getActiveClarifySession('conv-t40')!;
    assert(sessionBefore.is_active === true, 'session should be active');
    assert(sessionBefore.entity_type === 'pubs', 'entity_type should be pubs');

    const isTrust = isMetaTrustQuestion('are these results guaranteed correct');
    assert(isTrust === true, 'should detect trust question');

    const sessionAfter = getActiveClarifySession('conv-t40')!;
    assert(sessionAfter.is_active === true, 'session should still be active after trust check');
    assert(sessionAfter.entity_type === 'pubs', 'entity_type should still be pubs');
    assert(sessionAfter.location === 'Leeds', 'location should still be Leeds');
  });

  cleanup();

  await test('T41: META_TRUST fires even without any clarify session', () => {
    const session = getActiveClarifySession('conv-t41');
    assert(session === null, 'no session should exist');

    const isTrust = isMetaTrustQuestion('how sure are you about this data');
    assert(isTrust === true, 'should detect trust question without session');
  });

  cleanup();

  await test('T42: "can you help me with sales" during clarify → CHAT_INFO', () => {
    createClarifySession({
      conversationId: 'conv-t42',
      originalUserText: 'find pubs in west sussex',
      entityType: 'pubs',
      location: 'West Sussex',
      pendingQuestions: [],
    });

    const session = getActiveClarifySession('conv-t42')!;
    const cls = classifyClarifyInput('can you help me with sales', session);
    assert(cls === 'CHAT_INFO', `Expected CHAT_INFO, got ${cls}`);
    const after = getActiveClarifySession('conv-t42')!;
    assert(after.is_active === true, 'session should still be active');
    assert(after.entity_type === 'pubs', 'entity_type should still be pubs');
    assert(after.location === 'West Sussex', 'location should still be West Sussex');
  });

  cleanup();

  await test('T43: "how do I sell more" during clarify → CHAT_INFO', () => {
    createClarifySession({
      conversationId: 'conv-t43',
      originalUserText: 'find pubs',
      entityType: 'pubs',
      pendingQuestions: buildInitialQuestions('pubs', undefined),
    });

    const session = getActiveClarifySession('conv-t43')!;
    const cls = classifyClarifyInput('how do I sell more', session);
    assert(cls === 'CHAT_INFO', `Expected CHAT_INFO, got ${cls}`);
  });

  cleanup();

  await test('T44: "what should I do next" during clarify → CHAT_INFO', () => {
    createClarifySession({
      conversationId: 'conv-t44',
      originalUserText: 'find pubs',
      entityType: 'pubs',
      pendingQuestions: buildInitialQuestions('pubs', undefined),
    });

    const session = getActiveClarifySession('conv-t44')!;
    const cls = classifyClarifyInput('what should I do next', session);
    assert(cls === 'CHAT_INFO', `Expected CHAT_INFO, got ${cls}`);
  });

  cleanup();

  await test('T45: "any tips on marketing" during clarify → CHAT_INFO', () => {
    createClarifySession({
      conversationId: 'conv-t45',
      originalUserText: 'find pubs',
      entityType: 'pubs',
      pendingQuestions: buildInitialQuestions('pubs', undefined),
    });

    const session = getActiveClarifySession('conv-t45')!;
    const cls = classifyClarifyInput('any tips on marketing', session);
    assert(cls === 'CHAT_INFO', `Expected CHAT_INFO, got ${cls}`);
  });

  cleanup();

  await test('T46: "how to generate more leads" during clarify → CHAT_INFO', () => {
    createClarifySession({
      conversationId: 'conv-t46',
      originalUserText: 'find pubs',
      entityType: 'pubs',
      pendingQuestions: buildInitialQuestions('pubs', undefined),
    });

    const session = getActiveClarifySession('conv-t46')!;
    const cls = classifyClarifyInput('how to generate more leads', session);
    assert(cls === 'CHAT_INFO', `Expected CHAT_INFO, got ${cls}`);
  });

  cleanup();

  await test('T47: "find me some cafes" during clarify → NOT CHAT_INFO (has search verb)', () => {
    createClarifySession({
      conversationId: 'conv-t47',
      originalUserText: 'find pubs',
      entityType: 'pubs',
      pendingQuestions: buildInitialQuestions('pubs', undefined),
    });

    const session = getActiveClarifySession('conv-t47')!;
    const cls = classifyClarifyInput('find me some cafes', session);
    assert(cls !== 'CHAT_INFO', `Should NOT be CHAT_INFO when message has search verb, got ${cls}`);
  });

  cleanup();

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('All tests passed!');
  }
}

runAll().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
