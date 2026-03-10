import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearch } from 'wouter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ArrowLeft,
  Copy,
  Check,
  Search,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Play,
  FileText,
  Gavel,
  ChevronRight,
  Activity,
  ChevronDown,
  Package,
  Download,
} from 'lucide-react';
import { authedFetch, addDevAuthParams } from '@/lib/queryClient';

type Tab = 'runs' | 'detail' | 'judgements';

const RUNS_CACHE_KEY = 'afr_runs_cache';
const RUNS_CACHE_TTL = 60_000;
const PAGE_SIZE = 20;

interface AfrRun {
  id: string;
  created_at: string;
  goal_summary: string;
  vertical: string;
  status: string;
  client_request_id?: string;
  run_type?: string;
  score?: number | null;
  verdict?: string | null;
}

interface StreamEvent {
  id: string;
  ts: string;
  type: string;
  summary: string;
  details: {
    runType?: string;
    action?: string | null;
    task?: string | null;
    error?: string | null;
    durationMs?: number | null;
    results?: string | null;
  };
  status: string;
  run_id: string | null;
  client_request_id: string | null;
  router_decision?: string | null;
  router_reason?: string | null;
}

interface Judgement {
  id: string;
  evaluated_at: string;
  verdict: string;
  reason_code: string;
  explanation: string;
}

interface CachedRuns {
  runs: AfrRun[];
  ts: number;
}

function getCachedRuns(): AfrRun[] | null {
  try {
    const raw = sessionStorage.getItem(RUNS_CACHE_KEY);
    if (!raw) return null;
    const cached: CachedRuns = JSON.parse(raw);
    if (Date.now() - cached.ts > RUNS_CACHE_TTL) return null;
    return cached.runs;
  } catch {
    return null;
  }
}

function setCachedRuns(runs: AfrRun[]) {
  try {
    sessionStorage.setItem(RUNS_CACHE_KEY, JSON.stringify({ runs, ts: Date.now() }));
  } catch {}
}

function updateURLParams(params: Record<string, string | null>) {
  const url = new URL(window.location.href);
  Object.entries(params).forEach(([key, value]) => {
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  });
  window.history.replaceState({}, '', url.toString());
}

export default function AfrPage() {
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  const initialRunId = urlParams.get('run');

  const [tab, setTab] = useState<Tab>(initialRunId ? 'detail' : 'runs');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(initialRunId);
  const [selectedClientRequestId, setSelectedClientRequestId] = useState<string | null>(null);

  const handleRunClick = (run: AfrRun) => {
    setSelectedRunId(run.id);
    setSelectedClientRequestId(run.client_request_id || null);
    setTab('detail');
    updateURLParams({ run: run.id });
  };

  const handleBack = () => {
    setSelectedRunId(null);
    setSelectedClientRequestId(null);
    setTab('runs');
    updateURLParams({ run: null });
  };

  const handleTabChange = (newTab: Tab) => {
    if (newTab === 'runs') handleBack();
    else setTab(newTab);
  };

  return (
    <div className="p-4 md:p-6 space-y-4 h-full overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Agent Flight Recorder</h1>
          <p className="text-sm text-muted-foreground">Forensic viewer for agent runs, events, and judgements</p>
        </div>
      </div>

      <div className="flex gap-1 border-b pb-0">
        <TabBtn active={tab === 'runs'} onClick={() => handleTabChange('runs')} icon={<Activity className="w-3.5 h-3.5" />}>
          Runs
        </TabBtn>
        <TabBtn
          active={tab === 'detail'}
          onClick={() => setTab('detail')}
          disabled={!selectedRunId}
          icon={<FileText className="w-3.5 h-3.5" />}
        >
          Run Detail
        </TabBtn>
        <TabBtn active={tab === 'judgements'} onClick={() => handleTabChange('judgements')} icon={<Gavel className="w-3.5 h-3.5" />}>
          Judgement Ledger
        </TabBtn>
      </div>

      <div className="min-h-0">
        {tab === 'runs' && <RunsList onRunClick={handleRunClick} />}
        {tab === 'detail' && selectedRunId && (
          <RunDetail
            runId={selectedRunId}
            clientRequestId={selectedClientRequestId}
            onBack={handleBack}
            onViewJudgements={() => setTab('judgements')}
          />
        )}
        {tab === 'judgements' && <JudgementLedger runId={selectedRunId} />}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, disabled, icon, children }: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {icon}
      {children}
    </button>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-t animate-pulse">
      <td className="px-3 py-2.5"><div className="h-3.5 bg-muted rounded w-28" /></td>
      <td className="px-3 py-2.5"><div className="h-3.5 bg-muted rounded w-48" /></td>
      <td className="px-3 py-2.5"><div className="h-5 bg-muted rounded w-16" /></td>
      <td className="px-3 py-2.5"><div className="h-3.5 bg-muted rounded w-12" /></td>
      <td className="px-3 py-2.5"><div className="h-3.5 bg-muted rounded w-20" /></td>
      <td className="px-3 py-2.5"><div className="h-4 bg-muted rounded w-4" /></td>
    </tr>
  );
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      title={`Copy ${label || text}`}
    >
      <code className="bg-muted px-1.5 py-0.5 rounded text-[11px] font-mono max-w-[120px] truncate">
        {text.length > 12 ? text.slice(0, 8) + '...' : text}
      </code>
      {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status?.toLowerCase() || 'unknown';
  if (s === 'completed' || s === 'running' || s === 'success') {
    return (
      <Badge variant="outline" className="text-green-500 border-green-500/30 bg-green-500/10 text-xs">
        <CheckCircle2 className="w-3 h-3 mr-1" />
        {status}
      </Badge>
    );
  }
  if (s === 'failed' || s === 'error') {
    return (
      <Badge variant="outline" className="text-red-500 border-red-500/30 bg-red-500/10 text-xs">
        <XCircle className="w-3 h-3 mr-1" />
        {status}
      </Badge>
    );
  }
  if (s === 'executing' || s === 'in_progress' || s === 'pending') {
    return (
      <Badge variant="outline" className="text-blue-500 border-blue-500/30 bg-blue-500/10 text-xs">
        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
        {status}
      </Badge>
    );
  }
  if (s === 'stopped') {
    return (
      <Badge variant="outline" className="text-yellow-500 border-yellow-500/30 bg-yellow-500/10 text-xs">
        <AlertTriangle className="w-3 h-3 mr-1" />
        {status}
      </Badge>
    );
  }
  return <Badge variant="outline" className="text-xs">{status || 'unknown'}</Badge>;
}

