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

function shouldShowSearchNowButton(payload: MockClarifyPayload): boolean {
  if (payload.constraintContract && !payload.constraintContract.can_execute) return false;
  return payload.status === 'ready' && payload.missingFields.length === 0;
}

function shouldShowThinkingIndicator(isStreaming: boolean, isWaitingForSupervisor: boolean, isClarifyingForRun: boolean): boolean {
  return isStreaming && !isWaitingForSupervisor && !isClarifyingForRun;
}

function shouldRenderLeads(towerStopTimePredicate: boolean, canonicalStatus: string, isTrustFailure: boolean): boolean {
  if (isTrustFailure) return false;
  if (towerStopTimePredicate && (canonicalStatus === 'STOP' || canonicalStatus === 'FAIL')) return false;
  return true;
}

function resolveDefaultBadgeStatus(hasLeadVerifications: boolean, isTrustFailure: boolean, isTimePredicateStop: boolean): string {
  if (!hasLeadVerifications || isTrustFailure || isTimePredicateStop) return 'unverified';
  return 'candidate';
}

function shouldIngestConfidenceBubble(streamIsClarifying: boolean): boolean {
  return !streamIsClarifying;
}

function shouldRenderConfidenceBubble(isClarifyingForRun: boolean, constraintContract: MockConstraintContract | null): boolean {
  if (isClarifyingForRun && constraintContract && !constraintContract.can_execute) return false;
  return true;
}

function shouldShowProgressStack(isClarifyingForRun: boolean): boolean {
  return !isClarifyingForRun;
}

function getClarifyPanelHeader(constraintContract: MockConstraintContract | null): string {
  if (constraintContract && !constraintContract.can_execute) return 'Waiting for clarification';
  return 'Clarifying before run';
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

test('T11: Search now button blocked when can_execute=false even if status=ready', () => {
  const payload: MockClarifyPayload = {
    entityType: 'breweries',
    location: 'London',
    semanticConstraint: 'opened in last 12 months',
    count: '5',
    missingFields: [],
    status: 'ready',
    pendingQuestions: [],
    constraintContract: {
      type: 'time_predicate',
      can_execute: false,
      proxy_options: ['Use Google Reviews date as proxy'],
    },
  };
  assert(!shouldShowSearchNowButton(payload), 'Search now button must be blocked when can_execute=false');
  assert(shouldRenderProxyQuestion(payload), 'Proxy question must render instead');
});

test('T12: Search now button allowed when can_execute=true', () => {
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
      can_execute: true,
    },
  };
  assert(shouldShowSearchNowButton(payload), 'Search now button must be allowed when can_execute=true');
});

test('T13: Tower STOP + time_predicate suppresses lead rendering', () => {
  assert(!shouldRenderLeads(true, 'STOP', false), 'Leads must NOT render for time_predicate STOP');
  assert(!shouldRenderLeads(true, 'FAIL', false), 'Leads must NOT render for time_predicate FAIL');
});

test('T14: Tower PASS + time_predicate still renders leads', () => {
  assert(shouldRenderLeads(false, 'PASS', false), 'Leads should render for normal PASS');
  assert(shouldRenderLeads(true, 'PASS', false), 'Leads should render for PASS even with time_predicate (Tower explicitly allows)');
});

test('T15: Badge defaults to unverified for time_predicate STOP', () => {
  assert(resolveDefaultBadgeStatus(true, false, true) === 'unverified', 'Badge must be unverified for time_predicate STOP');
  assert(resolveDefaultBadgeStatus(true, false, false) === 'candidate', 'Badge should be candidate when not time_predicate STOP');
  assert(resolveDefaultBadgeStatus(false, false, false) === 'unverified', 'Badge should be unverified when no lead verifications');
});

test('T16: Confidence bubble suppressed at ingestion during clarification stream', () => {
  assert(!shouldIngestConfidenceBubble(true), 'Confidence bubble must NOT be ingested when stream is clarifying');
  assert(shouldIngestConfidenceBubble(false), 'Confidence bubble should be ingested when NOT clarifying');
});

