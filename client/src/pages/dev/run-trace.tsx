import { useState, useCallback } from 'react';
import { useSearch } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Search, Copy, Check, RefreshCw } from 'lucide-react';
import { addDevAuthParams } from '@/lib/queryClient';

type SuspectedBreakpoint =
  | 'no_afr_events'
  | 'no_tower_events'
  | 'tower_events_not_rendered'
  | 'judgement_endpoint_empty'
  | 'state_machine_bug'
  | 'unknown';

interface RunTraceReport {
  run_ref: {
    crid: string | null;
    runId: string | null;
    resolved_run_id: string | null;
  };
  fetched: {
    afr_events: boolean;
    afr_event_count: number;
    artefacts: boolean;
    artefact_count: number;
    judgements: boolean;
  };
  afr_event_summary: {
    total: number;
    first_30: Array<{ type: string; ts: string }>;
    all_types: string[];
  };
  tower_events_found: {
    present: boolean;
    count: number;
    events: Array<{ type: string; ts: string; verdict?: string | null; action?: string | null }>;
  };
  artefacts_found: {
    present: boolean;
    count: number;
    items: Array<{ id: string; type: string; title?: string }>;
    artefact_created_events_in_afr: Array<{ id: string; type: string; ts: string | null; details: any }>;
  };
  judgement_fetch_result: {
    endpoint_called: boolean;
    response: any;
    error: string | null;
  };
  ui_state_flags: {
    awaiting_tower_judgement_shown: boolean;
    awaiting_tower_judgement_condition: string | null;
    completed_no_tower_verdict_shown: boolean;
    completed_no_tower_verdict_condition: string | null;
    derived_status: string | null;
    tower_verdict: string | null;
    tower_missing: boolean;
    is_lead_run: boolean;
  };
  suspected_breakpoint: SuspectedBreakpoint;
}

const TOWER_EVENT_TYPES = [
  'tower_judgement',
  'tower_evaluation_completed',
  'tower_decision_stop',
  'tower_decision_change_plan',
  'tower_call_started',
  'tower_verdict',
  'judgement_received',
];

// Mirrored from live-activity-panel.tsx deriveTowerAwareStatus - keep in sync
function deriveTowerAwareStatus(events: any[], serverTerminalState: 'completed' | 'failed' | 'stopped' | null) {
  let lastTowerVerdict: string | null = null;
  let hasRunCompleted = false;
  let hasRunStopped = false;
  let hasTowerJudgement = false;
  let hasToolCompleted = false;
  let isLeadRun = false;

  for (const e of events) {
    const t = (e.type || '').toLowerCase();
    const action = (e.details?.action || '').toLowerCase();

    if (t === 'tower_judgement' || t === 'judgement_received' || t === 'tower_evaluation_completed' || t === 'tower_verdict') {
      hasTowerJudgement = true;
      const results = e.details?.results;
      if (results) {
        try {
          const parsed = JSON.parse(results);
          if (parsed.verdict) lastTowerVerdict = parsed.verdict.toLowerCase();
        } catch {}
      }
      const directVerdict = e.details?.verdict;
      if (directVerdict && typeof directVerdict === 'string') {
        lastTowerVerdict = directVerdict.toLowerCase();
      }
      if (action.includes('stop')) lastTowerVerdict = 'stop';
      if (action.includes('change_plan')) lastTowerVerdict = 'change_plan';
    }
    if (t === 'tower_decision_stop') { hasTowerJudgement = true; lastTowerVerdict = 'stop'; }
    if (t === 'tower_decision_change_plan') { hasTowerJudgement = true; lastTowerVerdict = 'change_plan'; }
    if (t === 'run_completed') hasRunCompleted = true;
    if (t === 'run_stopped' || t === 'plan_execution_halted') hasRunStopped = true;
    if (t === 'tool_call_completed') hasToolCompleted = true;

    const leadStepNames = ['search_places', 'batch_contact_finder', 'create_scheduled_monitor'];
    for (const step of leadStepNames) {
      if (t === `step_started:${step}` || t === `step_completed:${step}` || action === `step_started:${step}` || action === `step_completed:${step}` || action === step || t === step) {
        isLeadRun = true;
        break;
      }
    }
  }

  if (lastTowerVerdict === 'stop' || hasRunStopped) {
    return { towerVerdict: lastTowerVerdict || 'stop', derivedStatus: 'stopped', isLeadRun, towerMissing: !hasTowerJudgement };
  }
  if (serverTerminalState === 'stopped') {
    return { towerVerdict: lastTowerVerdict || 'stop', derivedStatus: 'stopped', isLeadRun, towerMissing: !hasTowerJudgement };
  }
  if (lastTowerVerdict === 'change_plan' || lastTowerVerdict === 'retry') {
    return { towerVerdict: lastTowerVerdict, derivedStatus: 'replanning', isLeadRun, towerMissing: false };
  }
  const isTerminal = serverTerminalState === 'completed' || hasRunCompleted;
  if (isTerminal) {
    if (hasTowerJudgement && lastTowerVerdict === 'accept') {
      return { towerVerdict: lastTowerVerdict, derivedStatus: 'completed', isLeadRun, towerMissing: false };
    }
    if (hasRunCompleted || serverTerminalState === 'completed') {
      return { towerVerdict: lastTowerVerdict, derivedStatus: 'completed', isLeadRun, towerMissing: !hasTowerJudgement };
    }
    return { towerVerdict: lastTowerVerdict, derivedStatus: 'completed', isLeadRun, towerMissing: !hasTowerJudgement };
  }
  if (hasToolCompleted && !hasTowerJudgement && !serverTerminalState) {
    return { towerVerdict: null, derivedStatus: 'awaiting_judgement', isLeadRun, towerMissing: true };
  }
  return { towerVerdict: lastTowerVerdict, derivedStatus: null, isLeadRun, towerMissing: !hasTowerJudgement };
}