function RunsList({ onRunClick }: { onRunClick: (run: AfrRun) => void }) {
  const [runs, setRuns] = useState<AfrRun[]>(() => getCachedRuns() || []);
  const [loading, setLoading] = useState(() => !getCachedRuns());
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [fetchMs, setFetchMs] = useState<number | null>(null);
  const mountRef = useRef(Date.now());
  const [bulkExportCount, setBulkExportCount] = useState(5);
  const [bulkExporting, setBulkExporting] = useState(false);

  const fetchRuns = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    const t0 = performance.now();
    try {
      const url = addDevAuthParams('/api/afr/runs?limit=50&all=true');
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = await res.json();
      setRuns(data);
      setCachedRuns(data);
      setFetchMs(Math.round(performance.now() - t0));
      const serverTiming = res.headers.get('Server-Timing');
      if (serverTiming) {
        console.log(`[AFR_PERF] Server-Timing: ${serverTiming}`);
      }
      console.log(`[AFR_PERF] Runs fetched in ${Math.round(performance.now() - t0)}ms (${data.length} runs)`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const cached = getCachedRuns();
    if (cached) {
      setRuns(cached);
      setLoading(false);
      console.log(`[AFR_PERF] Shell rendered from cache in ${Date.now() - mountRef.current}ms (${cached.length} cached runs)`);
      fetchRuns(true);
    } else {
      fetchRuns(false);
    }
  }, [fetchRuns]);

  const filtered = useMemo(() => {
    if (!search.trim()) return runs;
    const q = search.toLowerCase();
    return runs.filter(r =>
      r.goal_summary?.toLowerCase().includes(q) ||
      r.id?.toLowerCase().includes(q) ||
      r.client_request_id?.toLowerCase().includes(q) ||
      r.status?.toLowerCase().includes(q)
    );
  }, [runs, search]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  const tableHeader = (
    <thead>
      <tr className="bg-muted/50 text-left">
        <th className="px-3 py-2 font-medium">Created</th>
        <th className="px-3 py-2 font-medium">Goal / Summary</th>
        <th className="px-3 py-2 font-medium">Status</th>
        <th className="px-3 py-2 font-medium">Type</th>
        <th className="px-3 py-2 font-medium">Client Request ID</th>
        <th className="px-3 py-2 font-medium w-8"></th>
      </tr>
    </thead>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by goal, run ID, or clientRequestId..."
            value={search}
            onChange={e => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE); }}
            className="pl-9 h-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchRuns(true)} disabled={refreshing}>
          <RefreshCw className={`w-3 h-3 mr-1 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </Button>
        <span className="text-xs text-muted-foreground">
          {filtered.length} runs
          {fetchMs !== null && <span className="ml-1 opacity-60">({fetchMs}ms)</span>}
          {refreshing && <Loader2 className="w-3 h-3 inline ml-1 animate-spin" />}
        </span>

        <div className="flex items-center gap-1.5 ml-auto border-l pl-3 border-border">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Export last</span>
          <Input
            type="number"
            min={1}
            max={BULK_EXPORT_MAX}
            value={bulkExportCount}
            onChange={e => {
              const val = parseInt(e.target.value, 10);
              if (isNaN(val)) return;
              setBulkExportCount(Math.min(Math.max(1, val), BULK_EXPORT_MAX));
            }}
            onBlur={() => {
              setBulkExportCount(c => Math.min(Math.max(1, c), BULK_EXPORT_MAX));
            }}
            className="w-14 h-7 text-xs text-center px-1"
            disabled={bulkExporting}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={bulkExporting || loading || filtered.length === 0}
            className="h-7 text-xs"
            onClick={async () => {
              setBulkExporting(true);
              try {
                await exportMultipleRunsAsHtml(filtered, bulkExportCount);
              } catch (e: any) {
                console.error('[AFR Bulk Export] Failed:', e);
              } finally {
                setBulkExporting(false);
              }
            }}
          >
            {bulkExporting
              ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Exporting...</>
              : <><Download className="w-3 h-3 mr-1" /> Export {Math.min(bulkExportCount, filtered.length)} runs</>}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs ml-2"
            onClick={() => window.open('/dev/qa', '_blank')}
          >
            <Play className="w-3 h-3 mr-1" /> Open QA Test Runner
          </Button>
        </div>
      </div>

      {error && !runs.length ? (
        <div className="text-center py-12">
          <XCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <p className="text-sm text-red-400">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => fetchRuns(false)}>
            <RefreshCw className="w-3 h-3 mr-1" /> Retry
          </Button>
        </div>
      ) : loading && runs.length === 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            {tableHeader}
            <tbody>
              {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
            </tbody>
          </table>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">{search ? 'No runs match your search' : 'No runs found. Run a Supervisor demo to create one.'}</p>
        </div>
      ) : (
        <>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              {tableHeader}
              <tbody>
                {visible.map(run => (
                  <tr
                    key={run.id}
                    onClick={() => onRunClick(run)}
                    className="border-t hover:bg-muted/30 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      <Clock className="w-3 h-3 inline mr-1" />
                      {new Date(run.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 max-w-[300px] truncate">{run.goal_summary || 'Untitled'}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={run.status} /></td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{run.run_type || '-'}</td>
                    <td className="px-3 py-2.5">
                      {run.client_request_id ? (
                        <CopyButton text={run.client_request_id} label="clientRequestId" />
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
              >
                <ChevronDown className="w-3 h-3 mr-1" />
                Show more ({filtered.length - visibleCount} remaining)
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function escHtml(str: unknown): string {
  const s = String(str ?? '');
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatTs(ts: string | number | null | undefined): string {
  if (!ts) return '-';
  try { return new Date(ts).toISOString(); } catch { return String(ts); }
}

function prettyJson(val: any): string {
  if (val == null) return '';
  if (typeof val === 'string') {
    try { return JSON.stringify(JSON.parse(val), null, 2); } catch { return val; }
  }
  return JSON.stringify(val, null, 2);
}

const BULK_EXPORT_MAX = 15;

const KEY_EVENT_TYPES = new Set([
  'mission_extraction', 'mission_completeness_check', 'clarify_gate', 'constraint_gate',
  'pre_execution_constraint_gate', 'plan_created', 'plan_update', 'tower_verdict',
  'tower_call_started', 'stop', 'change_plan', 'block', 'execution_completed',
  'run_completed', 'run_failed', 'router_decision', 'supervisor_delegation',
  'clarify_resolution', 'run_started', 'search_places', 'deep_research',
]);

const IMPORTANT_ARTEFACT_TYPES = new Set([
  'mission_extraction', 'constraints_extracted', 'constraint_capability_check',
  'diagnostic', 'tower_judgement', 'clarify_gate', 'clarify_resolution',
  'intent_preview', 'run_configuration', 'leads_list', 'plan', 'plan_result',
  'plan_update',
]);

const HIGHLIGHT_PAYLOAD_FIELDS = [
  'raw_input', 'user_input', 'raw_user_input',
  'pass1_interpretation', 'semantic_interpretation', 'pass1',
  'pass2_structured', 'structured_mission', 'pass2',
  'constraint_types', 'constraints', 'constraint_type',
  'dropped_concepts', 'dropped',
  'recommended_action', 'action', 'recommended',
  'blocking_reason', 'why_blocked', 'block_reason',
  'clarify_question', 'question', 'questions', 'pending_questions',
  'verdict', 'tower_verdict',
  'suggested_changes', 'suggestions',
  'stop_reason', 'reason',
  'evidence_summary', 'evidence', 'rationale',
  'entity_type', 'business_type', 'location', 'location_text',
  'requested_count', 'count',
  'route', 'mode', 'scenario',
  'can_execute', 'explanation',
  'proxy_used', 'confidence',
];

const EXPORT_CSS = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; color: #1a1a1a; padding: 32px; max-width: 1200px; margin: 0 auto; line-height: 1.6; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    h2 { font-size: 16px; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 2px solid #e5e7eb; }
    h3 { font-size: 14px; margin: 16px 0 8px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th, td { border: 1px solid #d1d5db; padding: 6px 10px; text-align: left; vertical-align: top; font-size: 12px; }
    th { background: #f3f4f6; font-weight: 600; }
    .meta-grid { display: grid; grid-template-columns: 150px 1fr; gap: 4px 12px; margin-bottom: 16px; }
    .meta-grid dt { font-weight: 600; color: #6b7280; font-size: 12px; }
    .meta-grid dd { font-family: monospace; font-size: 12px; word-break: break-all; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
    .badge-completed, .badge-success, .badge-pass, .badge-accept { background: #dcfce7; color: #166534; }
    .badge-failed, .badge-fail, .badge-reject, .badge-error { background: #fee2e2; color: #991b1b; }
    .badge-running, .badge-executing, .badge-pending, .badge-started { background: #dbeafe; color: #1e40af; }
    .badge-stopped, .badge-clarifying, .badge-revise { background: #fef9c3; color: #854d0e; }
    pre { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 4px; padding: 8px 12px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; font-size: 11px; font-family: 'SF Mono', 'Fira Code', monospace; max-height: none; }
    .section-empty { color: #9ca3af; font-style: italic; padding: 12px 0; }

    .run-separator { border: none; border-top: 4px solid #4f46e5; margin: 56px 0 32px; }
    .run-header-block { background: linear-gradient(135deg, #eef2ff, #e0e7ff); border: 2px solid #818cf8; border-radius: 8px; padding: 16px 20px; margin-bottom: 20px; }
    .run-header-block h2 { margin: 0; border: none; padding: 0; font-size: 18px; color: #312e81; }
    .run-header-block .run-subtitle { margin-top: 6px; color: #4338ca; font-size: 12px; font-family: monospace; }
    .run-header-block .run-meta-row { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; color: #4b5563; }
    .run-header-block .run-meta-row span { display: inline-flex; align-items: center; gap: 4px; }

    .glance-box { background: #fffbeb; border: 1px solid #fbbf24; border-radius: 6px; padding: 14px 18px; margin-bottom: 20px; }
    .glance-box h3 { margin: 0 0 10px; font-size: 14px; color: #92400e; border: none; }
    .glance-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 6px 16px; font-size: 12px; }
    .glance-grid .glance-item { display: flex; gap: 6px; }
    .glance-grid .glance-label { font-weight: 600; color: #78716c; min-width: 100px; }
    .glance-grid .glance-value { color: #1c1917; }
    .glance-reason { margin-top: 10px; padding-top: 8px; border-top: 1px solid #fde68a; font-size: 12px; color: #92400e; }

    .key-moments { background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 14px 18px; margin-bottom: 20px; }
    .key-moments h3 { margin: 0 0 10px; font-size: 14px; color: #166534; border: none; }
    .key-moments ol { padding-left: 20px; margin: 0; }
    .key-moments li { margin-bottom: 4px; font-size: 12px; line-height: 1.5; }
    .key-moments .km-type { font-weight: 600; color: #15803d; }
    .key-moments .km-status { margin-left: 6px; }
    .key-moments .km-time { color: #6b7280; font-size: 11px; margin-left: 6px; }

    .event-row-important { background: #fefce8; }
    .event-row-fail { background: #fef2f2; }
    .event-row-clarify { background: #eff6ff; }
    .event-row { border-bottom: 1px solid #e5e7eb; padding: 8px 0; }
    .event-row:last-child { border-bottom: none; }

    .artefact-card { margin-bottom: 20px; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; }
    .artefact-card-important { border-color: #818cf8; border-width: 2px; }
    .artefact-card-header { padding: 10px 14px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; }
    .artefact-card-important .artefact-card-header { background: #eef2ff; }
    .artefact-card-header h3 { margin: 0; font-size: 13px; }
    .artefact-type-label { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-left: 8px; }
    .atl-mission { background: #dbeafe; color: #1e40af; }
    .atl-constraint { background: #fce7f3; color: #9d174d; }
    .atl-diagnostic { background: #e0e7ff; color: #3730a3; }
    .atl-tower { background: #fef3c7; color: #92400e; }
    .atl-clarify { background: #cffafe; color: #155e75; }
    .atl-plan { background: #d1fae5; color: #065f46; }
    .atl-leads { background: #dcfce7; color: #166534; }
    .atl-config { background: #f3e8ff; color: #6b21a8; }
    .artefact-card-body { padding: 12px 14px; }
    .artefact-summary-fields { margin-bottom: 12px; padding: 10px 12px; background: #fefce8; border: 1px solid #fde68a; border-radius: 4px; font-size: 12px; }
    .artefact-summary-fields dt { font-weight: 600; color: #78716c; margin-top: 4px; }
    .artefact-summary-fields dt:first-child { margin-top: 0; }
    .artefact-summary-fields dd { margin-left: 0; color: #1c1917; word-break: break-word; }
    .raw-payload-toggle { font-size: 11px; color: #6b7280; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #e5e7eb; }
    .raw-payload-toggle summary { cursor: pointer; font-weight: 600; }

    .toc { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px 18px; margin-bottom: 24px; }
    .toc h3 { margin: 0 0 8px; font-size: 14px; color: #334155; border: none; }
    .toc ol { padding-left: 20px; margin: 0; }
    .toc li { margin-bottom: 3px; font-size: 12px; }
    .toc a { color: #4f46e5; text-decoration: none; }
    .toc a:hover { text-decoration: underline; }

    @media print { body { padding: 16px; } h2 { break-before: auto; } pre { white-space: pre-wrap; } .run-separator { break-before: page; } details { open: true; } details[open] summary { display: none; } }
    @page { margin: 1.5cm; }
  `;

function exportBadgeClass(s: string): string {
  const sl = (s || '').toLowerCase();
  if (sl === 'completed' || sl === 'success' || sl === 'pass' || sl === 'accept' || sl === 'accept_with_unverified') return 'badge-completed';
  if (sl === 'failed' || sl === 'fail' || sl === 'reject' || sl === 'error') return 'badge-failed';
  if (sl === 'running' || sl === 'executing' || sl === 'pending' || sl === 'started') return 'badge-running';
  if (sl === 'stopped' || sl === 'clarifying' || sl === 'revise') return 'badge-stopped';
  return '';
}

function artefactTypeLabel(type: string): string {
  const t = (type || '').toLowerCase();
  if (t.includes('mission') || t === 'intent_preview') return '<span class="artefact-type-label atl-mission">Mission</span>';
  if (t.includes('constraint') || t === 'constraints_extracted' || t === 'constraint_capability_check') return '<span class="artefact-type-label atl-constraint">Constraint</span>';
  if (t === 'diagnostic') return '<span class="artefact-type-label atl-diagnostic">Diagnostic</span>';
  if (t.includes('tower') || t === 'tower_judgement') return '<span class="artefact-type-label atl-tower">Tower</span>';
  if (t.includes('clarify')) return '<span class="artefact-type-label atl-clarify">Clarify</span>';
  if (t.includes('plan')) return '<span class="artefact-type-label atl-plan">Plan</span>';
  if (t.includes('leads') || t === 'leads_list') return '<span class="artefact-type-label atl-leads">Leads</span>';
  if (t === 'run_configuration') return '<span class="artefact-type-label atl-config">Config</span>';
  return '';
}

function extractHighlightFields(payload: any): Array<{ key: string; value: string }> {
  if (!payload) return [];
  const obj = typeof payload === 'string' ? (() => { try { return JSON.parse(payload); } catch { return null; } })() : payload;
  if (!obj || typeof obj !== 'object') return [];
  const results: Array<{ key: string; value: string }> = [];
  for (const field of HIGHLIGHT_PAYLOAD_FIELDS) {
    if (field in obj && obj[field] != null) {
      const val = obj[field];
      const display = typeof val === 'object' ? JSON.stringify(val, null, 1) : String(val);
      if (display.length > 0 && display !== 'null' && display !== 'undefined') {
        results.push({ key: field, value: display.length > 500 ? display.slice(0, 500) + '...' : display });
      }
    }
  }
  return results;
}

interface RunGlance {
  goal: string;
  status: string;
  clarified: boolean;
  blocked: boolean;
  towerJudged: boolean;
  towerVerdict: string | null;
  missionCheckPassed: boolean | null;
  eventCount: number;
  artefactCount: number;
  judgementCount: number;
  keyReason: string | null;
  terminalState: string | null;
}

function extractRunGlance(
  runData: any,
  events: StreamEvent[],
  artefacts: Artefact[],
  judgements: Judgement[],
): RunGlance {
  const clarifyEvents = events.filter(ev =>
    ev.type?.toLowerCase().includes('clarify') || ev.status?.toLowerCase() === 'clarifying'
  );
  const blockEvents = events.filter(ev =>
    ev.type?.toLowerCase().includes('block') || ev.summary?.toLowerCase().includes('block')
  );
  const towerEvents = events.filter(ev =>
    ev.type?.toLowerCase().includes('tower')
  );
  const towerArtefacts = artefacts.filter(a => a.type === 'tower_judgement');

  let towerVerdict: string | null = null;
  if (towerArtefacts.length > 0) {
    const lastTower = towerArtefacts[towerArtefacts.length - 1];
    const p = typeof lastTower.payload_json === 'string'
      ? (() => { try { return JSON.parse(lastTower.payload_json); } catch { return null; } })()
      : lastTower.payload_json;
    towerVerdict = p?.verdict || null;
  }
  if (!towerVerdict && judgements.length > 0) {
    towerVerdict = judgements[judgements.length - 1].verdict || null;
  }

  const missionCheckArts = artefacts.filter(a =>
    a.type === 'constraint_capability_check' || a.type === 'mission_completeness_check'
  );
  let missionCheckPassed: boolean | null = null;
  if (missionCheckArts.length > 0) {
    const last = missionCheckArts[missionCheckArts.length - 1];
    const p = typeof last.payload_json === 'string'
      ? (() => { try { return JSON.parse(last.payload_json); } catch { return null; } })()
      : last.payload_json;
    if (p?.can_execute !== undefined) missionCheckPassed = !!p.can_execute;
    else if (p?.pass !== undefined) missionCheckPassed = !!p.pass;
  }

  let keyReason: string | null = null;
  const stopEvent = events.find(ev => ev.type?.toLowerCase().includes('stop') || ev.type?.toLowerCase().includes('block'));
  if (stopEvent) keyReason = stopEvent.summary || null;
  if (!keyReason && blockEvents.length > 0) keyReason = blockEvents[0].summary || null;
  const clarifyGate = artefacts.find(a => a.type === 'clarify_gate');
  if (!keyReason && clarifyGate) {
    const p = typeof clarifyGate.payload_json === 'string'
      ? (() => { try { return JSON.parse(clarifyGate.payload_json); } catch { return null; } })()
      : clarifyGate.payload_json;
    keyReason = p?.reason || p?.constraint_label || clarifyGate.summary || null;
  }

  return {
    goal: runData?.title || 'Unknown',
    status: runData?.status || 'unknown',
    clarified: clarifyEvents.length > 0 || artefacts.some(a => a.type?.includes('clarify')),
    blocked: blockEvents.length > 0 || artefacts.some(a => {
      if (a.type !== 'constraint_capability_check') return false;
      const p = typeof a.payload_json === 'string'
        ? (() => { try { return JSON.parse(a.payload_json); } catch { return null; } })()
        : a.payload_json;
      return p?.can_execute === false;
    }),
    towerJudged: towerEvents.length > 0 || towerArtefacts.length > 0 || judgements.length > 0,
    towerVerdict,
    missionCheckPassed,
    eventCount: events.length,
    artefactCount: artefacts.length,
    judgementCount: judgements.length,
    keyReason,
    terminalState: runData?.terminal_state || null,
  };
}

function buildGlanceHtml(glance: RunGlance): string {
  const yesNo = (v: boolean) => v ? '<strong style="color:#15803d">Yes</strong>' : 'No';
  const passFailNull = (v: boolean | null) => v === null ? '<span style="color:#9ca3af">N/A</span>' : v ? '<strong style="color:#15803d">Passed</strong>' : '<strong style="color:#dc2626">Failed</strong>';

  return `<div class="glance-box">
    <h3>At a Glance</h3>
    <div class="glance-grid">
      <div class="glance-item"><span class="glance-label">Goal:</span><span class="glance-value">${escHtml(glance.goal)}</span></div>
      <div class="glance-item"><span class="glance-label">Final status:</span><span class="glance-value"><span class="badge ${exportBadgeClass(glance.status)}">${escHtml(glance.status)}</span></span></div>
      <div class="glance-item"><span class="glance-label">Clarified:</span><span class="glance-value">${yesNo(glance.clarified)}</span></div>
      <div class="glance-item"><span class="glance-label">Blocked:</span><span class="glance-value">${yesNo(glance.blocked)}</span></div>
      <div class="glance-item"><span class="glance-label">Tower judged:</span><span class="glance-value">${yesNo(glance.towerJudged)}${glance.towerVerdict ? ` — <span class="badge ${exportBadgeClass(glance.towerVerdict)}">${escHtml(glance.towerVerdict)}</span>` : ''}</span></div>
      <div class="glance-item"><span class="glance-label">Mission check:</span><span class="glance-value">${passFailNull(glance.missionCheckPassed)}</span></div>
      <div class="glance-item"><span class="glance-label">Events:</span><span class="glance-value">${glance.eventCount}</span></div>
      <div class="glance-item"><span class="glance-label">Artefacts:</span><span class="glance-value">${glance.artefactCount}</span></div>
      <div class="glance-item"><span class="glance-label">Judgements:</span><span class="glance-value">${glance.judgementCount}</span></div>
      ${glance.terminalState ? `<div class="glance-item"><span class="glance-label">Terminal state:</span><span class="glance-value">${escHtml(glance.terminalState)}</span></div>` : ''}
    </div>
    ${glance.keyReason ? `<div class="glance-reason"><strong>Key reason:</strong> ${escHtml(glance.keyReason)}</div>` : ''}
  </div>`;
}

function buildKeyMomentsHtml(events: StreamEvent[]): string {
  const keyEvents = events.filter(ev => {
    const t = (ev.type || '').toLowerCase();
    if (KEY_EVENT_TYPES.has(t)) return true;
    const s = (ev.status || '').toLowerCase();
    if (s === 'failed' || s === 'error' || s === 'stopped') return true;
    const sum = (ev.summary || '').toLowerCase();
    if (sum.includes('clarif') || sum.includes('block') || sum.includes('tower') || sum.includes('stop') || sum.includes('mission')) return true;
    return false;
  });

  if (keyEvents.length === 0) {
    return '';
  }

  let html = '<div class="key-moments"><h3>Key Moments</h3><ol>';
  keyEvents.forEach(ev => {
    const statusBadge = ev.status ? `<span class="km-status badge ${exportBadgeClass(ev.status)}">${escHtml(ev.status)}</span>` : '';
    const time = ev.ts ? `<span class="km-time">${escHtml(formatTs(ev.ts))}</span>` : '';
    const summary = ev.summary ? ` — ${escHtml(ev.summary.length > 120 ? ev.summary.slice(0, 120) + '...' : ev.summary)}` : '';
    html += `<li><span class="km-type">${escHtml(ev.type)}</span>${summary} ${statusBadge} ${time}</li>`;
  });
  html += '</ol></div>';
  return html;
}

function eventRowClass(ev: StreamEvent): string {
  const t = (ev.type || '').toLowerCase();
  const s = (ev.status || '').toLowerCase();
  if (s === 'failed' || s === 'error') return 'event-row-fail';
  if (t.includes('clarify') || s === 'clarifying') return 'event-row-clarify';
  if (KEY_EVENT_TYPES.has(t) || t.includes('tower') || t.includes('stop') || t.includes('block')) return 'event-row-important';
  return '';
}

async function fetchRunExportData(
  runId: string,
  clientRequestId: string | null,
): Promise<{ runData: any; events: StreamEvent[]; artefacts: Artefact[]; judgements: Judgement[] }> {
  const fetchJson = async (path: string) => {
    const url = addDevAuthParams(path);
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json();
  };

  let runData: any = null;
  let events: StreamEvent[] = [];
  let artefacts: Artefact[] = [];
  let judgements: Judgement[] = [];

  const streamPromise = clientRequestId
    ? fetchJson(`/api/afr/stream?client_request_id=${encodeURIComponent(clientRequestId)}`)
    : fetchJson(`/api/afr/runs/${encodeURIComponent(runId)}`);
  const artefactsPromise = fetchJson(`/api/afr/runs/${encodeURIComponent(runId)}/artefacts`);
  const judgementsPromise = fetchJson(`/api/afr/judgements?run_id=${encodeURIComponent(runId)}`);

  const [streamResult, artefactsResult, judgementsResult] = await Promise.all([
    streamPromise, artefactsPromise, judgementsPromise,
  ]);

  if (streamResult) {
    if (streamResult.events) {
      events = [...streamResult.events].sort(
        (a: StreamEvent, b: StreamEvent) => new Date(a.ts).getTime() - new Date(b.ts).getTime()
      );
      runData = {
        title: streamResult.title || 'Agent Run',
        status: streamResult.status || 'unknown',
        run_id: streamResult.run_id || runId,
        client_request_id: streamResult.client_request_id || clientRequestId,
        conversation_id: streamResult.conversation_id || null,
        is_terminal: streamResult.is_terminal,
        terminal_state: streamResult.terminal_state,
        created_at: streamResult.created_at,
        updated_at: streamResult.updated_at,
        run_type: streamResult.run_type,
      };
    } else if (streamResult.run) {
      const r = streamResult.run;
      runData = {
        title: r.goal_summary || 'Agent Run',
        status: r.status || 'unknown',
        run_id: runId,
        client_request_id: r.client_request_id || clientRequestId,
        conversation_id: r.conversation_id || null,
        created_at: r.created_at,
        updated_at: r.updated_at,
        run_type: r.run_type || r.vertical,
      };
      events = (streamResult.activities || []).map((a: any) => ({
        id: a.id,
        ts: a.timestamp,
        type: a.runType || a.type || 'activity',
        summary: a.label || a.action || 'Activity',
        details: {
          action: a.action,
          durationMs: a.durationMs,
          error: a.error,
          results: a.results ? (typeof a.results === 'string' ? a.results : JSON.stringify(a.results)) : null,
        },
        status: a.status,
        run_id: runId,
        client_request_id: null,
      }));
    }
  }

  if (artefactsResult) {
    artefacts = Array.isArray(artefactsResult) ? artefactsResult : (artefactsResult?.rows ?? []);
  }

  if (judgementsResult?.judgements) {
    judgements = judgementsResult.judgements;
  }

  return { runData, events, artefacts, judgements };
}

interface BenchmarkMeta {
  benchmark_test_id: string | null;
  query: string | null;
  query_class: string | null;
  expected_mode: string | null;
  behaviour_result: string | null;
  metadata: any;
}

function buildBenchmarkSectionHtml(bm: BenchmarkMeta): string {
  const meta = typeof bm.metadata === 'string' ? (() => { try { return JSON.parse(bm.metadata); } catch { return {}; } })() : (bm.metadata || {});
  const llmResp = meta.behaviour_llm_response || null;
  const evalPacket = meta.behaviour_eval_packet || null;
  const bd = meta.behaviour_decision || {};
  const expectedOutcome = meta.expected_outcome_text || meta.expectedOutcome || bm.expected_mode || '—';
  const expectedBehaviour = meta.expected_behaviour_text || bm.expected_mode || '—';
  const bEvalMode = meta.behaviour_eval_mode || llmResp?.eval_mode || 'unknown';

  const derivedSource: string = meta.behaviour_source_of_truth || (bEvalMode.startsWith('llm') && !bEvalMode.includes('error') && !bEvalMode.includes('parse_error') ? 'llm' : bEvalMode === 'fallback_legacy' ? 'fallback_legacy' : 'unknown');
  const bResult = derivedSource === 'llm'
    ? (llmResp?.behaviour_result?.toUpperCase() || bm.behaviour_result || bd.result || '—')
    : (bm.behaviour_result || bd.result || llmResp?.behaviour_result?.toUpperCase() || '—');
  const bReason = derivedSource === 'llm'
    ? (llmResp?.behaviour_reason || meta.behaviour_reason || bd.reason || '—')
    : (meta.behaviour_reason || bd.reason || llmResp?.behaviour_reason || '—');
  const bExpectedCheck = meta.behaviour_expected_outcome_check || llmResp?.expected_outcome_check || bd.expected || '—';
  const bObservedCheck = meta.behaviour_observed_outcome_check || llmResp?.observed_outcome_check || bd.observed || '—';
  const bFailureType = meta.behaviour_key_failure_type || llmResp?.key_failure_type || 'none';
  const bConfidence = meta.behaviour_confidence ?? llmResp?.confidence ?? null;

  const sourceOfTruth: string = derivedSource;
  const fallbackUsed: boolean = meta.behaviour_fallback_used ?? (sourceOfTruth !== 'llm');
  const fallbackReason: string | null = meta.fallback_reason || null;
  const evalParseOk: boolean | null = meta.behaviour_eval_parse_ok ?? (llmResp ? true : null);
  const evalResponseRaw: string | null = meta.behaviour_eval_response_raw || null;

  const isPass = bResult === 'PASS' || bResult === 'pass';
  const isFail = bResult === 'FAIL' || bResult === 'fail';
  const borderColor = isPass ? '#bbf7d0' : isFail ? '#fecaca' : '#e5e7eb';
  const bgColor = isPass ? '#f0fdf4' : isFail ? '#fef2f2' : '#f9fafb';
  const headingColor = isPass ? '#15803d' : isFail ? '#dc2626' : '#6b7280';

  const sourceLabel = sourceOfTruth === 'llm' ? 'LLM evaluator' : sourceOfTruth === 'fallback_legacy' ? 'Fallback legacy logic' : 'Unknown';
  const sourceBg = sourceOfTruth === 'llm' ? '#dbeafe' : sourceOfTruth === 'fallback_legacy' ? '#fef3c7' : '#f3f4f6';
  const sourceColor = sourceOfTruth === 'llm' ? '#1e40af' : sourceOfTruth === 'fallback_legacy' ? '#92400e' : '#6b7280';
  const sourceBorder = sourceOfTruth === 'llm' ? '#93c5fd' : sourceOfTruth === 'fallback_legacy' ? '#fcd34d' : '#d1d5db';

  const MODE_LABELS: Record<string, string> = {
    deliver_results: 'Deliver results matching the query',
    clarify: 'Clarify before running (missing info)',
    honest_refusal: 'Honest refusal (impossible/fictional)',
    best_effort_honest: 'Best effort delivery or clarify',
  };
  const expectedBehaviourLabel = MODE_LABELS[expectedBehaviour] || expectedBehaviour;

  const rowStyle = 'padding:3px 14px 3px 0; font-weight:600; color:#4b5563; vertical-align:top;';
  const valStyle = 'padding:3px 0; vertical-align:top;';

  let html = `<div style="margin:16px 0 12px 0; padding:12px 18px; border:2px solid ${sourceBorder}; border-radius:8px; background:${sourceBg};">
    <div style="font-size:13px; color:${sourceColor}; line-height:1.6;">
      <strong>Behaviour source:</strong> ${escHtml(sourceLabel)}<br/>
      <strong>Behaviour result:</strong> <span class="badge ${exportBadgeClass(bResult)}" style="font-size:12px; font-weight:700;">${escHtml(bResult)}</span><br/>
      <strong>Why:</strong> ${escHtml(bReason)}
    </div>
    <div style="margin-top:8px; padding-top:8px; border-top:1px solid ${sourceBorder}; font-size:11px; color:${sourceColor};">
      Behaviour verdict shown in harness was driven by: <strong>${escHtml(sourceLabel)}</strong>
    </div>
  </div>`;

  html += `<div class="benchmark-section" style="margin:16px 0; padding:14px 18px; border:2px solid #c7d2fe; border-radius:8px; background:#eef2ff;">
    <h3 style="margin:0 0 10px 0; color:#4338ca; font-size:14px;">1. Benchmark Expectation</h3>
    <table style="width:auto; margin:0; font-size:12px; border-collapse:collapse;">
      <tr><td style="${rowStyle}">Test ID:</td><td style="${valStyle}">${escHtml(bm.benchmark_test_id || '—')}</td></tr>
      <tr><td style="${rowStyle}">Original query:</td><td style="${valStyle}">${escHtml(evalPacket?.original_query || bm.query || '—')}</td></tr>
      <tr><td style="${rowStyle}">Query class:</td><td style="${valStyle}">${escHtml(bm.query_class || '—')}</td></tr>
      <tr><td style="${rowStyle}">Expected outcome:</td><td style="${valStyle}">${escHtml(expectedOutcome)}</td></tr>
      <tr><td style="${rowStyle}">Expected behaviour:</td><td style="${valStyle}">${escHtml(expectedBehaviourLabel)}</td></tr>
    </table>
  </div>`;

  html += `<div class="behaviour-result-section" style="margin:16px 0; padding:14px 18px; border:2px solid ${borderColor}; border-radius:8px; background:${bgColor};">
    <h3 style="margin:0 0 10px 0; color:${headingColor}; font-size:14px;">2. Behaviour Result</h3>
    <table style="width:auto; margin:0; font-size:12px; border-collapse:collapse;">
      <tr><td style="${rowStyle}">Final result:</td><td style="${valStyle}"><span class="badge ${exportBadgeClass(bResult)}" style="font-size:13px; font-weight:700;">${escHtml(bResult)}</span></td></tr>
      <tr><td style="${rowStyle}">Source of truth:</td><td style="${valStyle}"><strong style="color:${sourceColor};">${escHtml(sourceLabel)}</strong></td></tr>
      <tr><td style="${rowStyle}">Eval mode:</td><td style="${valStyle}"><code>${escHtml(bEvalMode)}</code></td></tr>
      <tr><td style="${rowStyle}">Fallback used?</td><td style="${valStyle}">${fallbackUsed ? '<strong style="color:#b45309">Yes</strong>' : 'No'}</td></tr>
      ${fallbackReason ? `<tr><td style="${rowStyle}">Fallback reason:</td><td style="${valStyle}">${escHtml(fallbackReason)}</td></tr>` : ''}
    </table>
  </div>`;

  if (evalPacket) {
    const outcome = evalPacket.final_run_outcome || {};
    const runState = outcome.run_state || evalPacket.actual_run_state || '—';
    const clarified = outcome.clarified ?? evalPacket.clarified ?? false;
    const clarifyQ = outcome.clarify_question || evalPacket.clarify_question || '';
    const clarifyA = outcome.clarify_answer || evalPacket.clarify_answer || '';
    const deliveredCount = outcome.delivered_count ?? evalPacket.delivered_count ?? '—';

    const entities = Array.isArray(evalPacket.delivered_results)
      ? evalPacket.delivered_results
      : Array.isArray(evalPacket.delivered_entities) ? evalPacket.delivered_entities : [];
    const evidence = Array.isArray(evalPacket.delivered_result_evidence)
      ? evalPacket.delivered_result_evidence
      : Array.isArray(evalPacket.evidence_summary) ? evalPacket.evidence_summary : [];

    const visibleSummary = evalPacket.user_visible_summary || evalPacket.behaviour_observed_summary || '';

    html += `<div class="behaviour-packet-section" style="margin:16px 0; padding:14px 18px; border:2px solid #ddd6fe; border-radius:8px; background:#f5f3ff;">
      <h3 style="margin:0 0 10px 0; color:#6d28d9; font-size:14px;">3. Behaviour Evaluation Packet</h3>
      <table style="width:auto; margin:0; font-size:12px; border-collapse:collapse;">
        <tr><td style="${rowStyle}">Run state:</td><td style="${valStyle}"><code>${escHtml(String(runState))}</code></td></tr>
        <tr><td style="${rowStyle}">Clarified:</td><td style="${valStyle}">${clarified ? '<strong style="color:#b45309">Yes</strong>' : 'No'}</td></tr>
        ${clarifyQ ? `<tr><td style="${rowStyle}">Clarify question:</td><td style="${valStyle}">${escHtml(clarifyQ)}</td></tr>` : ''}
        ${clarifyA ? `<tr><td style="${rowStyle}">Clarify answer:</td><td style="${valStyle}">${escHtml(clarifyA)}</td></tr>` : ''}
        <tr><td style="${rowStyle}">Delivered count:</td><td style="${valStyle}">${deliveredCount}</td></tr>
      </table>`;

    if (entities.length > 0) {
      const evidenceByEntity: Record<string, typeof evidence> = {};
      for (const ev of evidence) {
        const key = (ev.entity_name || '').toLowerCase().trim();
        if (!evidenceByEntity[key]) evidenceByEntity[key] = [];
        evidenceByEntity[key].push(ev);
      }

      html += `<div style="margin-top:8px;"><strong style="font-size:12px; color:#4b5563;">Delivered results:</strong>
        <ul style="margin:4px 0 0 16px; padding:0; font-size:11px; color:#374151;">`;
      for (const e of entities.slice(0, 10)) {
        const name = e.name || e.entity_name || 'Unknown';
        const loc = e.location || e.address || '';
        const website = e.website || e.url || '';
        html += `<li style="margin-bottom:6px;"><strong>${escHtml(name)}</strong>`;
        if (loc) html += ` <span style="color:#6b7280;">(${escHtml(loc)})</span>`;
        if (website) html += `<br/><span style="color:#3b82f6; font-size:10px;">${escHtml(website.length > 80 ? website.slice(0, 80) + '...' : website)}</span>`;

        const rawEvidence: any[] = Array.isArray(e.evidence) ? e.evidence : [];
        const inlineSnippets: string[] = rawEvidence
          .map((item: any) => typeof item === 'string' ? item : (item?.snippet || item?.quote || item?.summary || ''))
          .filter((s: string) => s.length > 0);
        const matchedEvidence = evidenceByEntity[(name || '').toLowerCase().trim()] || [];

        if (inlineSnippets.length > 0) {
          for (const snippet of inlineSnippets.slice(0, 2)) {
            const display = snippet.length > 140 ? snippet.slice(0, 140) + '...' : snippet;
            html += `<br/><em style="color:#059669; font-size:10px;">"${escHtml(display)}"</em>`;
          }
        } else if (matchedEvidence.length > 0) {
          for (const ev of matchedEvidence.slice(0, 2)) {
            const quote = ev.quote || ev.matched_quote || '';
            if (quote) {
              const display = quote.length > 140 ? quote.slice(0, 140) + '...' : quote;
              html += `<br/><em style="color:#059669; font-size:10px;">"${escHtml(display)}"</em>`;
            }
            if (ev.source_url) html += `<br/><span style="color:#3b82f6; font-size:10px;">Source: ${escHtml(ev.source_url.length > 80 ? ev.source_url.slice(0, 80) + '...' : ev.source_url)}</span>`;
          }
        } else {
          html += `<br/><span style="color:#9ca3af; font-size:10px; font-style:italic;">No supporting evidence attached</span>`;
        }
        html += `</li>`;
      }
      if (entities.length > 10) html += `<li style="color:#6b7280;">...and ${entities.length - 10} more</li>`;
      html += `</ul></div>`;
    }

    if (visibleSummary) {
      html += `<div style="margin-top:8px;"><strong style="font-size:12px; color:#4b5563;">User-visible summary:</strong>
        <p style="margin:2px 0 0 0; font-size:11px; color:#374151;">${escHtml(visibleSummary)}</p></div>`;
    }

    html += `</div>`;
  }

  const hasLlmResponse = !!(llmResp || evalResponseRaw);
  if (hasLlmResponse) {
    html += `<div class="behaviour-llm-response-section" style="margin:16px 0; padding:14px 18px; border:2px solid #a7f3d0; border-radius:8px; background:#ecfdf5;">
      <h3 style="margin:0 0 10px 0; color:#065f46; font-size:14px;">4. Behaviour LLM Response</h3>
      <table style="width:auto; margin:0; font-size:12px; border-collapse:collapse;">
        <tr><td style="${rowStyle}">Result:</td><td style="${valStyle}"><span class="badge ${exportBadgeClass(bResult)}" style="font-size:13px; font-weight:700;">${escHtml(bResult)}</span></td></tr>
        <tr><td style="${rowStyle}">Reason:</td><td style="${valStyle} max-width:600px;">${escHtml(bReason)}</td></tr>
        <tr><td style="${rowStyle}">Expected outcome check:</td><td style="${valStyle}">${escHtml(bExpectedCheck)}</td></tr>
        <tr><td style="${rowStyle}">Observed outcome check:</td><td style="${valStyle}">${escHtml(bObservedCheck)}</td></tr>
        <tr><td style="${rowStyle}">Key failure type:</td><td style="${valStyle}"><code>${escHtml(bFailureType)}</code></td></tr>
        <tr><td style="${rowStyle}">Confidence:</td><td style="${valStyle}">${bConfidence != null ? String(bConfidence) : '—'}</td></tr>
        <tr><td style="${rowStyle}">Parse OK?</td><td style="${valStyle}">${evalParseOk === true ? 'Yes' : evalParseOk === false ? '<strong style="color:#dc2626">No</strong>' : '—'}</td></tr>
      </table>
    </div>`;
  }

  html += `<details class="raw-payload-toggle" style="margin-bottom:6px;">
    <summary>Full behaviour_eval_packet (JSON)</summary>
    <pre>${escHtml(prettyJson(evalPacket || { note: 'No eval packet persisted for this run' }))}</pre>
  </details>`;

  html += `<details class="raw-payload-toggle" style="margin-bottom:6px;">
    <summary>Full parsed behaviour_eval_response (JSON)</summary>
    <pre>${escHtml(prettyJson(llmResp || { note: 'No LLM response persisted for this run' }))}</pre>
  </details>`;

  if (evalResponseRaw) {
    html += `<details class="raw-payload-toggle" style="margin-bottom:6px;">
      <summary>Raw behaviour_eval_response_raw (text)</summary>
      <pre>${escHtml(evalResponseRaw)}</pre>
    </details>`;
  }

  html += `<details class="raw-payload-toggle" style="margin-bottom:12px;">
    <summary>Full benchmark metadata (JSON)</summary>
    <pre>${escHtml(prettyJson({ benchmark_test_id: bm.benchmark_test_id, query: bm.query, query_class: bm.query_class, expected_mode: bm.expected_mode, behaviour_result: bm.behaviour_result, metadata: meta }))}</pre>
  </details>`;

  return html;
}

async function fetchBenchmarkMetaForRuns(runIds: string[]): Promise<Record<string, BenchmarkMeta>> {
  if (runIds.length === 0) return {};
  try {
    const resp = await authedFetch(addDevAuthParams('/api/qa-metrics/by-runs'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runIds }),
    });
    if (!resp.ok) return {};
    const json = await resp.json();
    return json.data || {};
  } catch {
    return {};
  }
}

