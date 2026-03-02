import { test, expect, type APIRequestContext } from '@playwright/test';

const API_BASE = 'http://localhost:5001';
const TEST_USER_ID = 'test-rel-pred-user';
const TEST_USER_EMAIL = 'rel-pred-test@test.dev';

test.describe('Relationship Predicate Constraint Gate', () => {

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

  test('T19: Relationship predicate triggers clarification with relationship_options', async ({ request }) => {
    const { events } = await sendChat(request, 'Find charities that work with local councils in Manchester');

    const clarifyEvent = events.find(e => e.type === 'clarify_for_run');
    expect(clarifyEvent).toBeTruthy();
    expect(clarifyEvent.clarify_state).toBeTruthy();

    const cs = clarifyEvent.clarify_state;
    const contract = cs.constraint_contract;
    expect(contract).toBeTruthy();
    expect(contract.type).toBe('relationship_predicate');
    expect(contract.can_execute).toBe(false);
    expect(contract.why_blocked).toBeTruthy();
    expect(contract.why_blocked.toLowerCase()).toContain('work with');
    expect(contract.relationship_options).toBeTruthy();
    expect(contract.relationship_options.length).toBe(4);
    expect(contract.relationship_options).toContain('Official sources only');
    expect(contract.relationship_options).toContain('Best-effort public web');
    expect(contract.relationship_options).toContain('Require 2+ sources');
    expect(contract.relationship_options).toContain('Skip if uncertain');
  });

  test('T20: Search now hidden while relationship_predicate unresolved (can_execute false)', async ({ request }) => {
    const { events } = await sendChat(request, 'Find organisations that deal with homelessness in London');

    const clarifyEvent = events.find(e => e.type === 'clarify_for_run');
    expect(clarifyEvent).toBeTruthy();

    const contract = clarifyEvent.clarify_state.constraint_contract;
    expect(contract.type).toBe('relationship_predicate');
    expect(contract.can_execute).toBe(false);

    expect(clarifyEvent.clarify_state.status).toBe('gathering');
  });

  test('T21: Selecting "official sources only" resolves relationship_predicate', async ({ request }) => {
    const { events: initEvents, convId } = await sendChat(request, 'Find charities that partner with NHS in Leeds');

    const clarifyEvent = initEvents.find(e => e.type === 'clarify_for_run');
    expect(clarifyEvent).toBeTruthy();
    expect(clarifyEvent.clarify_state.constraint_contract.type).toBe('relationship_predicate');

    const { events: replyEvents } = await sendChat(request, 'official sources only', convId);

    const messageEvent = replyEvents.find(e => e.type === 'message');
    expect(messageEvent).toBeTruthy();
    expect(messageEvent.content.toLowerCase()).toContain('official sources only');

    const secondClarify = replyEvents.find(e => e.type === 'clarify_for_run');
    if (secondClarify && secondClarify.clarify_state.constraint_contract) {
      if (secondClarify.clarify_state.constraint_contract.type === 'relationship_predicate') {
        expect(secondClarify.clarify_state.constraint_contract.can_execute).toBe(true);
      }
    }
  });

  test('T22: Selecting "best-effort public web" resolves relationship_predicate', async ({ request }) => {
    const { events: initEvents, convId } = await sendChat(request, 'Find businesses that collaborate with universities in Bristol');

    const clarifyEvent = initEvents.find(e => e.type === 'clarify_for_run');
    expect(clarifyEvent).toBeTruthy();
    expect(clarifyEvent.clarify_state.constraint_contract.type).toBe('relationship_predicate');

    const { events: replyEvents } = await sendChat(request, 'best-effort public web', convId);

    const messageEvent = replyEvents.find(e => e.type === 'message');
    expect(messageEvent).toBeTruthy();
    expect(messageEvent.content.toLowerCase()).toContain('best-effort public web');
  });

  test('T23: No proxy/relax/subjective/numeric options leak for relationship_predicate', async ({ request }) => {
    const { events } = await sendChat(request, 'Find charities that work with schools in Birmingham');

    const clarifyEvent = events.find(e => e.type === 'clarify_for_run');
    expect(clarifyEvent).toBeTruthy();

    const contract = clarifyEvent.clarify_state.constraint_contract;
    expect(contract.type).toBe('relationship_predicate');
    expect(contract.proxy_options).toBeUndefined();
    expect(contract.subjective_options).toBeUndefined();
    expect(contract.numeric_options).toBeUndefined();
    expect(contract.relationship_options).toBeTruthy();
    expect(contract.relationship_options.length).toBe(4);
  });

  test('T24: "that specialise in" triggers relationship_predicate', async ({ request }) => {
    const { events } = await sendChat(request, 'Find solicitors that specialise in family law in Sheffield');

    const clarifyEvent = events.find(e => e.type === 'clarify_for_run');
    expect(clarifyEvent).toBeTruthy();

    const contract = clarifyEvent.clarify_state.constraint_contract;
    expect(contract).toBeTruthy();
    expect(contract.type).toBe('relationship_predicate');
    expect(contract.can_execute).toBe(false);
  });

  test('T25: "and the landlord name" triggers relationship_predicate, NOT RUN', async ({ request }) => {
    const { events } = await sendChat(request, 'Find pubs in Bristol and the landlord name');

    const clarifyEvent = events.find(e => e.type === 'clarify_for_run');
    expect(clarifyEvent).toBeTruthy();

    const contract = clarifyEvent.clarify_state.constraint_contract;
    expect(contract).toBeTruthy();
    expect(contract.type).toBe('relationship_predicate');
    expect(contract.can_execute).toBe(false);
    expect(contract.relationship_options).toBeTruthy();
    expect(contract.relationship_options.length).toBe(4);

    const runEvents = events.filter(e => e.type === 'supervisor_task_created' || e.type === 'confidence');
    expect(runEvents.length).toBe(0);
  });

  test('T26: "and the practice manager" triggers relationship_predicate', async ({ request }) => {
    const { events } = await sendChat(request, 'Find dentists in Texas and the practice manager');

    const clarifyEvent = events.find(e => e.type === 'clarify_for_run');
    expect(clarifyEvent).toBeTruthy();

    const contract = clarifyEvent.clarify_state.constraint_contract;
    expect(contract).toBeTruthy();
    expect(contract.type).toBe('relationship_predicate');
    expect(contract.can_execute).toBe(false);
    expect(contract.why_blocked).toBeTruthy();
    expect(contract.why_blocked.toLowerCase()).toContain('practice manager');
  });

  test('T27: "owned by" triggers relationship_predicate', async ({ request }) => {
    const { events } = await sendChat(request, 'Find breweries in Sussex owned by AB InBev');

    const clarifyEvent = events.find(e => e.type === 'clarify_for_run');
    expect(clarifyEvent).toBeTruthy();

    const contract = clarifyEvent.clarify_state.constraint_contract;
    expect(contract).toBeTruthy();
    expect(contract.type).toBe('relationship_predicate');
    expect(contract.can_execute).toBe(false);
    expect(contract.why_blocked.toLowerCase()).toContain('owned by');
  });

  test('T28: "Skip if uncertain" resolves relationship_predicate and proceeds', async ({ request }) => {
    const { events: initEvents, convId } = await sendChat(request, 'Find pubs in Bristol and the landlord name');

    const clarifyEvent = initEvents.find(e => e.type === 'clarify_for_run');
    expect(clarifyEvent).toBeTruthy();
    expect(clarifyEvent.clarify_state.constraint_contract.type).toBe('relationship_predicate');

    const { events: replyEvents } = await sendChat(request, 'skip if uncertain', convId);

    const messageEvent = replyEvents.find(e => e.type === 'message');
    expect(messageEvent).toBeTruthy();
    expect(messageEvent.content.toLowerCase()).toContain('skip if uncertain');

    const secondClarify = replyEvents.find(e => e.type === 'clarify_for_run');
    if (secondClarify && secondClarify.clarify_state.constraint_contract) {
      if (secondClarify.clarify_state.constraint_contract.type === 'relationship_predicate') {
        expect(secondClarify.clarify_state.constraint_contract.can_execute).toBe(true);
      }
    }
  });
});