function determineSuspectedBreakpoint(report: Omit<RunTraceReport, 'suspected_breakpoint'>): SuspectedBreakpoint {
  if (!report.fetched.afr_events || report.fetched.afr_event_count === 0) {
    return 'no_afr_events';
  }
  if (!report.tower_events_found.present && report.fetched.afr_event_count > 0) {
    return 'no_tower_events';
  }
  if (report.tower_events_found.present && report.ui_state_flags.tower_missing) {
    return 'tower_events_not_rendered';
  }
  if (report.judgement_fetch_result.endpoint_called && report.judgement_fetch_result.response?.judgements?.length === 0) {
    return 'judgement_endpoint_empty';
  }
  if (report.ui_state_flags.awaiting_tower_judgement_shown && report.tower_events_found.present) {
    return 'state_machine_bug';
  }
  if (report.ui_state_flags.completed_no_tower_verdict_shown && report.tower_events_found.present) {
    return 'state_machine_bug';
  }
  return 'unknown';
}

export default function RunTracePage() {
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  const initialCrid = urlParams.get('crid') || '';
  const initialRunId = urlParams.get('runId') || '';

  const [crid, setCrid] = useState(initialCrid);
  const [runId, setRunId] = useState(initialRunId);
  const [report, setReport] = useState<RunTraceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generateReport = useCallback(async () => {
    const effectiveCrid = crid.trim() || null;
    const effectiveRunId = runId.trim() || null;

    if (!effectiveCrid && !effectiveRunId) {
      setError('Please provide a crid or runId');
      return;
    }

    setLoading(true);
    setError(null);
    setReport(null);

    try {
      let events: any[] = [];
      let fetchedEvents = false;
      let resolvedRunId: string | null = effectiveRunId;
      let serverStatus: string | null = null;

      if (effectiveCrid) {
        const streamUrl = addDevAuthParams(`/api/afr/stream?client_request_id=${encodeURIComponent(effectiveCrid)}`);
        const streamRes = await fetch(streamUrl);
        if (streamRes.ok) {
          const data = await streamRes.json();
          events = data.events || [];
          fetchedEvents = true;
          resolvedRunId = data.run_id || resolvedRunId;
          serverStatus = data.status || null;
        }
      }

      if (!fetchedEvents && effectiveRunId) {
        const runUrl = addDevAuthParams(`/api/afr/runs/${encodeURIComponent(effectiveRunId)}`);
        const runRes = await fetch(runUrl);
        if (runRes.ok) {
          const data = await runRes.json();
          if (data.events) {
            events = data.events;
          } else if (data.activities) {
            events = data.activities.map((a: any) => ({
              id: a.id,
              ts: a.timestamp,
              type: a.runType || a.type,
              summary: a.label || a.action || 'Activity',
              details: { action: a.action, durationMs: a.durationMs, error: a.error },
              status: a.status,
              run_id: effectiveRunId,
              client_request_id: null,
            }));
          }
          fetchedEvents = true;
          resolvedRunId = data.run_id || data.run?.id || resolvedRunId;
          serverStatus = data.status || data.run?.status || null;
        }
      }

      const sorted = [...events].sort((a, b) => {
        const ta = a.ts ? new Date(a.ts).getTime() : 0;
        const tb = b.ts ? new Date(b.ts).getTime() : 0;
        return ta - tb;
      });

      const allTypes = Array.from(new Set(sorted.map(e => e.type)));
      const first30 = sorted.slice(0, 30).map(e => ({ type: e.type, ts: e.ts || null }));

      const towerEvents = sorted.filter(e => {
        const t = (e.type || '').toLowerCase();
        return TOWER_EVENT_TYPES.some(tt => t === tt) || t.startsWith('tower_');
      });

      const artefactCreatedEvents = sorted.filter(e => {
        const t = (e.type || '').toLowerCase();
        return t === 'artefact_created' || t === 'artifact_created';
      });

      let artefacts: any[] = [];
      let fetchedArtefacts = false;
      if (resolvedRunId) {
        try {
          const artUrl = addDevAuthParams(`/api/afr/runs/${encodeURIComponent(resolvedRunId)}/artefacts`);
          const artRes = await fetch(artUrl);
          if (artRes.ok) {
            const data = await artRes.json();
            artefacts = Array.isArray(data) ? data : (data?.rows ?? []);
            fetchedArtefacts = true;
          }
        } catch {}
      }

      let judgementResult: any = null;
      let fetchedJudgements = false;
      let judgementFetchError: string | null = null;
      if (resolvedRunId) {
        try {
          const judgeUrl = addDevAuthParams(`/api/afr/judgements?run_id=${encodeURIComponent(resolvedRunId)}`);
          const judgeRes = await fetch(judgeUrl);
          if (judgeRes.ok) {
            judgementResult = await judgeRes.json();
            fetchedJudgements = true;
          } else {
            judgementFetchError = `HTTP ${judgeRes.status}`;
          }
        } catch (e: any) {
          judgementFetchError = e.message || 'fetch failed';
        }
      }

      const terminalState = ['completed', 'failed', 'stopped'].includes(serverStatus || '')
        ? (serverStatus as 'completed' | 'failed' | 'stopped')
        : null;

      const towerAware = deriveTowerAwareStatus(sorted, terminalState);

      const awaitingShown = towerAware.derivedStatus === 'awaiting_judgement';
      const completedNoTowerShown = towerAware.derivedStatus === 'completed' && towerAware.towerMissing;

      let awaitingCondition: string | null = null;
      if (awaitingShown) {
        awaitingCondition = 'hasToolCompleted && !hasTowerJudgement && !serverTerminalState => derivedStatus=awaiting_judgement, towerMissing=true';
      }

      let completedNoTowerCondition: string | null = null;
      if (completedNoTowerShown) {
        completedNoTowerCondition = `(hasRunCompleted || serverTerminalState==${serverStatus}) && !hasTowerJudgement => derivedStatus=completed, towerMissing=true; label="Completed (no Tower verdict)"`;
      }

      const partial: Omit<RunTraceReport, 'suspected_breakpoint'> = {
        run_ref: {
          crid: effectiveCrid,
          runId: effectiveRunId,
          resolved_run_id: resolvedRunId,
        },
        fetched: {
          afr_events: fetchedEvents,
          afr_event_count: sorted.length,
          artefacts: fetchedArtefacts,
          artefact_count: artefacts.length,
          judgements: fetchedJudgements,
        },
        afr_event_summary: {
          total: sorted.length,
          first_30: first30,
          all_types: allTypes,
        },
        tower_events_found: {
          present: towerEvents.length > 0,
          count: towerEvents.length,
          events: towerEvents.map(e => ({
            type: e.type,
            ts: e.ts,
            verdict: e.details?.verdict || null,
            action: e.details?.action || null,
          })),
        },
        artefacts_found: {
          present: artefacts.length > 0 || artefactCreatedEvents.length > 0,
          count: artefacts.length,
          items: artefacts.map(a => ({
            id: a.id,
            type: a.type,
            title: a.title || undefined,
          })),
          artefact_created_events_in_afr: artefactCreatedEvents.map(e => ({
            id: e.id,
            type: e.type,
            ts: e.ts || null,
            details: e.details || null,
          })),
        },
        judgement_fetch_result: {
          endpoint_called: fetchedJudgements || !!judgementFetchError,
          response: judgementResult,
          error: judgementFetchError,
        },
        ui_state_flags: {
          awaiting_tower_judgement_shown: awaitingShown,
          awaiting_tower_judgement_condition: awaitingCondition,
          completed_no_tower_verdict_shown: completedNoTowerShown,
          completed_no_tower_verdict_condition: completedNoTowerCondition,
          derived_status: towerAware.derivedStatus,
          tower_verdict: towerAware.towerVerdict,
          tower_missing: towerAware.towerMissing,
          is_lead_run: towerAware.isLeadRun,
        },
      };

      const fullReport: RunTraceReport = {
        ...partial,
        suspected_breakpoint: determineSuspectedBreakpoint(partial),
      };

      setReport(fullReport);

      const url = new URL(window.location.href);
      if (effectiveCrid) url.searchParams.set('crid', effectiveCrid);
      else url.searchParams.delete('crid');
      if (effectiveRunId) url.searchParams.set('runId', effectiveRunId);
      else url.searchParams.delete('runId');
      window.history.replaceState({}, '', url.toString());

    } catch (e: any) {
      setError(e.message || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  }, [crid, runId]);

  const handleCopy = async () => {
    if (!report) return;
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-4 md:p-6 space-y-4 h-full overflow-y-auto">
      <div>
        <h1 className="text-xl font-semibold">Run Trace Report</h1>
        <p className="text-sm text-muted-foreground">
          Diagnostic JSON report for a given run identifier
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Lookup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                crid (conversation run id)
              </label>
              <Input
                placeholder="e.g. crid_abc123..."
                value={crid}
                onChange={e => setCrid(e.target.value)}
                className="h-9 font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                runId (plan_... / job_...)
              </label>
              <Input
                placeholder="e.g. plan_xyz789..."
                value={runId}
                onChange={e => setRunId(e.target.value)}
                className="h-9 font-mono text-xs"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={generateReport} disabled={loading} size="sm">
              {loading ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Search className="w-3 h-3 mr-1" />
              )}
              Generate Report
            </Button>
            {report && (
              <Button variant="outline" size="sm" onClick={handleCopy}>
                {copied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                {copied ? 'Copied' : 'Copy JSON'}
              </Button>
            )}
            {report && (
              <Button variant="outline" size="sm" onClick={generateReport} disabled={loading}>
                <RefreshCw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Fetching data and building report...</span>
        </div>
      )}

      {report && !loading && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Report Output</CardTitle>
              <BreakpointBadge breakpoint={report.suspected_breakpoint} />
            </div>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted/50 rounded-lg p-4 overflow-x-auto text-xs font-mono leading-relaxed whitespace-pre-wrap break-words max-h-[70vh] overflow-y-auto">
              {JSON.stringify(report, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BreakpointBadge({ breakpoint }: { breakpoint: SuspectedBreakpoint }) {
  const colors: Record<SuspectedBreakpoint, string> = {
    no_afr_events: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    no_tower_events: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    tower_events_not_rendered: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
    judgement_endpoint_empty: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    state_machine_bug: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    unknown: 'bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-300',
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${colors[breakpoint]}`}>
      {breakpoint}
    </span>
  );
}
