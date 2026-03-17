import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Play,
  Square,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ExternalLink,
  ArrowLeft,
  FlaskConical,
  ChevronDown,
  ChevronRight,
  BarChart3,
  AlertTriangle,
  Circle,
  Plus,
  X,
} from 'lucide-react';
import { buildApiUrl, addDevAuthParams } from '@/lib/queryClient';

type ExpectedOutcome = 'pass' | 'fail' | 'blocked' | 'clarify' | 'blocked_or_clarify';
type QueryClass = 'solvable' | 'clarification_required' | 'fictional_or_impossible' | 'subjective_or_unverifiable' | 'website_evidence_required' | 'relationship_required';
type ExpectedMode = 'deliver_results' | 'clarify' | 'honest_refusal' | 'best_effort_honest';
type TowerResult = 'PASS' | 'FAIL' | 'UNKNOWN' | 'NOT_APPLICABLE';
type BehaviourResult = 'PASS' | 'HONEST_PARTIAL' | 'BATCH_EXHAUSTED' | 'CAPABILITY_FAIL' | 'WRONG_DECISION';

interface BehaviourLLMDetail {
  behaviour_result: 'pass' | 'fail';
  behaviour_reason: string;
  expected_outcome_check: string;
  observed_outcome_check: string;
  key_failure_type: string;
  confidence: number;
  eval_mode: string;
  raw_response?: string;
  parse_ok?: boolean;
}

interface TestDefinition {
  id: string;
  query: string;
  expected: ExpectedOutcome;
  expectedStrategy?: string;
  notes?: string;
  queryClass: QueryClass;
  expectedMode: ExpectedMode;
  clarificationResponse?: string;
  minimumExpectedCount?: number;
}

interface TestSuite {
  id: string;
  name: string;
  description: string;
  tests: TestDefinition[];
}

const FULL_BENCHMARK_PACK: TestDefinition[] = [
  {
    id: 'B01',
    query: 'Find pubs in Arundel with Swan in the name',
    expected: 'pass',
    queryClass: 'solvable',
    expectedMode: 'deliver_results',
    minimumExpectedCount: 1,
    notes: 'Basic discovery — entity + location + name constraint.',
  },
  {
    id: 'B02',
    query: 'Find 10 cafes in York',
    expected: 'pass',
    queryClass: 'solvable',
    expectedMode: 'deliver_results',
    minimumExpectedCount: 10,
    notes: 'Basic discovery — entity + location + explicit count.',
  },
  {
    id: 'B03',
    query: 'Find restaurants in Bath that mention vegan options on their website',
    expected: 'pass',
    expectedStrategy: 'website_evidence',
    queryClass: 'website_evidence_required',
    expectedMode: 'deliver_results',
    minimumExpectedCount: 1,
    notes: 'Website evidence — semantic menu analysis.',
  },
  {
    id: 'B04',
    query: 'Find hotels in Edinburgh that mention spa facilities on their website',
    expected: 'pass',
    expectedStrategy: 'website_evidence',
    queryClass: 'website_evidence_required',
    expectedMode: 'deliver_results',
    minimumExpectedCount: 1,
    notes: 'Website evidence — amenity extraction.',
  },
  {
    id: 'B05',
    query: 'Find gyms in Manchester that offer personal training',
    expected: 'pass',
    expectedStrategy: 'website_evidence',
    queryClass: 'website_evidence_required',
    expectedMode: 'deliver_results',
    minimumExpectedCount: 1,
    notes: 'Website evidence — service attribute.',
  },
  {
    id: 'B06',
    query: 'Find pubs in Arundel that mention live music on their website',
    expected: 'pass',
    expectedStrategy: 'website_evidence',
    queryClass: 'website_evidence_required',
    expectedMode: 'deliver_results',
    minimumExpectedCount: 1,
    notes: 'Website evidence — entertainment attribute.',
  },
  {
    id: 'B06b',
    query: 'Find pubs in Arundel that mention live music on their website and have the word red in the name',
    expected: 'pass',
    expectedStrategy: 'website_evidence',
    queryClass: 'website_evidence_required',
    expectedMode: 'deliver_results',
    minimumExpectedCount: 1,
    notes: 'Website evidence + name constraint — The Red Lion should satisfy both.',
  },
  {
    id: 'B06c',
    query: 'Find pubs in Arundel that mention live music on their website and have arthaus',
    expected: 'pass',
    expectedStrategy: 'website_evidence',
    queryClass: 'website_evidence_required',
    expectedMode: 'deliver_results',
    minimumExpectedCount: 1,
    notes: 'Website evidence + name constraint — arthaus name filter alongside live music attribute.',
  },
  {
    id: 'B07',
    query: 'Find organisations that work with the local authority in Blackpool',
    expected: 'blocked_or_clarify',
    queryClass: 'relationship_required',
    expectedMode: 'clarify',
    clarificationResponse: 'Any organisations that collaborate with Blackpool Council, such as partners, suppliers, or programme participants.',
    notes: 'Relationship discovery — local authority predicate.',
  },
  {
    id: 'B08',
    query: 'Find companies that supply to NHS hospitals in Leeds',
    expected: 'blocked_or_clarify',
    queryClass: 'relationship_required',
    expectedMode: 'clarify',
    clarificationResponse: 'Companies that provide goods or services to NHS hospitals in Leeds.',
    notes: 'Relationship discovery — supplier predicate.',
  },
  {
    id: 'B09',
    query: 'Find the best dentists in Brighton',
    expected: 'blocked_or_clarify',
    queryClass: 'subjective_or_unverifiable',
    expectedMode: 'best_effort_honest',
    clarificationResponse: 'Find highly rated dental practices in Brighton based on Google reviews.',
    notes: 'Ranking — subjective "best" should trigger clarification or pass through.',
  },
  {
    id: 'B10',
    query: 'Find amazing vibes in London',
    expected: 'clarify',
    queryClass: 'subjective_or_unverifiable',
    expectedMode: 'clarify',
    clarificationResponse: 'Find popular bars and nightlife venues in London.',
    notes: 'Honest failure — purely subjective entity type, no concrete noun.',
  },
  {
    id: 'B11',
    query: 'Find pubs in Narnia',
    expected: 'clarify',
    queryClass: 'fictional_or_impossible',
    expectedMode: 'honest_refusal',
    notes: 'Honest failure — invalid/unknown location. Agent must recognise this itself.',
  },
  {
    id: 'B12',
    query: 'Find breweries',
    expected: 'clarify',
    queryClass: 'clarification_required',
    expectedMode: 'clarify',
    clarificationResponse: 'United Kingdom',
    notes: 'Difficult case — missing location, should clarify.',
  },
];

const SUITES: TestSuite[] = [
  {
    id: 'full-benchmark',
    name: 'Full Benchmark Pack',
    description: 'Complete regression benchmark — 14 fixed queries covering basic discovery, website evidence, name constraints, relationship discovery, ranking, and honest failure cases.',
    tests: FULL_BENCHMARK_PACK,
  },
  {
    id: 'stage1-core',
    name: 'Stage 1 Core',
    description: 'Basic entity-finding queries that should route and execute end-to-end.',
    tests: [
      {
        id: 'S1-01',
        query: 'Find pubs in Arundel with Swan in the name',
        expected: 'pass',
        queryClass: 'solvable',
        expectedMode: 'deliver_results',
        minimumExpectedCount: 1,
        notes: 'Simple entity + location + name filter. Should complete with results.',
      },
      {
        id: 'S1-02',
        query: 'Find pubs in Arundel that mention live music on their website',
        expected: 'pass',
        expectedStrategy: 'website_evidence',
        queryClass: 'website_evidence_required',
        expectedMode: 'deliver_results',
        minimumExpectedCount: 1,
        notes: 'Entity + location + website evidence attribute.',
      },
      {
        id: 'S1-03',
        query: 'Find the best dentists in Brighton',
        expected: 'blocked_or_clarify',
        queryClass: 'subjective_or_unverifiable',
        expectedMode: 'best_effort_honest',
        clarificationResponse: 'Find highly rated dental practices in Brighton based on Google reviews.',
        notes: 'Subjective "best" may trigger clarification or pass through — both are acceptable.',
      },
      {
        id: 'S1-04',
        query: 'Find 10 cafes in York',
        expected: 'pass',
        queryClass: 'solvable',
        expectedMode: 'deliver_results',
        minimumExpectedCount: 10,
        notes: 'Simple entity + location + explicit count.',
      },
    ],
  },
  {
    id: 'website-evidence',
    name: 'Website Evidence',
    description: 'Queries requiring semantic website analysis and evidence extraction.',
    tests: [
      {
        id: 'WE-01',
        query: 'Find restaurants in Bath that mention vegan options on their website',
        expected: 'pass',
        expectedStrategy: 'website_evidence',
        queryClass: 'website_evidence_required',
        expectedMode: 'deliver_results',
        minimumExpectedCount: 1,
        notes: 'Website evidence for vegan menu.',
      },
      {
        id: 'WE-02',
        query: 'Find hotels in Edinburgh that mention spa facilities on their website',
        expected: 'pass',
        expectedStrategy: 'website_evidence',
        queryClass: 'website_evidence_required',
        expectedMode: 'deliver_results',
        minimumExpectedCount: 1,
        notes: 'Website evidence for spa/wellness.',
      },
      {
        id: 'WE-03',
        query: 'Find gyms in Manchester that offer personal training',
        expected: 'pass',
        expectedStrategy: 'website_evidence',
        queryClass: 'website_evidence_required',
        expectedMode: 'deliver_results',
        minimumExpectedCount: 1,
        notes: 'Service attribute via website evidence.',
      },
    ],
  },
  {
    id: 'relationship-checks',
    name: 'Relationship Checks',
    description: 'Queries involving relationship predicates that may trigger clarification or blocking.',
    tests: [
      {
        id: 'RC-01',
        query: 'Find organisations that work with the local authority in Blackpool',
        expected: 'blocked_or_clarify',
        queryClass: 'relationship_required',
        expectedMode: 'clarify',
        clarificationResponse: 'Any organisations that collaborate with Blackpool Council, such as partners, suppliers, or programme participants.',
        notes: 'Relationship predicate — should trigger constraint gate or clarification.',
      },
      {
        id: 'RC-02',
        query: 'Find companies that supply to NHS hospitals in Leeds',
        expected: 'blocked_or_clarify',
        queryClass: 'relationship_required',
        expectedMode: 'clarify',
        clarificationResponse: 'Companies that provide goods or services to NHS hospitals in Leeds.',
        notes: 'Supplier relationship predicate.',
      },
    ],
  },
  {
    id: 'edge-cases',
    name: 'Edge Cases',
    description: 'Queries testing boundary conditions and error handling.',
    tests: [
      {
        id: 'EC-01',
        query: 'Find amazing vibes in London',
        expected: 'clarify',
        queryClass: 'subjective_or_unverifiable',
        expectedMode: 'clarify',
        clarificationResponse: 'Find popular bars and nightlife venues in London.',
        notes: 'Purely subjective entity type — should clarify for a concrete noun.',
      },
      {
        id: 'EC-02',
        query: 'Find pubs in Narnia',
        expected: 'clarify',
        queryClass: 'fictional_or_impossible',
        expectedMode: 'honest_refusal',
        notes: 'Invalid/unknown location — agent must recognise this itself.',
      },
      {
        id: 'EC-03',
        query: 'Find breweries',
        expected: 'clarify',
        queryClass: 'clarification_required',
        expectedMode: 'clarify',
        clarificationResponse: 'United Kingdom',
        notes: 'Missing location — should clarify.',
      },
    ],
  },
];

const GENERIC_CLARIFY_RESPONSE = 'Use the most reasonable interpretation and continue.';

const CLARIFY_PATTERNS: { pattern: RegExp; reply: string }[] = [
  { pattern: /location/i, reply: 'United Kingdom' },
];

function getClarifyAutoResponse(query: string, definitionResponse?: string, clarifyQuestion?: string): string | null {
  if (definitionResponse) return definitionResponse;
  if (clarifyQuestion) {
    for (const { pattern, reply } of CLARIFY_PATTERNS) {
      if (pattern.test(clarifyQuestion)) return reply;
    }
  }
  return null;
}

const PER_TEST_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 2_000;
const AFR_RECONCILE_TIMEOUT_MS = 120_000;
const AFR_RECONCILE_INTERVAL_MS = 5_000;
const SUPERVISOR_EXECUTION_TIMEOUT_MS = 300_000;

type TestStatus = 'queued' | 'running' | 'completed' | 'failed' | 'timed_out' | 'poll_timeout_completed' | 'poll_timeout_running' | 'poll_expired_reconciling';
type SuiteStatus = 'not_started' | 'running' | 'completed' | 'failed';
type Judgement = 'pass' | 'fail' | 'skip' | 'mismatch';
type LayerStatus = 'pass' | 'fail' | 'blocked' | 'timeout' | 'unknown';
type BenchmarkOutcome = 'PASS' | 'PARTIAL_SUCCESS' | 'BLOCKED' | 'TIMEOUT' | 'FAIL';
type SystemHealthOutcome = 'HEALTHY' | 'DEGRADED' | 'BROKEN' | 'TIMEOUT';
type AgentQualityOutcome = 'PASS' | 'PARTIAL' | 'FAIL' | 'NOT_APPLICABLE' | 'UNKNOWN';

const LAYER_NAMES = ['interpretation', 'planning', 'execution', 'discovery', 'delivery', 'verification', 'tower'] as const;
type LayerName = typeof LAYER_NAMES[number];

type LayerBreakdown = Record<LayerName, LayerStatus>;

function emptyLayerBreakdown(): LayerBreakdown {
  return {
    interpretation: 'unknown',
    planning: 'unknown',
    execution: 'unknown',
    discovery: 'unknown',
    delivery: 'unknown',
    verification: 'unknown',
    tower: 'unknown',
  };
}

interface TestResult {
  id: string;
  query: string;
  expected: ExpectedOutcome;
  queryClass: QueryClass;
  expectedMode: ExpectedMode;
  expectedOutcome: string;
  minimumExpectedCount?: number;
  notes?: string;
  status: TestStatus;
  runId: string | null;
  clientRequestId: string | null;
  error: string | null;
  durationMs: number | null;
  blocked: boolean;
  clarified: boolean;
  autoClarified: boolean;
  clarifyResponseValue: string | null;
  clarifyContinueSuccess: boolean;
  postClarifyTimeout: boolean;
  towerVerdict: string | null;
  resultSummary: string | null;
  deliveredCount: number;
  judgement: Judgement | null;
  layers: LayerBreakdown;
  benchmarkOutcome: BenchmarkOutcome | null;
  systemHealth: SystemHealthOutcome | null;
  agentQuality: AgentQualityOutcome | null;
  towerResult: TowerResult | null;
  behaviourResult: BehaviourResult | null;
  behaviourLLMDetail: BehaviourLLMDetail | null;
  behaviourSourceOfTruth: 'llm' | 'fallback_legacy' | 'unknown';
  behaviourFallbackUsed: boolean;
  fallbackReason: string | null;
  missionIntentVerdict: string | null;
  groundTruthVerdict: string | null;
}

interface SuiteRunHistory {
  suiteId: string;
  timestamp: number;
  results: TestResult[];
}

