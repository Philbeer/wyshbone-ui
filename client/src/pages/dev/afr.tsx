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
