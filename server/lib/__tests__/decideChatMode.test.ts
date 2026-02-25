import { decideChatMode } from '../decideChatMode';

function expectMode(input: string, expectedMode: 'CHAT_INFO' | 'CLARIFY_FOR_RUN' | 'RUN_SUPERVISOR', label?: string) {
  const result = decideChatMode({ userMessage: input });
  const tag = label ? ` [${label}]` : '';
  if (result.mode !== expectedMode) {
    throw new Error(`FAIL${tag}: "${input}" → got ${result.mode}, expected ${expectedMode} (reason: ${result.reason})`);
  }
  console.log(`PASS${tag}: "${input}" → ${result.mode}`);
  return result;
}

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (e: any) {
    failed++;
    console.error(e.message);
  }
}

test('T1: semantic constraint → CLARIFY_FOR_RUN', () => {
  expectMode('find organisations that work with local authorities in Blackpool', 'CLARIFY_FOR_RUN', 'T1');
});

test('T2: complete entity+location → RUN_SUPERVISOR', () => {
  expectMode('find 5 charities in blackpool', 'RUN_SUPERVISOR', 'T2');
});

test('T3: informational → CHAT_INFO', () => {
  expectMode('what is a charity', 'CHAT_INFO', 'T3');
});

test('T4: entity verb no location → CLARIFY_FOR_RUN', () => {
  expectMode('find organisations that help councils', 'CLARIFY_FOR_RUN', 'T4');
});

test('T5: entity + location → RUN_SUPERVISOR', () => {
  expectMode('find pubs in Leeds', 'RUN_SUPERVISOR', 'T5');
});

test('T6: greeting → CHAT_INFO', () => {
  expectMode('hello', 'CHAT_INFO', 'T6');
});

test('T7: how-to question → CHAT_INFO', () => {
  expectMode('how do I export my leads', 'CHAT_INFO', 'T7');
});

test('T8: entity noun + "that work with" + location → CLARIFY_FOR_RUN', () => {
  const r = expectMode('businesses that work with schools in London', 'CLARIFY_FOR_RUN', 'T8');
  if (!r.entityType) throw new Error('FAIL [T8]: entityType should be detected');
  if (!r.location) throw new Error('FAIL [T8]: location should be detected');
});

test('T9: entity verb, no location → CLARIFY_FOR_RUN', () => {
  expectMode('find dentists', 'CLARIFY_FOR_RUN', 'T9');
});

test('T10: entity discovery pattern → CLARIFY_FOR_RUN or RUN_SUPERVISOR', () => {
  expectMode('organisations that provide training in Manchester', 'CLARIFY_FOR_RUN', 'T10');
});

test('T11: charities in blackpool → RUN_SUPERVISOR', () => {
  const r = expectMode('find charities in Blackpool', 'RUN_SUPERVISOR', 'T11');
  if (!r.entityType) throw new Error('FAIL [T11]: entityType missing');
  if (!r.location) throw new Error('FAIL [T11]: location missing');
});

test('T12: explain → CHAT_INFO', () => {
  expectMode('explain how lead generation works', 'CHAT_INFO', 'T12');
});

test('T13: yes (bare confirm) → CHAT_INFO', () => {
  expectMode('yes', 'CHAT_INFO', 'T13');
});

test('T14: search for + location → RUN_SUPERVISOR', () => {
  expectMode('search for bakeries in Bristol', 'RUN_SUPERVISOR', 'T14');
});

test('T15: who are (informational) → CHAT_INFO', () => {
  expectMode('who are the biggest retailers in the UK', 'CHAT_INFO', 'T15');
});

test('T16: entity noun without verb or location → CHAT_INFO', () => {
  expectMode('charities', 'CHAT_INFO', 'T16');
});

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed!');
}