function getUser(): { id: string; email: string } | null {
  try {
    const raw = localStorage.getItem('wyshbone_user');
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function buildExpectedOutcome(t: TestDefinition): string {
  const MODE_LABELS: Record<ExpectedMode, string> = {
    deliver_results: 'Deliver results',
    clarify: 'Clarify before running',
    honest_refusal: 'Honest refusal',
    best_effort_honest: 'Best effort or clarify',
  };
  const parts: string[] = [MODE_LABELS[t.expectedMode] || t.expectedMode];
  if (t.expectedStrategy) parts.push(`strategy: ${t.expectedStrategy}`);
  if (t.minimumExpectedCount != null) parts.push(`min ${t.minimumExpectedCount} results`);
  if (t.notes) parts.push(t.notes);
  return parts.join(' · ');
}

function evaluateJudgement(expected: ExpectedOutcome, result: TestResult): Judgement {
  if (result.status === 'timed_out') return 'skip';
  if (result.status === 'poll_expired_reconciling') return 'skip';
  if (result.status === 'failed' && result.error === 'Stopped by user') return 'skip';

  const actualOutcome = deriveActualOutcome(result);

  switch (expected) {
    case 'pass':
      return actualOutcome === 'pass' ? 'pass' : 'mismatch';
    case 'fail':
      return actualOutcome === 'fail' ? 'pass' : 'mismatch';
    case 'blocked':
      return result.blocked ? 'pass' : 'mismatch';
    case 'clarify':
      return result.clarified ? 'pass' : 'mismatch';
    case 'blocked_or_clarify':
      return (result.blocked || result.clarified) ? 'pass' : 'mismatch';
    default:
      return 'skip';
  }
}

function deriveActualOutcome(result: TestResult): string {
  if (result.blocked) return 'blocked';
  if (result.clarified) return 'clarify';
  if (result.status === 'completed' || result.status === 'poll_timeout_completed') return 'pass';
  if (result.status === 'failed') return 'fail';
  if (result.status === 'timed_out') return 'timed_out';
  return 'unknown';
}

function judgementBadge(j: Judgement | null) {
  if (!j) return null;
  switch (j) {
    case 'pass':
      return <Badge className="bg-green-100 text-green-700 border-green-200"><CheckCircle2 className="w-3 h-3 mr-1" />Pass</Badge>;
    case 'mismatch':
      return <Badge className="bg-red-100 text-red-700 border-red-200"><XCircle className="w-3 h-3 mr-1" />Mismatch</Badge>;
    case 'fail':
      return <Badge className="bg-red-100 text-red-700 border-red-200"><XCircle className="w-3 h-3 mr-1" />Fail</Badge>;
    case 'skip':
      return <Badge variant="outline" className="text-gray-500 border-gray-300"><Clock className="w-3 h-3 mr-1" />Skip</Badge>;
  }
}

function statusBadge(status: TestStatus | SuiteStatus) {
  switch (status) {
    case 'not_started':
      return <Badge variant="outline" className="text-gray-500 border-gray-300"><Clock className="w-3 h-3 mr-1" />Not started</Badge>;
    case 'queued':
      return <Badge variant="outline" className="text-gray-500 border-gray-300"><Clock className="w-3 h-3 mr-1" />Queued</Badge>;
    case 'running':
      return <Badge className="bg-blue-100 text-blue-700 border-blue-200"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Running</Badge>;
    case 'completed':
      return <Badge className="bg-green-100 text-green-700 border-green-200"><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
    case 'failed':
      return <Badge className="bg-red-100 text-red-700 border-red-200"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
    case 'timed_out':
      return <Badge className="bg-red-100 text-red-700 border-red-200"><Clock className="w-3 h-3 mr-1" />Timeout</Badge>;
    case 'poll_timeout_completed':
      return <Badge className="bg-green-100 text-green-700 border-green-200"><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
    case 'poll_timeout_running':
      return <Badge className="bg-amber-100 text-amber-700 border-amber-200"><Clock className="w-3 h-3 mr-1" />Timeout</Badge>;
    case 'poll_expired_reconciling':
      return <Badge className="bg-blue-100 text-blue-700 border-blue-200"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Polling expired – reconciling with AFR</Badge>;
  }
}


async function submitQuery(
  query: string,
  user: { id: string; email: string },
  conversationId: string,
  clientRequestId: string,
  signal: AbortSignal,
): Promise<{ runId: string | null }> {
  const sessionId = localStorage.getItem('wyshbone_sid');
  const response = await fetch(buildApiUrl(addDevAuthParams('/api/chat')), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(sessionId ? { 'x-session-id': sessionId } : {}),
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: query }],
      user: { id: user.id, email: user.email },
      defaultCountry: 'GB',
      conversationId,
      clientRequestId,
      google_query_mode: 'BIASED_STABLE',
    }),
    signal,
    credentials: 'include',
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || err.message || `HTTP ${response.status}`);
  }

  let runId: string | null = null;
  const reader = response.body?.getReader();
  if (!reader) return { runId };

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') continue;
        try {
          const parsed = JSON.parse(raw);
          if (parsed.conversationId) {
            localStorage.setItem('currentConversationId', parsed.conversationId);
          }
          if (parsed.type === 'run_id' && parsed.content) {
            runId = parsed.content;
          }
        } catch {}
      }
    }
  } catch (e: any) {
    if (e.name === 'AbortError') throw e;
  } finally {
    try { reader.cancel(); } catch {}
  }

  window.dispatchEvent(new CustomEvent('wyshbone:refetch_history'));
  return { runId };
}

async function sendClarifyResponse(
  responseText: string,
  user: { id: string; email: string },
  conversationId: string,
  clarifyRunId: string,
  clarifyClientRequestId: string,
  signal: AbortSignal,
): Promise<void> {
  const sessionId = localStorage.getItem('wyshbone_sid');
  const newClientRequestId = crypto.randomUUID();
  const response = await fetch(buildApiUrl(addDevAuthParams('/api/chat')), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(sessionId ? { 'x-session-id': sessionId } : {}),
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: responseText }],
      user: { id: user.id, email: user.email },
      defaultCountry: 'GB',
      conversationId,
      clientRequestId: newClientRequestId,
      clarify_run_id: clarifyRunId,
      clarify_client_request_id: clarifyClientRequestId,
      google_query_mode: 'BIASED_STABLE',
    }),
    signal,
    credentials: 'include',
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`Clarify response failed: ${err.error || err.message || response.status}`);
  }

  const reader = response.body?.getReader();
  if (reader) {
    try {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    } catch (e: any) {
      if (e.name === 'AbortError') throw e;
    } finally {
      try { reader.cancel(); } catch {}
    }
  }
}

function parsePayload(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return {}; } }
  if (typeof raw === 'object') return raw as Record<string, any>;
  return {};
}

async function fetchClarifyQuestion(runId: string, signal: AbortSignal): Promise<string | undefined> {
  try {
    const params = new URLSearchParams({ runId });
    const res = await fetch(
      buildApiUrl(addDevAuthParams(`/api/afr/artefacts?${params.toString()}`)),
      { credentials: 'include', signal }
    );
    if (!res.ok) return undefined;
    const artefacts: any[] = await res.json();
    for (const a of artefacts) {
      if (a.type === 'clarify_gate') {
        const p = parsePayload(a.payload_json) ?? parsePayload(a.payload);
        return p.questions?.[0] ?? p.reason ?? p.question ?? p.prompt ?? p.message ?? undefined;
      }
      if (a.type === 'diagnostic' && typeof a.title === 'string' &&
          a.title.toLowerCase().includes('constraint gate') && a.title.toLowerCase().includes('blocked')) {
        const p = parsePayload(a.payload_json) ?? parsePayload(a.payload);
        const cc = p.constraint_contract;
        if (cc?.clarify_questions?.[0]) return cc.clarify_questions[0];
        const blocked = (cc?.constraints ?? []).find((c: any) => c.status === 'blocked' || c.status === 'unresolved');
        if (blocked?.clarify_question) return blocked.clarify_question;
        if (cc?.why_blocked) return cc.why_blocked;
      }
    }
  } catch {}
  return undefined;
}

interface QaClarifyContext {
  query: string;
  user: { id: string; email: string };
  conversationId: string;
  clarificationResponse?: string;
}

interface PollResult {
  terminal: boolean;
  status: string;
  timedOut: boolean;
  finalRunId: string | null;
  wasClarifying: boolean;
  autoClarified: boolean;
  clarifyResponseValue: string | null;
  clarifyContinueSuccess: boolean;
  postClarifyTimeout: boolean;
}

const POST_CLARIFY_EXTENSION_MS = 90_000;

function resolveCanonicalStatus(status: string, terminalState?: string): string {
  if (status === 'completed' || terminalState === 'completed' || terminalState === 'PASS') return 'completed';
  if (status === 'stopped' || terminalState === 'stopped' || terminalState === 'STOP') return 'stopped';
  if (status === 'timed_out' || terminalState === 'timed_out') return 'timed_out';
  if (status === 'failed' || terminalState === 'failed' || terminalState === 'FAIL') return 'failed';
  return 'failed';
}

async function pollUntilTerminal(
  clientRequestId: string,
  runId: string | null,
  timeoutMs: number,
  signal: AbortSignal,
  qaClarifyCtx?: QaClarifyContext,
): Promise<PollResult> {
  const start = Date.now();
  let deadline = start + timeoutMs;
  let finalRunId = runId;
  let wasClarifying = false;
  let autoClarified = false;
  let clarifyResponseSent = false;
  let clarifyResponseValue: string | null = null;
  let clarifyContinueSuccess = false;
  let postClarifyTimeout = false;
  let clarifyResponseSentAt: number | null = null;

  while (Date.now() < deadline) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    const params = new URLSearchParams();
    params.set('client_request_id', clientRequestId);
    if (finalRunId) params.set('runId', finalRunId);

    try {
      const res = await fetch(
        buildApiUrl(addDevAuthParams(`/api/afr/stream?${params.toString()}`)),
        { credentials: 'include', cache: 'no-store', signal }
      );
      if (!res.ok) continue;
      const data = await res.json();

      if (data.run_id && !finalRunId) finalRunId = data.run_id;

      const isTerminal = data.is_terminal === true;
      const status = data.status || 'unknown';
      const terminalState = data.terminal_state;

      if (status === 'clarifying') {
        wasClarifying = true;

        if (qaClarifyCtx && !clarifyResponseSent && finalRunId) {
          let clarifyQuestion: string | undefined;
          try { clarifyQuestion = await fetchClarifyQuestion(finalRunId, signal); } catch {}
          const autoResponse = getClarifyAutoResponse(qaClarifyCtx.query, qaClarifyCtx.clarificationResponse, clarifyQuestion);
          if (autoResponse) {
            try {
              await sendClarifyResponse(
                autoResponse,
                qaClarifyCtx.user,
                qaClarifyCtx.conversationId,
                finalRunId,
                clientRequestId,
                signal,
              );
              clarifyResponseSent = true;
              autoClarified = true;
              clarifyResponseValue = autoResponse;
              clarifyResponseSentAt = Date.now();
              deadline = clarifyResponseSentAt + POST_CLARIFY_EXTENSION_MS;
            } catch (e: any) {
              if (e.name === 'AbortError') throw e;
            }
            continue;
          }
        }
      }

      if (isTerminal || status === 'completed' || status === 'failed' || status === 'stopped' ||
          terminalState === 'PASS' || terminalState === 'FAIL' || terminalState === 'STOP' ||
          terminalState === 'completed' || terminalState === 'failed' || terminalState === 'stopped') {
        if (clarifyResponseSent) clarifyContinueSuccess = true;
        const canonicalStatus = resolveCanonicalStatus(status, terminalState);
        return { terminal: true, status: canonicalStatus, timedOut: false, finalRunId, wasClarifying, autoClarified, clarifyResponseValue, clarifyContinueSuccess, postClarifyTimeout: false };
      }
    } catch (e: any) {
      if (e.name === 'AbortError') throw e;
    }
  }

  postClarifyTimeout = clarifyResponseSent;

  return { terminal: false, status: 'poll_expired_reconciling' as any, timedOut: true, finalRunId, wasClarifying, autoClarified, clarifyResponseValue, clarifyContinueSuccess: false, postClarifyTimeout };
}

interface ReconcileResult {
  status: TestStatus;
  terminal: boolean;
  afrFinalState: string | null;
}

async function reconcileWithAfr(
  clientRequestId: string,
  runId: string | null,
  runStartTime: number,
  signal?: AbortSignal,
): Promise<ReconcileResult> {
  const supervisorDeadline = runStartTime + SUPERVISOR_EXECUTION_TIMEOUT_MS;

  while (Date.now() < supervisorDeadline) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    try {
      const params = new URLSearchParams();
      params.set('client_request_id', clientRequestId);
      if (runId) params.set('runId', runId);
      const res = await fetch(
        buildApiUrl(addDevAuthParams(`/api/afr/stream?${params.toString()}`)),
        { credentials: 'include', cache: 'no-store', signal }
      );
      if (res.ok) {
        const data = await res.json();
        const status = data.status || 'unknown';
        const terminalState = data.terminal_state;
        const isTerminal = data.is_terminal === true;

        if (isTerminal || status === 'completed' || status === 'failed' || status === 'stopped' ||
            terminalState === 'PASS' || terminalState === 'FAIL' || terminalState === 'STOP' ||
            terminalState === 'completed' || terminalState === 'failed' || terminalState === 'stopped') {
          const canonical = resolveCanonicalStatus(status, terminalState);
          if (canonical === 'completed') return { status: 'completed', terminal: true, afrFinalState: 'completed' };
          if (canonical === 'failed') return { status: 'failed', terminal: true, afrFinalState: 'failed' };
          if (canonical === 'stopped') return { status: 'timed_out', terminal: true, afrFinalState: 'stopped' };
          return { status: canonical as TestStatus, terminal: true, afrFinalState: canonical };
        }

        if (status === 'clarifying') {
          return { status: 'failed', terminal: true, afrFinalState: 'clarifying' };
        }
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') throw e;
    }

    await new Promise(r => setTimeout(r, AFR_RECONCILE_INTERVAL_MS));
  }

  return { status: 'timed_out', terminal: true, afrFinalState: 'timeout_exceeded' };
}

interface ArtefactInfo {
  blocked: boolean;
  clarified: boolean;
  towerVerdict: string | null;
  resultSummary: string | null;
  deliveredCount: number;
  hasLeadPack: boolean;
  layers: LayerBreakdown;
  deliveredEntities: Array<{
    name: string;
    location?: string;
    website?: string;
    key_evidence?: string[];
    match_reason?: string;
    evidence_source_url?: string;
    verification_flags?: Record<string, boolean>;
  }>;
  evidenceSummary: Array<{ entity_name: string; matched_quote?: string; source_url?: string; constraint_type?: string; confidence?: number }>;
}

function deriveLayers(artefacts: any[]): LayerBreakdown {
  const layers = emptyLayerBreakdown();

  let hasClarifyGate = false;
  let hasClarifyResolution = false;
  let hasConstraintBlocked = false;
  let hasLeadsList = false;
  let hasDeliverySummary = false;
  let deliveredCount = 0;
  let hasTowerJudgement = false;
  let towerPassed = false;
  let hasLeadPack = false;
  let hasPlanResult = false;
  let hasStepResult = false;

  for (const a of artefacts) {
    const t = a.type;
    const title = (typeof a.title === 'string' ? a.title : '').toLowerCase();

    if (t === 'clarify_gate') hasClarifyGate = true;
    if (t === 'clarify_resolution') hasClarifyResolution = true;
    if (t === 'diagnostic' && title.includes('constraint gate') && title.includes('blocked')) hasConstraintBlocked = true;

    if (t === 'leads_list') hasLeadsList = true;
    if (t === 'lead_pack' || t === 'contact_extract' || t === 'lead_enrich') hasLeadPack = true;
    if (t === 'plan_result' || t === 'step_result') {
      hasPlanResult = true;
      hasStepResult = true;
    }

    if (t === 'delivery_summary') {
      hasDeliverySummary = true;
      try {
        const payload = typeof a.payload_json === 'string' ? JSON.parse(a.payload_json) : a.payload_json;
        deliveredCount = payload?.delivered_exact?.length || payload?.delivered_count || 0;
      } catch {}
    }

    if (t === 'tower_judgement') {
      hasTowerJudgement = true;
      try {
        const payload = typeof a.payload_json === 'string' ? JSON.parse(a.payload_json) : a.payload_json;
        const v = (payload?.verdict || payload?.tower_verdict || payload?.pass_fail || '').toString().toLowerCase();
        if (v.includes('pass') || v.includes('accept')) towerPassed = true;
      } catch {}
    }
  }

  if (hasConstraintBlocked) {
    layers.interpretation = 'blocked';
    return layers;
  }

  if (hasClarifyGate && !hasClarifyResolution) {
    layers.interpretation = 'blocked';
    return layers;
  }

  layers.interpretation = 'pass';

  if (hasPlanResult || hasStepResult || hasLeadsList || hasDeliverySummary) {
    layers.planning = 'pass';
    layers.execution = 'pass';
  } else if (hasClarifyResolution) {
    layers.planning = 'unknown';
    layers.execution = 'unknown';
  }

  if (hasLeadsList || hasDeliverySummary) {
    layers.discovery = 'pass';
  } else if (layers.execution === 'pass') {
    layers.discovery = 'fail';
  }

  if (hasDeliverySummary && deliveredCount > 0) {
    layers.delivery = 'pass';
  } else if (hasDeliverySummary) {
    layers.delivery = 'fail';
  } else if (layers.discovery === 'pass') {
    layers.delivery = 'fail';
  }

  if (hasLeadPack && layers.delivery === 'pass') {
    layers.verification = 'pass';
  } else if (layers.delivery === 'pass') {
    layers.verification = 'fail';
  }

  if (hasTowerJudgement) {
    layers.tower = towerPassed ? 'pass' : 'fail';
  }

  return layers;
}

