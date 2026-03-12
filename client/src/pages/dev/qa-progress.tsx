import { useState, useEffect, useMemo, type ReactNode } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Scatter, ComposedChart, Legend,
} from 'recharts';
import { buildApiUrl, addDevAuthParams } from '@/lib/queryClient';
import { ExternalLink, ArrowLeft, RefreshCw, TrendingUp, X, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

interface MetricRow {
  id: number;
  run_id: string;
  timestamp: string | number;
  query: string;
  query_class: string | null;
  expected_mode: string | null;
  suite_id: string | null;
  pack_timestamp: string | number | null;
  benchmark_test_id: string | null;
  source: string;
  system_status: string;
  agent_status: string;
  tower_result: string;
  behaviour_result: string;
  system_score: string;
  agent_score: string;
  tower_score: string;
  behaviour_score: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

function toNumericTs(val: string | number | null | undefined): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  const n = parseInt(val, 10);
  return isNaN(n) ? 0 : n;
}

interface ChartPoint {
  index: number;
  timestamp: number;
  label: string;
  behaviourScore: number | null;
  systemScore: number | null;
  towerScore: number | null;
  behaviourAvg: number | null;
  systemAvg: number | null;
  towerAvg: number | null;
}

const ROLLING_WINDOW = 20;

function rollingAvg(values: (number | null)[], windowSize: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    const windowStart = Math.max(0, i - windowSize + 1);
    const window = values.slice(windowStart, i + 1).filter((v): v is number => v !== null);
    result.push(window.length > 0 ? window.reduce((a, b) => a + b, 0) / window.length : null);
  }
  return result;
}

