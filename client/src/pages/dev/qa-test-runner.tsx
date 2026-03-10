import { useState, useRef, useCallback, useMemo } from 'react';
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
  BarChart3,
} from 'lucide-react';
import { buildApiUrl, addDevAuthParams } from '@/lib/queryClient';

type ExpectedOutcome = 'pass' | 'fail' | 'blocked' | 'clarify' | 'blocked_or_clarify';
type QueryClass = 'solvable' | 'clarification_required' | 'fictional_or_impossible' | 'subjective_or_unverifiable' | 'website_evidence_required' | 'relationship_required';
type ExpectedMode = 'deliver_results' | 'clarify' | 'honest_refusal' | 'best_effort_honest';
type TowerResult = 'PASS' | 'FAIL' | 'UNKNOWN' | 'NOT_APPLICABLE';
type BehaviourResult = 'PASS' | 'FAIL' | 'UNKNOWN';

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
    description: 'Complete regression benchmark — 12 fixed queries covering basic discovery, website evidence, name constraints, relationship discovery, ranking, and honest failure cases.',
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

function getClarifyAutoResponse(query: string, definitionResponse?: string): string | null {
  if (definitionResponse) return definitionResponse;
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

function expectedBadge(expected: ExpectedOutcome) {
  switch (expected) {
    case 'pass':
      return <span className="text-xs text-green-600 font-medium">expect: pass</span>;
    case 'fail':
      return <span className="text-xs text-red-600 font-medium">expect: fail</span>;
    case 'blocked':
      return <span className="text-xs text-amber-600 font-medium">expect: blocked</span>;
    case 'clarify':
      return <span className="text-xs text-blue-600 font-medium">expect: clarify</span>;
    case 'blocked_or_clarify':
      return <span className="text-xs text-purple-600 font-medium">expect: blocked/clarify</span>;
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
          if (parsed.type === 'run_id' && parsed.content) {
            runId = parsed.content;
          }
          if (parsed.type === 'supervisorTaskId') {
            break;
          }
        } catch {}
      }
    }
  } catch (e: any) {
    if (e.name === 'AbortError') throw e;
  } finally {
    try { reader.cancel(); } catch {}
  }

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
          const autoResponse = getClarifyAutoResponse(qaClarifyCtx.query, qaClarifyCtx.clarificationResponse);
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

function deriveBehaviourResult(result: TestResult): BehaviourResult {
  if (result.status === 'timed_out') return 'UNKNOWN';
  if (result.status === 'poll_timeout_running') return 'UNKNOWN';
  if (result.status === 'poll_expired_reconciling') return 'UNKNOWN';
  if (result.status === 'failed' && result.error === 'Stopped by user') return 'UNKNOWN';
  if (result.status === 'queued' || result.status === 'running') return 'UNKNOWN';

  const delivered = result.layers.delivery === 'pass';
  const count = result.deliveredCount;
  const minCount = result.minimumExpectedCount ?? 1;

  switch (result.queryClass) {
    case 'solvable':
      if (!delivered) return 'FAIL';
      if (count < minCount) return 'FAIL';
      return 'PASS';

    case 'website_evidence_required':
      if (!delivered) return 'FAIL';
      if (count < minCount) return 'FAIL';
      if (!result.layers.verification || result.layers.verification !== 'pass') return 'FAIL';
      return 'PASS';

    case 'clarification_required':
      return result.clarified ? 'PASS' : 'FAIL';

    case 'relationship_required':
      if (result.clarified || result.blocked) return 'PASS';
      if (delivered) return 'PASS';
      return 'FAIL';

    case 'fictional_or_impossible':
      if (result.blocked || result.clarified) return 'PASS';
      if (result.status === 'failed' && !delivered) return 'PASS';
      if (delivered) return 'FAIL';
      return 'PASS';

    case 'subjective_or_unverifiable':
      if (result.clarified) return 'PASS';
      if (result.blocked) return 'PASS';
      if (delivered) return 'PASS';
      return 'FAIL';

    default:
      return 'UNKNOWN';
  }
}

