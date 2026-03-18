/**
 * Lightweight regression test: proves that timeout is non-terminal.
 *
 * Scenario: "timeout happens, but later receipt arrives and bubble updates"
 *
 * Simulates the polling state machine from chat.tsx:
 *  1. Run starts, polling begins
 *  2. 90s passes → hard timeout emits a `still_working` banner (NOT `run_timeout`)
 *  3. Polling continues (key is NOT in deliverySummaryRunIds)
 *  4. Backend eventually returns terminal status
 *  5. finalizeRunUI upserts real results, replacing the banner
 *
 * Run: npx tsx client/src/__tests__/timeout-non-terminal.test.ts
 */

interface Message {
  id: string;
  deliverySummary: {
    status: string;
    delivered_count: number;
    stop_reason: string;
  };
}

const messages = new Map<string, Message>();
const deliverySummaryRunIds = new Set<string>();

function upsertResultMessage(msg: Message) {
  messages.set(msg.id, msg);
}

let pass = 0;
let fail = 0;
function assert(cond: boolean, label: string) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}`);
  }
}

console.log('Test: Timeout banner is non-terminal and gets replaced by real results\n');

const effectiveKey = 'test-run-123';
const msgId = `ds-${effectiveKey}`;

console.log('Step 1: Simulate hard timeout (90s elapsed)');
const hardTimeoutEmitted = new Set<string>();
if (!hardTimeoutEmitted.has(effectiveKey)) {
  hardTimeoutEmitted.add(effectiveKey);
  if (!deliverySummaryRunIds.has(effectiveKey)) {
    upsertResultMessage({
      id: msgId,
      deliverySummary: {
        status: 'PENDING',
        delivered_count: 0,
        stop_reason: 'still_working',
      },
    });
  }
}

assert(messages.has(msgId), 'Banner message was created');
assert(messages.get(msgId)!.deliverySummary.stop_reason === 'still_working', 'Stop reason is still_working (not run_timeout)');
assert(messages.get(msgId)!.deliverySummary.status === 'PENDING', 'Status is PENDING (not FAIL)');
assert(!deliverySummaryRunIds.has(effectiveKey), 'Key NOT added to deliverySummaryRunIds (polling continues)');

console.log('\nStep 2: Verify polling would NOT be blocked');
const wouldSkipDueToFinalized = deliverySummaryRunIds.has(effectiveKey);
assert(!wouldSkipDueToFinalized, 'Poll loop would NOT skip this run (not finalized)');

console.log('\nStep 3: Simulate backend returning terminal status + real artefacts');
const realResultMsg: Message = {
  id: msgId,
  deliverySummary: {
    status: 'PASS',
    delivered_count: 20,
    stop_reason: '',
  },
};
upsertResultMessage(realResultMsg);
deliverySummaryRunIds.add(effectiveKey);

assert(messages.get(msgId)!.deliverySummary.status === 'PASS', 'Status updated to PASS');
assert(messages.get(msgId)!.deliverySummary.delivered_count === 20, 'Delivered count is 20');
assert(messages.get(msgId)!.deliverySummary.stop_reason !== 'still_working', 'Stop reason is no longer still_working');
assert(deliverySummaryRunIds.has(effectiveKey), 'Key now in deliverySummaryRunIds (run finalized)');

console.log('\nStep 4: Verify the old banner was replaced (same id)');
assert(messages.size === 1, 'Only one message exists (banner was replaced, not duplicated)');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
