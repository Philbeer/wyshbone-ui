import { decideChatMode, sanitizeBusinessType } from '../decideChatMode';

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

test('T17: sanitizeBusinessType — "5 pubs" → pubs, count=5', () => {
  const r = sanitizeBusinessType('5 pubs');
  if (r.businessType !== 'pubs') throw new Error(`FAIL [T17]: businessType="${r.businessType}", expected "pubs"`);
  if (r.requestedCount !== 5) throw new Error(`FAIL [T17]: requestedCount=${r.requestedCount}, expected 5`);
  console.log(`PASS [T17]: "5 pubs" → businessType="${r.businessType}", requestedCount=${r.requestedCount}`);
});

test('T18: sanitizeBusinessType — "10 coffee shops" → coffee shops, count=10', () => {
  const r = sanitizeBusinessType('10 coffee shops');
  if (r.businessType !== 'coffee shops') throw new Error(`FAIL [T18]: businessType="${r.businessType}", expected "coffee shops"`);
  if (r.requestedCount !== 10) throw new Error(`FAIL [T18]: requestedCount=${r.requestedCount}, expected 10`);
  console.log(`PASS [T18]: "10 coffee shops" → businessType="${r.businessType}", requestedCount=${r.requestedCount}`);
});

test('T19: sanitizeBusinessType — "a pub" → pub, count=1', () => {
  const r = sanitizeBusinessType('a pub');
  if (r.businessType !== 'pub') throw new Error(`FAIL [T19]: businessType="${r.businessType}", expected "pub"`);
  if (r.requestedCount !== 1) throw new Error(`FAIL [T19]: requestedCount=${r.requestedCount}, expected 1`);
  console.log(`PASS [T19]: "a pub" → businessType="${r.businessType}", requestedCount=${r.requestedCount}`);
});

test('T20: sanitizeBusinessType — "some pubs" → pubs, no count', () => {
  const r = sanitizeBusinessType('some pubs');
  if (r.businessType !== 'pubs') throw new Error(`FAIL [T20]: businessType="${r.businessType}", expected "pubs"`);
  if (r.requestedCount !== undefined) throw new Error(`FAIL [T20]: requestedCount=${r.requestedCount}, expected undefined`);
  console.log(`PASS [T20]: "some pubs" → businessType="${r.businessType}", requestedCount=${r.requestedCount}`);
});

test('T21: sanitizeBusinessType — "pubs" (no quantifier) → pubs, no count', () => {
  const r = sanitizeBusinessType('pubs');
  if (r.businessType !== 'pubs') throw new Error(`FAIL [T21]: businessType="${r.businessType}", expected "pubs"`);
  if (r.requestedCount !== undefined) throw new Error(`FAIL [T21]: requestedCount=${r.requestedCount}, expected undefined`);
  console.log(`PASS [T21]: "pubs" → businessType="${r.businessType}", requestedCount=${r.requestedCount}`);
});

test('T22: "find 5 pubs in arundel" → entityType=pubs, requestedCount=5', () => {
  const r = decideChatMode({ userMessage: 'find 5 pubs in arundel' });
  if (r.mode !== 'RUN_SUPERVISOR') throw new Error(`FAIL [T22]: mode=${r.mode}, expected RUN_SUPERVISOR`);
  if (r.entityType !== 'pubs') throw new Error(`FAIL [T22]: entityType="${r.entityType}", expected "pubs"`);
  if (r.requestedCount !== 5) throw new Error(`FAIL [T22]: requestedCount=${r.requestedCount}, expected 5`);
  console.log(`PASS [T22]: "find 5 pubs in arundel" → entityType="${r.entityType}", requestedCount=${r.requestedCount}`);
});

test('T23: "find pubs in arundel" → entityType=pubs, requestedCount=undefined', () => {
  const r = decideChatMode({ userMessage: 'find pubs in arundel' });
  if (r.mode !== 'RUN_SUPERVISOR') throw new Error(`FAIL [T23]: mode=${r.mode}, expected RUN_SUPERVISOR`);
  if (r.entityType !== 'pubs') throw new Error(`FAIL [T23]: entityType="${r.entityType}", expected "pubs"`);
  if (r.requestedCount !== undefined) throw new Error(`FAIL [T23]: requestedCount=${r.requestedCount}, expected undefined`);
  console.log(`PASS [T23]: "find pubs in arundel" → entityType="${r.entityType}", requestedCount=${r.requestedCount}`);
});

test('T24: "find 10 coffee shops in leeds" → entityType=coffee shops, requestedCount=10', () => {
  const r = decideChatMode({ userMessage: 'find 10 coffee shops in leeds' });
  if (r.mode !== 'RUN_SUPERVISOR') throw new Error(`FAIL [T24]: mode=${r.mode}, expected RUN_SUPERVISOR`);
  if (r.entityType !== 'coffee shops') throw new Error(`FAIL [T24]: entityType="${r.entityType}", expected "coffee shops"`);
  if (r.requestedCount !== 10) throw new Error(`FAIL [T24]: requestedCount=${r.requestedCount}, expected 10`);
  console.log(`PASS [T24]: "find 10 coffee shops in leeds" → entityType="${r.entityType}", requestedCount=${r.requestedCount}`);
});

test('T25: "find a pub in york" → entityType=pub, requestedCount=1', () => {
  const r = decideChatMode({ userMessage: 'find a pub in york' });
  if (r.mode !== 'RUN_SUPERVISOR') throw new Error(`FAIL [T25]: mode=${r.mode}, expected RUN_SUPERVISOR`);
  if (r.entityType !== 'pub') throw new Error(`FAIL [T25]: entityType="${r.entityType}", expected "pub"`);
  if (r.requestedCount !== 1) throw new Error(`FAIL [T25]: requestedCount=${r.requestedCount}, expected 1`);
  console.log(`PASS [T25]: "find a pub in york" → entityType="${r.entityType}", requestedCount=${r.requestedCount}`);
});

test('T26: sanitizeBusinessType — "an electrician" → electrician, count=1', () => {
  const r = sanitizeBusinessType('an electrician');
  if (r.businessType !== 'electrician') throw new Error(`FAIL [T26]: businessType="${r.businessType}", expected "electrician"`);
  if (r.requestedCount !== 1) throw new Error(`FAIL [T26]: requestedCount=${r.requestedCount}, expected 1`);
  console.log(`PASS [T26]: "an electrician" → businessType="${r.businessType}", requestedCount=${r.requestedCount}`);
});

test('T27: sanitizeBusinessType — "several bakeries" → bakeries, no count', () => {
  const r = sanitizeBusinessType('several bakeries');
  if (r.businessType !== 'bakeries') throw new Error(`FAIL [T27]: businessType="${r.businessType}", expected "bakeries"`);
  if (r.requestedCount !== undefined) throw new Error(`FAIL [T27]: requestedCount=${r.requestedCount}, expected undefined`);
  console.log(`PASS [T27]: "several bakeries" → businessType="${r.businessType}", requestedCount=${r.requestedCount}`);
});

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed!');
}
