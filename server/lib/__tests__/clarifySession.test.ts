import {
  getActiveClarifySession,
  createClarifySession,
  handleClarifyResponse,
  closeAllClarifySessions,
  buildInitialQuestions,
  checkDbHealth,
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

    const active = getActiveClarifySession('conv-t1');
    assert(active !== null, 'Session should be retrievable');
    assert(active!.id === session.id, 'Same session should be returned');
  });

  cleanup();

  await test('T2: reply "in Leeds" transitions to RUN_SUPERVISOR', () => {
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

    const afterClose = getActiveClarifySession('conv-t2');
    assert(afterClose === null, 'Session should be closed after transition');
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

  await test('T6: cancellation closes session', () => {
    createClarifySession({
      conversationId: 'conv-t6',
      originalUserText: 'find pubs',
      entityType: 'pubs',
      pendingQuestions: buildInitialQuestions('pubs', undefined),
    });

    const session = getActiveClarifySession('conv-t6');
    const result = handleClarifyResponse(session!, 'cancel');
    assert(result.action === 'cancelled', 'Should be cancelled');

    const afterCancel = getActiveClarifySession('conv-t6');
    assert(afterCancel === null, 'Session should be gone after cancel');
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

  await test('T8: handleClarifyResponse is synchronous (no DB)', () => {
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
