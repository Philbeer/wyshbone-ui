import { useState, useRef, useCallback } from 'react';
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
} from 'lucide-react';
import { buildApiUrl, addDevAuthParams } from '@/lib/queryClient';

const DEFAULT_TESTS = [
  'Find pubs in Arundel with Swan in the name',
  'Find pubs in Arundel that mention live music on their website',
  'Find organisations that work with the local authority in Blackpool',
  'Find the best dentists in Brighton',
];

const PER_TEST_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 2_000;

type TestStatus = 'queued' | 'running' | 'completed' | 'failed' | 'timed_out';
type SuiteStatus = 'not_started' | 'running' | 'completed' | 'failed';

interface TestResult {
  query: string;
  status: TestStatus;
  runId: string | null;
  clientRequestId: string | null;
  error: string | null;
  durationMs: number | null;
}

function getUser(): { id: string; email: string } | null {
  try {
    const raw = localStorage.getItem('wyshbone_user');
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
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

async function pollUntilTerminal(
  clientRequestId: string,
  runId: string | null,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<{ terminal: boolean; status: string; timedOut: boolean; finalRunId: string | null }> {
  const start = Date.now();
  let finalRunId = runId;

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

      if (isTerminal || status === 'completed' || status === 'failed' || status === 'stopped' ||
          terminalState === 'PASS' || terminalState === 'FAIL' || terminalState === 'STOP' ||
          terminalState === 'completed' || terminalState === 'failed' || terminalState === 'stopped') {
        return { terminal: true, status, timedOut: false, finalRunId };
      }
    } catch (e: any) {
      if (e.name === 'AbortError') throw e;
    }
  }

  return { terminal: false, status: 'timeout', timedOut: true, finalRunId };
}

export default function QaTestRunnerPage() {
  const [suiteStatus, setSuiteStatus] = useState<SuiteStatus>('not_started');
  const [results, setResults] = useState<TestResult[]>(
    DEFAULT_TESTS.map(q => ({ query: q, status: 'queued', runId: null, clientRequestId: null, error: null, durationMs: null }))
  );
  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);

  const updateResult = useCallback((idx: number, patch: Partial<TestResult>) => {
    setResults(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  }, []);

  const runSuite = useCallback(async () => {
    const user = getUser();
    if (!user) {
      alert('No user found in localStorage. Please load the main app first.');
      return;
    }

    runningRef.current = true;
    setSuiteStatus('running');
    setResults(DEFAULT_TESTS.map(q => ({ query: q, status: 'queued', runId: null, clientRequestId: null, error: null, durationMs: null })));

    const controller = new AbortController();
    abortRef.current = controller;

    const qaConversationId = `qa-suite-${crypto.randomUUID()}`;
    let allPassed = true;

    for (let i = 0; i < DEFAULT_TESTS.length; i++) {
      if (controller.signal.aborted) {
        for (let j = i; j < DEFAULT_TESTS.length; j++) {
          updateResult(j, { status: 'failed', error: 'Stopped by user' });
        }
        allPassed = false;
        break;
      }

      const query = DEFAULT_TESTS[i];
      const clientRequestId = crypto.randomUUID();
      const testStart = Date.now();

      updateResult(i, { status: 'running', clientRequestId });

      try {
        const { runId } = await submitQuery(query, user, qaConversationId, clientRequestId, controller.signal);
        updateResult(i, { runId });

        const result = await pollUntilTerminal(clientRequestId, runId, PER_TEST_TIMEOUT_MS, controller.signal);

        const duration = Date.now() - testStart;

        if (result.timedOut) {
          updateResult(i, { status: 'timed_out', runId: result.finalRunId, durationMs: duration });
          allPassed = false;
        } else if (result.status === 'failed') {
          updateResult(i, { status: 'failed', runId: result.finalRunId, durationMs: duration });
          allPassed = false;
        } else {
          updateResult(i, { status: 'completed', runId: result.finalRunId, durationMs: duration });
        }
      } catch (e: any) {
        const duration = Date.now() - testStart;
        if (e.name === 'AbortError') {
          updateResult(i, { status: 'failed', error: 'Stopped by user', durationMs: duration });
          for (let j = i + 1; j < DEFAULT_TESTS.length; j++) {
            updateResult(j, { status: 'failed', error: 'Stopped by user' });
          }
          allPassed = false;
          break;
        } else {
          updateResult(i, { status: 'failed', error: e.message, durationMs: duration });
          allPassed = false;
        }
      }
    }

    runningRef.current = false;
    abortRef.current = null;
    setSuiteStatus(allPassed ? 'completed' : 'failed');
  }, [updateResult]);

  const stopSuite = useCallback(() => {
    abortRef.current?.abort();
    runningRef.current = false;
    setSuiteStatus('failed');
  }, []);

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-6">
        <a
          href="/dev/afr"
          className="text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </a>
        <FlaskConical className="w-6 h-6 text-purple-600" />
        <h1 className="text-2xl font-bold">QA Test Runner</h1>
        <div className="ml-auto">{statusBadge(suiteStatus)}</div>
      </div>

      <p className="text-sm text-gray-500 mb-6">
        Runs a fixed internal test suite against Wyshbone using exact built-in inputs.
        Each test submits a query through the app's own chat/run flow, polls for completion, and records the result.
        Tests run sequentially with a {PER_TEST_TIMEOUT_MS / 1000}s per-test timeout.
      </p>

      <div className="flex items-center gap-3 mb-6">
        <Button
          onClick={runSuite}
          disabled={suiteStatus === 'running'}
          className="bg-purple-600 hover:bg-purple-700"
        >
          <Play className="w-4 h-4 mr-2" />
          Run Default Test Suite
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

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-gray-600 w-8">#</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Query</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600 w-28">Status</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600 w-20">Time</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600 w-28">Run</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr
                key={i}
                className={`border-t ${r.status === 'running' ? 'bg-blue-50 dark:bg-blue-950/20' : ''}`}
              >
                <td className="px-4 py-3 text-gray-400 font-mono">{i + 1}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-800 dark:text-gray-200">{r.query}</div>
                  {r.error && (
                    <div className="text-xs text-red-500 mt-1">{r.error}</div>
                  )}
                </td>
                <td className="px-4 py-3">{statusBadge(r.status)}</td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                  {r.durationMs !== null ? `${(r.durationMs / 1000).toFixed(1)}s` : '—'}
                </td>
                <td className="px-4 py-3">
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
                      {r.clientRequestId.slice(0, 8)}…
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-xs text-gray-400 space-y-1">
        <p>Tests use a dedicated QA conversation ID and do not affect normal chat history.</p>
        <p>Per-test timeout: {PER_TEST_TIMEOUT_MS / 1000}s · Poll interval: {POLL_INTERVAL_MS / 1000}s · Country: GB</p>
      </div>
    </div>
  );
}