async function fetchRunDetails(runId: string): Promise<ArtefactInfo> {
  const info: ArtefactInfo = { blocked: false, clarified: false, towerVerdict: null, resultSummary: null, deliveredCount: 0, hasLeadPack: false, layers: emptyLayerBreakdown() };
  try {
    const params = new URLSearchParams({ runId });
    const res = await fetch(
      buildApiUrl(addDevAuthParams(`/api/afr/artefacts?${params.toString()}`)),
      { credentials: 'include' }
    );
    if (!res.ok) return info;
    const artefacts: any[] = await res.json();

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
        } catch {}
      }
      if (a.type === 'delivery_summary') {
        try {
          const payload = typeof a.payload_json === 'string' ? JSON.parse(a.payload_json) : a.payload_json;
          const delivered = payload?.delivered_exact?.length || payload?.delivered_count || 0;
          info.deliveredCount = delivered;
          info.resultSummary = `${delivered} lead${delivered !== 1 ? 's' : ''} delivered`;
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
): Promise<void> {
  if (!result.runId) return;
  if (result.status === 'queued' || result.status === 'running' || result.status === 'poll_expired_reconciling') return;

  const systemHealth = result.systemHealth || deriveSystemHealth(result);
  const agentQuality = result.agentQuality || deriveAgentQuality(result);
  const tResult = result.towerResult || deriveTowerResult(result);
  const bResult = result.behaviourResult || deriveBehaviourResult(result);

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
      blocked: result.blocked,
      clarified: result.clarified,
      towerVerdict: result.towerVerdict,
      layers: result.layers,
      poll_expired: pollExpired,
      afr_final_state: afrFinalState,
      afr_reconciled: pollExpired,
      raw_observer_status: result.status,
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
      return <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px] px-1.5 py-0">Pass</Badge>;
    case 'NOT_APPLICABLE':
      return <Badge className="bg-gray-100 text-gray-500 border-gray-300 text-[10px] px-1.5 py-0">N/A</Badge>;
    case 'PARTIAL':
      return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-[10px] px-1.5 py-0">Partial</Badge>;
    case 'FAIL':
      return <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px] px-1.5 py-0">Fail</Badge>;
    case 'UNKNOWN':
      return <Badge variant="outline" className="text-gray-500 border-gray-300 text-[10px] px-1.5 py-0">Unknown</Badge>;
  }
}

function Scoreboard({ results }: { results: TestResult[] }) {
  const withOutcome = results.filter(r => r.systemHealth !== null || r.agentQuality !== null);
  const hc = computeHealthCounts(withOutcome);
  const qc = computeQualityCounts(withOutcome);
  const total = results.length;

  return (
    <div className="grid grid-cols-2 gap-3 mb-6">
      <div className="border rounded-lg p-4">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">System Reliability</div>
        <div className="flex items-baseline gap-2 mb-3">
          <span className={`text-3xl font-bold ${hc.reliability >= 80 ? 'text-green-700' : hc.reliability >= 50 ? 'text-amber-700' : 'text-red-700'}`}>{hc.reliability}%</span>
          <span className="text-xs text-gray-400">of {total} runs</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-green-700 font-medium">{hc.healthy} healthy</span>
          <span className="text-amber-700">{hc.degraded} degraded</span>
          <span className="text-gray-500">{hc.timeout} timeout</span>
          <span className="text-red-700">{hc.broken} broken</span>
        </div>
        <div className="mt-2 text-[9px] text-gray-400">(healthy + degraded) / total runs</div>
      </div>
      <div className="border rounded-lg p-4">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Agent Performance</div>
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
}

interface BenchmarkSummary {
  total: number;
  durationMs: number;
  system: { healthy: number; degraded: number; broken: number; timeout: number; reliability: number };
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
    </div>
  );
}