function buildRunSectionHtml(
  runData: any,
  runId: string,
  clientRequestId: string | null,
  events: StreamEvent[],
  artefacts: Artefact[],
  judgements: Judgement[],
  sectionPrefix: string,
  runIndex?: number,
  totalRuns?: number,
  benchmarkMeta?: BenchmarkMeta | null,
): string {
  const glance = extractRunGlance(runData, events, artefacts, judgements);

  const anchorId = `run-${runIndex ?? 0}`;
  const headerLabel = (runIndex != null && totalRuns != null)
    ? `Run ${runIndex + 1} of ${totalRuns}`
    : 'Run Details';

  let headerHtml = `<div class="run-header-block" id="${anchorId}">
    <h2>${escHtml(headerLabel)}: ${escHtml(runData?.title || 'Untitled')}</h2>
    <div class="run-subtitle">
      Run ID: ${escHtml(runData?.run_id || runId)} &nbsp;|&nbsp;
      CRID: ${escHtml(runData?.client_request_id || clientRequestId || '-')}
    </div>
    <div class="run-meta-row">
      <span><strong>Status:</strong> <span class="badge ${exportBadgeClass(runData?.status || '')}">${escHtml(runData?.status || 'unknown')}</span></span>
      ${runData?.terminal_state ? `<span><strong>Terminal:</strong> ${escHtml(runData.terminal_state)}</span>` : ''}
      ${glance.towerVerdict ? `<span><strong>Verdict:</strong> <span class="badge ${exportBadgeClass(glance.towerVerdict)}">${escHtml(glance.towerVerdict)}</span></span>` : ''}
      <span><strong>Type:</strong> ${escHtml(runData?.run_type || '-')}</span>
      <span><strong>Created:</strong> ${escHtml(formatTs(runData?.created_at))}</span>
      ${runData?.updated_at ? `<span><strong>Updated:</strong> ${escHtml(formatTs(runData.updated_at))}</span>` : ''}
      ${runData?.conversation_id ? `<span><strong>Conv:</strong> ${escHtml(String(runData.conversation_id).slice(0, 12))}...</span>` : ''}
    </div>
  </div>`;

  const glanceHtml = buildGlanceHtml(glance);

  let behaviourGlanceLine = '';
  if (benchmarkMeta) {
    const bmMeta = typeof benchmarkMeta.metadata === 'string' ? (() => { try { return JSON.parse(benchmarkMeta.metadata); } catch { return {}; } })() : (benchmarkMeta.metadata || {});
    const bmLlmResp = bmMeta.behaviour_llm_response || null;
    const bmBd = bmMeta.behaviour_decision || {};
    const bmBResult = bmLlmResp?.behaviour_result?.toUpperCase() || bmBd.result || benchmarkMeta.behaviour_result || '—';
    const bmBReason = bmMeta.behaviour_reason || bmLlmResp?.behaviour_reason || bmBd.reason || '—';
    const bmEvalMode = bmMeta.behaviour_eval_mode || bmLlmResp?.eval_mode || 'unknown';
    const bmSource = bmMeta.behaviour_source_of_truth || (bmEvalMode.startsWith('llm') && !bmEvalMode.includes('error') && !bmEvalMode.includes('parse_error') ? 'LLM' : bmEvalMode === 'fallback_legacy' ? 'Fallback legacy' : 'Unknown');
    const bmSourceLabel = bmSource === 'llm' ? 'LLM' : bmSource === 'fallback_legacy' ? 'Fallback legacy' : bmSource;
    const bmIsPass = bmBResult === 'PASS' || bmBResult === 'pass';
    const bmIsFail = bmBResult === 'FAIL' || bmBResult === 'fail';
    const bmLineColor = bmIsPass ? '#166534' : bmIsFail ? '#991b1b' : '#6b7280';
    const bmLineBg = bmIsPass ? '#dcfce7' : bmIsFail ? '#fee2e2' : '#f3f4f6';
    behaviourGlanceLine = `<div style="margin:-12px 0 20px 0; padding:8px 18px; border-radius:0 0 6px 6px; background:${bmLineBg}; border:1px solid ${bmIsPass ? '#bbf7d0' : bmIsFail ? '#fecaca' : '#d1d5db'}; border-top:none; font-size:12px; color:${bmLineColor}; line-height:1.5;">
      <strong>Behaviour source:</strong> ${escHtml(bmSourceLabel)} &nbsp;|&nbsp;
      <strong>Behaviour result:</strong> <span class="badge ${exportBadgeClass(bmBResult)}" style="font-weight:700;">${escHtml(bmBResult)}</span> &nbsp;|&nbsp;
      <strong>Why:</strong> ${escHtml(bmBReason.length > 100 ? bmBReason.slice(0, 100) + '...' : bmBReason)}
    </div>`;
  }

  const keyMomentsHtml = buildKeyMomentsHtml(events);

  let eventsHtml = '';
  if (events.length === 0) {
    eventsHtml = '<p class="section-empty">No events recorded.</p>';
  } else {
    eventsHtml = '<table><thead><tr><th>#</th><th>Timestamp</th><th>Type</th><th>Status</th><th>Summary</th></tr></thead><tbody>';
    events.forEach((ev, i) => {
      const rowCls = eventRowClass(ev);
      const summaryText = ev.summary || '';
      const truncated = summaryText.length > 150 ? summaryText.slice(0, 150) + '...' : summaryText;
      eventsHtml += `<tr class="${rowCls}">
        <td>${i + 1}</td>
        <td style="white-space:nowrap; font-size:11px;">${escHtml(formatTs(ev.ts))}</td>
        <td><code style="font-weight:${KEY_EVENT_TYPES.has((ev.type || '').toLowerCase()) ? '700' : '400'}">${escHtml(ev.type)}</code></td>
        <td><span class="badge ${exportBadgeClass(ev.status)}">${escHtml(ev.status)}</span></td>
        <td title="${escHtml(summaryText)}">${escHtml(truncated)}</td>
      </tr>`;
    });
    eventsHtml += '</tbody></table>';

    const eventsWithDetails = events.filter(ev => ev.details && Object.values(ev.details).some(v => v != null));
    if (eventsWithDetails.length > 0) {
      eventsHtml += '<h3>Event Details</h3>';
      eventsWithDetails.forEach((ev) => {
        const rowCls = eventRowClass(ev);
        eventsHtml += `<div class="event-row ${rowCls}" style="padding:8px 0;">
          <strong>${escHtml(ev.type)}</strong> &mdash; ${escHtml(formatTs(ev.ts))}`;
        if (ev.details.action) eventsHtml += `<br/><strong>Action:</strong> <code>${escHtml(ev.details.action)}</code>`;
        if (ev.details.durationMs != null) eventsHtml += `<br/><strong>Duration:</strong> ${ev.details.durationMs}ms`;
        if (ev.details.error) eventsHtml += `<br/><strong style="color:#dc2626">Error:</strong> <span style="color:#dc2626">${escHtml(ev.details.error)}</span>`;
        if (ev.details.results) {
          const highlighted = extractHighlightFields(ev.details.results);
          if (highlighted.length > 0) {
            eventsHtml += '<br/><div class="artefact-summary-fields"><dl style="margin:0">';
            highlighted.forEach(h => {
              eventsHtml += `<dt>${escHtml(h.key)}</dt><dd>${escHtml(h.value)}</dd>`;
            });
            eventsHtml += '</dl></div>';
          }
        }
        eventsHtml += `<details class="raw-payload-toggle"><summary>Raw payload</summary><pre>${escHtml(prettyJson(ev.details))}</pre></details>`;
        eventsHtml += '</div>';
      });
    }
  }

  let artefactsHtml = '';
  if (artefacts.length === 0) {
    artefactsHtml = '<p class="section-empty">No artefacts recorded.</p>';
  } else {
    artefacts.forEach((art, i) => {
      const isImportant = IMPORTANT_ARTEFACT_TYPES.has(art.type);
      const typeLabel = artefactTypeLabel(art.type);
      const highlighted = extractHighlightFields(art.payload_json);

      artefactsHtml += `<div class="artefact-card ${isImportant ? 'artefact-card-important' : ''}">
        <div class="artefact-card-header">
          <h3>${i + 1}. ${escHtml(art.title || 'Untitled')} ${typeLabel}</h3>
          <div style="margin-top:4px; font-size:11px; color:#6b7280;">
            Type: <code>${escHtml(art.type)}</code> &nbsp;|&nbsp;
            Created: ${escHtml(formatTs(art.created_at))} &nbsp;|&nbsp;
            ID: <code>${escHtml(String(art.id).slice(0, 12))}</code>
            ${art.summary ? `<br/>Summary: ${escHtml(art.summary)}` : ''}
          </div>
        </div>
        <div class="artefact-card-body">`;

      if (highlighted.length > 0) {
        artefactsHtml += '<div class="artefact-summary-fields"><dl style="margin:0">';
        highlighted.forEach(h => {
          artefactsHtml += `<dt>${escHtml(h.key)}</dt><dd>${escHtml(h.value)}</dd>`;
        });
        artefactsHtml += '</dl></div>';
      }

      artefactsHtml += `<details class="raw-payload-toggle"><summary>Full payload (JSON)</summary><pre>${escHtml(prettyJson(art.payload_json))}</pre></details>`;
      artefactsHtml += '</div></div>';
    });
  }

  let judgementsHtml = '';
  if (judgements.length === 0) {
    judgementsHtml = '<p class="section-empty">No judgements recorded.</p>';
  } else {
    judgementsHtml = '<table><thead><tr><th>Evaluated At</th><th>Verdict</th><th>Reason Code</th><th>Explanation</th></tr></thead><tbody>';
    judgements.forEach(j => {
      judgementsHtml += `<tr>
        <td style="white-space:nowrap">${escHtml(formatTs(j.evaluated_at))}</td>
        <td><span class="badge ${exportBadgeClass(j.verdict)}">${escHtml(j.verdict)}</span></td>
        <td><code>${escHtml(j.reason_code)}</code></td>
        <td>${escHtml(j.explanation)}</td>
      </tr>`;
    });
    judgementsHtml += '</tbody></table>';
    judgements.forEach((j, i) => {
      judgementsHtml += `<details class="raw-payload-toggle" style="margin-bottom:12px;">
        <summary>${i + 1}. ${escHtml(j.verdict)} — ${escHtml(j.reason_code)}</summary>
        <pre>${escHtml(prettyJson(j))}</pre>
      </details>`;
    });
  }

  const benchmarkHtml = benchmarkMeta ? `<h2>${sectionPrefix}Benchmark</h2>\n${buildBenchmarkSectionHtml(benchmarkMeta)}` : '';

  return `
${headerHtml}
${glanceHtml}
${behaviourGlanceLine}
${benchmarkHtml}
${keyMomentsHtml}

<h2>${sectionPrefix}Event Timeline (${events.length} events)</h2>
${eventsHtml}

<h2>${sectionPrefix}Artefacts (${artefacts.length})</h2>
${artefactsHtml}

<h2>${sectionPrefix}Judgements (${judgements.length})</h2>
${judgementsHtml}`;
}

