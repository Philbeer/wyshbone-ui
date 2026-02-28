import { resolveCanonicalStatus, STATUS_CONFIG } from '../../utils/deliveryStatus';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
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

interface MockConstraintContract {
  type: string;
  can_execute: boolean;
  explanation?: string;
  proxy_options?: string[];
  required_inputs_missing?: string[];
}

interface MockClarifyPayload {
  entityType: string | null;
  location: string | null;
  semanticConstraint: string | null;
  count: string | null;
  missingFields: string[];
  status: 'gathering' | 'ready';
  pendingQuestions: string[];
  constraintContract: MockConstraintContract | null;
}

function shouldRenderProxyQuestion(payload: MockClarifyPayload): boolean {
  const cc = payload.constraintContract;
  return !!(cc && !cc.can_execute && cc.type === 'time_predicate' && Array.isArray(cc.proxy_options) && cc.proxy_options.length > 0);
}

function shouldRenderResultsView(payload: MockClarifyPayload): boolean {
  const cc = payload.constraintContract;
  if (cc && !cc.can_execute) return false;
  return payload.status === 'ready' && payload.missingFields.length === 0;
}

function shouldShowThinkingIndicator(isStreaming: boolean, isWaitingForSupervisor: boolean, isClarifyingForRun: boolean): boolean {
  return isStreaming && !isWaitingForSupervisor && !isClarifyingForRun;
}

function getResultDisplayText(towerStopTimePredicate: boolean, canonicalStatus: string, summaryText: string): string {
  if (towerStopTimePredicate && (canonicalStatus === 'STOP' || canonicalStatus === 'FAIL')) {
    return "Stopped: can\u2019t verify opening date constraint without an acceptable proxy.";
  }
  return summaryText;
}

function getProxyUsedLine(proxyUsed: string | null): string | null {
  if (!proxyUsed) return null;
  return `Time constraint handled via proxy: ${proxyUsed}.`;
}

test('T1: Clarify payload with can_execute=false and proxy_options renders proxy question', () => {
  const payload: MockClarifyPayload = {
    entityType: 'breweries',
    location: 'London',
    semanticConstraint: 'opened in last 12 months',
    count: '5',
    missingFields: [],
    status: 'gathering',
    pendingQuestions: [],
    constraintContract: {
      type: 'time_predicate',
      can_execute: false,
      explanation: "Opening dates can't be guaranteed from listings.",
      proxy_options: [
        'Use Google Reviews date as proxy',
        'Use website registration date as proxy',
        'Use first social media post as proxy',
      ],
    },
  };

  assert(shouldRenderProxyQuestion(payload), 'Should render proxy question when can_execute=false with proxy_options');
  assert(!shouldRenderResultsView(payload), 'Should NOT render results view when can_execute=false');
});

test('T2: Clarify payload with can_execute=false does not render results view', () => {
  const payload: MockClarifyPayload = {
    entityType: 'pubs',
    location: 'Bristol',
    semanticConstraint: null,
    count: '3',
    missingFields: [],
    status: 'ready',
    pendingQuestions: [],
    constraintContract: {
      type: 'time_predicate',
      can_execute: false,
      proxy_options: ['Use Google Reviews date'],
    },
  };

  assert(!shouldRenderResultsView(payload), 'Should NOT show ready/results when can_execute=false even if status=ready');
});

test('T3: Clarify payload without constraint contract renders normally', () => {
  const payload: MockClarifyPayload = {
    entityType: 'cafes',
    location: 'Manchester',
    semanticConstraint: null,
    count: '5',
    missingFields: [],
    status: 'ready',
    pendingQuestions: [],
    constraintContract: null,
  };

  assert(!shouldRenderProxyQuestion(payload), 'Should NOT render proxy question when no constraint');
  assert(shouldRenderResultsView(payload), 'Should render results view when ready with no constraint blocking');
});

test('T4: Tower STOP judgement for time_predicate shows Stopped not Pass', () => {
  const canonical = resolveCanonicalStatus({ status: 'STOP', stop_reason: 'time_predicate' });
  assert(canonical.status === 'STOP', `Expected STOP, got ${canonical.status}`);

  const displayText = getResultDisplayText(true, canonical.status, 'some fallback text');
  assert(displayText.startsWith('Stopped:'), `Expected display text to start with "Stopped:", got "${displayText}"`);
  assert(!displayText.includes('Pass'), 'Display text must not contain "Pass"');
  assert(!displayText.includes('PASS'), 'Display text must not contain "PASS"');
});

test('T5: Tower PASS with proxy_used shows proxy line', () => {
  const canonical = resolveCanonicalStatus({ status: 'PASS' });
  assert(canonical.status === 'PASS', `Expected PASS, got ${canonical.status}`);

  const proxyLine = getProxyUsedLine('Google Reviews date');
  assert(proxyLine !== null, 'Proxy line should not be null');
  assert(proxyLine!.includes('Google Reviews date'), `Proxy line should contain proxy name, got "${proxyLine}"`);
  assert(proxyLine!.startsWith('Time constraint handled via proxy:'), 'Proxy line should start with correct prefix');
});

test('T6: No proxy_used returns null proxy line', () => {
  const proxyLine = getProxyUsedLine(null);
  assert(proxyLine === null, 'Proxy line should be null when no proxy used');
});

test('T7: Thinking indicator hidden during clarification-only state', () => {
  assert(!shouldShowThinkingIndicator(true, false, true), 'Thinking indicator should be hidden when clarifying');
  assert(shouldShowThinkingIndicator(true, false, false), 'Thinking indicator should show when streaming without clarify');
  assert(!shouldShowThinkingIndicator(true, true, false), 'Thinking indicator should be hidden when waiting for supervisor');
});

test('T8: STATUS_CONFIG STOP label says "Search stopped" not "Pass"', () => {
  assert(STATUS_CONFIG.STOP.label === 'Search stopped', `STOP label should be "Search stopped", got "${STATUS_CONFIG.STOP.label}"`);
  assert(!STATUS_CONFIG.STOP.label.includes('Pass'), 'STOP label must not mention Pass');
});

test('T9: required_inputs_missing renders alongside time_predicate', () => {
  const payload: MockClarifyPayload = {
    entityType: 'breweries',
    location: null,
    semanticConstraint: 'opened in last 12 months',
    count: null,
    missingFields: ['location'],
    status: 'gathering',
    pendingQuestions: ['What location should I search in?'],
    constraintContract: {
      type: 'time_predicate',
      can_execute: false,
      explanation: "Opening dates can't be guaranteed from listings.",
      proxy_options: ['Use Google Reviews date as proxy'],
      required_inputs_missing: ['result_count'],
    },
  };

  assert(shouldRenderProxyQuestion(payload), 'Should render proxy question');
  assert(!shouldRenderResultsView(payload), 'Should NOT show results view');
  assert(payload.missingFields.length > 0, 'Missing fields should be present alongside constraint');
  assert(payload.constraintContract!.required_inputs_missing!.length > 0, 'Constraint-level missing inputs should be present');
});

test('T10: Time predicate STOP does not use "verified" language', () => {
  const displayText = getResultDisplayText(true, 'STOP', 'I found 3 results that match.');
  assert(!displayText.toLowerCase().includes('verified'), `STOP time predicate text should not contain "verified", got "${displayText}"`);
  assert(!displayText.toLowerCase().includes('pass'), `STOP time predicate text should not contain "pass", got "${displayText}"`);
});

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