test('T17: Confidence bubble suppressed at render when can_execute=false', () => {
  const blockedContract: MockConstraintContract = { type: 'time_predicate', can_execute: false, proxy_options: ['Use date proxy'] };
  assert(!shouldRenderConfidenceBubble(true, blockedContract), 'Confidence must NOT render when clarifying + can_execute=false');
  assert(shouldRenderConfidenceBubble(false, blockedContract), 'Confidence should render when not clarifying');
  assert(shouldRenderConfidenceBubble(true, null), 'Confidence should render when clarifying but no constraint contract');
  assert(shouldRenderConfidenceBubble(true, { type: 'time_predicate', can_execute: true }), 'Confidence should render when can_execute=true');
});

test('T18: Progress stack hidden during clarification', () => {
  assert(!shouldShowProgressStack(true), 'Progress stack must NOT show during clarification');
  assert(shouldShowProgressStack(false), 'Progress stack should show when not clarifying');
});

test('T19: Panel header says "Waiting for clarification" when can_execute=false', () => {
  const blocked: MockConstraintContract = { type: 'time_predicate', can_execute: false };
  assert(getClarifyPanelHeader(blocked) === 'Waiting for clarification', 'Header must say waiting when blocked');
  assert(getClarifyPanelHeader(null) === 'Clarifying before run', 'Header should say clarifying when no constraint');
  assert(getClarifyPanelHeader({ type: 'time_predicate', can_execute: true }) === 'Clarifying before run', 'Header should say clarifying when can_execute=true');
});

test('T20: Compound clarification — constraint + missing fields coexist', () => {
  const payload: MockClarifyPayload = {
    entityType: 'pubs',
    location: null,
    semanticConstraint: 'live music, opened in last 12 months',
    count: null,
    missingFields: ['location'],
    status: 'gathering',
    pendingQuestions: ['What location should I search in?'],
    constraintContract: {
      type: 'time_predicate',
      can_execute: false,
      explanation: "Opening dates can't be guaranteed from listings.",
      proxy_options: ['Use Google Reviews date as proxy'],
      required_inputs_missing: ['verification_method_for_live_music'],
    },
  };
  assert(shouldRenderProxyQuestion(payload), 'Proxy question must render');
  assert(!shouldRenderResultsView(payload), 'Results view must NOT render');
  assert(!shouldShowSearchNowButton(payload), 'Search now must be blocked');
  assert(payload.missingFields.length > 0, 'Missing fields present');
  assert(payload.pendingQuestions.length > 0, 'Pending questions present');
  assert(payload.constraintContract!.required_inputs_missing!.length > 0, 'Constraint-level missing inputs present');
  assert(getClarifyPanelHeader(payload.constraintContract) === 'Waiting for clarification', 'Header must say waiting');
});

test('T21: ACCEPT_WITH_UNVERIFIED parsed by resolveCanonicalStatus', () => {
  const result = resolveCanonicalStatus({ status: 'ACCEPT_WITH_UNVERIFIED' });
  assert(result.status === 'ACCEPT_WITH_UNVERIFIED', `Expected ACCEPT_WITH_UNVERIFIED, got ${result.status}`);
});

test('T22: ACCEPT_WITH_UNVERIFIED uses warning styling not success', () => {
  const config = STATUS_CONFIG.ACCEPT_WITH_UNVERIFIED;
  assert(config !== undefined, 'STATUS_CONFIG must have ACCEPT_WITH_UNVERIFIED');
  assert(config.badge.includes('amber'), `Badge should use amber styling, got "${config.badge}"`);
  assert(!config.label.includes('Complete'), `Label must not say Complete, got "${config.label}"`);
  assert(config.label.includes('not all verified'), `Label should mention unverified, got "${config.label}"`);
});