function parseScore(val: string | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function statusToScore(status: string, type: 'system' | 'tower' | 'behaviour' | 'agent'): number | null {
  if (!status || status === 'UNKNOWN') return null;
  if (type === 'system') {
    if (status === 'HEALTHY') return 1;
    if (status === 'DEGRADED') return 0.5;
    return 0;
  }
  if (type === 'tower' || type === 'behaviour') {
    if (status === 'PASS' || status === 'NOT_APPLICABLE') return 1;
    if (status === 'FAIL') return 0;
    return null;
  }
  if (type === 'agent') {
    if (status === 'PASS') return 1;
    if (status === 'PARTIAL') return 0.5;
    if (status === 'UNKNOWN' || status === 'NOT_APPLICABLE') return null;
    return 0;
  }
  return null;
}

function formatTs(ts: string | number): string {
  const n = toNumericTs(ts);
  if (n === 0) return '—';
  const d = new Date(n);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function prettyJson(obj: unknown): string {
  try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
}

function ExpandableJson({ label, data }: { label: string; data: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700 font-medium"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {label}
      </button>
      {open && (
        <pre className="mt-1 p-3 bg-gray-50 border rounded text-[10px] font-mono overflow-auto max-h-[300px] whitespace-pre-wrap">
          {typeof data === 'string' ? data : prettyJson(data)}
        </pre>
      )}
    </div>
  );
}

function MetaField({ label, value }: { label: string; value: ReactNode }) {
  const display = value === null || value === undefined ? '—' : value;
  return (
    <tr>
      <td className="pr-3 py-0.5 text-gray-500 font-medium whitespace-nowrap align-top text-[11px]">{label}</td>
      <td className="py-0.5 text-gray-800 text-[11px] break-all">{display}</td>
    </tr>
  );
}

function BehaviourInspectModal({ row, open, onClose }: { row: MetricRow | null; open: boolean; onClose: () => void }) {
  const [judgeB, setJudgeB] = useState<{
    outcome: string;
    confidence: number | null;
    reason: string | null;
    tower_verdict: string | null;
    delivered_count: number | null;
    requested_count: number | null;
  } | null>(null);
  const [judgeBLoading, setJudgeBLoading] = useState(false);

  useEffect(() => {
    if (!open || !row?.run_id) { setJudgeB(null); return; }
    setJudgeBLoading(true);
    setJudgeB(null);
    fetch(buildApiUrl(addDevAuthParams(`/api/afr/behaviour-judge?run_id=${encodeURIComponent(row.run_id)}`)), { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { setJudgeB(data || null); })
      .catch(() => { setJudgeB(null); })
      .finally(() => setJudgeBLoading(false));
  }, [open, row?.run_id]);

  if (!row) return null;

  const titleParts: string[] = [];
  if (row.benchmark_test_id) titleParts.push(row.benchmark_test_id);
  titleParts.push(row.query.length > 60 ? row.query.slice(0, 57) + '...' : row.query);

  const outcome = (judgeB?.outcome || '').toUpperCase();
  const isPass = outcome === 'PASS';
  const isFail = outcome !== '' && outcome !== 'UNKNOWN' && !isPass;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold leading-snug">
            {titleParts.join(' — ')}
          </DialogTitle>
          <div className="text-[11px] text-gray-400 mt-0.5">{formatTs(row.timestamp)}</div>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <section>
            <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2 border-b pb-1">
              Behaviour Judge (Judge B)
            </h4>
            {judgeBLoading ? (
              <div className="text-[11px] text-gray-400 py-2">Loading…</div>
            ) : !judgeB ? (
              <div className="text-[11px] text-gray-400 italic py-2">
                No Judge B result in behaviour_judge_results for this run.
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold ${
                    isPass ? 'bg-green-100 text-green-800' : isFail ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {outcome || '—'}
                  </span>
                  {judgeB.confidence != null && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                      {judgeB.confidence > 1 ? Math.round(judgeB.confidence) : Math.round(judgeB.confidence * 100)}% confidence
                    </span>
                  )}
                  {judgeB.tower_verdict && (
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      judgeB.tower_verdict.toLowerCase() === 'accept'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      Tower: {judgeB.tower_verdict}
                    </span>
                  )}
                  {(judgeB.delivered_count != null || judgeB.requested_count != null) && (
                    <span className="text-[10px] text-gray-500 font-mono">
                      {judgeB.delivered_count ?? '?'}{judgeB.requested_count != null ? `/${judgeB.requested_count}` : ''} delivered
                    </span>
                  )}
                </div>
                {judgeB.reason && (
                  <p className="text-[11px] text-gray-700 leading-relaxed">{judgeB.reason}</p>
                )}
                <table className="text-[11px] mt-1">
                  <tbody>
                    <MetaField label="outcome" value={outcome || '—'} />
                    {judgeB.confidence != null && (
                      <MetaField label="confidence" value={`${judgeB.confidence > 1 ? Math.round(judgeB.confidence) : Math.round(judgeB.confidence * 100)}%`} />
                    )}
                    {judgeB.tower_verdict && <MetaField label="tower_verdict" value={judgeB.tower_verdict} />}
                    {judgeB.delivered_count != null && <MetaField label="delivered_count" value={String(judgeB.delivered_count)} />}
                    {judgeB.requested_count != null && <MetaField label="requested_count" value={String(judgeB.requested_count)} />}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2 border-b pb-1">
              Final Displayed Verdict
            </h4>
            <div className="flex items-center gap-3">
              <StatusBadge value={row.behaviour_result} type="behaviour" />
              <span className="text-[11px] text-gray-500">
                (as shown in the progress table for this run)
              </span>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function QaProgressPage() {
  const [rows, setRows] = useState<MetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>('benchmark');
  const [suiteFilter, setSuiteFilter] = useState<string>('');
  const [queryClassFilter, setQueryClassFilter] = useState<string>('');
  const [testIdFilter, setTestIdFilter] = useState<string>('');
  const [inspectRow, setInspectRow] = useState<MetricRow | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (sourceFilter) params.set('source', sourceFilter);
      const url = buildApiUrl(addDevAuthParams(`/api/qa-metrics/history?${params.toString()}`));
      const resp = await fetch(url, { credentials: 'include' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [sourceFilter]);

  const filteredRows = useMemo(() => {
    let r = rows;
    if (suiteFilter) r = r.filter(row => row.suite_id === suiteFilter);
    if (queryClassFilter) r = r.filter(row => row.query_class === queryClassFilter);
    if (testIdFilter) r = r.filter(row => row.benchmark_test_id === testIdFilter);
    return r;
  }, [rows, suiteFilter, queryClassFilter, testIdFilter]);

  const chartData = useMemo<ChartPoint[]>(() => {
    const sorted = [...filteredRows].sort((a, b) => toNumericTs(a.timestamp) - toNumericTs(b.timestamp));

    const EXCLUDED_STATUSES = ['UNKNOWN', 'NOT_APPLICABLE', 'TIMEOUT'];
    const behaviourScores = sorted.map(r => {
      if (EXCLUDED_STATUSES.includes(r.behaviour_result)) return null;
      const s = parseScore(r.behaviour_score);
      return s !== null ? s : statusToScore(r.behaviour_result, 'behaviour');
    });
    const systemScores = sorted.map(r => {
      if (r.system_status === 'TIMEOUT') return null;
      const s = parseScore(r.system_score);
      return s !== null ? s : statusToScore(r.system_status, 'system');
    });
    const towerScores = sorted.map(r => {
      if (EXCLUDED_STATUSES.includes(r.tower_result)) return null;
      const s = parseScore(r.tower_score);
      return s !== null ? s : statusToScore(r.tower_result, 'tower');
    });

    const behaviourAvgs = rollingAvg(behaviourScores, ROLLING_WINDOW);
    const systemAvgs = rollingAvg(systemScores, ROLLING_WINDOW);
    const towerAvgs = rollingAvg(towerScores, ROLLING_WINDOW);

    return sorted.map((r, i) => ({
      index: i + 1,
      timestamp: toNumericTs(r.timestamp),
      label: r.benchmark_test_id || r.query.slice(0, 30),
      behaviourScore: behaviourScores[i],
      systemScore: systemScores[i],
      towerScore: towerScores[i],
      behaviourAvg: behaviourAvgs[i],
      systemAvg: systemAvgs[i],
      towerAvg: towerAvgs[i],
    }));
  }, [filteredRows]);

  const uniqueSuites = useMemo(() => [...new Set(rows.map(r => r.suite_id).filter(Boolean))], [rows]);
  const uniqueClasses = useMemo(() => [...new Set(rows.map(r => r.query_class).filter(Boolean))], [rows]);
  const uniqueTestIds = useMemo(() => [...new Set(rows.map(r => r.benchmark_test_id).filter(Boolean))], [rows]);

  const tableRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => toNumericTs(b.timestamp) - toNumericTs(a.timestamp)).slice(0, 50);
  }, [filteredRows]);

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-6">
    <div className="max-w-[1400px] mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <a href="/dev/qa" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </a>
        <TrendingUp className="w-5 h-5 text-purple-600" />
        <h1 className="text-xl font-semibold text-gray-900">Agent Improvement Over Time</h1>
        <Button variant="ghost" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
        <span className="text-xs text-gray-400 ml-auto">{filteredRows.length} rows</span>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={sourceFilter}
          onChange={e => setSourceFilter(e.target.value)}
          className="text-xs border rounded px-2 py-1.5 bg-white"
        >
          <option value="benchmark">benchmark only</option>
          <option value="heuristic">heuristic only</option>
          <option value="">all sources</option>
        </select>
        <select
          value={suiteFilter}
          onChange={e => setSuiteFilter(e.target.value)}
          className="text-xs border rounded px-2 py-1.5 bg-white"
        >
          <option value="">all suites</option>
          {uniqueSuites.map(s => <option key={s} value={s!}>{s}</option>)}
        </select>
        <select
          value={queryClassFilter}
          onChange={e => setQueryClassFilter(e.target.value)}
          className="text-xs border rounded px-2 py-1.5 bg-white"
        >
          <option value="">all query classes</option>
          {uniqueClasses.map(c => <option key={c} value={c!}>{c}</option>)}
        </select>
        <select
          value={testIdFilter}
          onChange={e => setTestIdFilter(e.target.value)}
          className="text-xs border rounded px-2 py-1.5 bg-white"
        >
          <option value="">all test IDs</option>
          {uniqueTestIds.map(t => <option key={t} value={t!}>{t}</option>)}
        </select>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3 mb-4">{error}</div>
      )}

      {chartData.length > 0 ? (
        <div className="bg-white rounded-lg border p-4 mb-6">
          <div className="text-xs text-gray-500 mb-2">
            Rolling {ROLLING_WINDOW}-run averages (lines) and individual scores (dots). Nulls/unknowns excluded from averages.
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="index"
                tick={{ fontSize: 10 }}
                label={{ value: 'Benchmark run #', position: 'insideBottomRight', offset: -5, fontSize: 10 }}
              />
              <YAxis domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tick={{ fontSize: 10 }} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload as ChartPoint;
                  return (
                    <div className="bg-white border rounded shadow-sm p-2 text-xs max-w-[240px]">
                      <div className="font-medium mb-1">{d.label}</div>
                      <div className="text-gray-400">{formatTs(d.timestamp)}</div>
                      <div className="mt-1 space-y-0.5">
                        {d.behaviourScore !== null && <div>Behaviour: <span className="font-mono">{d.behaviourScore}</span> (avg: {d.behaviourAvg?.toFixed(2) ?? '—'})</div>}
                        {d.systemScore !== null && <div>System: <span className="font-mono">{d.systemScore}</span> (avg: {d.systemAvg?.toFixed(2) ?? '—'})</div>}
                        {d.towerScore !== null && <div>Tower: <span className="font-mono">{d.towerScore}</span> (avg: {d.towerAvg?.toFixed(2) ?? '—'})</div>}
                      </div>
                    </div>
                  );
                }}
              />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="behaviourAvg" name="Behaviour (avg)" stroke="#8b5cf6" strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="systemAvg" name="System (avg)" stroke="#3b82f6" strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="towerAvg" name="Tower (avg)" stroke="#10b981" strokeWidth={2} dot={false} connectNulls />
              <Scatter dataKey="behaviourScore" name="Behaviour" fill="#8b5cf6" fillOpacity={0.4} shape="circle" r={3} legendType="none" />
              <Scatter dataKey="systemScore" name="System" fill="#3b82f6" fillOpacity={0.4} shape="circle" r={3} legendType="none" />
              <Scatter dataKey="towerScore" name="Tower" fill="#10b981" fillOpacity={0.4} shape="circle" r={3} legendType="none" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : !loading ? (
        <div className="bg-white rounded-lg border p-8 text-center text-sm text-gray-400 mb-6">
          No benchmark data yet. Run the QA test suite to generate data.
        </div>
      ) : null}

      <div className="mb-4 border rounded-lg bg-gray-50/80 px-4 py-3">
        <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">What these scores mean</div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-[11px] text-gray-500 leading-relaxed">
          <div><span className="font-medium text-gray-700">System</span> — Did the run infrastructure behave reliably (no crash/timeout)?</div>
          <div><span className="font-medium text-gray-700">Agent</span> — Did the agent make the correct decision about what to do?</div>
          <div><span className="font-medium text-gray-700">Tower</span> — Was the mission execution result acceptable?</div>
          <div><span className="font-medium text-gray-700">Behaviour</span> — Did the system behave as the benchmark expected?</div>
        </div>
      </div>

      {tableRows.length > 0 && (
        <div className="bg-white rounded-lg border overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-gray-500">
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Test ID</th>
                <th className="px-3 py-2 font-medium">Query</th>
                <th className="px-3 py-2 font-medium">Class</th>
                <th className="px-3 py-2 font-medium">Suite</th>
                <th className="px-3 py-2 font-medium" title="Did the run infrastructure behave reliably (no crash/timeout)?">System</th>
                <th className="px-3 py-2 font-medium" title="Did the agent make the correct decision about what to do?">Agent</th>
                <th className="px-3 py-2 font-medium" title="Was the mission execution result acceptable?">Tower</th>
                <th className="px-3 py-2 font-medium" title="Did the system behave as the benchmark expected?">Behaviour</th>
                <th className="px-3 py-2 font-medium">AFR</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map(r => (
                <tr
                  key={r.id}
                  className="border-b last:border-0 hover:bg-purple-50/50 cursor-pointer transition-colors"
                  onClick={() => setInspectRow(r)}
                >
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap font-mono">{formatTs(r.timestamp)}</td>
                  <td className="px-3 py-2 font-medium text-purple-700">{r.benchmark_test_id || '—'}</td>
                  <td className="px-3 py-2 max-w-[200px] truncate" title={r.query}>{r.query}</td>
                  <td className="px-3 py-2 text-gray-500">{r.query_class || '—'}</td>
                  <td className="px-3 py-2 text-gray-500">{r.suite_id || '—'}</td>
                  <td className="px-3 py-2">
                    <StatusBadge value={r.system_status} type="system" />
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge value={r.agent_status} type="agent" />
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge value={r.tower_result} type="tower" />
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge value={r.behaviour_result} type="behaviour" />
                  </td>
                  <td className="px-3 py-2">
                    {r.run_id ? (
                      <a
                        href={`/dev/afr?run=${encodeURIComponent(r.run_id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-600 hover:text-purple-800 flex items-center gap-0.5"
                        onClick={e => e.stopPropagation()}
                      >
                        AFR <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 text-xs text-gray-400">
        <p>Source: qa_run_metrics table (Supabase). Default filter: source=benchmark.</p>
        <p>Rolling window: {ROLLING_WINDOW} runs. Null/UNKNOWN scores excluded from averages.</p>
        <p>Click any row to inspect stored Behaviour evaluation data.</p>
      </div>
    </div>

    <BehaviourInspectModal
      row={inspectRow}
      open={!!inspectRow}
      onClose={() => setInspectRow(null)}
    />
    </div>
  );
}

function StatusBadge({ value, type }: { value: string; type: 'system' | 'agent' | 'tower' | 'behaviour' }) {
  const colors: Record<string, string> = {
    HEALTHY: 'bg-green-100 text-green-800',
    PASS: 'bg-green-100 text-green-800',
    DEGRADED: 'bg-amber-100 text-amber-800',
    PARTIAL: 'bg-amber-100 text-amber-800',
    BROKEN: 'bg-red-100 text-red-700',
    FAIL: 'bg-red-100 text-red-700',
    TIMEOUT: 'bg-gray-100 text-gray-600',
    UNKNOWN: 'bg-gray-100 text-gray-500',
    NOT_APPLICABLE: 'bg-gray-100 text-gray-400',
  };
  const cls = colors[value] || 'bg-gray-100 text-gray-500';
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {value}
    </span>
  );
}