function triggerHtmlDownload(html: string, filename: string) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

async function exportRunAsHtml(
  runId: string,
  clientRequestId: string | null,
) {
  const [{ runData, events, artefacts, judgements }, bmMap] = await Promise.all([
    fetchRunExportData(runId, clientRequestId),
    fetchBenchmarkMetaForRuns([runId]),
  ]);
  const bm = bmMap[runId] || null;

  const bodyHtml = buildRunSectionHtml(runData, runId, clientRequestId, events, artefacts, judgements, '', 0, 1, bm);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>AFR Run Export — ${escHtml(runData?.title || runId)}</title>
<style>${EXPORT_CSS}</style>
</head>
<body>
<h1>Wyshbone AFR — Single Run Export</h1>
<p style="color:#6b7280; margin-bottom:20px">Generated ${new Date().toISOString()} &nbsp;|&nbsp; Run ID: <code>${escHtml(runId)}</code></p>

${bodyHtml}

</body>
</html>`;

  triggerHtmlDownload(html, `afr-run-${runId}.html`);
}

async function exportMultipleRunsAsHtml(
  runs: AfrRun[],
  count: number,
): Promise<void> {
  const safeCount = Math.min(Math.max(1, count), BULK_EXPORT_MAX);
  const runsToExport = runs.slice(0, safeCount);

  if (runsToExport.length === 0) {
    throw new Error('No runs available to export');
  }

  const [allRunDataArr, bmMap] = await Promise.all([
    Promise.all(runsToExport.map(run => fetchRunExportData(run.id, run.client_request_id || null))),
    fetchBenchmarkMetaForRuns(runsToExport.map(r => r.id)),
  ]);
  const allRunData = allRunDataArr;

  const glances = allRunData.map(({ runData, events, artefacts, judgements }) =>
    extractRunGlance(runData, events, artefacts, judgements)
  );

  let tocHtml = `<div class="toc"><h3>Contents</h3><ol>`;
  runsToExport.forEach((run, i) => {
    const goal = allRunData[i].runData?.title || run.goal_summary || 'Untitled';
    const g = glances[i];
    const flags = [
      g.clarified ? 'clarified' : '',
      g.blocked ? 'blocked' : '',
      g.towerVerdict ? `tower:${g.towerVerdict}` : '',
    ].filter(Boolean).join(', ');
    tocHtml += `<li><a href="#run-${i}">Run ${i + 1} — ${escHtml(goal)}</a> <span class="badge ${exportBadgeClass(run.status)}">${escHtml(run.status)}</span>${flags ? ` <span style="color:#6b7280; font-size:11px;">(${escHtml(flags)})</span>` : ''}</li>`;
  });
  tocHtml += `</ol></div>`;

  let summaryTableHtml = `<h2>Summary</h2>
<table>
<thead><tr><th>#</th><th>Run ID</th><th>Goal</th><th>Status</th><th>Type</th><th>Clarified</th><th>Blocked</th><th>Tower</th><th>Created</th></tr></thead>
<tbody>
${runsToExport.map((r, i) => {
    const g = glances[i];
    return `<tr>
  <td><a href="#run-${i}" style="color:#4f46e5">${i + 1}</a></td>
  <td style="font-family:monospace; font-size:11px;">${escHtml(r.id.length > 12 ? r.id.slice(0, 12) + '...' : r.id)}</td>
  <td>${escHtml(r.goal_summary || 'Untitled')}</td>
  <td><span class="badge ${exportBadgeClass(r.status)}">${escHtml(r.status)}</span></td>
  <td>${escHtml(r.run_type || '-')}</td>
  <td>${g.clarified ? '<strong style="color:#b45309">Yes</strong>' : 'No'}</td>
  <td>${g.blocked ? '<strong style="color:#dc2626">Yes</strong>' : 'No'}</td>
  <td>${g.towerJudged ? `<span class="badge ${exportBadgeClass(g.towerVerdict || '')}">${escHtml(g.towerVerdict || 'judged')}</span>` : '-'}</td>
  <td style="white-space:nowrap">${escHtml(formatTs(r.created_at))}</td>
</tr>`;
  }).join('')}
</tbody>
</table>`;

  let bodySections = '';
  runsToExport.forEach((run, idx) => {
    const { runData, events, artefacts, judgements } = allRunData[idx];
    const prefix = `Run ${idx + 1}/${runsToExport.length} — `;
    if (idx > 0) {
      bodySections += '<hr class="run-separator" />';
    }
    bodySections += buildRunSectionHtml(runData, run.id, run.client_request_id || null, events, artefacts, judgements, prefix, idx, runsToExport.length, bmMap[run.id] || null);
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Wyshbone AFR — Bulk Export — ${runsToExport.length} runs</title>
<style>${EXPORT_CSS}</style>
</head>
<body>
<h1>Wyshbone AFR — Bulk Export (${runsToExport.length} run${runsToExport.length !== 1 ? 's' : ''})</h1>
<p style="color:#6b7280; margin-bottom:8px">Generated ${new Date().toISOString()}</p>
<p style="color:#6b7280; margin-bottom:20px">Exported the ${runsToExport.length} most recent run${runsToExport.length !== 1 ? 's' : ''} from the current view.</p>

${tocHtml}

${summaryTableHtml}

${bodySections}

</body>
</html>`;

  const dateStr = new Date().toISOString().slice(0, 10);
  triggerHtmlDownload(html, `afr-bulk-export-${runsToExport.length}-runs-${dateStr}.html`);
}