function deriveBenchmarkOutcome(result: TestResult): BenchmarkOutcome {
  if (result.status === 'timed_out') return 'TIMEOUT';
  if (result.status === 'poll_timeout_running') return 'TIMEOUT';
  if (result.status === 'failed' && result.error === 'Stopped by user') return 'TIMEOUT';

  if (result.blocked || result.clarified) {
    if (result.expected === 'blocked' || result.expected === 'clarify' || result.expected === 'blocked_or_clarify') {
      return 'PASS';
    }
    return 'BLOCKED';
  }

  const l = result.layers;

  if (l.interpretation === 'blocked') return 'BLOCKED';

  const discoveryOk = l.discovery === 'pass';
  const deliveryOk = l.delivery === 'pass';
  const towerOk = l.tower === 'pass';

  if (discoveryOk && deliveryOk && towerOk) return 'PASS';

  if (discoveryOk && deliveryOk && !towerOk) return 'PARTIAL_SUCCESS';
  if (discoveryOk && !deliveryOk) return 'PARTIAL_SUCCESS';

  const isCompleted = result.status === 'completed' || result.status === 'poll_timeout_completed';

  if (isCompleted && result.expected === 'pass') {
    if (towerOk) return 'PASS';
    if (discoveryOk) return 'PARTIAL_SUCCESS';
    return 'FAIL';
  }

  if (isCompleted) return 'PASS';
  return 'FAIL';
}

function deriveSystemHealth(result: TestResult): SystemHealthOutcome {
  if (result.status === 'timed_out') return 'TIMEOUT';
  if (result.status === 'poll_timeout_running') return 'TIMEOUT';
  if (result.status === 'failed' && result.error === 'Stopped by user') return 'TIMEOUT';
  if (result.status === 'failed' && result.error && result.error !== 'Stopped by user') return 'BROKEN';
  if (result.status === 'completed' || result.status === 'poll_timeout_completed') return 'HEALTHY';
  if (result.blocked || result.clarified) return 'HEALTHY';
  return 'BROKEN';
}

function deriveAgentQuality(result: TestResult): AgentQualityOutcome {
  if (result.status === 'timed_out') return 'UNKNOWN';
  if (result.status === 'poll_timeout_running') return 'UNKNOWN';
  if (result.status === 'poll_expired_reconciling') return 'UNKNOWN';
  if (result.status === 'failed' && result.error === 'Stopped by user') return 'UNKNOWN';
  if (result.status === 'failed' && result.error) return 'UNKNOWN';

  if (result.blocked || result.clarified) {
    if (result.expected === 'blocked' || result.expected === 'clarify' || result.expected === 'blocked_or_clarify') {
      return 'PASS';
    }
    return 'FAIL';
  }

  const l = result.layers;
  const discoveryOk = l.discovery === 'pass';
  const deliveryOk = l.delivery === 'pass';

  if (discoveryOk && deliveryOk) return 'PASS';
  if (discoveryOk && !deliveryOk) return 'PARTIAL';

  return 'FAIL';
}

function deriveTowerResult(result: TestResult): TowerResult {
  if (result.blocked || result.clarified) return 'NOT_APPLICABLE';
  return towerVerdictToResult(result.towerVerdict);
}

function buildUserVisibleSummary(result: TestResult, details: ArtefactInfo): string {
  const parts: string[] = [];

  if (result.clarified) {
    parts.push('Asked a clarifying question before executing.');
  }
  if (result.blocked) {
    parts.push('Declined to execute because the query could not be satisfied.');
  }

  if (details.deliveredCount > 0) {
    const entityNames = details.deliveredEntities.slice(0, 5).map(e => e.name);
    const nameList = entityNames.length > 0 ? `, including ${entityNames.join(', ')}` : '';
    parts.push(`Returned ${details.deliveredCount} result${details.deliveredCount !== 1 ? 's' : ''}${nameList}.`);
  }

  const entitiesWithEvidence = details.deliveredEntities.filter(e => e.key_evidence && e.key_evidence.length > 0);
  if (entitiesWithEvidence.length > 0) {
    const names = entitiesWithEvidence.slice(0, 3).map(e => e.name);
    const nameStr = names.length > 0 ? `, including ${names.join(', ')}` : '';
    parts.push(`${entitiesWithEvidence.length} result${entitiesWithEvidence.length !== 1 ? 's have' : ' has'} attached evidence with supporting quotes${nameStr}.`);
  } else if (details.evidenceSummary.length > 0) {
    const withQuotes = details.evidenceSummary.filter(e => e.matched_quote);
    if (withQuotes.length > 0) {
      parts.push(`${withQuotes.length} result${withQuotes.length !== 1 ? 's have' : ' has'} attached evidence with source quotes.`);
    } else {
      parts.push(`${details.evidenceSummary.length} evidence item${details.evidenceSummary.length !== 1 ? 's' : ''} found, but none include direct quotes.`);
    }
  } else if (details.deliveredCount > 0) {
    parts.push('No supporting evidence attached to the delivered results.');
  }

  if (result.status === 'failed' && details.deliveredCount === 0 && !result.clarified && !result.blocked) {
    parts.push('Run failed with no results delivered.');
  }
  if (result.status === 'timed_out') {
    parts.push('Run timed out before completing.');
  }

  return parts.join(' ') || 'No observable outcome recorded.';
}

function buildEvalPacket(
  test: TestDefinition,
  result: TestResult,
  details: ArtefactInfo,
): Record<string, unknown> {
  const MODE_LABELS: Record<string, string> = {
    deliver_results: 'Deliver results matching the query',
    clarify: 'Clarify before running (missing info)',
    honest_refusal: 'Honest refusal (impossible/fictional)',
    best_effort_honest: 'Best effort delivery or clarify',
  };

  return {
    benchmark_test_id: test.id,
    original_query: test.query,
    expected_outcome_text: buildExpectedOutcome(test),
    expected_behaviour_text: MODE_LABELS[test.expectedMode] || test.expectedMode,
    final_run_outcome: {
      run_state: result.status,
      clarified: result.clarified,
      clarify_question: result.autoClarified ? 'Auto-clarification triggered' : undefined,
      clarify_answer: result.clarifyResponseValue || undefined,
      delivered_count: details.deliveredCount,
    },
    delivered_results: details.deliveredEntities.slice(0, 20).map(e => ({
      name: e.name,
      location: e.location,
      website: e.website,
      delivered: true,
      match_reason: e.match_reason || undefined,
      evidence: e.key_evidence && e.key_evidence.length > 0 ? e.key_evidence : undefined,
      evidence_source_url: e.evidence_source_url || undefined,
    })),
    delivered_result_evidence: (() => {
      const entityEvidence: Array<Record<string, unknown>> = [];
      for (const ent of details.deliveredEntities.slice(0, 20)) {
        if (ent.key_evidence && ent.key_evidence.length > 0) {
          for (const snippet of ent.key_evidence.slice(0, 3)) {
            entityEvidence.push({
              entity_name: ent.name,
              match_reason: ent.match_reason || undefined,
              source_url: ent.evidence_source_url || ent.website || undefined,
              quote: snippet,
              matched_phrase: snippet.length > 80 ? snippet.slice(0, 80) : snippet,
              constraint_type: 'entity_attached',
              confidence: undefined,
            });
          }
        } else if (ent.match_reason) {
          entityEvidence.push({
            entity_name: ent.name,
            match_reason: ent.match_reason,
            source_url: ent.evidence_source_url || ent.website || undefined,
            quote: undefined,
            constraint_type: 'match_only',
            confidence: undefined,
          });
        }
      }
      if (entityEvidence.length > 0) return entityEvidence.slice(0, 15);

      const deliveredNames = new Set(
        details.deliveredEntities.map(e => (e.name || '').toLowerCase().trim())
      );
      return details.evidenceSummary
        .filter(e => {
          const eName = (e.entity_name || '').toLowerCase().trim();
          if (deliveredNames.has(eName)) return true;
          for (const dName of deliveredNames) {
            if (dName && eName && (dName.includes(eName) || eName.includes(dName))) return true;
          }
          return false;
        })
        .slice(0, 15)
        .map(e => ({
          entity_name: e.entity_name,
          source_url: e.source_url,
          quote: e.matched_quote,
          matched_phrase: e.matched_quote,
          constraint_type: e.constraint_type,
          confidence: e.confidence,
        }));
    })(),
    user_visible_summary: buildUserVisibleSummary(result, details),
  };
}

async function fetchRunDetails(runId: string): Promise<ArtefactInfo> {
  const info: ArtefactInfo = { blocked: false, clarified: false, towerVerdict: null, resultSummary: null, deliveredCount: 0, hasLeadPack: false, layers: emptyLayerBreakdown(), deliveredEntities: [], evidenceSummary: [] };
  try {
    const params = new URLSearchParams({ runId });
    const res = await fetch(
      buildApiUrl(addDevAuthParams(`/api/afr/artefacts?${params.toString()}`)),
      { credentials: 'include' }
    );
    if (!res.ok) return info;
    const artefacts: any[] = await res.json();

    let deliveredExact: any[] = [];

    for (const a of artefacts) {
      if (a.type === 'clarify_gate') {
        info.clarified = true;
      }
      if (a.type === 'diagnostic' && typeof a.title === 'string' &&
          a.title.toLowerCase().includes('constraint gate') && a.title.toLowerCase().includes('blocked')) {
        info.blocked = true;
      }
      if (a.type === 'lead_pack' || a.type === 'contact_extract' || a.type === 'lead_enrich') {
        info.hasLeadPack = true;
      }
      if (a.type === 'tower_judgement') {
        try {
          const payload = typeof a.payload_json === 'string' ? JSON.parse(a.payload_json) : a.payload_json;
          info.towerVerdict = payload?.verdict || payload?.tower_verdict || payload?.pass_fail || null;
          if (payload?.evidence_items && Array.isArray(payload.evidence_items)) {
            for (const ev of payload.evidence_items.slice(0, 10)) {
              info.evidenceSummary.push({
                entity_name: ev.entity_name || ev.name || 'Unknown',
                matched_quote: ev.matched_quote || ev.quote || ev.snippet || undefined,
                source_url: ev.source_url || ev.url || undefined,
                constraint_type: ev.constraint_type || ev.type || undefined,
                confidence: ev.confidence ?? undefined,
              });
            }
          }
        } catch {}
      }
      if (a.type === 'delivery_summary') {
        try {
          const payload = typeof a.payload_json === 'string' ? JSON.parse(a.payload_json) : a.payload_json;
          deliveredExact = payload?.delivered_exact || [];
          const delivered = deliveredExact.length || payload?.delivered_count || 0;
          info.deliveredCount = delivered;
          info.resultSummary = `${delivered} lead${delivered !== 1 ? 's' : ''} delivered`;
        } catch {}
      }
    }

    const semanticByLead = new Map<string, { reason?: string; snippets?: string[]; sourceUrl?: string }>();
    for (const a of artefacts) {
      if (a.type === 'tower_semantic_judgement') {
        try {
          const p = typeof a.payload_json === 'string' ? JSON.parse(a.payload_json) : a.payload_json;
          if (p && typeof p === 'object') {
            const leadName = (p.lead_name || p.name || p.entity_name || '').toLowerCase().trim();
            const leadId = p.lead_place_id || p.lead_id || p.place_id || '';
            const constraint = p.constraint_to_check || '';
            const status = (p.tower_status || p.status || '').toLowerCase();
            const snippets = Array.isArray(p.tower_matched_snippets) ? p.tower_matched_snippets : [];
            const sourceUrl = p.source_url || '';
            const isMatch = status === 'strong_match' || status === 'match' || status === 'weak_match';
            if (leadName || leadId) {
              const key = leadName || leadId;
              const existing = semanticByLead.get(key);
              if (!existing || (isMatch && snippets.length > 0)) {
                semanticByLead.set(key, {
                  reason: constraint ? (isMatch ? `Matched: ${constraint}` : `${status}: ${constraint}`) : undefined,
                  snippets: snippets.length > 0 ? snippets.slice(0, 3) : existing?.snippets,
                  sourceUrl: sourceUrl || existing?.sourceUrl,
                });
              }
            }
          }
        } catch {}
      }
    }

    for (const entity of deliveredExact.slice(0, 20)) {
      const e: ArtefactInfo['deliveredEntities'][number] = {
        name: entity.name || entity.entity_name || 'Unknown',
      };
      if (entity.address || entity.location) e.location = entity.address || entity.location;
      if (entity.website || entity.url) e.website = entity.website || entity.url;
      if (entity.evidence && Array.isArray(entity.evidence)) {
        e.key_evidence = entity.evidence.slice(0, 3).map((ev: any) => typeof ev === 'string' ? ev : (ev.snippet || ev.quote || ev.summary || JSON.stringify(ev)));
      }
      if (entity.verification) e.verification_flags = entity.verification;

      if (entity.match_reason) e.match_reason = entity.match_reason;
      if (entity.match_summary) e.match_reason = e.match_reason || entity.match_summary;
      if (entity.evidence_source_url) e.evidence_source_url = entity.evidence_source_url;

      const nameKey = (e.name || '').toLowerCase().trim();
      const semantic = semanticByLead.get(nameKey);
      if (semantic) {
        if (!e.match_reason && semantic.reason) e.match_reason = semantic.reason;
        if (!e.evidence_source_url && semantic.sourceUrl) e.evidence_source_url = semantic.sourceUrl;
        if (!e.key_evidence && semantic.snippets && semantic.snippets.length > 0) {
          e.key_evidence = semantic.snippets;
        }
      }

      info.deliveredEntities.push(e);
    }

    for (const a of artefacts) {
      if (a.type === 'verification_result' || a.type === 'website_evidence') {
        try {
          const payload = typeof a.payload_json === 'string' ? JSON.parse(a.payload_json) : a.payload_json;
          if (payload?.results && Array.isArray(payload.results)) {
            for (const r of payload.results.slice(0, 5)) {
              info.evidenceSummary.push({
                entity_name: r.entity_name || r.name || 'Unknown',
                matched_quote: r.matched_quote || r.snippet || r.evidence_text || undefined,
                source_url: r.source_url || r.url || undefined,
                constraint_type: r.constraint_type || 'website_evidence',
                confidence: r.confidence ?? undefined,
              });
            }
          }
        } catch {}
      }
    }

    info.layers = deriveLayers(artefacts);
  } catch {}
  return info;
}

function saveHistory(history: SuiteRunHistory) {
  try {
    const key = 'qa_runner_history';
    const existing: SuiteRunHistory[] = JSON.parse(localStorage.getItem(key) || '[]');
    existing.unshift(history);
    if (existing.length > 10) existing.length = 10;
    localStorage.setItem(key, JSON.stringify(existing));
  } catch {}
}

function loadHistory(): SuiteRunHistory[] {
  try {
    return JSON.parse(localStorage.getItem('qa_runner_history') || '[]');
  } catch { return []; }
}

function towerVerdictToResult(verdict: string | null): 'PASS' | 'FAIL' | 'UNKNOWN' {
  if (!verdict) return 'UNKNOWN';
  const lower = verdict.toLowerCase();
  if (lower.includes('pass') || lower.includes('accept')) return 'PASS';
  if (lower.includes('fail') || lower.includes('stop') || lower.includes('error')) return 'FAIL';
  return 'UNKNOWN';
}

