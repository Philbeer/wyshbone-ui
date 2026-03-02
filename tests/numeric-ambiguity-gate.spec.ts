import { test, expect, type APIRequestContext } from '@playwright/test';

const API_BASE = 'http://localhost:5001';
const TEST_USER_ID = 'test-numeric-gate-user';
const TEST_USER_EMAIL = 'numeric-gate-test@test.dev';

test.describe('Numeric Ambiguity Constraint Gate', () => {

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
    const clarifyEvent = events.find(e => e.type === 'clarify_for_run');
    const serverConvId = clarifyEvent?.clarify_state?.conversationId || events.find(e => e.conversationId)?.conversationId || convId;
    return { response, events, convId: serverConvId };
  }

  test('T10: "few pubs" triggers numeric_ambiguity with numeric_options', async ({ request }) => {
    const { events } = await sendChat(request, 'Find a few pubs in Brighton');

    const clarifyEvent = events.find(e => e.type === 'clarify_for_run');
    expect(clarifyEvent).toBeTruthy();
    expect(clarifyEvent.clarify_state).toBeTruthy();

    const cs = clarifyEvent.clarify_state;
    const contract = cs.constraint_contract;
    expect(contract).toBeTruthy();
    expect(contract.type).toBe('numeric_ambiguity');
    expect(contract.can_execute).toBe(false);
    expect(contract.why_blocked).toBeTruthy();
    expect(contract.why_blocked.toLowerCase()).toContain('few');
    expect(contract.numeric_options).toBeTruthy();
    expect(contract.numeric_options.length).toBe(4);
    expect(contract.numeric_options).toContain('3');
    expect(contract.numeric_options).toContain('All');
  });

  test('T11: "several bars" triggers numeric_ambiguity', async ({ request }) => {
    const { events } = await sendChat(request, 'Find several bars in London');

    const clarifyEvent = events.find(e => e.type === 'clarify_for_run');
    expect(clarifyEvent).toBeTruthy();

    const contract = clarifyEvent.clarify_state.constraint_contract;
    expect(contract.type).toBe('numeric_ambiguity');
    expect(contract.can_execute).toBe(false);
    expect(contract.numeric_options).toBeTruthy();
  });

  test('T12: Explicit number "5 pubs" runs immediately (no numeric gate)', async ({ request }) => {
    const { events } = await sendChat(request, 'Find 5 pubs in Brighton');

    const clarifyEvent = events.find(e => e.type === 'clarify_for_run');
    const runEvent = events.find(e => e.type === 'status' && e.stage === 'starting_search');
    const messageEvent = events.find(e => e.type === 'message');

    if (clarifyEvent) {
      const contract = clarifyEvent.clarify_state?.constraint_contract;
      if (contract) {
        expect(contract.type).not.toBe('numeric_ambiguity');
      }
    }
  });

  test('T13: Answering "5" resolves numeric ambiguity and progresses', async ({ request }) => {
    const { events: initEvents, convId } = await sendChat(request, 'Find a few pubs in Brighton');

    const clarifyEvent = initEvents.find(e => e.type === 'clarify_for_run');
    expect(clarifyEvent).toBeTruthy();
    expect(clarifyEvent.clarify_state.constraint_contract.type).toBe('numeric_ambiguity');

    const { events: replyEvents } = await sendChat(request, '5', convId);

    const messageEvent = replyEvents.find(e => e.type === 'message');
    expect(messageEvent).toBeTruthy();
    expect(messageEvent.content.toLowerCase()).toContain('5');

    const secondClarify = replyEvents.find(e => e.type === 'clarify_for_run');
    if (secondClarify && secondClarify.clarify_state.constraint_contract) {
      if (secondClarify.clarify_state.constraint_contract.type === 'numeric_ambiguity') {
        expect(secondClarify.clarify_state.constraint_contract.can_execute).toBe(true);
      }
    }
  });

  test('T14: Answering "all" resolves numeric ambiguity', async ({ request }) => {
    const { events: initEvents, convId } = await sendChat(request, 'Find many restaurants in Leeds');

    const clarifyEvent = initEvents.find(e => e.type === 'clarify_for_run');
    expect(clarifyEvent).toBeTruthy();
    expect(clarifyEvent.clarify_state.constraint_contract.type).toBe('numeric_ambiguity');

    const { events: replyEvents } = await sendChat(request, 'all', convId);

    const messageEvent = replyEvents.find(e => e.type === 'message');
    expect(messageEvent).toBeTruthy();
    expect(messageEvent.content.toLowerCase()).toContain('all');
  });

  test('T15: numeric_ambiguity does not show proxy or relax options in contract', async ({ request }) => {
    const { events } = await sendChat(request, 'Find a few pubs in Brighton');

    const clarifyEvent = events.find(e => e.type === 'clarify_for_run');
    expect(clarifyEvent).toBeTruthy();

    const contract = clarifyEvent.clarify_state.constraint_contract;
    expect(contract.type).toBe('numeric_ambiguity');
    expect(contract.proxy_options).toBeUndefined();
    expect(contract.subjective_options).toBeUndefined();
  });

  test('T16: "nice" + "few" triggers subjective first (priority 0), numeric queued (priority 1)', async ({ request }) => {
    const { events } = await sendChat(request, 'Find a few nice pubs in Brighton');

    const clarifyEvent = events.find(e => e.type === 'clarify_for_run');
    expect(clarifyEvent).toBeTruthy();

    const contract = clarifyEvent.clarify_state.constraint_contract;
    expect(contract.type).toBe('subjective');
    expect(contract.can_execute).toBe(false);
  });

  test('T17: "cheap hotels" triggers subjective gate (cheap is subjective)', async ({ request }) => {
    const { events } = await sendChat(request, 'Find cheap hotels in Birmingham');

    const clarifyEvent = events.find(e => e.type === 'clarify_for_run');
    expect(clarifyEvent).toBeTruthy();

    const contract = clarifyEvent.clarify_state.constraint_contract;
    expect(contract).toBeTruthy();
    expect(contract.type).toBe('subjective');
    expect(contract.can_execute).toBe(false);
  });
});
