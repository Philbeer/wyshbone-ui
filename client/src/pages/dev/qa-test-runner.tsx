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
  AlertTriangle,
  Shield,
  BarChart3,
} from 'lucide-react';
import { buildApiUrl, addDevAuthParams } from '@/lib/queryClient';

type ExpectedOutcome = 'pass' | 'fail' | 'blocked' | 'clarify' | 'blocked_or_clarify';

interface TestDefinition {
  query: string;
  expected: ExpectedOutcome;
  expectedStrategy?: string;
  notes?: string;
}

interface TestSuite {
  id: string;
  name: string;
  description: string;
  tests: TestDefinition[];
}

const FULL_BENCHMARK_PACK: TestDefinition[] = [
  {
    query: 'Find pubs in Arundel with Swan in the name',
    expected: 'pass',
    notes: 'Basic discovery — entity + location + name constraint.',
  },
  {
    query: 'Find 10 cafes in York',
    expected: 'pass',
    notes: 'Basic discovery — entity + location + explicit count.',
  },
  {
    query: 'Find restaurants in Bath that mention vegan options on their website',
    expected: 'pass',
    expectedStrategy: 'website_evidence',
    notes: 'Website evidence — semantic menu analysis.',
  },
  {
    query: 'Find hotels in Edinburgh that mention spa facilities on their website',
    expected: 'pass',
    expectedStrategy: 'website_evidence',
    notes: 'Website evidence — amenity extraction.',
  },
  {
    query: 'Find gyms in Manchester that offer personal training',
    expected: 'pass',
    notes: 'Website evidence — service attribute.',
  },
  {
    query: 'Find pubs in Arundel that mention live music on their website',
    expected: 'pass',
    expectedStrategy: 'website_evidence',
    notes: 'Website evidence — entertainment attribute.',
  },
  {
    query: 'Find organisations that work with the local authority in Blackpool',
    expected: 'blocked_or_clarify',
    notes: 'Relationship discovery — local authority predicate.',
  },
  {
    query: 'Find companies that supply to NHS hospitals in Leeds',
    expected: 'blocked_or_clarify',
    notes: 'Relationship discovery — supplier predicate.',
  },
  {
    query: 'Find the best dentists in Brighton',
    expected: 'blocked_or_clarify',
    notes: 'Ranking — subjective "best" should trigger clarification or pass through.',
  },
  {
    query: 'Find amazing vibes in London',
    expected: 'clarify',
    notes: 'Honest failure — purely subjective entity type, no concrete noun.',
  },
  {
    query: 'Find pubs in Narnia',
    expected: 'clarify',
    notes: 'Honest failure — invalid/unknown location.',
  },
  {
    query: 'Find breweries',
    expected: 'clarify',
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
        query: 'Find pubs in Arundel with Swan in the name',
        expected: 'pass',
        notes: 'Simple entity + location + name filter. Should complete with results.',
      },
      {
        query: 'Find pubs in Arundel that mention live music on their website',
        expected: 'pass',
        expectedStrategy: 'website_evidence',
        notes: 'Entity + location + website evidence attribute.',
      },
      {
        query: 'Find the best dentists in Brighton',
        expected: 'blocked_or_clarify',
        notes: 'Subjective "best" may trigger clarification or pass through — both are acceptable.',
      },
      {
        query: 'Find 10 cafes in York',
        expected: 'pass',
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
        query: 'Find restaurants in Bath that mention vegan options on their website',
        expected: 'pass',
        notes: 'Website evidence for vegan menu.',
      },
      {
        query: 'Find hotels in Edinburgh that mention spa facilities on their website',
        expected: 'pass',
        notes: 'Website evidence for spa/wellness.',
      },
      {
        query: 'Find gyms in Manchester that offer personal training',
        expected: 'pass',
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
        query: 'Find organisations that work with the local authority in Blackpool',
        expected: 'blocked_or_clarify',
        notes: 'Relationship predicate — should trigger constraint gate or clarification.',
      },
      {
        query: 'Find companies that supply to NHS hospitals in Leeds',
        expected: 'blocked_or_clarify',
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
        query: 'Find amazing vibes in London',
        expected: 'clarify',
        notes: 'Purely subjective entity type — should clarify for a concrete noun.',
      },
      {
        query: 'Find pubs in Narnia',
        expected: 'clarify',
        notes: 'Invalid/unknown location — should clarify.',
      },
      {
        query: 'Find breweries',
        expected: 'clarify',
        notes: 'Missing location — should clarify.',
      },
    ],
  },
];