function towerResultBadge(result: TowerResult | null) {
  if (!result) return <span className="text-gray-300 text-xs">—</span>;
  const cls = result === 'PASS' ? 'bg-green-100 text-green-800'
    : result === 'FAIL' ? 'bg-red-100 text-red-800'
    : result === 'NOT_APPLICABLE' ? 'bg-gray-100 text-gray-400'
    : 'bg-gray-100 text-gray-600';
  const label = result === 'NOT_APPLICABLE' ? 'N/A' : result;
  return <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-medium border-0 ${cls}`}>{label}</Badge>;
}

function behaviourBadge(result: BehaviourResult | null) {
  if (!result) return <span className="text-gray-300 text-xs">—</span>;
  const cls = result === 'PASS' ? 'bg-green-100 text-green-800'
    : result === 'FAIL' ? 'bg-red-100 text-red-800'
    : 'bg-gray-100 text-gray-600';
  return <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-medium border-0 ${cls}`}>{result}</Badge>;
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
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">System Reliability</span>
            <span className={`text-2xl font-bold ml-auto ${s.reliability >= 80 ? 'text-green-700' : s.reliability >= 50 ? 'text-amber-700' : 'text-red-700'}`}>{s.reliability}%</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-green-700 font-medium">{s.healthy} healthy</span>
            <span className="text-amber-700">{s.degraded} degraded</span>
            <span className="text-gray-500">{s.timeout} timeout</span>
            <span className="text-red-700">{s.broken} broken</span>
          </div>
        </div>
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Agent Performance</span>
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

  const selectedSuite = useMemo(() => SUITES.find(s => s.id === selectedSuiteId)!, [selectedSuiteId]);

  const initResults = useCallback((suite: TestSuite): TestResult[] => {
    return suite.tests.map(t => ({
      id: t.id,
      query: t.query,
      expected: t.expected,
      queryClass: t.queryClass,
      expectedMode: t.expectedMode,
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
    }));
  }, []);

  const updateResult = useCallback((idx: number, patch: Partial<TestResult>) => {
    setResults(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  }, []);

  const computeProgressCounts = useCallback((finalResults: TestResult[]) => {
    return computeOutcomeCounts(finalResults);
  }, []);

  const runSuite = useCallback(async (suiteIdOverride?: string) => {
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

    const initialResults = initResults(suite);
    const isBenchmark = targetSuiteId === 'full-benchmark';

    runningRef.current = true;
    setSuiteStatus('running');
    setResults(initialResults);
    setBenchmarkSummary(null);

    if (isBenchmark) {
      setBenchmarkProgress({
        currentIndex: 0,
        totalCount: suite.tests.length,
        currentQuery: suite.tests[0].query,
        pass: 0, partial: 0, blocked: 0, timeout: 0, fail: 0,
      });
    } else {
      setBenchmarkProgress(null);
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const suiteStart = Date.now();
    const qaConversationId = `qa-${suite.id}-${crypto.randomUUID()}`;
    const finalResults = [...initialResults];

    for (let i = 0; i < suite.tests.length; i++) {
      if (controller.signal.aborted) {
        for (let j = i; j < suite.tests.length; j++) {
          const skipped: Partial<TestResult> = { status: 'failed', error: 'Stopped by user', judgement: 'skip', benchmarkOutcome: 'TIMEOUT' as BenchmarkOutcome, systemHealth: 'TIMEOUT' as SystemHealthOutcome, agentQuality: 'UNKNOWN' as AgentQualityOutcome, towerResult: 'UNKNOWN' as TowerResult, behaviourResult: 'UNKNOWN' as BehaviourResult };
          finalResults[j] = { ...finalResults[j], ...skipped };
          updateResult(j, skipped);
        }
        break;
      }

      const test = suite.tests[i];
      const clientRequestId = crypto.randomUUID();
      const testStart = Date.now();

      updateResult(i, { status: 'running', clientRequestId });
      finalResults[i] = { ...finalResults[i], status: 'running', clientRequestId };

      if (isBenchmark) {
        const counts = computeProgressCounts(finalResults);
        setBenchmarkProgress({
          currentIndex: i + 1,
          totalCount: suite.tests.length,
          currentQuery: test.query,
          ...counts,
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

        let details: ArtefactInfo = { blocked: false, clarified: false, towerVerdict: null, resultSummary: null, deliveredCount: 0, hasLeadPack: false, layers: emptyLayerBreakdown() };
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
        patch.behaviourResult = deriveBehaviourResult(tempResult as TestResult);

        finalResults[i] = { ...finalResults[i], ...patch };
        updateResult(i, patch);

        persistQaMetric(finalResults[i], test, targetSuiteId, suiteStart, pollExpired, afrFinalState);
      } catch (e: any) {
        const duration = Date.now() - testStart;
        if (e.name === 'AbortError') {
          const patch: Partial<TestResult> = { status: 'failed', error: 'Stopped by user', durationMs: duration, judgement: 'skip', benchmarkOutcome: 'TIMEOUT' as BenchmarkOutcome, systemHealth: 'TIMEOUT' as SystemHealthOutcome, agentQuality: 'UNKNOWN' as AgentQualityOutcome, towerResult: 'UNKNOWN' as TowerResult, behaviourResult: 'UNKNOWN' as BehaviourResult };
          finalResults[i] = { ...finalResults[i], ...patch };
          updateResult(i, patch);
          persistQaMetric(finalResults[i], test, targetSuiteId, suiteStart);
          break;
        } else {
          const patch: Partial<TestResult> = { status: 'failed', error: e.message, durationMs: duration, judgement: 'mismatch', benchmarkOutcome: 'FAIL' as BenchmarkOutcome, systemHealth: 'BROKEN' as SystemHealthOutcome, agentQuality: 'UNKNOWN' as AgentQualityOutcome, towerResult: 'UNKNOWN' as TowerResult, behaviourResult: 'UNKNOWN' as BehaviourResult };
          finalResults[i] = { ...finalResults[i], ...patch };
          updateResult(i, patch);
          persistQaMetric(finalResults[i], test, targetSuiteId, suiteStart);
        }
      }
    }

    const anyMismatch = finalResults.some(r => r.judgement === 'mismatch');
    runningRef.current = false;
    abortRef.current = null;
    setSuiteStatus(anyMismatch ? 'failed' : 'completed');
    setBenchmarkProgress(null);

    if (isBenchmark) {
      const healthCounts = computeHealthCounts(finalResults);
      const qualityCounts = computeQualityCounts(finalResults);
      const bPass = finalResults.filter(r => r.behaviourResult === 'PASS').length;
      const bFail = finalResults.filter(r => r.behaviourResult === 'FAIL').length;
      const bUnknown = finalResults.filter(r => r.behaviourResult === 'UNKNOWN' || r.behaviourResult === null).length;
      const bScore = finalResults.length > 0 ? Math.round((bPass / finalResults.length) * 100) : 0;
      setBenchmarkSummary({
        total: finalResults.length,
        durationMs: Date.now() - suiteStart,
        system: healthCounts,
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
            onChange={e => { setSelectedSuiteId(e.target.value); if (!runningRef.current) { setResults([]); setSuiteStatus('not_started'); setBenchmarkSummary(null); } }}
            disabled={suiteStatus === 'running'}
            className="border rounded-md px-3 py-1.5 text-sm bg-white"
          >
            {SUITES.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.tests.length} tests)</option>
            ))}
          </select>
        </div>

        <Button
          onClick={() => runSuite()}
          disabled={suiteStatus === 'running'}
          variant="outline"
          className="border-purple-300 text-purple-700 hover:bg-purple-50"
        >
          <Play className="w-4 h-4 mr-2" />
          Run Selected Suite
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
          <h3 className="font-semibold text-gray-700 mb-2">{selectedSuite.name}</h3>
          <p className="text-sm text-gray-500 mb-4">{selectedSuite.description}</p>
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            {selectedSuite.tests.map((t, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <span className="text-gray-400 font-mono w-6 text-right shrink-0">{i + 1}.</span>
                <div className="flex-1">
                  <span className="text-gray-800">{t.query}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    {expectedBadge(t.expected)}
                    {t.expectedStrategy && <span className="text-xs text-indigo-500 font-mono">strategy: {t.expectedStrategy}</span>}
                    {t.notes && <span className="text-xs text-gray-400">{t.notes}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasResults && hasFinished && !benchmarkSummary && <Scoreboard results={results} />}

      <div className="mb-4 border rounded-lg bg-gray-50/80 px-4 py-3">
        <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">What these scores mean</div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-[11px] text-gray-500 leading-relaxed">
          <div><span className="font-medium text-gray-700">System</span> — Did the run infrastructure behave reliably (no crash/timeout)?</div>
          <div><span className="font-medium text-gray-700">Agent</span> — Did the agent make the correct decision about what to do?</div>
          <div><span className="font-medium text-gray-700">Tower</span> — Was the mission execution result acceptable?</div>
          <div><span className="font-medium text-gray-700">Behaviour</span> — Did the system behave as the benchmark expected?</div>
        </div>
      </div>

      {hasResults && (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-600 w-8">#</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Query</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 w-20" title="Did the run infrastructure behave reliably (no crash/timeout)?">System</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 w-20" title="Did the agent make the correct decision about what to do?">Agent</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 w-20" title="Was the mission execution result acceptable?">Tower</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 w-20" title="Did the system behave as the benchmark expected?">Behaviour</th>
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
                    <div className="flex items-center gap-2 mt-0.5">
                      {expectedBadge(r.expected)}
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
                    {systemHealthBadge(r.systemHealth)}
                  </td>
                  <td className="px-3 py-2.5">
                    {agentQualityBadge(r.agentQuality)}
                  </td>
                  <td className="px-3 py-2.5">
                    {towerResultBadge(r.towerResult)}
                  </td>
                  <td className="px-3 py-2.5">
                    {behaviourBadge(r.behaviourResult)}
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
    </div>
    </div>
  );
}