test('T23: PASS with unverified leads must downgrade to ACCEPT_WITH_UNVERIFIED', () => {
  function detectEffectiveStatus(
    rawStatus: string,
    towerVerdict: string | null,
    allLeadsCount: number,
    matchesCount: number,
    hasLeadVerifications: boolean
  ): string {
    const canonical = resolveCanonicalStatus({ status: rawStatus });
    const towerUpper = (towerVerdict || "").toUpperCase().replace(/[\s-]/g, '_');
    if (towerUpper === 'ACCEPT_WITH_UNVERIFIED') return 'ACCEPT_WITH_UNVERIFIED';
    const hasUnverified = !hasLeadVerifications;
    const hasAnyUnverifiedResults = allLeadsCount > 0 && (hasUnverified || matchesCount < allLeadsCount);
    if (canonical.status === 'PASS' && hasAnyUnverifiedResults) return 'ACCEPT_WITH_UNVERIFIED';
    return canonical.status;
  }

  assert(
    detectEffectiveStatus('PASS', null, 5, 0, false) === 'ACCEPT_WITH_UNVERIFIED',
    'PASS + no lead verifications must downgrade'
  );
  assert(
    detectEffectiveStatus('PASS', null, 5, 5, true) === 'PASS',
    'PASS + all verified should stay PASS'
  );
  assert(
    detectEffectiveStatus('PASS', null, 5, 3, true) === 'ACCEPT_WITH_UNVERIFIED',
    'PASS + some unverified must downgrade'
  );
  assert(
    detectEffectiveStatus('PASS', 'ACCEPT_WITH_UNVERIFIED', 5, 5, true) === 'ACCEPT_WITH_UNVERIFIED',
    'Explicit Tower ACCEPT_WITH_UNVERIFIED always wins'
  );
  assert(
    detectEffectiveStatus('STOP', null, 5, 0, false) === 'STOP',
    'STOP should remain STOP regardless of verification'
  );
});

test('T24: PASS with all leads verified stays PASS', () => {
  const canonical = resolveCanonicalStatus({ status: 'PASS' });
  assert(canonical.status === 'PASS', 'Raw status should be PASS');
  const allLeads = 5;
  const matches = 5;
  const hasLeadVerifications = true;
  const hasAnyUnverified = allLeads > 0 && (!hasLeadVerifications || matches < allLeads);
  assert(!hasAnyUnverified, 'Should NOT detect unverified when all leads match');
});

test('T25a: PASS stays PASS when verifiedExact covers all leads', () => {
  function detectWithVerifiedExact(
    rawStatus: string,
    allLeadsCount: number,
    verifiedExact: number,
    hasLeadVerifications: boolean
  ): string {
    const canonical = resolveCanonicalStatus({ status: rawStatus });
    const verifiedExactCoversAll = verifiedExact >= allLeadsCount && allLeadsCount > 0;
    const hasUnverified = !hasLeadVerifications;
    const hasAnyUnverifiedResults = allLeadsCount > 0 && !verifiedExactCoversAll && hasUnverified;
    if (canonical.status === 'PASS' && hasAnyUnverifiedResults) return 'ACCEPT_WITH_UNVERIFIED';
    return canonical.status;
  }

  assert(
    detectWithVerifiedExact('PASS', 5, 5, false) === 'PASS',
    'PASS + verifiedExact=allLeads should stay PASS even without leadVerifications'
  );
  assert(
    detectWithVerifiedExact('PASS', 5, 6, false) === 'PASS',
    'PASS + verifiedExact>allLeads should stay PASS'
  );
  assert(
    detectWithVerifiedExact('PASS', 5, 3, false) === 'ACCEPT_WITH_UNVERIFIED',
    'PASS + verifiedExact<allLeads + no leadVerifications should downgrade'
  );
  assert(
    detectWithVerifiedExact('PASS', 0, 0, false) === 'PASS',
    'PASS + no leads at all should stay PASS'
  );
});

test('T25b: ACCEPT_WITH_UNVERIFIED summary text avoids success language', () => {
  const canonical = resolveCanonicalStatus({ status: 'ACCEPT_WITH_UNVERIFIED' });
  assert(canonical.status === 'ACCEPT_WITH_UNVERIFIED', 'Should resolve to ACCEPT_WITH_UNVERIFIED');
  const config = STATUS_CONFIG[canonical.status];
  assert(!config.label.toLowerCase().includes('pass'), 'Label must not say pass');
  assert(!config.label.toLowerCase().includes('complete'), 'Label must not say complete');
  assert(!config.description.toLowerCase().includes('success'), 'Description must not say success');
});

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