const PER_TEST_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 2_000;

type TestStatus = 'queued' | 'running' | 'completed' | 'failed' | 'timed_out';
type SuiteStatus = 'not_started' | 'running' | 'completed' | 'failed';
type Judgement = 'pass' | 'fail' | 'skip' | 'mismatch';

interface TestResult {
  query: string;
  expected: ExpectedOutcome;
  notes?: string;
  status: TestStatus;
  runId: string | null;
  clientRequestId: string | null;
  error: string | null;
  durationMs: number | null;
  blocked: boolean;
  clarified: boolean;
  towerVerdict: string | null;
  resultSummary: string | null;
  judgement: Judgement | null;
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
  if (result.status === 'completed') return 'pass';
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
      return <Badge className="bg-amber-100 text-amber-700 border-amber-200"><Clock className="w-3 h-3 mr-1" />Timed out</Badge>;
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

interface PollResult {
  terminal: boolean;
  status: string;
  timedOut: boolean;
  finalRunId: string | null;
  wasClarifying: boolean;
}

async function pollUntilTerminal(
  clientRequestId: string,
  runId: string | null,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<PollResult> {
  const start = Date.now();
  let finalRunId = runId;
  let wasClarifying = false;

  while (Date.now() - start < timeoutMs) {
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

      if (status === 'clarifying') wasClarifying = true;

      if (isTerminal || status === 'completed' || status === 'failed' || status === 'stopped' ||
          terminalState === 'PASS' || terminalState === 'FAIL' || terminalState === 'STOP' ||
          terminalState === 'completed' || terminalState === 'failed' || terminalState === 'stopped') {
        return { terminal: true, status, timedOut: false, finalRunId, wasClarifying };
      }
    } catch (e: any) {
      if (e.name === 'AbortError') throw e;
    }
  }

  return { terminal: false, status: 'timeout', timedOut: true, finalRunId, wasClarifying };
}

interface ArtefactInfo {
  blocked: boolean;
  clarified: boolean;
  towerVerdict: string | null;
  resultSummary: string | null;
}

async function fetchRunDetails(runId: string): Promise<ArtefactInfo> {
  const info: ArtefactInfo = { blocked: false, clarified: false, towerVerdict: null, resultSummary: null };
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
          info.resultSummary = `${delivered} lead${delivered !== 1 ? 's' : ''} delivered`;
        } catch {}
      }
    }
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

function Scoreboard({ results }: { results: TestResult[] }) {
  const finished = results.filter(r => r.judgement !== null);
  const passed = finished.filter(r => r.judgement === 'pass').length;
  const mismatched = finished.filter(r => r.judgement === 'mismatch').length;
  const skipped = finished.filter(r => r.judgement === 'skip').length;
  const blocked = results.filter(r => r.blocked).length;
  const timedOut = results.filter(r => r.status === 'timed_out').length;
  const total = results.length;
  const evaluated = passed + mismatched;
  const pct = evaluated > 0 ? Math.round((passed / evaluated) * 100) : 0;

  return (
    <div className="grid grid-cols-6 gap-3 mb-6">
      <div className="border rounded-lg p-3 text-center">
        <div className="text-2xl font-bold">{total}</div>
        <div className="text-xs text-gray-500">Total</div>
      </div>
      <div className="border rounded-lg p-3 text-center bg-green-50">
        <div className="text-2xl font-bold text-green-700">{passed}</div>
        <div className="text-xs text-green-600">Passed</div>
      </div>
      <div className="border rounded-lg p-3 text-center bg-red-50">
        <div className="text-2xl font-bold text-red-700">{mismatched}</div>
        <div className="text-xs text-red-600">Mismatched</div>
      </div>
      <div className="border rounded-lg p-3 text-center bg-amber-50">
        <div className="text-2xl font-bold text-amber-700">{blocked}</div>
        <div className="text-xs text-amber-600">Blocked</div>
      </div>
      <div className="border rounded-lg p-3 text-center bg-gray-50">
        <div className="text-2xl font-bold text-gray-700">{timedOut + skipped}</div>
        <div className="text-xs text-gray-500">Skipped/Timeout</div>
      </div>
      <div className="border rounded-lg p-3 text-center bg-purple-50">
        <div className="text-2xl font-bold text-purple-700">{pct}%</div>
        <div className="text-xs text-purple-600">Pass Rate</div>
      </div>
    </div>
  );
}