function RunDetail({
  runId,
  clientRequestId,
  onBack,
  onViewJudgements,
}: {
  runId: string;
  clientRequestId: string | null;
  onBack: () => void;
  onViewJudgements: () => void;
}) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [runMeta, setRunMeta] = useState<{ title: string; status: string; run_id: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url: string;
      if (clientRequestId) {
        url = addDevAuthParams(`/api/afr/stream?client_request_id=${encodeURIComponent(clientRequestId)}`);
      } else {
        url = addDevAuthParams(`/api/afr/runs/${encodeURIComponent(runId)}`);
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = await res.json();

      if (data.events) {
        const sorted = [...data.events].sort(
          (a: StreamEvent, b: StreamEvent) => new Date(a.ts).getTime() - new Date(b.ts).getTime()
        );
        setEvents(sorted);
        setRunMeta({
          title: data.title || 'Agent Run',
          status: data.status || 'unknown',
          run_id: data.run_id || runId,
        });
      } else if (data.run) {
        const activities = (data.activities || []).map((a: any) => ({
          id: a.id,
          ts: a.timestamp,
          type: a.runType,
          summary: a.label || a.action || 'Activity',
          details: { action: a.action, durationMs: a.durationMs, error: a.error },
          status: a.status,
          run_id: runId,
          client_request_id: null,
        }));
        setEvents(activities);
        setRunMeta({
          title: data.run.goal_summary || 'Agent Run',
          status: data.run.status || 'unknown',
          run_id: runId,
        });
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [runId, clientRequestId]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              {loading ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-5 bg-muted rounded w-48" />
                  <div className="h-4 bg-muted rounded w-32" />
                </div>
              ) : (
                <>
                  <CardTitle className="text-base">{runMeta?.title || 'Agent Run'}</CardTitle>
                  <div className="flex items-center gap-3 flex-wrap">
                    <StatusBadge status={runMeta?.status || 'unknown'} />
                    {runMeta?.run_id && <CopyButton text={runMeta.run_id} label="run_id" />}
                    {clientRequestId && <CopyButton text={clientRequestId} label="clientRequestId" />}
                  </div>
                </>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchDetail}>
                <RefreshCw className="w-3 h-3 mr-1" /> Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={onViewJudgements}>
                <Gavel className="w-3 h-3 mr-1" /> Judgements
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={exporting || loading}
                onClick={async () => {
                  setExporting(true);
                  try {
                    await exportRunAsHtml(runId, clientRequestId);
                  } catch (e: any) {
                    console.error('[AFR Export] Failed:', e);
                  } finally {
                    setExporting(false);
                  }
                }}
              >
                {exporting
                  ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Exporting...</>
                  : <><Download className="w-3 h-3 mr-1" /> Export run</>}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="space-y-1">
        <h3 className="text-sm font-medium text-muted-foreground mb-2">
          {loading ? (
            <span className="animate-pulse">Loading events...</span>
          ) : (
            `Event Timeline (${events.length} events, oldest first)`
          )}
        </h3>

        {loading ? (
          <div className="border rounded-lg divide-y">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="px-3 py-2.5 animate-pulse">
                <div className="flex items-start gap-3">
                  <div className="w-4 h-4 bg-muted rounded-full mt-0.5" />
                  <div className="flex-1 space-y-1.5">
                    <div className="flex gap-2">
                      <div className="h-3 bg-muted rounded w-16" />
                      <div className="h-3 bg-muted rounded w-12" />
                    </div>
                    <div className="h-3.5 bg-muted rounded w-64" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <XCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
            <p className="text-sm text-red-400">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={fetchDetail}>
              <RefreshCw className="w-3 h-3 mr-1" /> Retry
            </Button>
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="w-6 h-6 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No events found for this run</p>
          </div>
        ) : (
          <div className="border rounded-lg divide-y">
            {events.map((ev, idx) => (
              <EventRow key={ev.id} event={ev} index={idx} />
            ))}
          </div>
        )}
      </div>

      <ArtefactsPanel runId={runId} />
    </div>
  );
}

interface Artefact {
  id: string;
  run_id: string;
  type: string;
  title: string;
  summary: string | null;
  payload_json: any | null;
  created_at: string;
}

function ArtefactsPanel({ runId }: { runId: string }) {
  const [artefacts, setArtefacts] = useState<Artefact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchArtefacts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = addDevAuthParams(`/api/afr/runs/${encodeURIComponent(runId)}/artefacts`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data?.rows ?? []);
      setArtefacts(list);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => { fetchArtefacts(); }, [fetchArtefacts]);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
          <Package className="w-3.5 h-3.5" />
          {loading ? (
            <span className="animate-pulse">Loading artefacts...</span>
          ) : (
            `Artefacts (${artefacts.length})`
          )}
        </h3>
        {!loading && (
          <Button variant="ghost" size="sm" onClick={fetchArtefacts} className="h-6 px-2">
            <RefreshCw className="w-3 h-3" />
          </Button>
        )}
      </div>

      {loading ? (
        <div className="border rounded-lg divide-y">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="px-3 py-2.5 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-3 bg-muted rounded w-16" />
                <div className="h-3 bg-muted rounded w-12" />
                <div className="h-3.5 bg-muted rounded w-48" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-6 border rounded-lg">
          <XCircle className="w-6 h-6 text-red-500 mx-auto mb-1" />
          <p className="text-xs text-red-400">{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={fetchArtefacts}>
            <RefreshCw className="w-3 h-3 mr-1" /> Retry
          </Button>
        </div>
      ) : artefacts.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground border rounded-lg">
          <Package className="w-5 h-5 mx-auto mb-1 opacity-40" />
          <p className="text-xs">No artefacts for this run</p>
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {artefacts.map((art) => {
            const isExpanded = expandedId === art.id;
            return (
              <div key={art.id} className="hover:bg-muted/20 transition-colors">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : art.id)}
                  className="w-full px-3 py-2.5 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-mono flex-shrink-0">
                      {art.created_at ? new Date(art.created_at).toLocaleTimeString() : '-'}
                    </span>
                    <Badge variant="outline" className="text-[10px] flex-shrink-0">
                      {art.type || 'unknown'}
                    </Badge>
                    <span className="text-sm truncate">{art.title || 'Untitled'}</span>
                    <ChevronDown className={`w-3.5 h-3.5 ml-auto flex-shrink-0 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                  {art.summary && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{art.summary}</p>
                  )}
                </button>
                {isExpanded && art.payload_json != null && (
                  <div className="px-3 pb-3">
                    {art.type === 'leads_list'
                      ? <LeadsListRenderer payload={art.payload_json} />
                      : art.type === 'plan'
                        ? <PlanArtefactRenderer payload={art.payload_json} />
                        : (
                          <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto max-h-64 whitespace-pre-wrap font-mono">
                            {typeof art.payload_json === 'string'
                              ? tryPrettyJson(art.payload_json)
                              : JSON.stringify(art.payload_json, null, 2)}
                          </pre>
                        )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function parsePayload(payload: any): any {
  if (typeof payload === 'string') {
    try { return JSON.parse(payload); } catch { return payload; }
  }
  return payload;
}

interface Lead {
  name?: string;
  location?: string;
  postcode?: string;
  phone?: string;
  website?: string;
  score?: number | string;
  [key: string]: any;
}

function PlanArtefactRenderer({ payload }: { payload: any }) {
  const parsed = parsePayload(payload);
  const version = parsed?.version ?? parsed?.plan_version ?? 1;
  const title = parsed?.title ?? `Plan v${version}`;
  const goal = parsed?.original_user_goal ?? parsed?.user_goal ?? parsed?.goal ?? '';
  const steps = parsed?.steps ?? parsed?.plan_steps ?? parsed?.actions ?? [];
  const constraints = parsed?.constraints ?? [];
  const assumptions = parsed?.assumptions ?? [];

  const hasContent = goal || (Array.isArray(steps) && steps.length > 0) || (Array.isArray(constraints) && constraints.length > 0) || (Array.isArray(assumptions) && assumptions.length > 0);

  if (!hasContent) {
    return (
      <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto max-h-64 whitespace-pre-wrap font-mono">
        {typeof payload === 'string' ? tryPrettyJson(payload) : JSON.stringify(parsed, null, 2)}
      </pre>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-purple-600 dark:text-purple-400 border-purple-300 dark:border-purple-700 font-bold">
          {title}
        </Badge>
      </div>

      {goal && (
        <div className="rounded border border-blue-200 dark:border-blue-800/50 bg-blue-50/50 dark:bg-blue-900/10 p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-blue-600 dark:text-blue-400 font-medium mb-0.5">Original User Goal</p>
          <p className="text-sm text-foreground font-medium">{goal}</p>
        </div>
      )}

      {Array.isArray(steps) && steps.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">Steps ({steps.length})</p>
          <div className="space-y-1.5">
            {steps.map((step: any, i: number) => {
              const tool = step.tool ?? step.action ?? step.type ?? '';
              const args = step.args ?? step.parameters ?? step.params ?? step.input ?? {};
              const desc = step.description ?? step.label ?? step.summary ?? '';
              const argEntries = typeof args === 'object' && args !== null ? Object.entries(args) : [];

              return (
                <div key={i} className="rounded border bg-card p-2">
                  <div className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-4 h-4 rounded-full bg-primary/10 text-primary text-[9px] font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {tool && (
                          <span className="text-[11px] font-mono bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 px-1.5 py-0.5 rounded font-semibold">
                            {tool}
                          </span>
                        )}
                        {desc && <span className="text-xs text-muted-foreground">{desc}</span>}
                      </div>
                      {argEntries.length > 0 && (
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                          {argEntries.map(([k, v]) => (
                            <span key={k} className="text-[10px] text-foreground/80">
                              <span className="text-muted-foreground font-medium">{k}:</span>{' '}
                              <span className="font-mono">{typeof v === 'string' ? v : JSON.stringify(v)}</span>
                            </span>
                          ))}
                        </div>
                      )}
                      {typeof step === 'string' && <p className="text-xs text-foreground/80">{step}</p>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {Array.isArray(constraints) && constraints.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1">Constraints</p>
          <ul className="space-y-0.5">
            {constraints.map((c: any, i: number) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-foreground/80">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-amber-500" />
                <span>{typeof c === 'string' ? c : c.description || c.text || JSON.stringify(c)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {Array.isArray(assumptions) && assumptions.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1">Assumptions</p>
          <ul className="space-y-0.5">
            {assumptions.map((a: any, i: number) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-foreground/80">
                <span className="text-blue-500 mt-0.5 shrink-0">*</span>
                <span>{typeof a === 'string' ? a : a.description || a.text || JSON.stringify(a)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function LeadsListRenderer({ payload }: { payload: any }) {
  const parsed = parsePayload(payload);
  const leads: Lead[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.leads)
      ? parsed.leads
      : Array.isArray(parsed?.results)
        ? parsed.results
        : [];

  if (leads.length === 0) {
    return (
      <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto max-h-64 whitespace-pre-wrap font-mono">
        {typeof payload === 'string' ? tryPrettyJson(payload) : JSON.stringify(payload, null, 2)}
      </pre>
    );
  }

  return (
    <div className="overflow-x-auto rounded border max-h-72 overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="bg-muted/60 sticky top-0">
          <tr>
            <th className="text-left px-2 py-1.5 font-medium">Name</th>
            <th className="text-left px-2 py-1.5 font-medium">Location</th>
            <th className="text-left px-2 py-1.5 font-medium">Phone</th>
            <th className="text-left px-2 py-1.5 font-medium">Website</th>
            <th className="text-left px-2 py-1.5 font-medium">Score</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {leads.map((lead, i) => {
            const loc = lead.location || lead.postcode || lead.address || lead.city || '-';
            return (
              <tr key={i} className="hover:bg-muted/20">
                <td className="px-2 py-1.5 font-medium">{lead.name || lead.business_name || lead.title || '-'}</td>
                <td className="px-2 py-1.5 text-muted-foreground">{loc}</td>
                <td className="px-2 py-1.5 text-muted-foreground font-mono">{lead.phone || lead.phone_number || '-'}</td>
                <td className="px-2 py-1.5">
                  {(lead.website || lead.url) ? (
                    <a
                      href={lead.website || lead.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:underline truncate block max-w-[180px]"
                    >
                      {(lead.website || lead.url || '').replace(/^https?:\/\/(www\.)?/, '')}
                    </a>
                  ) : '-'}
                </td>
                <td className="px-2 py-1.5 text-center">
                  {lead.score != null ? (
                    <span className="inline-block bg-primary/10 text-primary rounded px-1.5 py-0.5 font-mono text-[10px]">
                      {lead.score}
                    </span>
                  ) : '-'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function tryPrettyJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

function EventRow({ event, index }: { event: StreamEvent; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="px-3 py-2.5 hover:bg-muted/20 transition-colors cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <EventIcon type={event.type} status={event.status} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs text-muted-foreground font-mono">
              {new Date(event.ts).toLocaleTimeString()}
            </span>
            <EventTypeBadge type={event.type} />
            <EventStatusPill status={event.status} />
          </div>
          <p className="text-sm leading-snug">{event.summary}</p>
          {event.details?.action && (
            <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
              {event.details.action}
            </p>
          )}
          {event.details?.durationMs != null && (
            <span className="text-xs text-muted-foreground">
              {event.details.durationMs}ms
            </span>
          )}
          {event.details?.error && (
            <p className="text-xs text-red-400 mt-0.5 truncate">{event.details.error}</p>
          )}
        </div>
      </div>
      {expanded && event.details?.results && (
        <div className="mt-2 ml-8">
          <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto max-h-40 whitespace-pre-wrap">
            {event.details.results}
          </pre>
        </div>
      )}
    </div>
  );
}

function EventIcon({ type, status }: { type: string; status: string }) {
  const s = status?.toLowerCase();
  if (s === 'failed') return <XCircle className="w-4 h-4 text-red-500" />;
  if (s === 'running' || s === 'pending') return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;

  const t = type?.toLowerCase() || '';
  if (t.includes('plan')) return <FileText className="w-4 h-4 text-purple-500" />;
  if (t.includes('step') || t.includes('tool')) return <Play className="w-4 h-4 text-blue-500" />;
  if (t.includes('research')) return <Search className="w-4 h-4 text-cyan-500" />;
  if (t.includes('judgement') || t.includes('tower')) return <Gavel className="w-4 h-4 text-yellow-500" />;
  if (t.includes('completed') || t.includes('success')) return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  if (t.includes('user_message')) return <Activity className="w-4 h-4 text-foreground" />;
  return <Activity className="w-4 h-4 text-muted-foreground" />;
}

function EventTypeBadge({ type }: { type: string }) {
  return (
    <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
      {type}
    </span>
  );
}

function EventStatusPill({ status }: { status: string }) {
  const s = status?.toLowerCase();
  if (s === 'completed' || s === 'success') {
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-500 font-medium">success</span>;
  }
  if (s === 'failed') {
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 font-medium">failed</span>;
  }
  if (s === 'running' || s === 'pending') {
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 font-medium">{s}</span>;
  }
  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">{status}</span>;
}

function JudgementLedger({ runId }: { runId: string | null }) {
  const [judgements, setJudgements] = useState<Judgement[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const params = runId ? `?run_id=${encodeURIComponent(runId)}` : '';
    const url = addDevAuthParams(`/api/afr/judgements${params}`);
    fetch(url)
      .then(res => res.json())
      .then(data => {
        setJudgements(data.judgements || []);
        setMessage(data.message || null);
      })
      .catch(() => setMessage('Failed to load judgements'))
      .finally(() => setLoading(false));
  }, [runId]);

  if (loading) {
    return (
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-left">
              <th className="px-3 py-2 font-medium">Evaluated At</th>
              <th className="px-3 py-2 font-medium">Verdict</th>
              <th className="px-3 py-2 font-medium">Reason Code</th>
              <th className="px-3 py-2 font-medium">Explanation</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 3 }).map((_, i) => (
              <tr key={i} className="border-t animate-pulse">
                <td className="px-3 py-2"><div className="h-3.5 bg-muted rounded w-28" /></td>
                <td className="px-3 py-2"><div className="h-5 bg-muted rounded w-16" /></td>
                <td className="px-3 py-2"><div className="h-3.5 bg-muted rounded w-20" /></td>
                <td className="px-3 py-2"><div className="h-3.5 bg-muted rounded w-48" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (judgements.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Gavel className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">{message || 'No judgements recorded for this run yet'}</p>
        {runId && (
          <p className="text-xs mt-1 font-mono">run_id: {runId}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">
        Judgements {runId ? `for run ${runId.slice(0, 12)}...` : '(all)'}
      </h3>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-left">
              <th className="px-3 py-2 font-medium">Evaluated At</th>
              <th className="px-3 py-2 font-medium">Verdict</th>
              <th className="px-3 py-2 font-medium">Reason Code</th>
              <th className="px-3 py-2 font-medium">Explanation</th>
            </tr>
          </thead>
          <tbody>
            {judgements.map(j => (
              <tr key={j.id} className="border-t">
                <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(j.evaluated_at).toLocaleString()}</td>
                <td className="px-3 py-2"><StatusBadge status={j.verdict} /></td>
                <td className="px-3 py-2 text-xs font-mono">{j.reason_code}</td>
                <td className="px-3 py-2 text-xs">{j.explanation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