async function persistQaMetric(
  result: TestResult,
  test: TestDefinition,
  suiteId: string,
  packTimestamp: number,
  pollExpired: boolean = false,
  afrFinalState: string | null = null,
  artefactDetails: ArtefactInfo | null = null,
): Promise<void> {
  if (!result.runId) return;
  if (result.status === 'queued' || result.status === 'running' || result.status === 'poll_expired_reconciling') return;

  const systemHealth = result.systemHealth || deriveSystemHealth(result);
  const agentQuality = result.agentQuality || deriveAgentQuality(result);
  const tResult = result.towerResult || deriveTowerResult(result);
  const bResult = result.behaviourResult || 'UNKNOWN';

  const payload = {
    runId: result.runId,
    timestamp: Date.now(),
    query: result.query,
    queryClass: result.queryClass,
    expectedMode: test.expectedMode,
    suiteId,
    packTimestamp,
    benchmarkTestId: test.id,
    source: 'benchmark' as const,
    systemStatus: systemHealth,
    agentStatus: agentQuality,
    towerResult: tResult,
    behaviourResult: bResult,
    metadata: {
      judgement: result.judgement,
      benchmarkOutcome: result.benchmarkOutcome,
      expected: result.expected,
      durationMs: result.durationMs,
      deliveredCount: result.deliveredCount,
      requestedCount: result.minimumExpectedCount ?? null,
      blocked: result.blocked,
      clarified: result.clarified,
      towerVerdict: result.towerVerdict,
      layers: result.layers,
      poll_expired: pollExpired,
      afr_final_state: afrFinalState,
      afr_reconciled: pollExpired,
      raw_observer_status: result.status,
      expectedOutcome: result.expectedOutcome,
      expected_outcome_text: buildExpectedOutcome(test),
      expected_behaviour_text: test.expectedMode,
      behaviour_eval_packet: artefactDetails
        ? buildEvalPacket(test, result, artefactDetails)
        : {
            benchmark_test_id: test.id,
            original_query: test.query,
            expected_outcome_text: buildExpectedOutcome(test),
            expected_behaviour_text: test.expectedMode,
            final_run_outcome: {
              run_state: result.status,
              clarified: result.clarified,
              delivered_count: result.deliveredCount,
            },
            delivered_results: [],
            delivered_result_evidence: [],
            user_visible_summary: 'N/A',
          },
      behaviour_source_of_truth: 'judge_b_pending',
    },
  };

  try {
    const url = buildApiUrl(addDevAuthParams('/api/qa-metrics/persist'));
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      console.error('[qa-metrics] persist failed:', resp.status, body);
    }
  } catch (err) {
    console.error('[qa-metrics] persist network error:', err);
  }

  if (result.runId && test.id) {
    try {
      const enrichUrl = buildApiUrl(addDevAuthParams('/api/gt-enrichment/run'));
      fetch(enrichUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ run_id: result.runId, query_id: test.id }),
      }).catch(err => console.warn('[gt-enrichment] fire error:', err));
    } catch (_) {}
  }
}

function outcomeBadge(outcome: BenchmarkOutcome | null) {
  if (!outcome) return null;
  switch (outcome) {
    case 'PASS':
      return <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px] px-1.5 py-0">PASS</Badge>;
    case 'PARTIAL_SUCCESS':
      return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-[10px] px-1.5 py-0">PARTIAL</Badge>;
    case 'BLOCKED':
      return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0">BLOCKED</Badge>;
    case 'TIMEOUT':
      return <Badge variant="outline" className="text-gray-500 border-gray-300 text-[10px] px-1.5 py-0">TIMEOUT</Badge>;
    case 'FAIL':
      return <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px] px-1.5 py-0">FAIL</Badge>;
  }
}

function layerDot(status: LayerStatus) {
  switch (status) {
    case 'pass': return <span className="inline-block w-2 h-2 rounded-full bg-green-500" title="pass" />;
    case 'fail': return <span className="inline-block w-2 h-2 rounded-full bg-red-500" title="fail" />;
    case 'blocked': return <span className="inline-block w-2 h-2 rounded-full bg-amber-500" title="blocked" />;
    case 'timeout': return <span className="inline-block w-2 h-2 rounded-full bg-gray-400" title="timeout" />;
    case 'unknown': return <span className="inline-block w-2 h-2 rounded-full bg-gray-200" title="unknown" />;
  }
}

const LAYER_ABBREV: Record<LayerName, string> = {
  interpretation: 'Int',
  planning: 'Plan',
  execution: 'Exec',
  discovery: 'Disc',
  delivery: 'Dlvr',
  verification: 'Vrfy',
  tower: 'Twr',
};

function LayerStrip({ layers }: { layers: LayerBreakdown }) {
  return (
    <div className="flex items-center gap-1" title={LAYER_NAMES.map(l => `${LAYER_ABBREV[l]}: ${layers[l]}`).join(' · ')}>
      {LAYER_NAMES.map(l => (
        <div key={l} className="flex flex-col items-center gap-0.5">
          {layerDot(layers[l])}
          <span className="text-[8px] text-gray-400 leading-none">{LAYER_ABBREV[l]}</span>
        </div>
      ))}
    </div>
  );
}

function computeOutcomeCounts(results: TestResult[]) {
  let pass = 0, partial = 0, blocked = 0, timeout = 0, fail = 0;
  for (const r of results) {
    switch (r.benchmarkOutcome) {
      case 'PASS': pass++; break;
      case 'PARTIAL_SUCCESS': partial++; break;
      case 'BLOCKED': blocked++; break;
      case 'TIMEOUT': timeout++; break;
      case 'FAIL': fail++; break;
    }
  }
  return { pass, partial, blocked, timeout, fail };
}

function computeHealthCounts(results: TestResult[]) {
  let healthy = 0, degraded = 0, broken = 0, timeout = 0;
  for (const r of results) {
    switch (r.systemHealth) {
      case 'HEALTHY': healthy++; break;
      case 'DEGRADED': degraded++; break;
      case 'BROKEN': broken++; break;
      case 'TIMEOUT': timeout++; break;
    }
  }
  const total = healthy + degraded + broken + timeout;
  const reliability = total > 0 ? Math.round(((healthy + degraded) / total) * 100) : 0;
  return { healthy, degraded, broken, timeout, reliability };
}

function computeQualityCounts(results: TestResult[]) {
  let pass = 0, partial = 0, fail = 0, unknown = 0;
  for (const r of results) {
    switch (r.agentQuality) {
      case 'PASS': pass++; break;
      case 'NOT_APPLICABLE': pass++; break;
      case 'PARTIAL': partial++; break;
      case 'FAIL': fail++; break;
      case 'UNKNOWN': unknown++; break;
    }
  }
  const judged = pass + partial + fail;
  const successRate = judged > 0 ? Math.round((pass / judged) * 100) : 0;
  return { pass, partial, fail, unknown, successRate };
}

function computeCompletionPct(r: TestResult): number | null {
  if (r.status === 'queued' || r.status === 'running') return null;
  const isNonDelivery = r.expected === 'clarify' || r.expected === 'blocked' || r.expected === 'blocked_or_clarify';
  if (isNonDelivery) {
    if (r.blocked || r.clarified) return 100;
    if (r.systemHealth === 'BROKEN' || r.systemHealth === 'TIMEOUT') return 0;
    return null;
  }
  const total = r.minimumExpectedCount ?? null;
  const delivered = r.deliveredCount ?? 0;
  if (total == null || total === 0) {
    if (r.systemHealth === 'HEALTHY' || r.systemHealth === 'DEGRADED') return 100;
    if (r.systemHealth === 'BROKEN') return 0;
    return null;
  }
  return Math.min(100, Math.round((delivered / total) * 100));
}