interface BenchmarkProgress {
  currentIndex: number;
  totalCount: number;
  currentQuery: string;
  passed: number;
  mismatched: number;
  blocked: number;
  timedOut: number;
  skipped: number;
}

interface BenchmarkSummary {
  total: number;
  passed: number;
  mismatched: number;
  blocked: number;
  skipped: number;
  timedOut: number;
  passRate: number;
  durationMs: number;
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
          <span className="text-green-700">{progress.passed} passed</span>
          <span className="text-red-700">{progress.mismatched} mismatch</span>
          <span className="text-amber-700">{progress.blocked} blocked</span>
          <span className="text-gray-500">{progress.timedOut} timeout</span>
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

function BenchmarkSummaryCard({ summary }: { summary: BenchmarkSummary }) {
  return (
    <div className="border-2 rounded-lg p-5 mb-6 bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-5 h-5 text-purple-600" />
        <h3 className="font-bold text-purple-900">Full Benchmark Pack — Complete</h3>
        <span className="text-xs text-gray-500 ml-auto">
          {(summary.durationMs / 1000).toFixed(0)}s total
        </span>
      </div>
      <div className="grid grid-cols-7 gap-2">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">{summary.total}</div>
          <div className="text-xs text-gray-500">Total</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-700">{summary.passed}</div>
          <div className="text-xs text-green-600">Passed</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-red-700">{summary.mismatched}</div>
          <div className="text-xs text-red-600">Mismatched</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-amber-700">{summary.blocked}</div>
          <div className="text-xs text-amber-600">Blocked</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-600">{summary.skipped}</div>
          <div className="text-xs text-gray-500">Skipped</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-orange-600">{summary.timedOut}</div>
          <div className="text-xs text-orange-500">Timeout</div>
        </div>
        <div className="text-center">
          <div className={`text-2xl font-bold ${summary.passRate >= 80 ? 'text-green-700' : summary.passRate >= 50 ? 'text-amber-700' : 'text-red-700'}`}>
            {summary.passRate}%
          </div>
          <div className="text-xs text-purple-600">Pass Rate</div>
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
      query: t.query,
      expected: t.expected,
      notes: t.notes,
      status: 'queued',
      runId: null,
      clientRequestId: null,
      error: null,
      durationMs: null,
      blocked: false,
      clarified: false,
      towerVerdict: null,
      resultSummary: null,
      judgement: null,
    }));
  }, []);

  const updateResult = useCallback((idx: number, patch: Partial<TestResult>) => {
    setResults(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  }, []);

  const computeProgressCounts = useCallback((finalResults: TestResult[]) => {
    let passed = 0, mismatched = 0, blocked = 0, timedOut = 0, skipped = 0;
    for (const r of finalResults) {
      if (r.judgement === 'pass') passed++;
      else if (r.judgement === 'mismatch') mismatched++;
      else if (r.judgement === 'skip') skipped++;
      if (r.blocked) blocked++;
      if (r.status === 'timed_out') timedOut++;
    }
    return { passed, mismatched, blocked, timedOut, skipped };
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
        passed: 0, mismatched: 0, blocked: 0, timedOut: 0, skipped: 0,
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
          const skipped: Partial<TestResult> = { status: 'failed', error: 'Stopped by user', judgement: 'skip' };
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

        const pollResult = await pollUntilTerminal(clientRequestId, runId, PER_TEST_TIMEOUT_MS, controller.signal);
        const duration = Date.now() - testStart;

        let details: ArtefactInfo = { blocked: false, clarified: false, towerVerdict: null, resultSummary: null };
        const effectiveRunId = pollResult.finalRunId || runId;
        if (effectiveRunId) {
          try { details = await fetchRunDetails(effectiveRunId); } catch {}
        }

        if (pollResult.wasClarifying) details.clarified = true;

        let testStatus: TestStatus;
        if (pollResult.timedOut) {
          testStatus = 'timed_out';
        } else if (pollResult.status === 'failed' || pollResult.status === 'stopped') {
          testStatus = 'failed';
        } else {
          testStatus = 'completed';
        }

        const patch: Partial<TestResult> = {
          status: testStatus,
          runId: effectiveRunId,
          durationMs: duration,
          blocked: details.blocked,
          clarified: details.clarified,
          towerVerdict: details.towerVerdict,
          resultSummary: details.resultSummary,
        };

        const tempResult = { ...finalResults[i], ...patch };
        patch.judgement = evaluateJudgement(test.expected, tempResult as TestResult);

        finalResults[i] = { ...finalResults[i], ...patch };
        updateResult(i, patch);
      } catch (e: any) {
        const duration = Date.now() - testStart;
        if (e.name === 'AbortError') {
          const patch: Partial<TestResult> = { status: 'failed', error: 'Stopped by user', durationMs: duration, judgement: 'skip' };
          finalResults[i] = { ...finalResults[i], ...patch };
          updateResult(i, patch);
          for (let j = i + 1; j < suite.tests.length; j++) {
            const skipped: Partial<TestResult> = { status: 'failed', error: 'Stopped by user', judgement: 'skip' };
            finalResults[j] = { ...finalResults[j], ...skipped };
            updateResult(j, skipped);
          }
          break;
        } else {
          const patch: Partial<TestResult> = { status: 'failed', error: e.message, durationMs: duration, judgement: 'mismatch' };
          finalResults[i] = { ...finalResults[i], ...patch };
          updateResult(i, patch);
        }
      }
    }

    const anyMismatch = finalResults.some(r => r.judgement === 'mismatch');
    runningRef.current = false;
    abortRef.current = null;
    setSuiteStatus(anyMismatch ? 'failed' : 'completed');
    setBenchmarkProgress(null);

    if (isBenchmark) {
      const counts = computeProgressCounts(finalResults);
      const evaluated = counts.passed + counts.mismatched;
      setBenchmarkSummary({
        total: finalResults.length,
        passed: counts.passed,
        mismatched: counts.mismatched,
        blocked: counts.blocked,
        skipped: counts.skipped,
        timedOut: counts.timedOut,
        passRate: evaluated > 0 ? Math.round((counts.passed / evaluated) * 100) : 0,
        durationMs: Date.now() - suiteStart,
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
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-6">
        <a href="/dev/afr" className="text-gray-500 hover:text-gray-700 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </a>
        <FlaskConical className="w-6 h-6 text-purple-600" />
        <h1 className="text-2xl font-bold">QA Regression Dashboard</h1>
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

      {hasResults && hasFinished && <Scoreboard results={results} />}

      {hasResults && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-600 w-8">#</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Query</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 w-24">Status</th>
                <th className="text-center px-3 py-2 font-medium text-gray-600 w-12" title="Blocked">
                  <Shield className="w-3.5 h-3.5 mx-auto" />
                </th>
                <th className="text-center px-3 py-2 font-medium text-gray-600 w-12" title="Clarified">
                  <AlertTriangle className="w-3.5 h-3.5 mx-auto" />
                </th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 w-20">Tower</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 w-16">Time</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 w-24">Judgement</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 w-16">Run</th>
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
                    {r.error && <div className="text-xs text-red-500 mt-0.5">{r.error}</div>}
                  </td>
                  <td className="px-3 py-2.5">{statusBadge(r.status)}</td>
                  <td className="px-3 py-2.5 text-center">
                    {r.blocked ? <span className="text-amber-600 font-bold text-xs">Y</span> : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {r.clarified ? <span className="text-blue-600 font-bold text-xs">Y</span> : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {r.towerVerdict ? (
                      <span className={`text-xs font-medium ${
                        r.towerVerdict.toLowerCase().includes('pass') ? 'text-green-600' :
                        r.towerVerdict.toLowerCase().includes('fail') ? 'text-red-600' : 'text-gray-500'
                      }`}>{r.towerVerdict}</span>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 font-mono text-xs">
                    {r.durationMs !== null ? `${(r.durationMs / 1000).toFixed(1)}s` : '—'}
                  </td>
                  <td className="px-3 py-2.5">{judgementBadge(r.judgement)}</td>
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
  );
}
