import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
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
  mission_intent_assessment: { verdict: string; reasoning: string; confidence: number } | null;
  ground_truth_assessment: { verdict: string; reasoning: string; confidence: number } | null;
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
  missionIntentScore: number | null;
  groundTruthScore: number | null;
  behaviourAvg: number | null;
  systemAvg: number | null;
  towerAvg: number | null;
  missionIntentAvg: number | null;
  groundTruthAvg: number | null;
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
  if (type === 'behaviour') {
    if (status === 'PASS') return 1.0;
    if (status === 'HONEST_PARTIAL') return 0.8;
    if (status === 'BATCH_EXHAUSTED') return 0.6;
    if (status === 'CAPABILITY_FAIL') return 0.2;
    if (status === 'WRONG_DECISION') return 0.0;
    return null;
  }
  if (type === 'tower') {
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

interface ConstraintVerdict {
  constraint: string;
  verdict: string;
}

interface LeadEvidence {
  lead_name?: string;
  verified?: boolean;
  source_tier?: string;
  constraint_verdicts?: ConstraintVerdict[];
  // legacy / richer fields (may be present in some rows)
  business_name?: string;
  entity_name?: string;
  name?: string;
  url?: string;
  source_url?: string;
  website_url?: string;
  quote?: string;
  quotes?: string[];
  matched_phrase?: string;
  context_snippet?: string;
  context?: string;
  tower_status?: string;
  constraint_type?: string;
}

interface DeliveryLeadEvidence {
  url: string;
  quotes: string[];
  matched_phrase: string;
  context_snippet: string;
  verification_status: string;
  constraint_verdicts: { constraint: string; verdict: string }[];
}

type ResolvedBadge = {
  label: string | null;
  verdict: 'verified' | 'unverified' | 'unreachable';
};

function normalizeVerdict(v: string): ResolvedBadge['verdict'] {
  if (v === 'verified') return 'verified';
  if (v === 'unreachable') return 'unreachable';
  return 'unverified';
}

function resolveConstraintBadges(
  item: LeadEvidence,
  verifiableConstraints: string[],
  verificationPolicy: string | undefined,
): ResolvedBadge[] {
  const noVerification =
    verificationPolicy === 'DIRECTORY_VERIFIED' ||
    verifiableConstraints.length === 0;
  if (noVerification) return [];

  if (item.constraint_verdicts && item.constraint_verdicts.length > 0) {
    const showLabel = item.constraint_verdicts.length > 1;
    return item.constraint_verdicts.map(cv => ({
      label: showLabel ? cv.constraint : null,
      verdict: normalizeVerdict(cv.verdict),
    }));
  }

  if (item.verified !== undefined && item.verified !== null) {
    return [{ label: null, verdict: item.verified ? 'verified' : 'unverified' }];
  }

  return [];
}

function LeadConstraintBadges({ badges }: { badges: ResolvedBadge[] }) {
  if (badges.length === 0) return null;
  return (
    <div className="flex items-center gap-1 flex-wrap shrink-0">
      {badges.map((b, i) => {
        const verdictCls =
          b.verdict === 'verified'
            ? 'bg-green-100 text-green-700'
            : b.verdict === 'unreachable'
              ? 'bg-amber-100 text-amber-700'
              : 'bg-red-100 text-red-700';
        const icon = b.verdict === 'verified' ? '✓' : b.verdict === 'unreachable' ? '~' : '✗';
        return (
          <span
            key={i}
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${verdictCls}`}
          >
            {b.label ? `${b.label}: ${icon} ${b.verdict}` : `${icon} ${b.verdict}`}
          </span>
        );
      })}
    </div>
  );
}

export function BehaviourInspectContent({ runId, query, timestamp }: {
  runId: string;
  query?: string;
  timestamp?: string | number | Date;
}) {
  type BjAssessment = { verdict: string; reasoning: string; confidence: number } | null;
  const [judgeB, setJudgeB] = useState<{
    outcome: string;
    confidence: number | null;
    reason: string | null;
    tower_verdict: string | null;
    delivered_count: number | null;
    requested_count: number | null;
    mission_intent_assessment: BjAssessment;
    ground_truth_assessment: BjAssessment;
    input_snapshot?: {
      leads_evidence?: LeadEvidence[];
      leads?: LeadEvidence[];
      verification_policy?: string;
      verifiable_constraints?: string[];
      [key: string]: unknown;
    } | null;
  } | null>(null);
  const [judgeBLoading, setJudgeBLoading] = useState(false);
  const [expandedEvidence, setExpandedEvidence] = useState<Set<number>>(new Set());
  const [deliveryEvidence, setDeliveryEvidence] = useState<{
    evidenceMap: Record<string, DeliveryLeadEvidence>;
    verifiableConstraints: string[];
  }>({ evidenceMap: {}, verifiableConstraints: [] });

  useEffect(() => {
    console.log('[BIC_MOUNT] runId:', runId);
    console.log('[BIC] runId received:', runId);
    if (!runId) {
      setJudgeB(null);
      setExpandedEvidence(new Set());
      setDeliveryEvidence({ evidenceMap: {}, verifiableConstraints: [] });
      return;
    }
    setJudgeBLoading(true);
    setJudgeB(null);
    setExpandedEvidence(new Set());
    setDeliveryEvidence({ evidenceMap: {}, verifiableConstraints: [] });

    let cancelled = false;
    const MAX_RETRIES = 8;
    const RETRY_INTERVAL_MS = 2500;

    const encoded = encodeURIComponent(runId);

    const fetchEvidence = () =>
      fetch(buildApiUrl(addDevAuthParams(`/api/afr/delivery-evidence?run_id=${encoded}`)), { credentials: 'include' })
        .then(r => r.ok ? r.json() : { evidenceMap: {}, verifiableConstraints: [] })
        .catch(() => ({ evidenceMap: {}, verifiableConstraints: [] }));

    const fetchJudge = () =>
      fetch(buildApiUrl(addDevAuthParams(`/api/afr/behaviour-judge?run_id=${encoded}`)), { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null);

    const attempt = async (retriesLeft: number) => {
      if (cancelled) return;
      const [judgeData, evidenceData] = await Promise.all([fetchJudge(), fetchEvidence()]);
      if (cancelled) return;
      console.log(`[BIC] behaviour-judge result (retriesLeft=${retriesLeft}):`, JSON.stringify(judgeData));
      console.log('[BIC] delivery-evidence result:', JSON.stringify(evidenceData));
      setDeliveryEvidence(evidenceData || { evidenceMap: {}, verifiableConstraints: [] });
      if (judgeData) {
        setJudgeB(judgeData);
        setJudgeBLoading(false);
      } else if (retriesLeft > 0) {
        setTimeout(() => attempt(retriesLeft - 1), RETRY_INTERVAL_MS);
      } else {
        setJudgeB(null);
        setJudgeBLoading(false);
      }
    };

    attempt(MAX_RETRIES);
    return () => { cancelled = true; };
  }, [runId]);

  const tsNum = timestamp instanceof Date
    ? timestamp.getTime()
    : typeof timestamp === 'number' || typeof timestamp === 'string'
      ? toNumericTs(timestamp as string | number)
      : 0;

  function verdictChip(v: string | null | undefined) {
    const upper = (v || '').toUpperCase();
    const isP = upper === 'PASS';
    const isF = upper !== '' && upper !== 'UNKNOWN' && !isP;
    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold ${
        isP ? 'bg-green-100 text-green-800' : isF ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700'
      }`}>
        {upper || 'N/A'}
      </span>
    );
  }

  function fmtConf(c: number | null | undefined) {
    if (c == null) return null;
    return `${c > 1 ? Math.round(c) : Math.round(c * 100)}%`;
  }

  function BjSubSection({ label, assessment }: {
    label: string;
    assessment: { verdict: string; reasoning: string; confidence: number } | null | undefined;
  }) {
    return (
      <div className="space-y-1">
        <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{label}</div>
        {assessment == null ? (
          <div className="text-[11px] text-gray-400 italic">N/A</div>
        ) : (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {verdictChip(assessment.verdict)}
              {fmtConf(assessment.confidence) && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                  {fmtConf(assessment.confidence)} confidence
                </span>
              )}
            </div>
            {assessment.reasoning && (
              <p className="text-[11px] text-gray-700 leading-relaxed">{assessment.reasoning}</p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {(query || tsNum > 0) && (
        <div>
          {query && (
            <p className="text-[12px] font-medium text-gray-800 leading-snug">
              {query.length > 120 ? query.slice(0, 117) + '…' : query}
            </p>
          )}
          {tsNum > 0 && (
            <div className="text-[11px] text-gray-400 mt-0.5">{formatTs(tsNum)}</div>
          )}
        </div>
      )}

      <section>
        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2 border-b pb-1">
          Behaviour Judge (Judge B)
        </h4>
        {judgeBLoading ? (
          <div className="text-[11px] text-gray-400 py-2">Awaiting Judge B…</div>
        ) : !judgeB ? (
          <div className="text-[11px] text-gray-400 italic py-2">
            No Judge B result in behaviour_judge_results for this run.
          </div>
        ) : (
          <div className="space-y-3">
            <BjSubSection label="Mission Intent" assessment={judgeB.mission_intent_assessment} />
            <BjSubSection label="Ground Truth" assessment={judgeB.ground_truth_assessment} />
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Combined</div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  {verdictChip(judgeB.outcome)}
                  {fmtConf(judgeB.confidence) && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                      {fmtConf(judgeB.confidence)} confidence
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
              </div>
            </div>
          </div>
        )}
      </section>

      {(() => {
        const evidence = judgeB?.input_snapshot?.leads_evidence
          ?? judgeB?.input_snapshot?.leads
          ?? [];
        if (evidence.length === 0) return null;
        const verificationPolicy = judgeB?.input_snapshot?.verification_policy;
        const verifiableConstraints: string[] =
          deliveryEvidence.verifiableConstraints.length > 0
            ? deliveryEvidence.verifiableConstraints
            : (judgeB?.input_snapshot?.verifiable_constraints ?? []);
        return (
          <section>
            <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2 border-b pb-1">
              Evidence Found Per Lead
            </h4>
            <div className="space-y-1">
              {evidence.map((item, idx) => {
                const displayName = item.lead_name || item.business_name || item.entity_name || item.name || `Lead ${idx + 1}`;
                const isExpanded = expandedEvidence.has(idx);
                const rich = deliveryEvidence.evidenceMap[displayName.toLowerCase().trim()] ?? null;
                const itemWithVerdicts: LeadEvidence = {
                  ...item,
                  constraint_verdicts: rich?.constraint_verdicts?.length
                    ? rich.constraint_verdicts
                    : (item.constraint_verdicts ?? []),
                };
                const badges = resolveConstraintBadges(itemWithVerdicts, verifiableConstraints, verificationPolicy);
                const siteUrl = rich?.url || item.url || item.source_url || item.website_url || '';
                const allQuotes: string[] = rich?.quotes?.length
                  ? rich.quotes
                  : [...(item.quotes ?? []), ...(item.quote ? [item.quote] : [])];
                const matchedPhrase = rich?.matched_phrase || item.matched_phrase || '';
                const contextSnippet = rich?.context_snippet || item.context_snippet || item.context || '';
                const towerStatus = rich?.verification_status || item.tower_status || '';
                const towerCls = towerStatus.toUpperCase() === 'VERIFIED'
                  ? 'bg-green-100 text-green-700'
                  : towerStatus === 'weak_match'
                    ? 'bg-amber-100 text-amber-700'
                    : towerStatus === 'no_evidence'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-gray-100 text-gray-600';
                return (
                  <div key={idx} className="border rounded-md overflow-hidden text-[11px]">
                    <button
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
                      onClick={() => {
                        setExpandedEvidence(prev => {
                          const next = new Set(prev);
                          next.has(idx) ? next.delete(idx) : next.add(idx);
                          return next;
                        });
                      }}
                    >
                      <span className="font-medium text-gray-800 truncate flex-1">{displayName}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <LeadConstraintBadges badges={badges} />
                        {item.source_tier && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">
                            {item.source_tier}
                          </span>
                        )}
                        <span className="text-gray-400 text-[10px]">{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="border-t bg-gray-50 px-3 py-2 space-y-1.5">
                        <div>
                          <span className="text-gray-500 font-medium">URL visited: </span>
                          {siteUrl
                            ? <a href={siteUrl} target="_blank" rel="noopener noreferrer"
                                className="text-blue-600 hover:underline break-all">{siteUrl}</a>
                            : <span className="text-gray-400 italic">not captured</span>
                          }
                        </div>
                        <div>
                          <span className="text-gray-500 font-medium">Quotes found: </span>
                          {allQuotes.length > 0
                            ? (
                              <div className="mt-0.5 space-y-1">
                                {allQuotes.map((q, qi) => (
                                  <blockquote key={qi} className="border-l-2 border-gray-300 pl-2 text-gray-700 italic">{q}</blockquote>
                                ))}
                              </div>
                            )
                            : <span className="text-gray-400 italic">not captured</span>
                          }
                        </div>
                        <div>
                          <span className="text-gray-500 font-medium">Matched phrase: </span>
                          {matchedPhrase
                            ? <span className="text-gray-800 font-mono bg-yellow-50 px-1 rounded">{matchedPhrase}</span>
                            : <span className="text-gray-400 italic">not captured</span>
                          }
                        </div>
                        <div>
                          <span className="text-gray-500 font-medium">Context snippet: </span>
                          {contextSnippet
                            ? <span className="text-gray-700">{contextSnippet}</span>
                            : <span className="text-gray-400 italic">not captured</span>
                          }
                        </div>
                        <div>
                          <span className="text-gray-500 font-medium">Tower verdict: </span>
                          {towerStatus
                            ? <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${towerCls}`}>{towerStatus}</span>
                            : <span className="text-gray-400 italic">not captured</span>
                          }
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })()}
    </div>
  );
}

function BehaviourInspectModal({ row, open, onClose }: { row: MetricRow | null; open: boolean; onClose: () => void }) {
  if (!row) return null;

  const titleParts: string[] = [];
  if (row.benchmark_test_id) titleParts.push(row.benchmark_test_id);
  titleParts.push(row.query.length > 60 ? row.query.slice(0, 57) + '...' : row.query);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold leading-snug">
            {titleParts.join(' — ')}
          </DialogTitle>
          <div className="text-[11px] text-gray-400 mt-0.5">{formatTs(row.timestamp)}</div>
        </DialogHeader>

        <div className="mt-2">
          {open && (
            <BehaviourInspectContent
              runId={row.run_id}
              query={row.query}
              timestamp={row.timestamp}
            />
          )}
          <section className="mt-4">
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

  const fetchDataRef = useRef(fetchData);
  useEffect(() => { fetchDataRef.current = fetchData; });

  useEffect(() => {
    const id = setInterval(() => {
      if (localStorage.getItem('qa_benchmark_running') === 'true') {
        fetchDataRef.current();
      }
    }, 10_000);
    return () => clearInterval(id);
  }, []);

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
    const missionIntentScores = sorted.map(r => {
      const v = r.mission_intent_assessment?.verdict;
      if (!v) return null;
      return statusToScore(v.toUpperCase(), 'behaviour');
    });
    const groundTruthScores = sorted.map(r => {
      const v = r.ground_truth_assessment?.verdict;
      if (!v) return null;
      return statusToScore(v.toUpperCase(), 'behaviour');
    });

    const behaviourAvgs = rollingAvg(behaviourScores, ROLLING_WINDOW);
    const systemAvgs = rollingAvg(systemScores, ROLLING_WINDOW);
    const towerAvgs = rollingAvg(towerScores, ROLLING_WINDOW);
    const missionIntentAvgs = rollingAvg(missionIntentScores, ROLLING_WINDOW);
    const groundTruthAvgs = rollingAvg(groundTruthScores, ROLLING_WINDOW);

    return sorted.map((r, i) => ({
      index: i + 1,
      timestamp: toNumericTs(r.timestamp),
      label: r.benchmark_test_id || r.query.slice(0, 30),
      behaviourScore: behaviourScores[i],
      systemScore: systemScores[i],
      towerScore: towerScores[i],
      missionIntentScore: missionIntentScores[i],
      groundTruthScore: groundTruthScores[i],
      behaviourAvg: behaviourAvgs[i],
      systemAvg: systemAvgs[i],
      towerAvg: towerAvgs[i],
      missionIntentAvg: missionIntentAvgs[i],
      groundTruthAvg: groundTruthAvgs[i],
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
                        {d.missionIntentScore !== null && <div style={{ color: '#f59e0b' }}>Mission Intent: <span className="font-mono">{d.missionIntentScore}</span> (avg: {d.missionIntentAvg?.toFixed(2) ?? '—'})</div>}
                        {d.groundTruthScore !== null && <div style={{ color: '#ec4899' }}>Ground Truth: <span className="font-mono">{d.groundTruthScore}</span> (avg: {d.groundTruthAvg?.toFixed(2) ?? '—'})</div>}
                        {d.behaviourScore !== null && <div style={{ color: '#8b5cf6' }}>Combined: <span className="font-mono">{d.behaviourScore}</span> (avg: {d.behaviourAvg?.toFixed(2) ?? '—'})</div>}
                        {d.systemScore !== null && <div style={{ color: '#3b82f6' }}>System: <span className="font-mono">{d.systemScore}</span> (avg: {d.systemAvg?.toFixed(2) ?? '—'})</div>}
                        {d.towerScore !== null && <div style={{ color: '#10b981' }}>Tower: <span className="font-mono">{d.towerScore}</span> (avg: {d.towerAvg?.toFixed(2) ?? '—'})</div>}
                      </div>
                    </div>
                  );
                }}
              />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="missionIntentAvg" name="Mission Intent (avg)" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="groundTruthAvg" name="Ground Truth (avg)" stroke="#ec4899" strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="behaviourAvg" name="Combined (avg)" stroke="#8b5cf6" strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="systemAvg" name="System (avg)" stroke="#3b82f6" strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="towerAvg" name="Tower (avg)" stroke="#10b981" strokeWidth={2} dot={false} connectNulls />
              <Scatter dataKey="missionIntentScore" name="Mission Intent" fill="#f59e0b" fillOpacity={0.4} shape="circle" r={3} legendType="none" />
              <Scatter dataKey="groundTruthScore" name="Ground Truth" fill="#ec4899" fillOpacity={0.4} shape="circle" r={3} legendType="none" />
              <Scatter dataKey="behaviourScore" name="Combined" fill="#8b5cf6" fillOpacity={0.4} shape="circle" r={3} legendType="none" />
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
                    {(() => {
                      const delivered = typeof r.metadata?.deliveredCount === 'number' ? r.metadata.deliveredCount : null;
                      const requested = typeof r.metadata?.requestedCount === 'number' ? r.metadata.requestedCount : null;
                      if (delivered === null || requested === null) return <span className="text-gray-400 text-xs">—</span>;
                      const pct = requested === 0 ? 100 : Math.min(100, Math.round((delivered / requested) * 100));
                      const cls = pct === 100 ? 'bg-green-100 text-green-800' : pct >= 60 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-700';
                      return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${cls}`}>{pct}%</span>;
                    })()}
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
