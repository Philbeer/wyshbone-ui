import { test, expect, type APIRequestContext } from '@playwright/test';

const API_BASE = 'http://localhost:5001';
const TEST_USER_ID = 'test-subj-gate-user';
const TEST_USER_EMAIL = 'subj-gate-test@test.dev';

test.describe('Subjective Constraint Gate', () => {

  async function sendChat(request: APIRequestContext, message: string, conversationId?: string) {
    const convId = conversationId || `test-conv-${Date.now()}`;
    const response = await request.post(
      `${API_BASE}/api/chat?user_id=${TEST_USER_ID}&user_email=${encodeURIComponent(TEST_USER_EMAIL)}`,
      {
        data: {
          messages: [{ role: 'user', content: message }],
          conversationId: convId,
          user: { id: TEST_USER_ID, email: TEST_USER_EMAIL },
        },
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
      },
    );
    const text = await response.text();
    const events: any[] = [];
    for (const line of text.split('\n')) {
      if (line.startsWith('data: ') && !line.includes('[DONE]')) {
        try {
          events.push(JSON.parse(line.slice(6)));
        } catch {}
      }
    }
    return { response, events, convId };
  }

  test('T1: Subjective clarification renders "Waiting for clarification" and why_blocked', async ({ request }) => {
    const { events } = await sendChat(request, 'Find nice bars in Manchester');

    const clarifyEvent = events.find(e => e.type === 'clarify_for_run');
    expect(clarifyEvent).toBeTruthy();
    expect(clarifyEvent.clarify_state).toBeTruthy();

    const cs = clarifyEvent.clarify_state;
    const contract = cs.constraint_contract;
    expect(contract).toBeTruthy();
    expect(contract.type).toBe('subjective');
    expect(contract.can_execute).toBe(false);
    expect(contract.why_blocked).toBeTruthy();
    expect(contract.why_blocked).toContain('nice');
    expect(contract.subjective_options).toBeTruthy();
    expect(contract.subjective_options.length).toBeGreaterThan(0);
    expect(contract.subjective_options).toContain('Lively');
    expect(contract.subjective_options).toContain('Quiet');
    expect(contract.subjective_options).toContain('Cosy');

    const messageEvent = events.find(e => e.type === 'message' && e.role === 'assistant');
    expect(messageEvent).toBeTruthy();
    expect(messageEvent.content).toContain("'nice'");

    console.log('✅ T1: Subjective gate blocks execution and includes why_blocked + options');
  });

  test('T2: "Search now" does not appear while subjective constraint unresolved', async ({ request }) => {
    const { events } = await sendChat(request, 'Find nice bars in Manchester');

    const clarifyEvent = events.find(e => e.type === 'clarify_for_run');
    expect(clarifyEvent).toBeTruthy();

    const cs = clarifyEvent.clarify_state;
    expect(cs.constraint_contract.can_execute).toBe(false);
    expect(cs.status).toBe('gathering');

    const messageEvent = events.find(e => e.type === 'message' && e.role === 'assistant');
    expect(messageEvent).toBeTruthy();
    expect(messageEvent.content).not.toContain('**Search now**');

    console.log('✅ T2: Search now not shown while subjective constraint is unresolved');
  });

  test('T3: Clicking "Lively" resolves the subjective gate and results in can_execute true', async ({ request }) => {
    const { events: initialEvents } = await sendChat(request, 'Find nice bars in Manchester');
    const clarifyEvent = initialEvents.find(e => e.type === 'clarify_for_run');
    expect(clarifyEvent).toBeTruthy();
    expect(clarifyEvent.clarify_state.constraint_contract.can_execute).toBe(false);

    const serverConvId = initialEvents.find(e => e.conversationId)?.conversationId;
    expect(serverConvId).toBeTruthy();

    const { events: resolveEvents } = await sendChat(request, 'Lively', serverConvId);

    const resolveClarifyEvent = resolveEvents.find(e => e.type === 'clarify_for_run');
    expect(resolveClarifyEvent).toBeTruthy();

    const resolvedContract = resolveClarifyEvent.clarify_state.constraint_contract;
    expect(resolvedContract).toBeTruthy();
    expect(resolvedContract.can_execute).toBe(true);

    const resolvedStatus = resolveClarifyEvent.clarify_state.status;
    expect(resolvedStatus).toBe('ready');

    const messageEvent = resolveEvents.find(e => e.type === 'message' && e.role === 'assistant');
    expect(messageEvent).toBeTruthy();
    expect(messageEvent.content.toLowerCase()).toContain('lively');

    console.log('✅ T3: Selecting "Lively" resolves subjective gate, can_execute=true, status=ready');
  });

  test('T4: Regression - time-predicate gate still works', async ({ request }) => {
    const { events } = await sendChat(request, 'Find pubs that opened in the last 12 months in Manchester');

    const clarifyEvent = events.find(e => e.type === 'clarify_for_run');
    expect(clarifyEvent).toBeTruthy();

    const cs = clarifyEvent.clarify_state;
    const contract = cs.constraint_contract;
    expect(contract).toBeTruthy();
    expect(contract.type).toBe('time_predicate');
    expect(contract.can_execute).toBe(false);
    expect(contract.proxy_options).toBeTruthy();
    expect(contract.proxy_options.length).toBeGreaterThan(0);

    console.log('✅ T4: Time-predicate gate still works correctly');
  });

  test('T5: Multiple subjective terms detected', async ({ request }) => {
    const { events } = await sendChat(request, 'Find nice good bars in Manchester');

    const clarifyEvent = events.find(e => e.type === 'clarify_for_run');
    expect(clarifyEvent).toBeTruthy();

    const cs = clarifyEvent.clarify_state;
    const contract = cs.constraint_contract;
    expect(contract).toBeTruthy();
    expect(contract.type).toBe('subjective');
    expect(contract.why_blocked).toContain('nice');
    expect(contract.why_blocked).toContain('good');

    const messageEvent = events.find(e => e.type === 'message' && e.role === 'assistant');
    expect(messageEvent).toBeTruthy();
    expect(messageEvent.content).toContain("'nice'");
    expect(messageEvent.content).toContain("'good'");

    console.log('✅ T5: Multiple subjective terms detected and shown');
  });

  test('T6: Non-subjective queries pass through without gate', async ({ request }) => {
    const { events } = await sendChat(request, 'Find pubs in Manchester');

    const clarifyEvent = events.find(e => e.type === 'clarify_for_run');
    if (clarifyEvent) {
      const cs = clarifyEvent.clarify_state;
      const contract = cs.constraint_contract;
      if (contract) {
        expect(contract.type).not.toBe('subjective');
      }
    }

    console.log('✅ T6: Non-subjective queries not gated by subjective constraint');
  });

  test('T7: Compound query (subjective + time) shows subjective first, then time after resolution', async ({ request }) => {
    const { events: step1Events } = await sendChat(request, 'Find nice pubs that opened recently in Manchester');

    const step1Clarify = step1Events.find(e => e.type === 'clarify_for_run');
    expect(step1Clarify).toBeTruthy();
    const step1Contract = step1Clarify.clarify_state.constraint_contract;
    expect(step1Contract.type).toBe('subjective');
    expect(step1Contract.can_execute).toBe(false);
    expect(step1Contract.subjective_options).toBeTruthy();

    expect(step1Clarify.clarify_state.pendingQuestions.length).toBe(1);
    expect(step1Clarify.clarify_state.pendingQuestions[0]).toContain("'nice'");
    expect(step1Clarify.clarify_state.pendingQuestions[0]).not.toContain('proxy');
    expect(step1Clarify.clarify_state.pendingQuestions[0]).not.toContain('opened');

    const serverConvId = step1Events.find(e => e.conversationId)?.conversationId;
    expect(serverConvId).toBeTruthy();

    const { events: step2Events } = await sendChat(request, 'Lively', serverConvId);

    const step2Clarify = step2Events.find(e => e.type === 'clarify_for_run');
    expect(step2Clarify).toBeTruthy();
    const step2Contract = step2Clarify.clarify_state.constraint_contract;
    expect(step2Contract.type).toBe('time_predicate');
    expect(step2Contract.can_execute).toBe(false);
    expect(step2Contract.proxy_options).toBeTruthy();
    expect(step2Contract.proxy_options.length).toBeGreaterThan(0);

    expect(step2Clarify.clarify_state.status).toBe('gathering');

    const step2Message = step2Events.find(e => e.type === 'message' && e.role === 'assistant');
    expect(step2Message).toBeTruthy();
    expect(step2Message.content.toLowerCase()).toContain('lively');
    expect(step2Message.content).toContain('proxy');

    console.log('✅ T7: Compound query sequences subjective → time_predicate correctly');
  });

  test('T8: Pure time-predicate query (no subjective) shows time_predicate immediately', async ({ request }) => {
    const { events } = await sendChat(request, 'Find pubs that opened recently in Manchester');

    const clarifyEvent = events.find(e => e.type === 'clarify_for_run');
    expect(clarifyEvent).toBeTruthy();

    const contract = clarifyEvent.clarify_state.constraint_contract;
    expect(contract).toBeTruthy();
    expect(contract.type).toBe('time_predicate');
    expect(contract.proxy_options).toBeTruthy();

    console.log('✅ T8: Pure time-predicate shows immediately without subjective gate');
  });

  test('T9: Subjective-only query does not queue any further constraints', async ({ request }) => {
    const { events: step1Events } = await sendChat(request, 'Find nice bars in Manchester');

    const step1Clarify = step1Events.find(e => e.type === 'clarify_for_run');
    expect(step1Clarify).toBeTruthy();
    expect(step1Clarify.clarify_state.constraint_contract.type).toBe('subjective');

    const serverConvId = step1Events.find(e => e.conversationId)?.conversationId;
    const { events: step2Events } = await sendChat(request, 'Lively', serverConvId);

    const step2Clarify = step2Events.find(e => e.type === 'clarify_for_run');
    expect(step2Clarify).toBeTruthy();
    expect(step2Clarify.clarify_state.constraint_contract.can_execute).toBe(true);
    expect(step2Clarify.clarify_state.status).toBe('ready');

    console.log('✅ T9: Subjective-only resolves to ready (no queued constraints)');
  });
});
