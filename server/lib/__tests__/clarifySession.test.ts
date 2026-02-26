import {
  getActiveClarifySession,
  createClarifySession,
  handleClarifyResponse,
  closeAllClarifySessions,
  buildInitialQuestions,
  checkDbHealth,
  isMeaningfulClarificationAnswer,
  _getSessionsMapForTesting,
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

  await test('T2: reply "in Leeds" transitions to run_supervisor — session stays open', () => {
    createClarifySession({
      conversationId: 'conv-t2',
      originalUserText: 'find pubs',
      entityType: 'pubs',
      pendingQuestions: buildInitialQuestions('pubs', undefined),
    });

    const session = getActiveClarifySession('conv-t2');
    assert(session !== null, 'Session should exist');

    const result = handleClarifyResponse(session!, 'in Leeds');
    assert(result.action === 'run_supervisor', `Expected run_supervisor, got ${result.action}`);
    assert(result.clarifiedRequest !== undefined, 'Should have clarifiedRequest');
    assert(result.clarifiedRequest!.toLowerCase().includes('leeds'), 'Clarified request should include Leeds');
    assert(result.clarifiedRequest!.toLowerCase().includes('pubs'), 'Clarified request should include pubs');
    assert(result.entityType === 'pubs', 'entityType should be pubs');
    assert(result.location === 'Leeds', `location should be Leeds, got ${result.location}`);

    const stillActive = getActiveClarifySession('conv-t2');
    assert(stillActive !== null, 'Session must remain open — only routes.ts can close it');
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

  await test('T4: DB health check returns boolean', async () => {
    const result = await checkDbHealth();
    assert(typeof result === 'boolean', 'checkDbHealth should return boolean');
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
    assert(result.action === 'run_supervisor', 'Should transition to run_supervisor');

    const stillActive = getActiveClarifySession('conv-t8');
    assert(stillActive !== null, 'Session must remain open after run_supervisor');
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
    assert(result.action === 'run_supervisor', `Expected run_supervisor after sufficient clarification, got ${result.action}`);
    assert(result.clarifiedRequest !== undefined, 'Should have clarifiedRequest');
    assert(result.clarifiedRequest!.includes('organisations'), 'Should include entity type');
    assert(result.clarifiedRequest!.includes('blackpool'), 'Should include location');
  });

  cleanup();

  await test('T13: clarifySession module has no DB imports (static audit)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(process.cwd(), 'server/lib/clarifySession.ts');
    const source = fs.readFileSync(filePath, 'utf8');

    const lines = source.split('\n');
    const nonCheckDbLines = lines.filter(l => !l.includes('checkDbHealth') && !l.includes('async function checkDbHealth'));
    const coreSource = nonCheckDbLines.join('\n');

    assert(!coreSource.includes('import { neon }'), 'Core module should not import neon');
    assert(!coreSource.includes('from "@neondatabase'), 'Core module should not reference @neondatabase');
    assert(!coreSource.includes('buildContextWithFacts'), 'Core module should not reference buildContextWithFacts');
    assert(!coreSource.includes('SYSTEM_PROMPT'), 'Core module should not reference SYSTEM_PROMPT');
    assert(!coreSource.includes('saveMessage'), 'Core module should not reference saveMessage');
    assert(!coreSource.includes('createSupervisorTask'), 'Core module should not reference createSupervisorTask');
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

  await test('T15: "find pubs" → "in leeds" → run_supervisor returned, session stays open until caller closes', () => {
    createClarifySession({
      conversationId: 'conv-t15',
      originalUserText: 'find pubs',
      entityType: 'pubs',
      pendingQuestions: buildInitialQuestions('pubs', undefined),
    });

    const session = getActiveClarifySession('conv-t15');
    assert(session !== null, 'Session should exist');

    const result = handleClarifyResponse(session!, 'in Leeds');
    assert(result.action === 'run_supervisor', 'Should return run_supervisor');

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
    assert(result.action === 'run_supervisor', 'Should return run_supervisor');

    const stillActive = getActiveClarifySession('conv-t16');
    assert(stillActive !== null, 'Session must survive — simulates DB failure where caller does NOT close');
    assert(stillActive!.entity_type === 'pubs', 'Entity type preserved');
    assert(stillActive!.location === 'Manchester' || stillActive!.answers['location'] === 'Manchester', 'Location preserved');
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