function completionPctBadge(r: TestResult) {
  const pct = computeCompletionPct(r);
  if (pct === null) return <span className="text-gray-300 text-xs">—</span>;
  const cls = pct === 100 ? 'bg-green-100 text-green-700 border-green-200'
    : pct >= 60 ? 'bg-amber-100 text-amber-800 border-amber-200'
    : 'bg-red-100 text-red-700 border-red-200';
  return <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-medium border-0 ${cls}`}>{pct}%</Badge>;
}

function systemHealthBadge(outcome: SystemHealthOutcome | null) {
  if (!outcome) return null;
  switch (outcome) {
    case 'HEALTHY':
      return <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px] px-1.5 py-0">Healthy</Badge>;
    case 'DEGRADED':
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] px-1.5 py-0">Degraded</Badge>;
    case 'BROKEN':
      return <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px] px-1.5 py-0">Broken</Badge>;
    case 'TIMEOUT':
      return <Badge variant="outline" className="text-gray-500 border-gray-300 text-[10px] px-1.5 py-0">Timeout</Badge>;
  }
}

function agentQualityBadge(outcome: AgentQualityOutcome | null) {
  if (!outcome) return null;
  switch (outcome) {
    case 'PASS':
      return <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium bg-green-100 text-green-800">Pass</span>;
    case 'NOT_APPLICABLE':
      return <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-400">N/A</span>;
    case 'PARTIAL':
      return <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-800">Partial</span>;
    case 'FAIL':
      return <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium bg-red-100 text-red-700">Fail</span>;
    case 'UNKNOWN':
      return <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500">Unknown</span>;
  }
}

function Scoreboard({ results }: { results: TestResult[] }) {
  const withOutcome = results.filter(r => r.systemHealth !== null || r.agentQuality !== null);
  const qc = computeQualityCounts(withOutcome);
  const total = results.length;
  const completionPcts = results.map(computeCompletionPct).filter((v): v is number => v !== null);
  const avgCompletion = completionPcts.length > 0 ? Math.round(completionPcts.reduce((a, b) => a + b, 0) / completionPcts.length) : null;

  return (
    <div className="grid grid-cols-2 gap-3 mb-6">
      <div className="border rounded-lg p-4">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Results Completeness</div>
        <div className="flex items-baseline gap-2 mb-3">
          {avgCompletion !== null
            ? <span className={`text-3xl font-bold ${avgCompletion === 100 ? 'text-green-700' : avgCompletion >= 60 ? 'text-amber-700' : 'text-red-700'}`}>{avgCompletion}%</span>
            : <span className="text-3xl font-bold text-gray-400">—</span>
          }
          <span className="text-xs text-gray-400">avg completion across {total} runs</span>
        </div>
        <div className="mt-2 text-[9px] text-gray-400">completed leads / leads requested per run</div>
      </div>
      <div className="border rounded-lg p-4">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">System Health</div>
        <div className="flex items-baseline gap-2 mb-3">
          <span className={`text-3xl font-bold ${qc.successRate >= 80 ? 'text-green-700' : qc.successRate >= 50 ? 'text-amber-700' : 'text-red-700'}`}>{qc.successRate}%</span>
          <span className="text-xs text-gray-400">success rate</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-green-700 font-medium">{qc.pass} pass</span>
          <span className="text-yellow-700">{qc.partial} partial</span>
          <span className="text-red-700">{qc.fail} fail</span>
          <span className="text-gray-500">{qc.unknown} unknown</span>
        </div>
        <div className="mt-2 text-[9px] text-gray-400">pass / judged runs (excludes unknown)</div>
      </div>
    </div>
  );
}

interface BenchmarkProgress {
  currentIndex: number;
  totalCount: number;
  currentQuery: string;
  pass: number;
  partial: number;
  blocked: number;
  timeout: number;
  fail: number;
  behaviourPass: number;
  behaviourFail: number;
  behaviourUnknown: number;
  behaviourScore: number;
}

interface BenchmarkSummary {
  total: number;
  durationMs: number;
  system: { healthy: number; degraded: number; broken: number; timeout: number; reliability: number; completionPct: number | null };
  agent: { pass: number; partial: number; fail: number; unknown: number; successRate: number };
  behaviour: { pass: number; fail: number; unknown: number; score: number };
}

function BenchmarkProgressBar({ progress }: { progress: BenchmarkProgress }) {
  const pct = Math.round((progress.currentIndex / progress.totalCount) * 100);
  return (
    <div className="border rounded-lg p-4 mb-4 bg-blue-50 border-blue-200">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
          <span className="text-sm font-semibold text-blue-800">
            Running {progress.currentIndex} of {progress.totalCount}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-green-700">{progress.pass} pass</span>
          <span className="text-yellow-700">{progress.partial} partial</span>
          <span className="text-amber-700">{progress.blocked} blocked</span>
          <span className="text-gray-500">{progress.timeout} timeout</span>
          <span className="text-red-700">{progress.fail} fail</span>
        </div>
      </div>
      <div className="w-full bg-blue-100 rounded-full h-2 mb-2">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-xs text-blue-700 truncate">
        Current: {progress.currentQuery}
      </div>
      <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500 border-t border-blue-100 pt-1">
        <span className="font-medium">Judge B:</span>
        <span className={`font-bold ${progress.behaviourScore >= 80 ? 'text-green-700' : progress.behaviourScore >= 50 ? 'text-amber-700' : 'text-gray-500'}`}>
          {progress.behaviourScore}%
        </span>
        <span className="text-green-700">{progress.behaviourPass} pass</span>
        <span className="text-red-700">{progress.behaviourFail} fail</span>
        <span className="text-gray-400">{progress.behaviourUnknown} pending</span>
      </div>
    </div>
  );
}

function towerResultBadge(result: TowerResult | null) {
  if (!result) return <span className="text-gray-300 text-xs">—</span>;
  const cls = result === 'PASS' ? 'bg-green-100 text-green-800'
    : result === 'FAIL' ? 'bg-red-100 text-red-700'
    : result === 'NOT_APPLICABLE' ? 'bg-gray-100 text-gray-400'
    : 'bg-gray-100 text-gray-500';
  const label = result === 'NOT_APPLICABLE' ? 'N/A' : result;
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>{label}</span>;
}

function behaviourBadge(result: BehaviourResult | null, isPending = false) {
  if (!result) {
    if (isPending) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0 font-medium text-gray-500 bg-gray-100 rounded">
          <Loader2 className="w-2.5 h-2.5 animate-spin" />
          PENDING
        </span>
      );
    }
    return <span className="text-gray-300 text-xs">—</span>;
  }
  const cls = result === 'PASS' ? 'bg-green-100 text-green-800'
    : result === 'HONEST_PARTIAL' ? 'bg-amber-100 text-amber-800'
    : result === 'BATCH_EXHAUSTED' ? 'bg-amber-100 text-amber-800'
    : result === 'CAPABILITY_FAIL' ? 'bg-red-100 text-red-700'
    : result === 'WRONG_DECISION' ? 'bg-red-100 text-red-700'
    : 'bg-gray-100 text-gray-500';
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>{result}</span>;
}

function bjVerdictBadge(verdict: string | null, isPending = false) {
  if (!verdict) {
    if (isPending) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0 font-medium text-gray-500 bg-gray-100 rounded">
          <Loader2 className="w-2.5 h-2.5 animate-spin" />
          …
        </span>
      );
    }
    return <span className="text-gray-300 text-xs">—</span>;
  }
  const colors: Record<string, string> = {
    PASS: 'bg-green-100 text-green-800',
    HONEST_PARTIAL: 'bg-amber-100 text-amber-800',
    BATCH_EXHAUSTED: 'bg-amber-100 text-amber-800',
    CAPABILITY_FAIL: 'bg-red-100 text-red-700',
    WRONG_DECISION: 'bg-red-100 text-red-700',
    NOT_APPLICABLE: 'bg-gray-100 text-gray-400',
    N_A: 'bg-gray-100 text-gray-400',
    UNKNOWN: 'bg-gray-100 text-gray-500',
  };
  const key = verdict.replace(/[^A-Z_]/gi, '').toUpperCase();
  const cls = colors[key] || colors[verdict.toUpperCase()] || 'bg-gray-100 text-gray-500';
  const label = verdict === 'NOT_APPLICABLE' ? 'N/A' : verdict;
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>{label}</span>;
}

function BehaviourDetailBlock({ detail }: { detail: BehaviourLLMDetail }) {
  const isFallback = detail.eval_mode.includes('fallback');
  return (
    <details className="mt-1 group">
      <summary className="cursor-pointer select-none list-none flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600">
        <ChevronRight className="w-3 h-3 group-open:hidden" />
        <ChevronDown className="w-3 h-3 hidden group-open:block" />
        <span className="font-semibold uppercase tracking-wider">Behaviour detail</span>
        {isFallback && <span className="text-amber-500 ml-1">(fallback)</span>}
      </summary>
      <div className="mt-1 text-[10px] bg-gray-50 dark:bg-gray-900 rounded px-2 py-1.5 space-y-1 border border-gray-200 dark:border-gray-700">
        <div><span className="font-semibold text-gray-600">Reason:</span> <span className="text-gray-800 dark:text-gray-200">{detail.behaviour_reason}</span></div>
        <div><span className="font-semibold text-gray-600">Expected:</span> <span className="text-gray-800 dark:text-gray-200">{detail.expected_outcome_check}</span></div>
        <div><span className="font-semibold text-gray-600">Observed:</span> <span className="text-gray-800 dark:text-gray-200">{detail.observed_outcome_check}</span></div>
        <div><span className="font-semibold text-gray-600">Failure type:</span> <span className="text-gray-800 dark:text-gray-200">{detail.key_failure_type}</span></div>
        <div><span className="font-semibold text-gray-600">Confidence:</span> <span className="text-gray-800 dark:text-gray-200">{(detail.confidence * 100).toFixed(0)}%</span></div>
        <div><span className="font-semibold text-gray-600">Eval mode:</span> <span className="text-gray-500">{detail.eval_mode}</span></div>
      </div>
    </details>
  );
}

function BenchmarkSummaryCard({ summary }: { summary: BenchmarkSummary }) {
  const s = summary.system;
  const a = summary.agent;
  const b = summary.behaviour;
  return (
    <div className="border-2 rounded-lg p-5 mb-6 bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-5 h-5 text-purple-600" />
        <h3 className="font-bold text-purple-900">Full Benchmark Pack — {summary.total} Tests</h3>
        <span className="text-xs text-gray-500 ml-auto">
          {(summary.durationMs / 1000).toFixed(0)}s total
        </span>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Results Completeness</span>
            {s.completionPct !== null
              ? <span className={`text-2xl font-bold ml-auto ${s.completionPct === 100 ? 'text-green-700' : s.completionPct >= 60 ? 'text-amber-700' : 'text-red-700'}`}>{s.completionPct}%</span>
              : <span className="text-2xl font-bold ml-auto text-gray-400">—</span>
            }
          </div>
          <div className="text-[10px] text-gray-400">avg completion across {summary.total} tests</div>
        </div>
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">System Health</span>
            <span className={`text-2xl font-bold ml-auto ${a.successRate >= 80 ? 'text-green-700' : a.successRate >= 50 ? 'text-amber-700' : 'text-red-700'}`}>{a.successRate}%</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-green-700 font-medium">{a.pass} pass</span>
            <span className="text-yellow-700">{a.partial} partial</span>
            <span className="text-red-700">{a.fail} fail</span>
            <span className="text-gray-500">{a.unknown} unknown</span>
          </div>
        </div>
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Behaviour Score</span>
            <span className={`text-2xl font-bold ml-auto ${b.score >= 80 ? 'text-green-700' : b.score >= 50 ? 'text-amber-700' : 'text-red-700'}`}>{b.score}%</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-green-700 font-medium">{b.pass} pass</span>
            <span className="text-red-700">{b.fail} fail</span>
            <span className="text-gray-500">{b.unknown} unknown</span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface GroundTruthRecord {
  id: number;
  queryId: string;
  queryText: string;
  queryClass: string;
  trueUniverse: string[];
  matchCriteria: string | null;
  reasoning: string | null;
  notes: string | null;
  createdAt: string;
}

function parseGroundTruthText(raw: string): Partial<{
  queryId: string;
  queryText: string;
  queryClass: string;
  trueUniverse: string[];
  matchCriteria: string;
  reasoning: string;
  notes: string;
}> {
  const get = (patterns: RegExp[]): string | undefined => {
    for (const p of patterns) {
      const m = raw.match(p);
      if (m) return m[1].trim();
    }
    return undefined;
  };

  const queryId = get([
    /\bquery[_ ]?id[:\s*_]*([A-Za-z0-9_-]+)/i,
    /\bid[:\s*_]*([A-Za-z][0-9]+)/i,
  ]);

  const queryText = get([
    /\bquery[_ ]?text[:\s*_]*(.+)/i,
    /\bquery(?![_ ]?id\b)[:\s*_]*(.+)/i,
  ]);

  const queryClass = get([
    /\bquery[_ ]?class[:\s*_]*(.+)/i,
    /\bclass[:\s*_]*(.+)/i,
  ]);

  // Split free-text block into named sections.
  // Section headings are ALL-CAPS lines ending with ":" e.g. "TRUE UNIVERSE:", "MATCH CRITERIA:"
  const sections: Record<string, string> = {};
  const parts = raw.split(/\n(?=[A-Z][A-Z _]+:)/);
  for (const part of parts) {
    const colonIdx = part.indexOf(':');
    if (colonIdx > 0) {
      const heading = part.slice(0, colonIdx).trim().toUpperCase();
      const content = part.slice(colonIdx + 1).trim();
      sections[heading] = content;
    }
  }

  // TRUE UNIVERSE: heading may appear without a colon (e.g. "TRUE UNIVERSE\nMatches:\n- name | ...")
  // Fall back to a direct regex if the section-splitter didn't find it
  const trueUniverse: string[] = [];
  const tuBlock = sections['TRUE UNIVERSE']
    ?? (() => {
      const m = raw.match(/\bTRUE UNIVERSE\b[^\n]*\n([\s\S]+?)(?=\n[A-Z][A-Z ]+:|$)/i);
      return m ? m[1].trim() : '';
    })();
  for (const line of tuBlock.split('\n')) {
    if (!/^\s*[-*•]/.test(line)) continue;
    const name = line.replace(/^\s*[-*•]\s*/, '').split(/\s*\|\s*/)[0].trim();
    if (name) trueUniverse.push(name);
  }

  // MATCH CRITERIA: plain text (may span multiple lines)
  const matchCriteria = sections['MATCH CRITERIA']
    || get([/\bmatch[_ ]?criteria[:\s]*(.+)/i]);

  const reasoning = sections['REASONING']
    || get([/\breasoning[:\s*_]*([\s\S]+?)(?:\n\n|\nnotes|\z)/i]);

  // NOTES: skip EXPECTED BEHAVIOUR JUDGE OUTCOME — it is never in sections we care about
  const notes = sections['NOTES']
    || get([/\bnotes[:\s*_]*([\s\S]+?)$/i]);

  return {
    queryId,
    queryText,
    queryClass,
    trueUniverse: trueUniverse.length ? trueUniverse : undefined,
    matchCriteria,
    reasoning,
    notes,
  };
}

function useGroundTruth() {
  const [records, setRecords] = useState<Map<string, GroundTruthRecord>>(new Map());
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = buildApiUrl(addDevAuthParams('/api/ground-truth'));
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const map = new Map<string, GroundTruthRecord>();
        for (const r of data.records ?? []) map.set(r.queryId, r);
        setRecords(map);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (payload: Omit<GroundTruthRecord, 'id' | 'createdAt'>): Promise<boolean> => {
    try {
      const url = buildApiUrl(addDevAuthParams('/api/ground-truth'));
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.record) {
          setRecords(prev => new Map(prev).set(data.record.queryId, data.record));
        }
        return true;
      }
    } catch {}
    return false;
  }, []);

  return { records, loading, load, save };
}

interface EnrichmentHistoryItem {
  id: string;
  candidate_name: string;
  candidate_location?: string | null;
  constraints_to_verify?: string | null;
  status: string;
  enrichment_result?: string | null;
  enrichment_evidence?: string | null;
  enriched_at?: string | null;
  run_id?: string | null;
}

function enrichmentStatusBadge(status: string) {
  if (status === 'confirmed_positive') {
    return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-100 text-green-700 border border-green-200">CONFIRMED POSITIVE</span>;
  }
  if (status === 'confirmed_false_positive') {
    return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700 border border-red-200">CONFIRMED FALSE POSITIVE</span>;
  }
  return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-gray-100 text-gray-600 border border-gray-200">INCONCLUSIVE</span>;
}

function GroundTruthViewModal({ record, onClose, onDeleted, onEdit }: { record: GroundTruthRecord; onClose: () => void; onDeleted: (queryId: string) => void; onEdit: (record: GroundTruthRecord) => void }) {
  const [deleting, setDeleting] = useState(false);
  const [enrichmentHistory, setEnrichmentHistory] = useState<EnrichmentHistoryItem[]>([]);
  const [enrichmentLoading, setEnrichmentLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setEnrichmentLoading(true);
    const url = buildApiUrl(addDevAuthParams(`/api/gt-enrichment/history/${encodeURIComponent(record.queryId)}`));
    fetch(url, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (!cancelled && data.ok) setEnrichmentHistory(data.items || []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setEnrichmentLoading(false); });
    return () => { cancelled = true; };
  }, [record.queryId]);

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this ground truth record?')) return;
    setDeleting(true);
    try {
      const url = buildApiUrl(addDevAuthParams(`/api/ground-truth/${encodeURIComponent(record.queryId)}`));
      const res = await fetch(url, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        onDeleted(record.queryId);
        onClose();
      }
    } catch {}
    setDeleting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <h2 className="font-bold text-gray-800">Ground Truth — {record.queryId}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 text-sm">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Query ID &amp; Text</div>
            <div className="font-mono text-xs text-purple-700 mb-0.5">{record.queryId}</div>
            <div className="text-gray-800">{record.queryText}</div>
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Query Class</div>
            <Badge variant="outline" className="text-xs">{record.queryClass}</Badge>
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">True Universe</div>
            {record.trueUniverse.length > 0 ? (
              <ul className="space-y-0.5 list-disc list-inside text-gray-700">
                {record.trueUniverse.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            ) : (
              <span className="text-gray-400 italic">No items recorded</span>
            )}
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Match Criteria</div>
            {record.matchCriteria ? (
              <p className="text-gray-800 text-sm">{record.matchCriteria}</p>
            ) : (
              <span className="text-gray-400 italic text-xs">No match criteria recorded</span>
            )}
          </div>

          {record.reasoning && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Reasoning</div>
              <p className="text-gray-700 leading-relaxed">{record.reasoning}</p>
            </div>
          )}

          {record.notes && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Notes</div>
              <p className="text-gray-600 italic">{record.notes}</p>
            </div>
          )}

          <div className="border-t pt-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Enrichment History</div>
            {enrichmentLoading ? (
              <p className="text-xs text-gray-400">Loading…</p>
            ) : enrichmentHistory.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No enrichment events yet. Events are added automatically after each benchmark run when the agent finds candidates not in the GT.</p>
            ) : (
              <ul className="space-y-3">
                {enrichmentHistory.map(item => (
                  <li key={item.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-800">{item.candidate_name}</span>
                      {item.candidate_location && <span className="text-gray-500">({item.candidate_location})</span>}
                      {enrichmentStatusBadge(item.status)}
                      {item.enriched_at && (
                        <span className="text-gray-400 ml-auto">{new Date(item.enriched_at).toLocaleDateString()}</span>
                      )}
                    </div>
                    {item.status === 'confirmed_positive' && (
                      <div className="text-[10px] text-green-700 font-medium">✓ Added to true universe</div>
                    )}
                    {item.enrichment_evidence && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-gray-500 hover:text-gray-700">Evidence / reasoning</summary>
                        <p className="mt-1 text-gray-600 whitespace-pre-wrap leading-relaxed">{item.enrichment_evidence}</p>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between pt-3 border-t">
            <div className="text-[10px] text-gray-300">
              Created: {new Date(record.createdAt).toLocaleString()}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onEdit(record)}
                className="text-xs font-medium text-purple-600 border border-purple-300 hover:bg-purple-50 rounded px-2.5 py-1"
              >
                Edit
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs font-medium text-red-600 border border-red-300 hover:bg-red-50 rounded px-2.5 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting…' : 'Delete Ground Truth Record'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GroundTruthAddModal({
  queryId,
  queryText,
  queryClass,
  initialFields,
  onClose,
  onSaved,
}: {
  queryId: string;
  queryText: string;
  queryClass: string;
  initialFields?: {
    queryId: string;
    queryText: string;
    queryClass: string;
    trueUniverse: string;
    matchCriteria: string;
    reasoning: string;
    notes: string;
  };
  onClose: () => void;
  onSaved: (record: GroundTruthRecord) => void;
}) {
  const [pasteText, setPasteText] = useState('');
  const [fields, setFields] = useState<{
    queryId: string;
    queryText: string;
    queryClass: string;
    trueUniverse: string;
    matchCriteria: string;
    reasoning: string;
    notes: string;
  }>(initialFields ?? {
    queryId,
    queryText,
    queryClass,
    trueUniverse: '',
    matchCriteria: '',
    reasoning: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'paste' | 'manual'>(initialFields ? 'manual' : 'paste');

  const applyPaste = () => {
    const parsed = parseGroundTruthText(pasteText);
    setFields(prev => ({
      ...prev,
      queryId: parsed.queryId ?? prev.queryId,
      queryText: parsed.queryText ?? prev.queryText,
      queryClass: parsed.queryClass ?? prev.queryClass,
      trueUniverse: parsed.trueUniverse?.join('\n') ?? prev.trueUniverse,
      matchCriteria: parsed.matchCriteria ?? prev.matchCriteria,
      reasoning: parsed.reasoning ?? prev.reasoning,
      notes: parsed.notes ?? prev.notes,
    }));
    setTab('manual');
  };

  const handleSave = async () => {
    if (!fields.queryId.trim() || !fields.queryText.trim() || !fields.queryClass.trim()) {
      setError('Query ID, query text and query class are required.');
      return;
    }
    setSaving(true);
    setError(null);

    const parseLines = (s: string) => s.split('\n').map(l => l.replace(/^[-*•\d.)\s]+/, '').trim()).filter(Boolean);

    try {
      const url = buildApiUrl(addDevAuthParams('/api/ground-truth'));
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          queryId: fields.queryId.trim(),
          queryText: fields.queryText.trim(),
          queryClass: fields.queryClass.trim(),
          trueUniverse: parseLines(fields.trueUniverse),
          matchCriteria: fields.matchCriteria.trim() || null,
          reasoning: fields.reasoning.trim() || null,
          notes: fields.notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (res.ok && data.record) {
        onSaved(data.record);
        onClose();
      } else {
        setError(data.error || 'Failed to save');
      }
    } catch {
      setError('Network error');
    }
    setSaving(false);
  };

  const inputCls = "w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400";
  const labelCls = "block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-purple-600" />
            <h2 className="font-bold text-gray-800">Add Ground Truth — {queryId}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 text-sm">
          <div className="flex gap-2 border-b pb-3">
            <button
              onClick={() => setTab('paste')}
              className={`px-3 py-1 rounded text-xs font-medium ${tab === 'paste' ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Paste text
            </button>
            <button
              onClick={() => setTab('manual')}
              className={`px-3 py-1 rounded text-xs font-medium ${tab === 'manual' ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Fill fields
            </button>
          </div>

          {tab === 'paste' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">Paste a ground truth record in plain text (e.g. from Claude). The fields below will be auto-populated.</p>
              <textarea
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder="Paste ground truth text here…"
                rows={12}
                className={inputCls + " font-mono text-xs"}
              />
              <Button onClick={applyPaste} disabled={!pasteText.trim()} className="bg-purple-600 hover:bg-purple-700 w-full">
                Parse &amp; fill fields →
              </Button>
            </div>
          )}

          {tab === 'manual' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Query ID</label>
                  <input className={inputCls} value={fields.queryId} onChange={e => setFields(p => ({ ...p, queryId: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Query Class</label>
                  <input className={inputCls} value={fields.queryClass} onChange={e => setFields(p => ({ ...p, queryClass: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Query Text</label>
                <input className={inputCls} value={fields.queryText} onChange={e => setFields(p => ({ ...p, queryText: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>True Universe (one per line)</label>
                <textarea className={inputCls} rows={4} value={fields.trueUniverse} onChange={e => setFields(p => ({ ...p, trueUniverse: e.target.value }))} placeholder="- The Swan, Arundel&#10;- Swan Hotel" />
              </div>
              <div>
                <label className={labelCls}>Match Criteria</label>
                <textarea className={inputCls} rows={3} value={fields.matchCriteria} onChange={e => setFields(p => ({ ...p, matchCriteria: e.target.value }))} placeholder="e.g. Name must contain Swan AND location must be in Arundel BN18" />
              </div>
              <div>
                <label className={labelCls}>Reasoning</label>
                <textarea className={inputCls} rows={3} value={fields.reasoning} onChange={e => setFields(p => ({ ...p, reasoning: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Notes</label>
                <textarea className={inputCls} rows={2} value={fields.notes} onChange={e => setFields(p => ({ ...p, notes: e.target.value }))} />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex gap-2 pt-2">
                <Button onClick={handleSave} disabled={saving} className="bg-purple-600 hover:bg-purple-700 flex-1">
                  {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : 'Save ground truth'}
                </Button>
                <Button variant="outline" onClick={onClose}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GroundTruthIndicator({
  queryId,
  queryText,
  queryClass,
  record,
  onSaved,
  onDeleted,
}: {
  queryId: string;
  queryText: string;
  queryClass: string;
  record: GroundTruthRecord | undefined;
  onSaved: (r: GroundTruthRecord) => void;
  onDeleted: (queryId: string) => void;
}) {
  const [showView, setShowView] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editingRecord, setEditingRecord] = useState<GroundTruthRecord | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  const buildPromptText = () => {
    const today = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
    return `You are establishing ground truth for the Wyshbone AI lead finder evaluation suite. Your job is to independently find the genuine answer to this query by searching and visiting websites yourself.

## The Query
${queryText}

## Your Task — complete each step once only, do not repeat searches

**Step 1 — Establish the true universe (max 3-4 searches)**
Search Google independently and visit actual business websites to find all genuine matches for this query. Do not stop early — check the top results thoroughly. For each genuine match record:
- Business name
- Website URL
- The specific evidence confirming it matches (exact quote, name confirmation, etc.)
- Whether the website was accessible or bot-blocked

Stop after 4 searches maximum. If results are sparse after 2 searches, that is genuine scarcity — record it.

**Step 2 — Produce the ground truth record in exactly this format:**

GROUND TRUTH RECORD
Query ID: ${queryId}
Query: ${queryText}
Query Class: [simple_discovery / website_evidence / name_match / relationship / clarify_required]
Date: ${today}

TRUE UNIVERSE
Matches:
- [Business name] | [URL] | [Evidence confirming match] | [accessible / bot_blocked]

MATCH CRITERIA
[Describe the rules for what counts as a valid match for this specific query]

NOTES
[Scarcity, bot-blocking, edge cases, ambiguity]

## Important Notes
- Be rigorous about what counts as a match — apply the query constraints strictly.
- Bot-blocked sites count as accessible matches if the business genuinely meets the criteria.`;
  };

  const gtPromptButton = (
    <button
      onClick={() => setShowPrompt(true)}
      title="Open GT research prompt"
      className="inline-flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-blue-600 shrink-0 border border-gray-300 hover:border-blue-400 rounded px-1 py-0.5 leading-none"
    >
      GT Prompt
    </button>
  );

  const handleEdit = (r: GroundTruthRecord) => {
    setShowView(false);
    setEditingRecord(r);
  };

  const editInitialFields = editingRecord ? {
    queryId: editingRecord.queryId,
    queryText: editingRecord.queryText,
    queryClass: editingRecord.queryClass,
    trueUniverse: editingRecord.trueUniverse.join('\n'),
    matchCriteria: editingRecord.matchCriteria ?? '',
    reasoning: editingRecord.reasoning ?? '',
    notes: editingRecord.notes ?? '',
  } : undefined;

  if (record) {
    return (
      <>
        <button
          onClick={() => setShowView(true)}
          title="View ground truth record"
          className="inline-flex items-center gap-1 text-green-600 hover:text-green-700 shrink-0"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
        </button>
        {gtPromptButton}
        {showView && (
          <GroundTruthViewModal
            record={record}
            onClose={() => setShowView(false)}
            onDeleted={onDeleted}
            onEdit={handleEdit}
          />
        )}
        {editingRecord && (
          <GroundTruthAddModal
            queryId={editingRecord.queryId}
            queryText={editingRecord.queryText}
            queryClass={editingRecord.queryClass}
            initialFields={editInitialFields}
            onClose={() => setEditingRecord(null)}
            onSaved={r => { onSaved(r); setEditingRecord(null); }}
          />
        )}
        {showPrompt && (
          <GtPromptModal
            queryId={queryId}
            promptText={buildPromptText()}
            onClose={() => setShowPrompt(false)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <span title="No ground truth record" className="inline-flex items-center text-gray-300 shrink-0">
        <Circle className="w-3.5 h-3.5" />
      </span>
      <button
        onClick={() => setShowAdd(true)}
        title="Add ground truth record"
        className="inline-flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-purple-600 shrink-0 border border-dashed border-gray-300 hover:border-purple-400 rounded px-1 py-0.5 leading-none"
      >
        <Plus className="w-2.5 h-2.5" />Add GT
      </button>
      {gtPromptButton}
      {showAdd && (
        <GroundTruthAddModal
          queryId={queryId}
          queryText={queryText}
          queryClass={queryClass}
          onClose={() => setShowAdd(false)}
          onSaved={r => { onSaved(r); setShowAdd(false); }}
        />
      )}
      {showPrompt && (
        <GtPromptModal
          queryId={queryId}
          promptText={buildPromptText()}
          onClose={() => setShowPrompt(false)}
        />
      )}
    </>
  );
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let col = '';
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { col += '"'; i += 2; continue; }
        inQuotes = false;
      } else {
        col += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(col); col = '';
      } else if (ch === '\r' && text[i + 1] === '\n') {
        row.push(col); col = ''; rows.push(row); row = []; i++;
      } else if (ch === '\n') {
        row.push(col); col = ''; rows.push(row); row = [];
      } else {
        col += ch;
      }
    }
    i++;
  }
  if (col || row.length) { row.push(col); rows.push(row); }
  return rows;
}

type GtImportRow = {
  queryId: string;
  queryText: string;
  queryClass: string;
  trueUniverse: string[];
  matchCriteria: string;
  reasoning: string;
  notes: string;
  matchCount: number;
  status: 'ready' | 'skipped' | 'error';
  errorMsg?: string;
};

function ImportGtModal({ onClose, onImported, existingRecords }: { onClose: () => void; onImported: (records: GroundTruthRecord[]) => void; existingRecords: Map<string, GroundTruthRecord> }) {
  const [rows, setRows] = useState<GtImportRow[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [phase, setPhase] = useState<'idle' | 'preview' | 'importing' | 'done'>('idle');
  const [importMode, setImportMode] = useState<'missing-only' | 'replace-all'>('missing-only');
  const [showConfirm, setShowConfirm] = useState(false);
  const [progress, setProgress] = useState({ imported: 0, skipped: 0, errors: 0, current: 0, total: 0 });
  const [importedRecords, setImportedRecords] = useState<GroundTruthRecord[]>([]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const allRows = parseCsv(text);
      if (allRows.length < 2) return;
      const header = allRows[0].map(h => h.trim());
      const colIdx = {
        queryId: header.findIndex(h => /query.?id/i.test(h)),
        queryClass: header.findIndex(h => /query.?class/i.test(h)),
        query: header.findIndex(h => /^query$/i.test(h)),
        gtResult: header.findIndex(h => /ground.?truth.?result/i.test(h)),
      };
      const parsed: GtImportRow[] = [];
      for (let i = 1; i < allRows.length; i++) {
        const r = allRows[i];
        if (r.every(c => !c.trim())) continue;
        const csvQueryId = r[colIdx.queryId >= 0 ? colIdx.queryId : 0]?.trim() ?? '';
        const csvQuery = r[colIdx.query >= 0 ? colIdx.query : 2]?.trim() ?? '';
        const csvClass = r[colIdx.queryClass >= 0 ? colIdx.queryClass : 1]?.trim() ?? '';
        const gtBlock = r[colIdx.gtResult >= 0 ? colIdx.gtResult : 4]?.trim() ?? '';
        const parsed_gt = gtBlock ? parseGroundTruthText(gtBlock) : {};
        const csvTrueUniverse = parsed_gt.trueUniverse ?? [];
        const csvMatchCriteria = parsed_gt.matchCriteria ?? '';
        const csvNotes = parsed_gt.notes ?? '';
        const csvReasoning = parsed_gt.reasoning ?? '';
        if (!csvQueryId) {
          parsed.push({ queryId: '', queryText: csvQuery, queryClass: csvClass, trueUniverse: csvTrueUniverse, matchCriteria: csvMatchCriteria, reasoning: csvReasoning, notes: csvNotes, matchCount: 0, status: 'error', errorMsg: 'Could not extract Query ID' });
          continue;
        }
        parsed.push({
          queryId: csvQueryId, queryText: csvQuery, queryClass: csvClass,
          trueUniverse: csvTrueUniverse,
          matchCriteria: csvMatchCriteria,
          reasoning: csvReasoning,
          notes: csvNotes,
          matchCount: 0,
          status: 'ready',
        });
      }
      setRows(parsed);
      setPhase('preview');
    };
    reader.readAsText(file);
  };

  const getImportableRows = (mode: 'missing-only' | 'replace-all') =>
    (rows ?? []).filter(r => {
      if (r.status !== 'ready') return false;
      if (mode === 'missing-only' && existingRecords.has(r.queryId)) return false;
      return true;
    });

  const doImport = async () => {
    if (!rows) return;
    const readyRows = getImportableRows(importMode);
    const existSkipped = importMode === 'missing-only' ? rows.filter(r => r.status === 'ready' && existingRecords.has(r.queryId)).length : 0;
    const initialSkipped = rows.filter(r => r.status === 'skipped').length + existSkipped;
    const initialErrors = rows.filter(r => r.status === 'error').length;
    setPhase('importing');
    setProgress({ imported: 0, skipped: initialSkipped, errors: initialErrors, current: 0, total: readyRows.length });
    const newRecords: GroundTruthRecord[] = [];
    let imported = 0;
    let errors = initialErrors;
    for (let i = 0; i < readyRows.length; i++) {
      const row = readyRows[i];
      setProgress(p => ({ ...p, current: i + 1 }));
      try {
        const url = buildApiUrl(addDevAuthParams('/api/ground-truth'));
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            queryId: row.queryId,
            queryText: row.queryText,
            queryClass: row.queryClass,
            trueUniverse: row.trueUniverse,
            matchCriteria: row.matchCriteria || null,
            reasoning: row.reasoning || null,
            notes: row.notes || null,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.record) newRecords.push(data.record);
          imported++;
        } else { errors++; }
      } catch { errors++; }
    }
    setProgress(p => ({ ...p, imported, errors }));
    setImportedRecords(newRecords);
    setPhase('done');
  };

  const handleImportClick = () => {
    if (importMode === 'replace-all') { setShowConfirm(true); return; }
    doImport();
  };

  const thCls = 'text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-2 py-1.5 border-b';
  const tdCls = 'px-2 py-1.5 text-xs text-gray-700 align-top';

  const importableCount = getImportableRows(importMode).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 flex flex-col max-h-[88vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
          <h2 className="text-sm font-semibold text-gray-800">Import Ground Truth Records from CSV</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {phase === 'idle' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Select a CSV file with columns: <span className="font-mono text-xs bg-gray-100 px-1 rounded">Query ID, Query Class, Query, Research Prompt, Ground Truth Result</span></p>
              <p className="text-xs text-gray-400">Ground Truth Result — free-text block with TRUE UNIVERSE, MATCH CRITERIA, and NOTES sections.</p>
              <input
                type="file"
                accept=".csv"
                onChange={handleFile}
                className="text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-gray-300 file:text-xs file:font-medium file:bg-white file:text-gray-700 hover:file:bg-gray-50"
              />
            </div>
          )}

          {(phase === 'preview' || phase === 'importing') && rows && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">{fileName} — {rows.length} rows parsed: <span className="text-green-600 font-medium">{rows.filter(r => r.status === 'ready').length} parsed OK</span>, <span className="text-amber-600 font-medium">{rows.filter(r => r.status === 'skipped').length} no GT data</span>, <span className="text-red-600 font-medium">{rows.filter(r => r.status === 'error').length} errors</span></p>

              {phase === 'preview' && (
                <div className="flex items-center gap-5 py-2 px-3 bg-gray-50 border rounded">
                  <span className="text-xs font-medium text-gray-600 shrink-0">Import mode:</span>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      value="missing-only"
                      checked={importMode === 'missing-only'}
                      onChange={() => setImportMode('missing-only')}
                      className="accent-blue-600"
                    />
                    <span className="text-xs text-gray-700">Import missing only</span>
                    <span className="text-[10px] text-gray-400 ml-0.5">— skip items that already have a GT record</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      value="replace-all"
                      checked={importMode === 'replace-all'}
                      onChange={() => setImportMode('replace-all')}
                      className="accent-blue-600"
                    />
                    <span className="text-xs text-gray-700">Replace all</span>
                    <span className="text-[10px] text-gray-400 ml-0.5">— overwrite existing records</span>
                  </label>
                </div>
              )}

              <div className="border rounded overflow-auto max-h-[320px]">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className={thCls}>Query ID</th>
                      <th className={thCls}>Query</th>
                      <th className={thCls}>Class</th>
                      <th className={thCls}>True Universe</th>
                      <th className={thCls}>Match Criteria</th>
                      <th className={thCls}>Notes</th>
                      <th className={thCls}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => {
                      const alreadyExists = row.status === 'ready' && existingRecords.has(row.queryId);
                      const willSkip = alreadyExists && importMode === 'missing-only';
                      const willOverwrite = alreadyExists && importMode === 'replace-all';
                      const rowBg = row.status === 'error'
                        ? 'bg-red-50'
                        : row.status === 'skipped'
                        ? 'bg-amber-50/60'
                        : willSkip
                        ? 'bg-gray-50'
                        : willOverwrite
                        ? 'bg-orange-50'
                        : '';
                      return (
                        <tr key={idx} className={`border-b last:border-0 ${rowBg}`}>
                          <td className={tdCls + ' font-mono'}>{row.queryId || '—'}</td>
                          <td className={tdCls + ' max-w-[200px]'}>
                            <span className="line-clamp-2">{row.queryText || '—'}</span>
                          </td>
                          <td className={tdCls}>{row.queryClass || '—'}</td>
                          <td className={tdCls + ' max-w-[160px]'}>
                            {row.trueUniverse.length > 0
                              ? <span className="line-clamp-2 text-[11px]">{row.trueUniverse.join(', ')}</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className={tdCls + ' max-w-[160px]'}>
                            {row.matchCriteria
                              ? <span className="line-clamp-2 text-[11px]">{row.matchCriteria}</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className={tdCls + ' max-w-[140px]'}><span className="line-clamp-2">{row.notes || '—'}</span></td>
                          <td className={tdCls}>
                            {willSkip && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500">skipped (already exists)</span>}
                            {willOverwrite && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700">will overwrite</span>}
                            {!alreadyExists && row.status === 'ready' && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">ready</span>}
                            {row.status === 'skipped' && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">no GT data</span>}
                            {row.status === 'error' && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700" title={row.errorMsg}>error</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {phase === 'importing' && (
                <div className="text-xs text-gray-600">
                  Importing {progress.current} / {progress.total}…
                  <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {phase === 'done' && (
            <div className="space-y-2 text-sm">
              <p className="font-semibold text-gray-800">Import complete</p>
              <ul className="text-gray-600 space-y-1">
                <li><span className="text-green-600 font-medium">{progress.imported} imported</span></li>
                <li><span className="text-amber-600 font-medium">{progress.skipped} skipped</span></li>
                <li><span className="text-red-600 font-medium">{progress.errors} errors</span></li>
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t shrink-0">
          {phase === 'done' ? (
            <button
              onClick={() => onImported(importedRecords)}
              className="text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded px-4 py-1.5"
            >
              Done
            </button>
          ) : (
            <>
              <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded border border-gray-200 hover:border-gray-300">
                Cancel
              </button>
              {phase === 'preview' && importableCount > 0 && (
                <button
                  onClick={handleImportClick}
                  className="text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded px-4 py-1.5"
                >
                  Import {importableCount} record{importableCount !== 1 ? 's' : ''}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50" onClick={() => setShowConfirm(false)}>
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm mx-4 p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-semibold text-gray-800">Warning: Replace existing records?</p>
            <p className="text-xs text-gray-600">This will overwrite existing ground truth records. This cannot be undone. Are you sure?</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded border border-gray-200 hover:border-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowConfirm(false); doImport(); }}
                className="text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded px-4 py-1.5"
              >
                Yes, replace all
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GtPromptModal({ queryId, promptText, onClose }: { queryId: string; promptText: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const tryCopy = () => {
      if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(promptText);
      }
      const ta = document.createElement('textarea');
      ta.value = promptText;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return Promise.resolve();
    };
    tryCopy().then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
          <h2 className="text-sm font-semibold text-gray-800">Ground Truth Research Prompt — {queryId}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>
        <div className="flex-1 overflow-hidden px-5 py-4">
          <textarea
            readOnly
            value={promptText}
            className="w-full h-full min-h-[400px] text-xs font-mono text-gray-700 bg-gray-50 border border-gray-200 rounded p-3 resize-none focus:outline-none"
          />
        </div>
        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t shrink-0">
          <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded border border-gray-200 hover:border-gray-300">
            Close
          </button>
          <button
            onClick={handleCopy}
            className="text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded px-3 py-1.5 min-w-[130px] text-center"
          >
            {copied ? 'Copied!' : 'Copy to clipboard'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AdHocRunner() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<{
    towerVerdict: string | null;
    deliveredCount: number;
    runId: string | null;
    durationMs: number;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleRun = async () => {
    if (!query.trim() || status === 'running') return;
    const user = getUser();
    if (!user) {
      setErrorMsg('No user found in localStorage. Load the main app first.');
      setStatus('error');
      return;
    }
    setStatus('running');
    setResult(null);
    setErrorMsg(null);
    const controller = new AbortController();
    abortRef.current = controller;
    const start = Date.now();
    try {
      const conversationId = localStorage.getItem('currentConversationId') || `adhoc-${crypto.randomUUID()}`;
      const clientRequestId = crypto.randomUUID();
      const { runId } = await submitQuery(query.trim(), user, conversationId, clientRequestId, controller.signal);
      const pollResult = await pollUntilTerminal(clientRequestId, runId, PER_TEST_TIMEOUT_MS, controller.signal);
      const effectiveRunId = pollResult.finalRunId || runId;
      let towerVerdict: string | null = null;
      let deliveredCount = 0;
      let detailsBlocked = false;
      let detailsClarified = false;
      if (effectiveRunId) {
        try {
          const d = await fetchRunDetails(effectiveRunId);
          towerVerdict = d.towerVerdict;
          deliveredCount = d.deliveredCount;
          detailsBlocked = d.blocked;
          detailsClarified = d.clarified;
        } catch {}
      }
      setResult({ towerVerdict, deliveredCount, runId: effectiveRunId, durationMs: Date.now() - start });
      setStatus('done');
      if (effectiveRunId) {
        const ps = pollResult.status;
        const sysStatus = ps === 'completed' ? 'HEALTHY' : (ps === 'stopped' || ps === 'timed_out') ? 'TIMEOUT' : 'BROKEN';
        const towerRes = towerVerdictToResult(towerVerdict);
        const agentStatus = detailsBlocked || detailsClarified ? 'PASS' : deliveredCount > 0 ? 'PASS' : towerRes === 'PASS' ? 'PASS' : 'UNKNOWN';
        const persistUrl = buildApiUrl(addDevAuthParams('/api/qa-metrics/persist'));
        fetch(persistUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            runId: effectiveRunId,
            timestamp: Date.now(),
            query: query.trim(),
            source: 'heuristic',
            systemStatus: sysStatus,
            agentStatus,
            towerResult: towerRes,
            behaviourResult: 'UNKNOWN',
            metadata: { adhoc: true, deliveredCount, durationMs: Date.now() - start, blocked: detailsBlocked, clarified: detailsClarified },
          }),
        }).catch(() => {});
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        setStatus('idle');
      } else {
        setErrorMsg(e?.message || 'Unknown error');
        setStatus('error');
      }
    }
  };

  return (
    <div className="border rounded-lg p-4 mb-6 bg-white shadow-sm">
      <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <Play className="w-4 h-4 text-purple-500" />
        Ad-hoc Test Runner
      </h2>
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleRun(); }}
          placeholder="Enter a test query..."
          disabled={status === 'running'}
          className="flex-1 text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400 disabled:bg-gray-50 disabled:text-gray-400"
        />
        <Button
          onClick={status === 'running' ? () => { abortRef.current?.abort(); setStatus('idle'); } : handleRun}
          disabled={status !== 'running' && !query.trim()}
          className={status === 'running' ? 'bg-red-600 hover:bg-red-700 shrink-0' : 'bg-purple-600 hover:bg-purple-700 shrink-0'}
        >
          {status === 'running'
            ? <><Square className="w-4 h-4 mr-1.5" />Stop</>
            : <><Play className="w-4 h-4 mr-1.5" />Run Test</>}
        </Button>
      </div>

      {status === 'running' && (
        <div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
          Running query…
        </div>
      )}

      {status === 'error' && errorMsg && (
        <div className="mt-3 text-sm text-red-600 flex items-center gap-1.5">
          <XCircle className="w-4 h-4 shrink-0" />{errorMsg}
        </div>
      )}

      {status === 'done' && result && (
        <div className="mt-3 flex items-center gap-5 text-sm flex-wrap border-t pt-3">
          <span className="flex items-center gap-1.5">
            <span className="text-gray-500">Tower:</span>
            <span className={
              result.towerVerdict === 'PASS' ? 'font-semibold text-green-700' :
              result.towerVerdict === 'FAIL' ? 'font-semibold text-red-700' :
              'text-gray-400'
            }>{result.towerVerdict ?? 'N/A'}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-gray-500">Delivered:</span>
            <span className="font-semibold">{result.deliveredCount}</span>
          </span>
          <span className="text-gray-400">{(result.durationMs / 1000).toFixed(1)}s</span>
          {result.runId && (
            <a
              href={`/dev/afr?run_id=${result.runId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-purple-600 hover:text-purple-800 font-medium"
            >
              <ExternalLink className="w-3.5 h-3.5" />View AFR
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export default function QaTestRunnerPage() {
  const [selectedSuiteId, setSelectedSuiteId] = useState(SUITES[0].id);
  const [suiteStatus, setSuiteStatus] = useState<SuiteStatus>('not_started');
  const [results, setResults] = useState<TestResult[]>([]);
  const [history, setHistory] = useState<SuiteRunHistory[]>(() => loadHistory());
  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);
  const [benchmarkProgress, setBenchmarkProgress] = useState<BenchmarkProgress | null>(null);
  const [benchmarkSummary, setBenchmarkSummary] = useState<BenchmarkSummary | null>(null);
  const isBenchmarkRunning = suiteStatus === 'running' && selectedSuiteId === 'full-benchmark';

  const [gtRecords, setGtRecords] = useState<Map<string, GroundTruthRecord>>(new Map());
  const [showImportGt, setShowImportGt] = useState(false);

  const loadGtRecords = useCallback(() => {
    fetch(buildApiUrl(addDevAuthParams('/api/ground-truth')), { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const map = new Map<string, GroundTruthRecord>();
        for (const r of data.records ?? []) map.set(r.queryId, r);
        setGtRecords(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => { loadGtRecords(); }, [loadGtRecords]);

  const handleGtSaved = useCallback((record: GroundTruthRecord) => {
    setGtRecords(prev => new Map(prev).set(record.queryId, record));
  }, []);

  const handleGtDeleted = useCallback((queryId: string) => {
    setGtRecords(prev => {
      const next = new Map(prev);
      next.delete(queryId);
      return next;
    });
  }, []);

  const selectedSuite = useMemo(() => SUITES.find(s => s.id === selectedSuiteId)!, [selectedSuiteId]);

  const [selectedTestIds, setSelectedTestIds] = useState<Set<string>>(
    () => new Set(SUITES[0].tests.map(t => t.id))
  );

  const selectedTests = useMemo(
    () => selectedSuite.tests.filter(t => selectedTestIds.has(t.id)),
    [selectedSuite, selectedTestIds]
  );
  const allSelected = selectedTests.length === selectedSuite.tests.length;
  const noneSelected = selectedTests.length === 0;
  const runBtnLabel = allSelected
    ? `Run Selected Suite (${selectedTests.length})`
    : selectedTests.length === 1
      ? 'Run 1 Test'
      : `Run ${selectedTests.length} Tests`;

  const initResults = useCallback((suite: TestSuite): TestResult[] => {
    return suite.tests.map(t => ({
      id: t.id,
      query: t.query,
      expected: t.expected,
      queryClass: t.queryClass,
      expectedMode: t.expectedMode,
      expectedOutcome: buildExpectedOutcome(t),
      minimumExpectedCount: t.minimumExpectedCount,
      notes: t.notes,
      status: 'queued',
      runId: null,
      clientRequestId: null,
      error: null,
      durationMs: null,
      blocked: false,
      clarified: false,
      autoClarified: false,
      clarifyResponseValue: null,
      clarifyContinueSuccess: false,
      postClarifyTimeout: false,
      towerVerdict: null,
      resultSummary: null,
      deliveredCount: 0,
      judgement: null,
      layers: emptyLayerBreakdown(),
      benchmarkOutcome: null,
      systemHealth: null,
      agentQuality: null,
      towerResult: null,
      behaviourResult: null,
      behaviourLLMDetail: null,
      behaviourSourceOfTruth: 'unknown',
      behaviourFallbackUsed: false,
      fallbackReason: null,
      missionIntentVerdict: null,
      groundTruthVerdict: null,
    }));
  }, []);

  const updateResult = useCallback((idx: number, patch: Partial<TestResult>) => {
    setResults(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  }, []);

  const computeProgressCounts = useCallback((finalResults: TestResult[]) => {
    return computeOutcomeCounts(finalResults);
  }, []);

  const runSuite = useCallback(async (suiteIdOverride?: string, testsOverride?: TestDefinition[]) => {
    const user = getUser();
    if (!user) {
      alert('No user found in localStorage. Please load the main app first.');
      return;
    }

    const targetSuiteId = suiteIdOverride || selectedSuiteId;
    const suite = SUITES.find(s => s.id === targetSuiteId)!;

    if (suiteIdOverride) {
      setSelectedSuiteId(targetSuiteId);
    }

    const testsToRun: TestDefinition[] = testsOverride ?? suite.tests;
    const initialResults = initResults({ ...suite, tests: testsToRun });
    const isBenchmark = targetSuiteId === 'full-benchmark';

    runningRef.current = true;
    setSuiteStatus('running');
    localStorage.setItem('qa_benchmark_running', 'true');
    setResults(initialResults);
    setBenchmarkSummary(null);

    if (isBenchmark) {
      setBenchmarkProgress({
        currentIndex: 0,
        totalCount: testsToRun.length,
        currentQuery: testsToRun[0]?.query ?? '',
        pass: 0, partial: 0, blocked: 0, timeout: 0, fail: 0,
        behaviourPass: 0, behaviourFail: 0, behaviourUnknown: 0, behaviourScore: 0,
      });
    } else {
      setBenchmarkProgress(null);
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const suiteStart = Date.now();
    const qaConversationId = `qa-${suite.id}-${crypto.randomUUID()}`;
    const finalResults = [...initialResults];

    const pollJudgeBInBackground = (index: number, runId: string): void => {
      void (async () => {
        const pollDeadline = Date.now() + 30_000;
        while (Date.now() < pollDeadline) {
          await new Promise<void>(resolve => setTimeout(resolve, 3_000));
          try {
            const resp = await fetch(
              buildApiUrl(addDevAuthParams(`/api/afr/behaviour-judge?run_id=${encodeURIComponent(runId)}`)),
              { credentials: 'include' }
            );
            if (resp.ok) {
              const data = await resp.json();
              if (data && (data.outcome || data.mission_intent_assessment || data.ground_truth_assessment)) {
                const outcome = data.outcome ? data.outcome.toUpperCase() as BehaviourResult : null;
                const miVerdict: string | null = (data.mission_intent_assessment as any)?.verdict ?? null;
                const gtVerdict: string | null = (data.ground_truth_assessment as any)?.verdict ?? null;
                finalResults[index] = { ...finalResults[index], behaviourResult: outcome, missionIntentVerdict: miVerdict, groundTruthVerdict: gtVerdict };
                updateResult(index, { behaviourResult: outcome, missionIntentVerdict: miVerdict, groundTruthVerdict: gtVerdict });
                if (isBenchmark) {
                  const bPass = finalResults.filter(r => r.behaviourResult === 'PASS').length;
                  const bFail = finalResults.filter(r => r.behaviourResult !== null && r.behaviourResult !== 'PASS').length;
                  const bUnknown = finalResults.filter(r => r.behaviourResult === null).length;
                  const bScore = finalResults.length > 0 ? Math.round((bPass / finalResults.length) * 100) : 0;
                  setBenchmarkProgress(prev => prev ? {
                    ...prev,
                    behaviourPass: bPass,
                    behaviourFail: bFail,
                    behaviourUnknown: bUnknown,
                    behaviourScore: bScore,
                  } : null);
                }
                return;
              }
            }
          } catch { /* continue polling */ }
        }
      })();
    };

    for (let i = 0; i < testsToRun.length; i++) {
      if (controller.signal.aborted) {
        for (let j = i; j < testsToRun.length; j++) {
          const skipped: Partial<TestResult> = { status: 'failed', error: 'Stopped by user', judgement: 'skip', benchmarkOutcome: 'TIMEOUT' as BenchmarkOutcome, systemHealth: 'TIMEOUT' as SystemHealthOutcome, agentQuality: 'UNKNOWN' as AgentQualityOutcome, towerResult: 'UNKNOWN' as TowerResult, behaviourResult: 'UNKNOWN' as BehaviourResult, behaviourLLMDetail: null, behaviourSourceOfTruth: 'unknown', behaviourFallbackUsed: false, fallbackReason: null };
          finalResults[j] = { ...finalResults[j], ...skipped };
          updateResult(j, skipped);
        }
        break;
      }

      const test = testsToRun[i];
      const clientRequestId = crypto.randomUUID();
      const testStart = Date.now();

      updateResult(i, { status: 'running', clientRequestId });
      finalResults[i] = { ...finalResults[i], status: 'running', clientRequestId };

      if (isBenchmark) {
        const counts = computeProgressCounts(finalResults);
        const bPass = finalResults.filter(r => r.behaviourResult === 'PASS').length;
        const bFail = finalResults.filter(r => r.behaviourResult !== null && r.behaviourResult !== 'PASS').length;
        const bUnknown = finalResults.filter(r => r.behaviourResult === null).length;
        const bScoreCalc = finalResults.length > 0 ? Math.round((bPass / finalResults.length) * 100) : 0;
        setBenchmarkProgress({
          currentIndex: i + 1,
          totalCount: testsToRun.length,
          currentQuery: test.query,
          ...counts,
          behaviourPass: bPass,
          behaviourFail: bFail,
          behaviourUnknown: bUnknown,
          behaviourScore: bScoreCalc,
        });
      }

      try {
        const { runId } = await submitQuery(test.query, user, qaConversationId, clientRequestId, controller.signal);
        updateResult(i, { runId });
        finalResults[i] = { ...finalResults[i], runId };

        const qaClarifyCtx: QaClarifyContext = { query: test.query, user, conversationId: qaConversationId, clarificationResponse: test.clarificationResponse };
        const pollResult = await pollUntilTerminal(clientRequestId, runId, PER_TEST_TIMEOUT_MS, controller.signal, qaClarifyCtx);

        const effectiveRunId = pollResult.finalRunId || runId;

        let testStatus: TestStatus;
        let afrFinalState: string | null = null;
        let pollExpired = false;

        if (pollResult.status === 'poll_expired_reconciling') {
          pollExpired = true;
          updateResult(i, { status: 'poll_expired_reconciling' as TestStatus, runId: effectiveRunId });
          finalResults[i] = { ...finalResults[i], status: 'poll_expired_reconciling' as TestStatus, runId: effectiveRunId };

          const reconciled = await reconcileWithAfr(
            clientRequestId,
            effectiveRunId || null,
            testStart,
            controller.signal,
          );
          testStatus = reconciled.status;
          afrFinalState = reconciled.afrFinalState;
        } else if (pollResult.timedOut) {
          testStatus = 'timed_out';
        } else if (pollResult.status === 'stopped' || pollResult.status === 'timed_out') {
          testStatus = 'timed_out';
        } else if (pollResult.status === 'failed') {
          testStatus = 'failed';
        } else {
          testStatus = 'completed';
        }

        const duration = Date.now() - testStart;

        let details: ArtefactInfo = { blocked: false, clarified: false, towerVerdict: null, resultSummary: null, deliveredCount: 0, hasLeadPack: false, layers: emptyLayerBreakdown(), deliveredEntities: [], evidenceSummary: [] };
        if (effectiveRunId) {
          try { details = await fetchRunDetails(effectiveRunId); } catch {}
        }

        if (pollResult.wasClarifying) details.clarified = true;
        if (afrFinalState === 'clarifying') details.clarified = true;

        const patch: Partial<TestResult> = {
          status: testStatus,
          runId: effectiveRunId,
          durationMs: duration,
          blocked: details.blocked,
          clarified: details.clarified,
          autoClarified: pollResult.autoClarified,
          clarifyResponseValue: pollResult.clarifyResponseValue,
          clarifyContinueSuccess: pollResult.clarifyContinueSuccess,
          postClarifyTimeout: pollResult.postClarifyTimeout,
          towerVerdict: details.towerVerdict,
          resultSummary: details.resultSummary,
          deliveredCount: details.deliveredCount,
          layers: details.layers,
        };

        const tempResult = { ...finalResults[i], ...patch };
        patch.judgement = evaluateJudgement(test.expected, tempResult as TestResult);
        patch.benchmarkOutcome = deriveBenchmarkOutcome(tempResult as TestResult);
        patch.systemHealth = deriveSystemHealth(tempResult as TestResult);
        patch.agentQuality = deriveAgentQuality(tempResult as TestResult);
        patch.towerResult = deriveTowerResult(tempResult as TestResult);

        const isTerminal = testStatus !== 'queued' && testStatus !== 'running' && testStatus !== 'poll_expired_reconciling';
        patch.behaviourResult = null;
        patch.behaviourLLMDetail = null;
        patch.behaviourSourceOfTruth = 'unknown';
        patch.behaviourFallbackUsed = false;
        patch.fallbackReason = null;
        if (isTerminal) {
          const runId = finalResults[i].runId;
          if (runId) {
            pollJudgeBInBackground(i, runId);
          }
        }

        finalResults[i] = { ...finalResults[i], ...patch };
        updateResult(i, patch);

        persistQaMetric(finalResults[i], test, targetSuiteId, suiteStart, pollExpired, afrFinalState, details);
      } catch (e: any) {
        const duration = Date.now() - testStart;
        if (e.name === 'AbortError') {
          const patch: Partial<TestResult> = { status: 'failed', error: 'Stopped by user', durationMs: duration, judgement: 'skip', benchmarkOutcome: 'TIMEOUT' as BenchmarkOutcome, systemHealth: 'TIMEOUT' as SystemHealthOutcome, agentQuality: 'UNKNOWN' as AgentQualityOutcome, towerResult: 'UNKNOWN' as TowerResult, behaviourResult: 'UNKNOWN' as BehaviourResult, behaviourLLMDetail: null, behaviourSourceOfTruth: 'unknown', behaviourFallbackUsed: false, fallbackReason: null };
          finalResults[i] = { ...finalResults[i], ...patch };
          updateResult(i, patch);
          persistQaMetric(finalResults[i], test, targetSuiteId, suiteStart);
          break;
        } else {
          const patch: Partial<TestResult> = { status: 'failed', error: e.message, durationMs: duration, judgement: 'mismatch', benchmarkOutcome: 'FAIL' as BenchmarkOutcome, systemHealth: 'BROKEN' as SystemHealthOutcome, agentQuality: 'UNKNOWN' as AgentQualityOutcome, towerResult: 'UNKNOWN' as TowerResult, behaviourResult: 'UNKNOWN' as BehaviourResult, behaviourLLMDetail: null, behaviourSourceOfTruth: 'unknown', behaviourFallbackUsed: false, fallbackReason: null };
          finalResults[i] = { ...finalResults[i], ...patch };
          updateResult(i, patch);
          persistQaMetric(finalResults[i], test, targetSuiteId, suiteStart);
        }
      }
    }

    const anyMismatch = finalResults.some(r => r.judgement === 'mismatch');
    runningRef.current = false;
    abortRef.current = null;
    localStorage.removeItem('qa_benchmark_running');
    setSuiteStatus(anyMismatch ? 'failed' : 'completed');
    setBenchmarkProgress(null);

    if (isBenchmark) {
      const healthCounts = computeHealthCounts(finalResults);
      const qualityCounts = computeQualityCounts(finalResults);
      const bPass = finalResults.filter(r => r.behaviourResult === 'PASS').length;
      const bFail = finalResults.filter(r => r.behaviourResult !== null && r.behaviourResult !== 'PASS').length;
      const bUnknown = finalResults.filter(r => r.behaviourResult === null).length;
      const bScore = finalResults.length > 0 ? Math.round((bPass / finalResults.length) * 100) : 0;
      const cPcts = finalResults.map(computeCompletionPct).filter((v): v is number => v !== null);
      const avgCompletionPct = cPcts.length > 0 ? Math.round(cPcts.reduce((a, b) => a + b, 0) / cPcts.length) : null;
      setBenchmarkSummary({
        total: finalResults.length,
        durationMs: Date.now() - suiteStart,
        system: { ...healthCounts, completionPct: avgCompletionPct },
        agent: qualityCounts,
        behaviour: { pass: bPass, fail: bFail, unknown: bUnknown, score: bScore },
      });
    }

    const entry = { suiteId: suite.id, timestamp: Date.now(), results: finalResults };
    saveHistory(entry);
    setHistory(loadHistory());
  }, [selectedSuiteId, initResults, updateResult, computeProgressCounts]);

  const stopSuite = useCallback(() => {
    abortRef.current?.abort();
    runningRef.current = false;
    localStorage.removeItem('qa_benchmark_running');
    setSuiteStatus('failed');
  }, []);

  const hasResults = results.length > 0;
  const hasFinished = suiteStatus === 'completed' || suiteStatus === 'failed';

  return (
    <div className="h-full overflow-y-auto">
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-6">
        <a href="/dev/afr" className="text-gray-500 hover:text-gray-700 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </a>
        <FlaskConical className="w-6 h-6 text-purple-600" />
        <h1 className="text-2xl font-bold">QA Regression Dashboard</h1>
        <a href="/dev/qa-progress" className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1 ml-2">
          <BarChart3 className="w-3.5 h-3.5" /> Progress Chart
        </a>
        <div className="ml-auto">{statusBadge(suiteStatus)}</div>
      </div>

      <p className="text-sm text-gray-500 mb-6">
        Run saved test suites against Wyshbone and compare actual outcomes against expected results.
        Each test submits a query through the app's internal chat/run flow, polls for completion, then evaluates pass/fail.
      </p>

      <AdHocRunner />

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Button
          onClick={() => runSuite('full-benchmark')}
          disabled={suiteStatus === 'running'}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          <FlaskConical className="w-4 h-4 mr-2" />
          Run Full Benchmark Pack
          <span className="ml-1 text-indigo-200 text-xs">({FULL_BENCHMARK_PACK.length})</span>
        </Button>

        {suiteStatus === 'running' && (
          <Button
            variant="outline"
            onClick={stopSuite}
            className="border-red-300 text-red-600 hover:bg-red-50"
          >
            <Square className="w-4 h-4 mr-2" />
            Stop
          </Button>
        )}

        <a
          href="/dev/afr"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-sm text-purple-600 hover:text-purple-800 flex items-center gap-1"
        >
          Open AFR <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-600">Or run a suite:</label>
          <select
            value={selectedSuiteId}
            onChange={e => {
              const newId = e.target.value;
              setSelectedSuiteId(newId);
              if (!runningRef.current) { setResults([]); setSuiteStatus('not_started'); setBenchmarkSummary(null); }
              const newSuite = SUITES.find(s => s.id === newId);
              if (newSuite) setSelectedTestIds(new Set(newSuite.tests.map(t => t.id)));
            }}
            disabled={suiteStatus === 'running'}
            className="border rounded-md px-3 py-1.5 text-sm bg-white"
          >
            {SUITES.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.tests.length} tests)</option>
            ))}
          </select>
        </div>

        <Button
          onClick={() => runSuite(undefined, selectedTests)}
          disabled={suiteStatus === 'running' || noneSelected}
          variant="outline"
          className="border-purple-300 text-purple-700 hover:bg-purple-50"
        >
          <Play className="w-4 h-4 mr-2" />
          {runBtnLabel}
        </Button>
      </div>

      {benchmarkProgress && isBenchmarkRunning && (
        <BenchmarkProgressBar progress={benchmarkProgress} />
      )}

      {benchmarkSummary && !isBenchmarkRunning && (
        <BenchmarkSummaryCard summary={benchmarkSummary} />
      )}

      {!hasResults && (
        <div className="border rounded-lg p-6 mb-6 bg-gray-50">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-gray-700">{selectedSuite.name}</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowImportGt(true)}
                className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 rounded px-2 py-0.5"
              >
                Import GT Records
              </button>
              <button
                className="text-xs text-purple-600 hover:text-purple-800 disabled:opacity-40"
                disabled={suiteStatus === 'running'}
                onClick={() => {
                  if (allSelected) setSelectedTestIds(new Set());
                  else setSelectedTestIds(new Set(selectedSuite.tests.map(t => t.id)));
                }}
              >
                {allSelected ? 'Uncheck all' : 'Check all'}
              </button>
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-4">{selectedSuite.description}</p>
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
            {selectedSuite.tests.map((t, i) => {
              const isChecked = selectedTestIds.has(t.id);
              return (
                <label key={i} className="flex items-start gap-2.5 text-sm cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={suiteStatus === 'running'}
                    onChange={e => {
                      setSelectedTestIds(prev => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(t.id);
                        else next.delete(t.id);
                        return next;
                      });
                    }}
                    className="mt-0.5 w-4 h-4 accent-purple-600 shrink-0"
                  />
                  <span className="text-gray-400 font-mono w-5 text-right shrink-0">{i + 1}.</span>
                  <div className="flex-1">
                    <span className={`${isChecked ? 'text-gray-800' : 'text-gray-400'}`}>{t.query}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <GroundTruthIndicator
                        queryId={t.id}
                        queryText={t.query}
                        queryClass={t.queryClass}
                        record={gtRecords.get(t.id)}
                        onSaved={handleGtSaved}
                        onDeleted={handleGtDeleted}
                      />
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {hasResults && hasFinished && !benchmarkSummary && <Scoreboard results={results} />}

      <div className="mb-4 border rounded-lg bg-gray-50/80 px-4 py-3">
        <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">What these scores mean</div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-[11px] text-gray-500 leading-relaxed">
          <div><span className="font-medium text-gray-700">Results Completeness</span> — How many of the expected results were delivered?</div>
          <div><span className="font-medium text-gray-700">System Health</span> — Did the pipeline stages (discovery, delivery) complete successfully?</div>
          <div><span className="font-medium text-gray-700">Tower</span> — Was the mission execution result acceptable?</div>
          <div><span className="font-medium text-gray-700">Behaviour</span> — LLM-judged: did the run genuinely satisfy the benchmark query? (strict)</div>
        </div>
      </div>

      {hasResults && (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-600 w-8">#</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Query</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 w-20" title="How many of the expected results were delivered?">Results</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 w-20" title="Did the pipeline stages (discovery, delivery) complete successfully?">Sys Health</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 w-20" title="Was the mission execution result acceptable?">Tower</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 w-20" title="Behaviour Judge: mission intent assessment verdict">Mission Intent</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 w-20" title="Behaviour Judge: ground truth assessment verdict">Ground Truth</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 w-20" title="Behaviour Judge: combined verdict (authoritative)">Combined</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 w-16">Time</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 w-16">AFR</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr
                  key={i}
                  className={`border-t ${
                    r.status === 'running' ? 'bg-blue-50 dark:bg-blue-950/20' :
                    r.judgement === 'mismatch' ? 'bg-red-50/50 dark:bg-red-950/10' :
                    r.judgement === 'pass' ? 'bg-green-50/30 dark:bg-green-950/10' : ''
                  }`}
                >
                  <td className="px-3 py-2.5 text-gray-400 font-mono">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-gray-800 dark:text-gray-200 text-xs">{r.query}</div>
                    {r.judgement === 'mismatch' && (
                      <div className="mt-0.5 flex items-center gap-1 text-[10px] text-amber-600">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Expected vs Behaviour mismatch</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      <GroundTruthIndicator
                        queryId={r.id}
                        queryText={r.query}
                        queryClass={r.queryClass}
                        record={gtRecords.get(r.id)}
                        onSaved={handleGtSaved}
                        onDeleted={handleGtDeleted}
                      />
                      {r.resultSummary && <span className="text-xs text-gray-400">{r.resultSummary}</span>}
                    </div>
                    {r.clarified && (
                      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Clarification:</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-medium border-0 bg-green-100 text-green-800">
                          <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />requested
                        </Badge>
                        {r.autoClarified ? (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-medium border-0 bg-green-100 text-green-800">
                            <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />answered
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-medium border-0 bg-gray-100 text-gray-500">
                            <XCircle className="w-2.5 h-2.5 mr-0.5" />answered
                          </Badge>
                        )}
                        {r.clarifyContinueSuccess ? (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-medium border-0 bg-green-100 text-green-800">
                            <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />completed
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-medium border-0 bg-red-100 text-red-700">
                            <XCircle className="w-2.5 h-2.5 mr-0.5" />completed
                          </Badge>
                        )}
                        {r.clarifyResponseValue && (
                          <span className="text-[10px] text-gray-400 ml-1">"{r.clarifyResponseValue}"</span>
                        )}
                      </div>
                    )}
                    {r.error && <div className="text-xs text-red-500 mt-0.5">{r.error}</div>}
                  </td>
                  <td className="px-3 py-2.5">
                    {completionPctBadge(r)}
                  </td>
                  <td className="px-3 py-2.5">
                    {agentQualityBadge(r.agentQuality)}
                  </td>
                  <td className="px-3 py-2.5">
                    {towerResultBadge(r.towerResult)}
                  </td>
                  <td className="px-3 py-2.5">
                    {bjVerdictBadge(r.missionIntentVerdict, r.missionIntentVerdict === null && r.groundTruthVerdict === null && r.behaviourResult === null && !!r.runId && isBenchmarkRunning)}
                  </td>
                  <td className="px-3 py-2.5">
                    {bjVerdictBadge(r.groundTruthVerdict)}
                  </td>
                  <td className="px-3 py-2.5">
                    {bjVerdictBadge(r.behaviourResult, r.behaviourResult === null && r.missionIntentVerdict === null && r.groundTruthVerdict === null && !!r.runId && isBenchmarkRunning)}
                    {r.behaviourLLMDetail && <BehaviourDetailBlock detail={r.behaviourLLMDetail} />}
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 font-mono text-xs">
                    {r.durationMs !== null ? `${(r.durationMs / 1000).toFixed(1)}s` : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    {r.runId ? (
                      <a
                        href={`/dev/afr?run=${encodeURIComponent(r.runId)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1"
                      >
                        AFR <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : r.clientRequestId && r.status !== 'queued' ? (
                      <span className="text-xs text-gray-400 font-mono" title={r.clientRequestId}>
                        {r.clientRequestId.slice(0, 6)}
                      </span>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {history.length > 0 && !runningRef.current && (
        <details className="mt-6">
          <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700 flex items-center gap-1">
            <BarChart3 className="w-3.5 h-3.5" />
            Previous runs ({history.length})
          </summary>
          <div className="mt-2 space-y-2">
            {history.slice(0, 5).map((h, i) => {
              const suite = SUITES.find(s => s.id === h.suiteId);
              const passed = h.results.filter(r => r.judgement === 'pass').length;
              const total = h.results.length;
              return (
                <div key={i} className="text-xs border rounded-md p-2 flex items-center gap-3">
                  <span className="text-gray-500">{new Date(h.timestamp).toLocaleString()}</span>
                  <span className="font-medium">{suite?.name || h.suiteId}</span>
                  <span className={passed === total ? 'text-green-600' : 'text-amber-600'}>
                    {passed}/{total} passed
                  </span>
                </div>
              );
            })}
          </div>
        </details>
      )}

      <div className="mt-4 text-xs text-gray-400 space-y-1">
        <p>Tests use a dedicated QA conversation ID and do not affect normal chat history.</p>
        <p>Per-test timeout: {PER_TEST_TIMEOUT_MS / 1000}s · Poll interval: {POLL_INTERVAL_MS / 1000}s · Country: GB</p>
        <p>Expected outcomes: pass, fail, blocked, clarify, blocked_or_clarify</p>
      </div>

      {showImportGt && (
        <ImportGtModal
          onClose={() => setShowImportGt(false)}
          existingRecords={gtRecords}
          onImported={records => {
            setGtRecords(prev => {
              const next = new Map(prev);
              for (const r of records) next.set(r.queryId, r);
              return next;
            });
            setShowImportGt(false);
          }}
        />
      )}
    </div>
    </div>
  );
}
