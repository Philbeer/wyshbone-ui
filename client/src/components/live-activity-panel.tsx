import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { 
  RefreshCw, Clock, CheckCircle2, XCircle, Loader2, AlertTriangle, 
  MessageSquare, Route, FileSearch, Wrench, ListChecks, Play, ChevronDown, ChevronUp,
  Zap, Brain, Send, Sparkles, Film, Eye
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUser } from "@/contexts/UserContext";
import { usePlan } from "@/contexts/PlanContext";

const IS_DEV = import.meta.env.DEV;

const MIN_VISIBLE_RUN_MS = 6000;
const POST_TERMINAL_HOLD_MS = 60000;

const THINKING_MS = 250;
const WORKING_MS = 250;
const EVENT_GAP_MS = 150;
const DEMO_THINKING_MS = 400;
const DEMO_WORKING_MS = 400;
const DEMO_EVENT_GAP_MS = 250;

function ThinkingIndicator({ variant = "inline" }: { variant?: "inline" | "footer" }) {
  const [phase, setPhase] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setPhase(p => (p + 1) % 3);
    }, 400);
    return () => clearInterval(interval);
  }, []);
  
  const brainCount = phase + 1;
  
  if (variant === "footer") {
    return (
      <div className="flex items-center gap-2 py-2 px-1 text-muted-foreground">
        <div className="flex items-center gap-0.5">
          {[0, 1, 2].map(i => (
            <Brain 
              key={i}
              className={cn(
                "h-3 w-3 transition-opacity duration-200",
                i < brainCount ? "opacity-70" : "opacity-20"
              )} 
            />
          ))}
        </div>
        <span className="text-xs">Working...</span>
      </div>
    );
  }
  
  return (
    <div className="relative pb-4">
      <span className="absolute left-[7px] top-0 -ml-px h-[1.5rem] w-0.5 bg-border" aria-hidden="true" />
      <span className="absolute left-[7px] top-6 bottom-0 -ml-px w-0.5 bg-border" aria-hidden="true" />
      <div className="relative flex items-start gap-3">
        <div className="flex h-4 items-center">
          <Sparkles className="h-4 w-4 text-muted-foreground/50 animate-pulse" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5">
              {[0, 1, 2].map(i => (
                <Brain 
                  key={i}
                  className={cn(
                    "h-3 w-3 text-muted-foreground transition-opacity duration-200",
                    i < brainCount ? "opacity-60" : "opacity-20"
                  )} 
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground/70">Thinking...</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StartingOverlay() {
  const [phase, setPhase] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setPhase(p => (p + 1) % 3);
    }, 400);
    return () => clearInterval(interval);
  }, []);
  
  const brainCount = phase + 1;
  
  return (
    <div 
      className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-card animate-in fade-in duration-200"
      style={{ backgroundColor: 'hsl(var(--card))' }}
    >
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-1">
          {[0, 1, 2].map(i => (
            <Brain 
              key={i}
              className={cn(
                "h-6 w-6 text-primary transition-all duration-300",
                i < brainCount ? "opacity-100 scale-110" : "opacity-30 scale-100"
              )} 
            />
          ))}
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">Starting request...</p>
          <p className="text-xs text-muted-foreground mt-0.5">Routing and planning</p>
        </div>
      </div>
    </div>
  );
}

interface Artefact {
  id: string;
  run_id: string;
  type: string;
  title: string | null;
  summary: string | null;
  payload_json: any;
  created_at: string;
}

interface Lead {
  name?: string;
  business_name?: string;
  title?: string;
  location?: string;
  postcode?: string;
  address?: string;
  city?: string;
  phone?: string;
  phone_number?: string;
  website?: string;
  url?: string;
  score?: number | string;
  [key: string]: any;
}

function parsePayload(payload: any): any {
  if (typeof payload === 'string') {
    try { return JSON.parse(payload); } catch { return payload; }
  }
  return payload;
}

function tryPrettyJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

function LeadsListTable({ payload }: { payload: any }) {
  const parsed = parsePayload(payload);
  const leads: Lead[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.leads)
      ? parsed.leads
      : Array.isArray(parsed?.results)
        ? parsed.results
        : [];

  if (leads.length === 0) {
    const hasRawContent = payload && (typeof payload === 'string' ? payload.trim().length > 2 : Object.keys(payload).length > 0);
    return (
      <div className="text-sm text-muted-foreground py-6 text-center">
        <p className="font-medium">No leads found</p>
        <p className="text-xs mt-1">This run did not produce any leads data.</p>
        {hasRawContent && (
          <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto max-h-40 whitespace-pre-wrap font-mono mt-3 text-left">
            {typeof payload === 'string' ? tryPrettyJson(payload) : JSON.stringify(payload, null, 2)}
          </pre>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded border max-h-96 overflow-y-auto">
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

interface EmailDraft {
  to?: string;
  subject?: string;
  body?: string;
  recipient_name?: string;
  company?: string;
  [key: string]: any;
}

function EmailDraftsView({ payload }: { payload: any }) {
  const parsed = parsePayload(payload);
  const drafts: EmailDraft[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.drafts)
      ? parsed.drafts
      : Array.isArray(parsed?.emails)
        ? parsed.emails
        : [];

  if (drafts.length === 0) {
    return (
      <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto max-h-64 whitespace-pre-wrap font-mono">
        {typeof payload === 'string' ? tryPrettyJson(payload) : JSON.stringify(payload, null, 2)}
      </pre>
    );
  }

  return (
    <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
      {drafts.map((draft, i) => (
        <div key={i} className="rounded-lg border bg-card p-4 space-y-2">
          <div className="flex items-start gap-2">
            <Send className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0 space-y-1.5">
              {draft.subject && (
                <div>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Subject</span>
                  <p className="text-sm font-medium leading-tight">{draft.subject}</p>
                </div>
              )}
              {(draft.to || draft.recipient_name) && (
                <div>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">To</span>
                  <p className="text-xs text-muted-foreground">
                    {draft.recipient_name && <span className="font-medium text-foreground">{draft.recipient_name}</span>}
                    {draft.recipient_name && draft.to && ' — '}
                    {draft.to}
                    {draft.company && <span className="text-muted-foreground"> ({draft.company})</span>}
                  </p>
                </div>
              )}
              {draft.body && (
                <div>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Body</span>
                  <div className="text-xs text-muted-foreground whitespace-pre-wrap bg-muted/30 rounded p-2 mt-0.5 leading-relaxed">
                    {draft.body}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ChatResponseView({ payload }: { payload: any }) {
  const parsed = typeof payload === 'string' ? (() => { try { return JSON.parse(payload); } catch { return null; } })() : payload;
  if (!parsed) return <pre className="text-xs bg-muted/50 rounded p-3 whitespace-pre-wrap">{String(payload)}</pre>;

  return (
    <div className="space-y-3">
      {parsed.user_message && (
        <div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Your Message</span>
          <p className="text-sm text-foreground mt-0.5">{parsed.user_message}</p>
        </div>
      )}
      {parsed.ai_response && (
        <div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">AI Response</span>
          <div className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/30 rounded p-2 mt-0.5 leading-relaxed max-h-96 overflow-y-auto">
            {parsed.ai_response}
          </div>
        </div>
      )}
      {parsed.tool_calls?.length > 0 && (
        <div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
            Tools Used ({parsed.tool_calls.length})
          </span>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {parsed.tool_calls.map((tc: any, i: number) => (
              <span key={i} className="text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded">
                {tc.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DeepResearchResultView({ payload }: { payload: any }) {
  const [expanded, setExpanded] = useState(false);
  const parsed = typeof payload === 'string' ? (() => { try { return JSON.parse(payload); } catch { return {}; } })() : (payload || {});
  
  const report = parsed.report || parsed.full_report || parsed.content || '';
  const sources = parsed.sources || parsed.references || [];
  const summary = parsed.summary || parsed.executive_summary || '';
  
  return (
    <div className="space-y-3">
      {summary && (
        <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{summary}</div>
      )}
      {report && (
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? 'Collapse full report' : 'Expand full report'}
          </button>
          {expanded && (
            <div className="mt-2 text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap bg-muted/30 rounded p-3 max-h-[60vh] overflow-y-auto">
              {report}
            </div>
          )}
        </div>
      )}
      {sources.length > 0 && (
        <div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
            Sources ({sources.length})
          </span>
          <ul className="mt-1 space-y-1">
            {sources.map((src: any, i: number) => {
              const url = typeof src === 'string' ? src : (src.url || src.link || '');
              const title = typeof src === 'string' ? src : (src.title || src.name || url);
              return (
                <li key={i} className="text-xs text-blue-600 dark:text-blue-400 truncate">
                  {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline">{title}</a>
                  ) : (
                    <span>{title}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {!summary && !report && (
        <pre className="text-xs bg-muted/50 rounded p-3 overflow-x-auto max-h-96 whitespace-pre-wrap font-mono">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      )}
    </div>
  );
}

function TowerVerdictBadge({ verdict, score }: { verdict: string; score?: number | null }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    accept: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', label: 'Accepted' },
    continue: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', label: 'Accepted' },
    revise: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', label: 'Revise' },
    change_plan: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', label: 'Plan Changed' },
    abandon: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', label: 'Abandoned' },
    stop: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', label: 'Stopped' },
  };
  const v = verdict.toLowerCase();
  const c = config[v] || { bg: 'bg-gray-100 dark:bg-gray-800/50', text: 'text-gray-700 dark:text-gray-300', label: verdict };

  return (
    <div className={cn("inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold", c.bg, c.text)}>
      <Brain className="h-3.5 w-3.5" />
      <span>Tower: {c.label}</span>
      {score != null && (
        <span className="ml-1 font-mono text-[10px] opacity-80">({Math.round(score * 100)}%)</span>
      )}
    </div>
  );
}

function RunSummaryView({ payload }: { payload: any }) {
  const parsed = parsePayload(payload);
  const delivered = parsed?.delivered ?? parsed?.delivered_count ?? null;
  const requested = parsed?.requested ?? parsed?.requested_count ?? null;
  const gaps = parsed?.gaps ?? parsed?.gap_list ?? [];
  const confidence = parsed?.confidence ?? parsed?.confidence_score ?? null;
  const rationale = parsed?.rationale ?? parsed?.reason ?? parsed?.explanation ?? '';
  const verdict = parsed?.verdict ?? null;
  const score = parsed?.score ?? null;

  return (
    <div className="space-y-3">
      {verdict && (
        <TowerVerdictBadge verdict={verdict} score={score} />
      )}

      {(delivered != null || requested != null) && (
        <div className="flex gap-4">
          {requested != null && (
            <div className="flex-1 rounded-lg border bg-muted/30 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Requested</p>
              <p className="text-2xl font-bold text-foreground mt-0.5">{requested}</p>
            </div>
          )}
          {delivered != null && (
            <div className="flex-1 rounded-lg border bg-muted/30 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Delivered</p>
              <p className={cn(
                "text-2xl font-bold mt-0.5",
                delivered >= (requested ?? 0) ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"
              )}>{delivered}</p>
            </div>
          )}
          {confidence != null && (
            <div className="flex-1 rounded-lg border bg-muted/30 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Confidence</p>
              <p className="text-2xl font-bold text-foreground mt-0.5">{typeof confidence === 'number' && confidence <= 1 ? `${Math.round(confidence * 100)}%` : confidence}</p>
            </div>
          )}
        </div>
      )}

      {Array.isArray(gaps) && gaps.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1">Gaps</p>
          <ul className="space-y-1">
            {gaps.map((gap: any, i: number) => (
              <li key={i} className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                <span>{typeof gap === 'string' ? gap : gap.description || gap.text || JSON.stringify(gap)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rationale && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1">Rationale</p>
          <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap bg-muted/30 rounded p-2">{rationale}</p>
        </div>
      )}

      {!delivered && !requested && !rationale && gaps.length === 0 && (
        <pre className="text-xs bg-muted/50 rounded p-3 overflow-x-auto max-h-96 whitespace-pre-wrap font-mono">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      )}
    </div>
  );
}

function PlanUpdateView({ payload }: { payload: any }) {
  const parsed = parsePayload(payload);
  const reason = parsed?.reason ?? parsed?.rationale ?? parsed?.change_reason ?? '';
  const changes = parsed?.changes ?? parsed?.plan_changes ?? parsed?.modifications ?? [];
  const newPlan = parsed?.new_plan ?? parsed?.plan_v2 ?? parsed?.updated_plan ?? null;
  const verdict = parsed?.verdict ?? null;
  const score = parsed?.score ?? null;

  return (
    <div className="space-y-3">
      {verdict && (
        <TowerVerdictBadge verdict={verdict} score={score} />
      )}

      {reason && (
        <div className="rounded-lg border border-purple-200 dark:border-purple-800/50 bg-purple-50/50 dark:bg-purple-900/10 p-3">
          <p className="text-[10px] uppercase tracking-wide text-purple-600 dark:text-purple-400 font-medium mb-1">Reason for Change</p>
          <p className="text-sm text-foreground/90 leading-relaxed">{reason}</p>
        </div>
      )}

      {Array.isArray(changes) && changes.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">Changes</p>
          <div className="space-y-1.5">
            {changes.map((change: any, i: number) => (
              <div key={i} className="flex items-start gap-2 text-xs rounded border bg-card p-2">
                <ListChecks className="h-3.5 w-3.5 text-purple-500 mt-0.5 shrink-0" />
                <span className="text-foreground/80">{typeof change === 'string' ? change : change.description || change.text || JSON.stringify(change)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {newPlan && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1">Updated Plan</p>
          {typeof newPlan === 'string' ? (
            <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap bg-muted/30 rounded p-2">{newPlan}</p>
          ) : Array.isArray(newPlan) ? (
            <ol className="space-y-1 list-decimal list-inside">
              {newPlan.map((step: any, i: number) => (
                <li key={i} className="text-xs text-foreground/80">
                  {typeof step === 'string' ? step : step.description || step.text || JSON.stringify(step)}
                </li>
              ))}
            </ol>
          ) : (
            <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto max-h-40 whitespace-pre-wrap font-mono">
              {JSON.stringify(newPlan, null, 2)}
            </pre>
          )}
        </div>
      )}

      {!reason && changes.length === 0 && !newPlan && (
        <pre className="text-xs bg-muted/50 rounded p-3 overflow-x-auto max-h-96 whitespace-pre-wrap font-mono">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ArtefactRenderer({ artefact }: { artefact: Artefact }) {
  switch (artefact.type) {
    case 'leads_list':
      return <LeadsListTable payload={artefact.payload_json} />;
    case 'email_drafts':
      return <EmailDraftsView payload={artefact.payload_json} />;
    case 'chat_response':
      return <ChatResponseView payload={artefact.payload_json} />;
    case 'deep_research_result':
      return <DeepResearchResultView payload={artefact.payload_json} />;
    case 'run_summary':
      return <RunSummaryView payload={artefact.payload_json} />;
    case 'plan_update':
      return <PlanUpdateView payload={artefact.payload_json} />;
    default:
      return (
        <pre className="text-xs bg-muted/50 rounded p-3 overflow-x-auto max-h-96 whitespace-pre-wrap font-mono">
          {typeof artefact.payload_json === 'string'
            ? tryPrettyJson(artefact.payload_json)
            : JSON.stringify(artefact.payload_json, null, 2)}
        </pre>
      );
  }
}

const ARTEFACT_LABELS: Record<string, { label: string; icon: string }> = {
  leads_list: { label: 'Leads', icon: '🏢' },
  email_drafts: { label: 'Email Drafts', icon: '✉️' },
  plan_result: { label: 'Summary', icon: '📋' },
  chat_response: { label: 'Chat Response', icon: '💬' },
  deep_research_result: { label: 'Research Report', icon: '🔬' },
  run_summary: { label: 'Run Summary', icon: '📊' },
  plan_update: { label: 'Plan v2', icon: '🔄' },
};

function ResultsModal({ clientRequestId, runId, open, onOpenChange }: { clientRequestId?: string | null; runId?: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [artefacts, setArtefacts] = useState<Artefact[]>([]);
  const [activeTab, setActiveTab] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || (!runId && !clientRequestId)) return;
    setLoading(true);
    setError(null);
    setArtefacts([]);
    setActiveTab('');

    const url = runId
      ? `/api/afr/artefacts?runId=${encodeURIComponent(runId)}`
      : `/api/afr/artefacts?client_request_id=${encodeURIComponent(clientRequestId!)}`;

    console.log(`[ResultsModal] Fetching artefacts — runId=${runId || 'n/a'} crid=${clientRequestId?.slice(0, 12) || 'n/a'} url=${url}`);

    fetch(url)
      .then(res => {
        console.log(`[ResultsModal] Response status=${res.status}`);
        if (!res.ok) throw new Error('Failed to fetch results');
        return res.json();
      })
      .then((rows: Artefact[]) => {
        console.log(`[ResultsModal] Got ${rows.length} artefact(s) — types: [${rows.map(r => r.type).join(', ')}]`);
        const byType = new Map<string, Artefact>();
        const typeOrder = ['run_summary', 'plan_update', 'deep_research_result', 'leads_list', 'email_drafts', 'plan_result', 'chat_response'];

        for (const row of rows) {
          const existing = byType.get(row.type);
          if (!existing || new Date(row.created_at) > new Date(existing.created_at)) {
            byType.set(row.type, row);
          }
        }

        const sorted = Array.from(byType.values()).sort((a, b) => {
          const ai = typeOrder.indexOf(a.type);
          const bi = typeOrder.indexOf(b.type);
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });

        setArtefacts(sorted);
        if (sorted.length > 0) {
          setActiveTab(sorted[0].type);
        }
      })
      .catch(() => setError('Could not load results.'))
      .finally(() => setLoading(false));
  }, [open, clientRequestId, runId]);

  const activeArtefact = artefacts.find(a => a.type === activeTab) || null;
  const hasTabs = artefacts.length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {artefacts.length === 1
              ? (activeArtefact?.title || 'Results')
              : 'Run Results'}
          </DialogTitle>
          <DialogDescription>
            {artefacts.length === 0 && !loading && !error
              ? 'No results yet.'
              : loading
                ? 'Loading results...'
                : `${artefacts.length} artefact${artefacts.length === 1 ? '' : 's'} from this run`}
          </DialogDescription>
        </DialogHeader>
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && (
          <div className="text-sm text-red-500 py-4 text-center">{error}</div>
        )}
        {!loading && !error && artefacts.length === 0 && (
          <div className="text-sm text-muted-foreground py-8 text-center">No results yet.</div>
        )}
        {!loading && !error && artefacts.length > 0 && (() => {
          const verdictSource = artefacts.find(a => {
            const p = parsePayload(a.payload_json);
            return p?.verdict && (a.type === 'run_summary' || a.type === 'plan_update' || p?.tower_judgement_received);
          });
          if (!verdictSource) return null;
          const p = parsePayload(verdictSource.payload_json);
          return (
            <div className="mb-2">
              <TowerVerdictBadge verdict={p.verdict} score={p.score ?? p.confidence} />
            </div>
          );
        })()}
        {!loading && !error && artefacts.length > 0 && !artefacts.some(a => a.type === 'leads_list') && !artefacts.some(a => a.type === 'deep_research_result') && !artefacts.some(a => a.type === 'run_summary') && !artefacts.some(a => a.type === 'plan_update') && (() => {
          const delegationArtefact = artefacts.find(a => {
            const p = parsePayload(a.payload_json);
            return p?.delegated_to_supervisor === true;
          });
          if (delegationArtefact) {
            return (
              <div className="text-xs text-blue-500/80 bg-blue-500/10 rounded px-3 py-2 mt-1">
                This task was delegated to deep research. Results will appear here once the research completes.
              </div>
            );
          }
          return (
            <div className="text-xs text-amber-500/80 bg-amber-500/10 rounded px-3 py-2 mt-1">
              No leads artefact found for this run.
            </div>
          );
        })()}
        {!loading && !error && artefacts.length > 0 && (
          <div className="mt-2 space-y-3">
            {hasTabs && (
              <div className="flex gap-1 border-b pb-2">
                {artefacts.map(a => {
                  const meta = ARTEFACT_LABELS[a.type] || { label: a.type, icon: '📄' };
                  return (
                    <button
                      key={a.type}
                      onClick={() => setActiveTab(a.type)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                        activeTab === a.type
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {meta.icon} {meta.label}
                    </button>
                  );
                })}
              </div>
            )}
            {activeArtefact && (
              <>
                {hasTabs && activeArtefact.summary && (
                  <p className="text-xs text-muted-foreground">{activeArtefact.summary}</p>
                )}
                <ArtefactRenderer artefact={activeArtefact} />
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SequenceStatusRow({ status, clientRequestId, runId }: { status: "completed" | "failed" | "stopped"; clientRequestId?: string | null; runId?: string | null }) {
  const [showResults, setShowResults] = useState(false);

  const config = {
    completed: { 
      icon: CheckCircle2, 
      label: "Sequence complete", 
      className: "text-green-500/70" 
    },
    failed: { 
      icon: XCircle, 
      label: "Sequence failed", 
      className: "text-red-500/70" 
    },
    stopped: { 
      icon: AlertTriangle, 
      label: "Sequence stopped", 
      className: "text-orange-500/70" 
    },
  };
  
  const { icon: Icon, label, className } = config[status];
  
  return (
    <>
      <div className="flex items-center justify-between gap-2 py-2 px-1 border-t border-border/50 mt-2">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4", className)} />
          <span className={cn("text-xs font-medium", className)}>{label}</span>
        </div>
        {(clientRequestId || runId) && status === 'completed' && (
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs px-2 gap-1"
            onClick={() => {
              console.log(`[ViewResults] Button clicked — runId=${runId || 'n/a'} crid=${clientRequestId?.slice(0, 12) || 'n/a'}`);
              setShowResults(true);
            }}
          >
            <Eye className="h-3 w-3" />
            View results
          </Button>
        )}
      </div>
      {(clientRequestId || runId) && (
        <ResultsModal clientRequestId={clientRequestId} runId={runId} open={showResults} onOpenChange={setShowResults} />
      )}
    </>
  );
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
    label?: string | null;
    prompt?: string | null;
    mode?: string | null;
    outputPreview?: string | null;
  };
  status: 'pending' | 'running' | 'completed' | 'failed';
  run_id: string | null;
  client_request_id: string | null;
  router_decision?: string | null;
  router_reason?: string | null;
}

interface StreamResponse {
  client_request_id: string | null;
  title: string;
  status: 'idle' | 'routing' | 'planning' | 'executing' | 'finalizing' | 'completed' | 'failed' | 'stopped';
  is_terminal: boolean;
  terminal_state: 'completed' | 'failed' | 'stopped' | null;
  ui_ready: boolean;
  run_id: string | null;
  events: StreamEvent[];
  event_count: number;
  last_updated: string;
  last_event_at?: string | null;
  error?: string;
  message?: string;
}

type OverallStatus = 'idle' | 'routing' | 'planning' | 'executing' | 'finalizing' | 'deep_research' | 'completed' | 'failed' | 'stopped';

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);

  if (diffSecs < 10) return "just now";
  if (diffSecs < 60) return `${diffSecs}s ago`;
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}

function formatEventTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    second: '2-digit',
    hour12: false 
  });
}

function StatusBadge({ status }: { status: OverallStatus }) {
  const config: Record<OverallStatus, { icon: typeof Clock; label: string; className: string }> = {
    idle: { icon: Clock, label: "Idle", className: "bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-300" },
    routing: { icon: Route, label: "Routing", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200" },
    planning: { icon: Brain, label: "Planning", className: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200" },
    executing: { icon: Zap, label: "Executing", className: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200" },
    finalizing: { icon: Zap, label: "Finalizing", className: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200" },
    deep_research: { icon: FileSearch, label: "Researching", className: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-200" },
    completed: { icon: CheckCircle2, label: "Completed", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200" },
    failed: { icon: XCircle, label: "Failed", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200" },
    stopped: { icon: AlertTriangle, label: "Stopped", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200" },
  };

  const { icon: Icon, label, className } = config[status] || config.idle;
  const isAnimated = ['routing', 'planning', 'executing', 'finalizing', 'deep_research'].includes(status);
  
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", className)}>
      <Icon className={cn("h-3 w-3", isAnimated && "animate-pulse")} />
      {label}
    </span>
  );
}

function EventIcon({ type }: { type: string }) {
  const iconMap: Record<string, { icon: typeof MessageSquare; className: string }> = {
    user_message_received: { icon: MessageSquare, className: "text-blue-500" },
    router_decision: { icon: Route, className: "text-purple-500" },
    plan_created: { icon: ListChecks, className: "text-indigo-500" },
    plan_approved: { icon: CheckCircle2, className: "text-green-500" },
    plan_rejected: { icon: XCircle, className: "text-red-500" },
    plan_updated: { icon: ListChecks, className: "text-indigo-400" },
    tool_call_started: { icon: Wrench, className: "text-orange-500" },
    tool_call_completed: { icon: CheckCircle2, className: "text-green-500" },
    deep_research_started: { icon: FileSearch, className: "text-cyan-500" },
    deep_research_completed: { icon: CheckCircle2, className: "text-green-500" },
    supervisor_plan: { icon: Brain, className: "text-purple-500" },
    direct_response: { icon: Send, className: "text-blue-400" },
    streaming_response: { icon: Zap, className: "text-yellow-500" },
    run_completed: { icon: CheckCircle2, className: "text-green-500" },
    run_failed: { icon: XCircle, className: "text-red-500" },
    plan_execution_started: { icon: Play, className: "text-indigo-500" },
    plan_execution_completed: { icon: CheckCircle2, className: "text-green-500" },
    plan_execution_halted: { icon: AlertTriangle, className: "text-orange-500" },
    step_started: { icon: Zap, className: "text-blue-500" },
    step_completed: { icon: CheckCircle2, className: "text-green-500" },
    judgement_received: { icon: Brain, className: "text-purple-500" },
    tower_judgement: { icon: Brain, className: "text-purple-500" },
    tower_evaluation_completed: { icon: Brain, className: "text-purple-500" },
    tower_decision_stop: { icon: AlertTriangle, className: "text-orange-500" },
    tower_decision_change_plan: { icon: ListChecks, className: "text-purple-400" },
  };

  const baseType = type.includes(':') ? type.split(':')[0] : type;
  const { icon: Icon, className } = iconMap[type] || iconMap[baseType] || { icon: Play, className: "text-gray-500" };
  return <Icon className={cn("h-4 w-4 shrink-0", className)} />;
}

function EventStatusIndicator({ status }: { status: StreamEvent['status'] }) {
  if (status === 'running') {
    return <Loader2 className="h-3 w-3 text-blue-500 animate-spin shrink-0" />;
  }
  if (status === 'completed') {
    return <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />;
  }
  if (status === 'failed') {
    return <XCircle className="h-3 w-3 text-red-500 shrink-0" />;
  }
  return <Clock className="h-3 w-3 text-gray-400 shrink-0" />;
}

function resolveEventSummary(event: StreamEvent): string {
  if (event.summary && event.summary !== event.type) {
    const looksRaw = /^[a-z_]+$/.test(event.summary) || event.summary.includes('_');
    if (!looksRaw) return event.summary;
    const humanized = humanizeEventType(event.summary);
    if (humanized !== event.summary) return humanized;
    return event.summary;
  }
  return humanizeEventType(event.type);
}

function isTowerEvent(event: StreamEvent): boolean {
  const t = event.type;
  const action = event.details?.action;
  return t.startsWith('tower_') ||
    t === 'judgement_received' ||
    t === 'tower_judgement' ||
    !!(action && action.startsWith('tower_'));
}

const TERMINAL_EVENT_TYPES = new Set([
  'run_completed',
  'plan_execution_completed',
  'tower_decision_stop',
  'sequence_complete',
  'run_failed',
  'run_stopped',
]);

function isTerminalEvent(event: StreamEvent, index: number, events: StreamEvent[]): boolean {
  const t = event.type?.toLowerCase() || '';
  if (TERMINAL_EVENT_TYPES.has(t)) return true;
  if (t.includes('completed') && index === events.length - 1) return true;
  if (event.status === 'completed' && index === events.length - 1) return true;
  if (event.status === 'failed' && index === events.length - 1) return true;
  return false;
}

function ProvenanceBadge({ isTower }: { isTower: boolean }) {
  return isTower ? (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 leading-none">
      Tower
    </span>
  ) : (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 leading-none">
      Supervisor
    </span>
  );
}

function isMessageReceivedRow(event: StreamEvent): boolean {
  const t = event.type?.toLowerCase() || '';
  const action = event.details?.action?.toLowerCase() || '';
  const summary = resolveEventSummary(event);
  return t === 'user_message_received' ||
    t === 'user_message' ||
    action === 'user_message_received' ||
    summary.startsWith('Message received:');
}

function TimelineEvent({ event, isFirst = false, isLast, isTerminal }: { event: StreamEvent; isFirst?: boolean; isLast: boolean; isTerminal: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const hasIds = !!(event.client_request_id || event.run_id);
  const hasDetails = hasIds || (event.details && (
    event.details.error || 
    event.details.results || 
    event.router_decision ||
    event.router_reason
  ));

  const tower = isTowerEvent(event);
  const noConnector = isLast || isTerminal;
  const messageRow = isMessageReceivedRow(event);

  const statusIcon = event.status === 'completed' ? '✅' :
                     event.status === 'failed' ? '❌' :
                     event.status === 'running' ? null :
                     '⏳';

  return (
    <div className={cn("relative", noConnector ? "pb-2" : "pb-4")}>
      {!isFirst && (
        <span className="absolute left-[7px] top-0 -ml-px h-[1.5rem] w-0.5 bg-border" aria-hidden="true" />
      )}
      {!noConnector && (
        <span className="absolute left-[7px] top-6 bottom-0 -ml-px w-0.5 bg-border" aria-hidden="true" />
      )}
      <div className="relative flex items-start gap-3">
        <div className="flex h-4 items-center shrink-0">
          {statusIcon ? (
            <span className="text-sm leading-none" aria-label={event.status}>{statusIcon}</span>
          ) : (
            <Loader2 className="h-4 w-4 text-blue-500 animate-spin shrink-0" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          {messageRow ? (
            <div className="flex flex-col gap-1">
              <p
                className="text-sm font-medium text-foreground leading-snug whitespace-normal break-words w-full"
                title={resolveEventSummary(event)}
              >
                {resolveEventSummary(event)}
              </p>
              <div className="flex items-center gap-1.5">
                <ProvenanceBadge isTower={tower} />
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {formatRelativeTime(event.ts)}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex justify-between gap-2">
              <p
                className="text-sm font-medium text-foreground leading-snug whitespace-normal break-words line-clamp-3 min-w-0"
                title={resolveEventSummary(event)}
              >
                {resolveEventSummary(event)}
              </p>
              <div className="flex items-start gap-1.5 shrink-0 pt-0.5">
                <ProvenanceBadge isTower={tower} />
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {formatRelativeTime(event.ts)}
                </span>
              </div>
            </div>
          )}
          
          {event.router_decision && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {event.router_decision === 'tool_call' ? (
                <>
                  <span className="font-medium text-blue-600 dark:text-blue-400">Mode: Single action</span>
                  {' - Auto-executing'}
                  {event.router_reason && ` (${event.router_reason})`}
                </>
              ) : event.router_decision === 'supervisor_plan' || event.router_decision === 'plan' ? (
                <>
                  <span className="font-medium text-purple-600 dark:text-purple-400">Mode: Multi-step plan</span>
                  {' - Supervisor engaged, running now'}
                </>
              ) : (
                <>
                  Path: <span className="font-medium text-foreground">{event.router_decision}</span>
                  {event.router_reason && ` - ${event.router_reason}`}
                </>
              )}
            </p>
          )}

          {hasDetails && (
            <button
              onClick={() => {
                const next = !expanded;
                setExpanded(next);
                if (next) {
                  console.log(`[ShowDetails] crid=${event.client_request_id || 'n/a'} runId=${event.run_id || 'n/a'} type=${event.type}`);
                }
              }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-1"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? 'Hide details' : 'Show details'}
            </button>
          )}

          {expanded && hasDetails && (
            <div className="mt-2 p-2 bg-muted/50 rounded-md text-xs space-y-1">
              {event.client_request_id && (
                <p className="text-muted-foreground font-mono">
                  <span className="font-medium text-foreground">crid:</span> {event.client_request_id}
                </p>
              )}
              {event.run_id && (
                <p className="text-muted-foreground font-mono">
                  <span className="font-medium text-foreground">runId:</span> {event.run_id}
                </p>
              )}
              {(event.details as any)?.supervisorTaskId && (
                <p className="text-muted-foreground font-mono">
                  <span className="font-medium text-foreground">supervisorTaskId:</span> {(event.details as any).supervisorTaskId}
                </p>
              )}
              {event.details?.error && (
                <p className="text-red-600 dark:text-red-400">
                  Error: {event.details.error}
                </p>
              )}
              {event.details?.durationMs && (
                <p className="text-muted-foreground">
                  Duration: {event.details.durationMs}ms
                </p>
              )}
              {event.details?.results && (
                <p className="text-muted-foreground break-all">
                  Results: {event.details.results.slice(0, 200)}
                  {event.details.results.length > 200 && '...'}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type PlaybackPhase = 'thinking' | 'working' | 'revealed';

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function usePacedPlaybackQueue(
  allEvents: StreamEvent[],
  isDemoMode: boolean,
  clientRequestId: string | null | undefined
): { displayEvents: StreamEvent[]; transientPhase: PlaybackPhase | null } {
  const [, forceRender] = useState(0);
  const kick = useCallback(() => forceRender(n => n + 1), []);

  const revealedRef = useRef<StreamEvent[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const queueRef = useRef<StreamEvent[]>([]);
  const isPlayingRef = useRef(false);
  const phaseRef = useRef<PlaybackPhase | null>(null);
  const prevKeyRef = useRef<string | null | undefined>(undefined);
  const cancelRef = useRef(0);

  const timingsRef = useRef({ thinkingMs: THINKING_MS, workingMs: WORKING_MS, gapMs: EVENT_GAP_MS });
  timingsRef.current = {
    thinkingMs: isDemoMode ? DEMO_THINKING_MS : THINKING_MS,
    workingMs: isDemoMode ? DEMO_WORKING_MS : WORKING_MS,
    gapMs: isDemoMode ? DEMO_EVENT_GAP_MS : EVENT_GAP_MS,
  };

  const kickPlayer = useCallback(() => {
    if (isPlayingRef.current) return;
    isPlayingRef.current = true;
    const generation = ++cancelRef.current;

    const loop = async () => {
      while (true) {
        if (cancelRef.current !== generation) return;

        if (queueRef.current.length === 0) {
          await Promise.resolve();
          if (queueRef.current.length > 0) continue;
          break;
        }

        const event = queueRef.current[0];

        phaseRef.current = 'thinking';
        kick();
        await delay(timingsRef.current.thinkingMs);
        if (cancelRef.current !== generation) return;

        phaseRef.current = 'working';
        kick();
        await delay(timingsRef.current.workingMs);
        if (cancelRef.current !== generation) return;

        queueRef.current.shift();
        revealedRef.current = [...revealedRef.current, event];
        phaseRef.current = null;
        kick();

        if (queueRef.current.length > 0) {
          await delay(timingsRef.current.gapMs);
          if (cancelRef.current !== generation) return;
        }
      }

      isPlayingRef.current = false;
      kick();
    };

    loop();
  }, [kick]);

  useEffect(() => {
    if (clientRequestId !== prevKeyRef.current && prevKeyRef.current !== undefined) {
      cancelRef.current++;
      isPlayingRef.current = false;
      revealedRef.current = [];
      seenIdsRef.current = new Set();
      queueRef.current = [];
      phaseRef.current = null;
      kick();
    }
    prevKeyRef.current = clientRequestId;

    let hasNew = false;
    for (const event of allEvents) {
      if (!seenIdsRef.current.has(event.id)) {
        seenIdsRef.current.add(event.id);
        queueRef.current.push(event);
        hasNew = true;
      }
    }

    if (hasNew) {
      kickPlayer();
    }
  }, [allEvents, clientRequestId, kickPlayer, kick]);

  useEffect(() => {
    return () => { cancelRef.current++; };
  }, []);

  return {
    displayEvents: revealedRef.current,
    transientPhase: queueRef.current.length > 0 ? phaseRef.current : null,
  };
}

function TransientPhaseRow({ phase }: { phase: PlaybackPhase }) {
  if (phase === 'thinking') {
    return (
      <div className="relative pb-4">
        <span className="absolute left-[7px] top-0 -ml-px h-[1.5rem] w-0.5 bg-border" aria-hidden="true" />
        <span className="absolute left-[7px] top-6 bottom-0 -ml-px w-0.5 bg-border" aria-hidden="true" />
        <div className="relative flex items-start gap-3">
          <div className="flex h-4 items-center">
            <Sparkles className="h-4 w-4 text-muted-foreground/50 animate-pulse" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground/70 italic">Thinking...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative pb-4">
      <span className="absolute left-[7px] top-0 -ml-px h-[1.5rem] w-0.5 bg-border" aria-hidden="true" />
      <span className="absolute left-[7px] top-6 bottom-0 -ml-px w-0.5 bg-border" aria-hidden="true" />
      <div className="relative flex items-start gap-3">
        <div className="flex h-4 items-center">
          <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground/70 italic">Working...</p>
        </div>
      </div>
    </div>
  );
}

function mapActivityRunTypeToEventType(runType: string, action: string | null): string {
  if (runType.startsWith('step_started')) return runType;
  if (runType.startsWith('step_completed')) return runType;

  switch (runType) {
    case 'user_message':
      return 'user_message_received';
    case 'router':
    case 'routing':
      return 'router_decision';
    case 'plan':
    case 'planning':
      return action?.includes('create') ? 'plan_created' :
             action?.includes('approve') ? 'plan_approved' :
             action?.includes('reject') ? 'plan_rejected' : 'plan_updated';
    case 'tool':
    case 'tool_call':
      return action?.includes('complete') || action?.includes('finish') ?
             'tool_call_completed' : 'tool_call_started';
    case 'deep_research':
      return 'deep_research_started';
    case 'supervisor':
      return 'supervisor_plan';
    case 'direct_response':
      return 'direct_response';
    case 'stream':
      return 'streaming_response';
    case 'run_completed':
      return 'run_completed';
    case 'run_failed':
      return 'run_failed';
    case 'plan_execution_started':
      return 'plan_execution_started';
    case 'plan_execution_completed':
      return 'plan_execution_completed';
    case 'plan_execution_halted':
      return 'plan_execution_halted';
    case 'judgement_received':
    case 'tower_judgement':
    case 'tower_evaluation_completed':
    case 'tower_decision_stop':
    case 'tower_decision_change_plan':
      return runType;
    default:
      if (runType.startsWith('tower_')) return runType;
      if (action?.startsWith('tower_')) return action;
      if (action?.startsWith('step_started')) return action;
      if (action?.startsWith('step_completed')) return action;
      return action || runType || 'unknown_event';
  }
}

function humanizeEventType(eventType: string): string {
  const knownLabels: Record<string, string> = {
    plan_execution_started: 'Plan created and execution started',
    plan_execution_completed: 'Plan execution completed',
    plan_execution_halted: 'Execution stopped by Tower',
    judgement_received: 'Tower evaluated results',
    tower_judgement: 'Tower evaluated results',
    tower_evaluation_completed: 'Tower evaluation completed',
    tower_decision_stop: 'Tower decided to stop execution',
    tower_decision_change_plan: 'Tower decided to change plan',
  };

  if (knownLabels[eventType]) return knownLabels[eventType];

  if (eventType.startsWith('step_started:')) {
    const stepName = eventType.slice('step_started:'.length);
    return `Executing step: ${stepName}`;
  }
  if (eventType.startsWith('step_completed:')) {
    const stepName = eventType.slice('step_completed:'.length);
    return `Step completed: ${stepName}`;
  }

  return eventType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function buildActivitySummary(runType: string, action: string | null, label: string | null): string {
  if (runType.startsWith('step_started:') || runType.startsWith('step_completed:')) {
    return humanizeEventType(runType);
  }
  if (action?.startsWith('step_started:') || action?.startsWith('step_completed:')) {
    return humanizeEventType(action);
  }

  switch (runType) {
    case 'user_message':
      return `Message received: "${label?.slice(0, 60) || 'User message'}${label && label.length > 60 ? '...' : ''}"`;
    case 'router':
    case 'routing':
      return `Router decision: ${action || 'processing'}`;
    case 'plan':
    case 'planning':
      if (action?.includes('create')) return 'Created execution plan';
      if (action?.includes('approve')) return 'Plan approved by user';
      if (action?.includes('reject')) return 'Plan rejected by user';
      return label?.slice(0, 80) || `Plan: ${action || 'updating'}`;
    case 'tool':
    case 'tool_call':
      return action?.includes('complete') || action?.includes('finish') ?
        `Completed: ${action?.replace(/_/g, ' ') || 'Tool'}` :
        `Started: ${action?.replace(/_/g, ' ') || 'Tool'}`;
    case 'deep_research':
      return `Deep research: ${label?.slice(0, 50) || 'analyzing'}`;
    case 'supervisor':
      return 'Supervisor creating plan';
    case 'direct_response':
      return 'Direct response (no tools needed)';
    case 'stream':
      return 'Streaming AI response';
    case 'run_completed':
      return label || 'Run completed';
    case 'run_failed':
      return label || 'Run failed';
    case 'plan_execution_started':
      return 'Plan created and execution started';
    case 'plan_execution_completed':
      return 'Plan execution completed';
    case 'plan_execution_halted':
      return 'Execution stopped by Tower';
    case 'judgement_received':
    case 'tower_judgement':
      return 'Tower evaluated results';
    case 'tower_evaluation_completed':
      return 'Tower evaluation completed';
    case 'tower_decision_stop':
      return 'Tower decided to stop execution';
    case 'tower_decision_change_plan':
      return 'Tower decided to change plan';
    default:
      if (runType.startsWith('tower_'))
        return label?.slice(0, 80) || humanizeEventType(runType);
      return label?.slice(0, 80) || (action ? humanizeEventType(action) : humanizeEventType(runType));
  }
}

function mapActivityStatus(status: string | null): 'pending' | 'running' | 'completed' | 'failed' {
  switch (status) {
    case 'success':
    case 'completed':
      return 'completed';
    case 'failed':
    case 'error':
      return 'failed';
    case 'pending':
      return 'pending';
    case 'running':
    case 'in_progress':
      return 'running';
    default:
      return 'pending';
  }
}

interface LiveActivityPanelProps {
  activeClientRequestId?: string | null;
  onRequestIdChange?: (id: string | null) => void;
}

const THINKING_THRESHOLD_MS = 200;
const OVERLAY_DURATION_MS = 2000;
const TERMINAL_STABILITY_MS = 800;
const DEBUG_TERMINAL = true;

const ACTIVE_STATUSES = ['routing', 'planning', 'executing', 'deep_research', 'running', 'in_progress'];
const TERMINAL_STATUSES = ['completed', 'failed', 'stopped'];

export function LiveActivityPanel({ activeClientRequestId, onRequestIdChange }: LiveActivityPanelProps) {
  const { user } = useUser();
  const { plan } = usePlan();
  const [stream, setStream] = useState<StreamResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showThinking, setShowThinking] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [confirmedTerminal, setConfirmedTerminal] = useState(false);
  
  const [demoPlayback, setDemoPlayback] = useState(IS_DEV);

  const [minVisibleHold, setMinVisibleHold] = useState(false);
  const [postTerminalHold, setPostTerminalHold] = useState(false);
  const minVisibleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const postTerminalTimerRef = useRef<NodeJS.Timeout | null>(null);
  const runStartTimeRef = useRef<number | null>(null);

  const hasActivePlan = plan && ['approved', 'executing', 'pending_approval'].includes(plan.status);
  const isMultiStepPlan = hasActivePlan && plan.steps && plan.steps.length >= 2;
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevEventCount = useRef(0);
  const prevActiveIdRef = useRef<string | null | undefined>(undefined);
  const thinkingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const overlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const terminalStabilityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const terminalEventCountRef = useRef<number | null>(null);
  const nearBottomRef = useRef(true);
  const autoScrollTimerRef = useRef<number | null>(null);
  const lastAutoScrollRef = useRef(0);
  const fetchAbortRef = useRef<AbortController | null>(null);
  
  const streamRequestId = stream?.client_request_id;
  const idsMatch = !!(activeClientRequestId && streamRequestId && activeClientRequestId === streamRequestId);

  const allEvents = useMemo(() => stream?.events || [], [stream?.events]);
  const effectiveDemoPlayback = demoPlayback && !activeClientRequestId;
  const { displayEvents, transientPhase } = usePacedPlaybackQueue(allEvents, effectiveDemoPlayback, activeClientRequestId);
  const allRevealed = displayEvents.length >= allEvents.length;

  const fetchStream = useCallback(async () => {
    if (fetchAbortRef.current) {
      fetchAbortRef.current.abort();
    }
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    try {
      if (!activeClientRequestId) {
        setStream(null);
        setLoading(false);
        return;
      }

      const params = new URLSearchParams();
      params.set('client_request_id', activeClientRequestId);
      
      const response = await fetch(`/api/afr/stream?${params.toString()}`, { signal: controller.signal });
      if (!response.ok) {
        throw new Error("Failed to fetch activity stream");
      }
      
      const data: StreamResponse = await response.json();

      if (controller.signal.aborted) return;

      if (activeClientRequestId && data.client_request_id && data.client_request_id !== activeClientRequestId) {
        if (IS_DEV) console.warn('[LiveActivityPanel] Ignoring stale response for', data.client_request_id, 'expected', activeClientRequestId);
        return;
      }

      setStream(data);
      setError(null);
      setLastFetch(new Date());


      if (nearBottomRef.current && data.event_count > prevEventCount.current) {
        if (autoScrollTimerRef.current) cancelAnimationFrame(autoScrollTimerRef.current);
        autoScrollTimerRef.current = requestAnimationFrame(() => {
          const now = Date.now();
          const isBursty = now - lastAutoScrollRef.current < 300;
          lastAutoScrollRef.current = now;
          bottomRef.current?.scrollIntoView({
            block: 'end',
            behavior: isBursty ? 'auto' : 'smooth',
          });
          autoScrollTimerRef.current = null;
        });
      }
      
      if (data.event_count > prevEventCount.current) {
        setShowThinking(false);
        if (thinkingTimerRef.current) {
          clearTimeout(thinkingTimerRef.current);
          thinkingTimerRef.current = null;
        }
      }
      
      prevEventCount.current = data.event_count;

    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.error("[LiveActivityPanel] Fetch error:", err);
      setError("Could not load activity stream.");
    } finally {
      setLoading(false);
    }
  }, [user?.id, activeClientRequestId, autoScroll]);

  useEffect(() => {
    fetchStream();
  }, [fetchStream]);

  useEffect(() => {
    if (activeClientRequestId && activeClientRequestId !== prevActiveIdRef.current) {
      if (DEBUG_TERMINAL) {
        console.log('[STATUS_DEBUG] activeClientRequestId changed (overlay trigger):', {
          from: prevActiveIdRef.current,
          to: activeClientRequestId
        });
      }
      
      if (overlayTimerRef.current) {
        clearTimeout(overlayTimerRef.current);
        overlayTimerRef.current = null;
      }
      if (terminalStabilityTimerRef.current) {
        clearTimeout(terminalStabilityTimerRef.current);
        terminalStabilityTimerRef.current = null;
      }
      
      if (fetchAbortRef.current) {
        fetchAbortRef.current.abort();
        fetchAbortRef.current = null;
      }
      
      setConfirmedTerminal(false);
      setShowThinking(false);
      terminalEventCountRef.current = null;
      prevEventCount.current = 0;
      
      setStream(null);
      
      setMinVisibleHold(true);
      setPostTerminalHold(false);
      runStartTimeRef.current = Date.now();
      if (minVisibleTimerRef.current) {
        clearTimeout(minVisibleTimerRef.current);
      }
      minVisibleTimerRef.current = setTimeout(() => {
        setMinVisibleHold(false);
        minVisibleTimerRef.current = null;
      }, MIN_VISIBLE_RUN_MS);

      if (postTerminalTimerRef.current) {
        clearTimeout(postTerminalTimerRef.current);
        postTerminalTimerRef.current = null;
      }
      
      setShowOverlay(true);
      overlayTimerRef.current = setTimeout(() => {
        setShowOverlay(false);
        overlayTimerRef.current = null;
      }, OVERLAY_DURATION_MS);
    }
    
    prevActiveIdRef.current = activeClientRequestId;
  }, [activeClientRequestId]);
  
  useEffect(() => {
    return () => {
      if (overlayTimerRef.current) {
        clearTimeout(overlayTimerRef.current);
        overlayTimerRef.current = null;
      }
      if (terminalStabilityTimerRef.current) {
        clearTimeout(terminalStabilityTimerRef.current);
        terminalStabilityTimerRef.current = null;
      }
      if (minVisibleTimerRef.current) {
        clearTimeout(minVisibleTimerRef.current);
        minVisibleTimerRef.current = null;
      }
      if (postTerminalTimerRef.current) {
        clearTimeout(postTerminalTimerRef.current);
        postTerminalTimerRef.current = null;
      }
      if (autoScrollTimerRef.current) {
        cancelAnimationFrame(autoScrollTimerRef.current);
        autoScrollTimerRef.current = null;
      }
      if (fetchAbortRef.current) {
        fetchAbortRef.current.abort();
        fetchAbortRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const isActive = stream?.status && !['idle', 'completed', 'failed'].includes(stream.status) && (stream?.status as string) !== 'stopped';
    const intervalMs = isActive ? 1500 : 10000;

    const interval = setInterval(fetchStream, intervalMs);
    return () => clearInterval(interval);
  }, [stream?.status, fetchStream]);

  useEffect(() => {
    const handleFocus = () => fetchStream();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchStream]);

  useEffect(() => {
    const apiIsTerminal = stream?.is_terminal ?? false;
    const terminalState = stream?.terminal_state;
    const currentEventCount = stream?.event_count || 0;
    
    if (DEBUG_TERMINAL) {
      console.log('[TERMINAL_DEBUG] Check:', {
        apiIsTerminal,
        terminalState,
        idsMatch,
        eventCount: currentEventCount,
        prevEventCount: terminalEventCountRef.current,
        confirmedTerminal
      });
    }
    
    if (!idsMatch) {
      if (terminalStabilityTimerRef.current) {
        clearTimeout(terminalStabilityTimerRef.current);
        terminalStabilityTimerRef.current = null;
      }
      terminalEventCountRef.current = null;
      return;
    }
    
    if (!apiIsTerminal) {
      if (terminalStabilityTimerRef.current) {
        clearTimeout(terminalStabilityTimerRef.current);
        terminalStabilityTimerRef.current = null;
      }
      if (confirmedTerminal || terminalEventCountRef.current !== null) {
        if (DEBUG_TERMINAL) console.log('[TERMINAL_DEBUG] API says not terminal - resetting');
        setConfirmedTerminal(false);
        terminalEventCountRef.current = null;
      }
      return;
    }
    
    if (apiIsTerminal && terminalState && idsMatch) {
      if (terminalEventCountRef.current !== null && currentEventCount !== terminalEventCountRef.current) {
        if (DEBUG_TERMINAL) console.log('[TERMINAL_DEBUG] New events arrived, resetting stability timer');
        if (terminalStabilityTimerRef.current) {
          clearTimeout(terminalStabilityTimerRef.current);
          terminalStabilityTimerRef.current = null;
        }
        terminalEventCountRef.current = null;
      }
      
      if (terminalEventCountRef.current === null && !terminalStabilityTimerRef.current) {
        if (DEBUG_TERMINAL) console.log('[TERMINAL_DEBUG] Starting 800ms stability timer');
        terminalEventCountRef.current = currentEventCount;
        terminalStabilityTimerRef.current = setTimeout(() => {
          if (DEBUG_TERMINAL) console.log('[TERMINAL_DEBUG] *** CONFIRMING TERMINAL after stability ***');
          setConfirmedTerminal(true);
          terminalStabilityTimerRef.current = null;
        }, TERMINAL_STABILITY_MS);
      }
    }
  }, [stream?.is_terminal, stream?.terminal_state, stream?.event_count, idsMatch]);

  useEffect(() => {
    if (!confirmedTerminal) return;
    if (postTerminalTimerRef.current) return;

    setPostTerminalHold(true);
    postTerminalTimerRef.current = setTimeout(() => {
      setPostTerminalHold(false);
      postTerminalTimerRef.current = null;
    }, POST_TERMINAL_HOLD_MS);
  }, [confirmedTerminal]);

  useEffect(() => {
    if (thinkingTimerRef.current) {
      clearTimeout(thinkingTimerRef.current);
      thinkingTimerRef.current = null;
    }
    
    const hasActiveRequest = !!activeClientRequestId;
    const isRunActive = hasActiveRequest && !confirmedTerminal && !showOverlay;
    
    if (!isRunActive) {
      setShowThinking(false);
      return;
    }
    
    thinkingTimerRef.current = setTimeout(() => {
      setShowThinking(true);
      thinkingTimerRef.current = null;
    }, THINKING_THRESHOLD_MS);
    
    return () => {
      if (thinkingTimerRef.current) {
        clearTimeout(thinkingTimerRef.current);
        thinkingTimerRef.current = null;
      }
    };
  }, [activeClientRequestId, confirmedTerminal, showOverlay, stream?.event_count]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const nearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 80;
    nearBottomRef.current = nearBottom;
    setAutoScroll(nearBottom);
  };

  const prevDisplayCountRef = useRef(0);
  useEffect(() => {
    if (displayEvents.length > prevDisplayCountRef.current && nearBottomRef.current) {
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
      });
    }
    prevDisplayCountRef.current = displayEvents.length;
  }, [displayEvents.length]);

  const effectiveTerminal = confirmedTerminal && !minVisibleHold && (effectiveDemoPlayback ? allRevealed : true);

  const mappedStatus: OverallStatus = (() => {
    if (activeClientRequestId && !idsMatch) {
      return 'executing';
    }
    
    if (!stream) return 'idle';
    
    if (!activeClientRequestId && stream.is_terminal) {
      if (postTerminalHold) {
        return stream.terminal_state || 'idle';
      }
      return 'idle';
    }
    
    if (activeClientRequestId && !stream.ui_ready) {
      return 'executing';
    }
    
    if (idsMatch && stream.is_terminal && stream.terminal_state && effectiveTerminal) {
      return stream.terminal_state;
    }
    
    if (stream.is_terminal && stream.terminal_state) {
      if (minVisibleHold || (demoPlayback && !allRevealed)) {
        return 'executing';
      }
      return 'executing';
    }
    
    const s = stream.status;
    if (s === 'routing') return 'routing';
    if (s === 'planning') return 'planning';
    if (s === 'finalizing') return 'finalizing';
    if (s === 'executing') {
      const hasDeepResearch = stream.events.some(e => 
        e.type.includes('deep_research') && e.status === 'running'
      );
      if (hasDeepResearch) return 'deep_research';
      return 'executing';
    }
    return 'idle';
  })();
  
  const isWorking = !showOverlay && (
    (activeClientRequestId && !effectiveTerminal) ||
    (mappedStatus !== 'idle' && mappedStatus !== 'completed' && mappedStatus !== 'failed' && mappedStatus !== 'stopped' && mappedStatus !== 'finalizing')
  );

  useEffect(() => {
    if (nearBottomRef.current && (transientPhase || showThinking || isWorking)) {
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
      });
    }
  }, [transientPhase, showThinking, isWorking]);
    
  const streamEvents = stream?.events || [];
  useEffect(() => {
    if (DEBUG_TERMINAL) {
      console.log('[STATUS_DEBUG] Poll state:', {
        activeClientRequestId,
        streamRequestId,
        idsMatch,
        is_terminal: stream?.is_terminal,
        terminal_state: stream?.terminal_state,
        ui_ready: stream?.ui_ready,
        run_id: stream?.run_id,
        mappedStatus,
        confirmedTerminal,
        effectiveTerminal,
        minVisibleHold,
        postTerminalHold,
        demoPlayback: effectiveDemoPlayback,
        revealedEvents: displayEvents.length,
        totalEvents: allEvents.length,
        isWorking,
        showThinking,
        showOverlay,
        eventCount: stream?.event_count || 0,
      });
    }
  }, [stream?.is_terminal, stream?.terminal_state, stream?.ui_ready, stream?.run_id, stream?.event_count, confirmedTerminal, effectiveTerminal, minVisibleHold, postTerminalHold, demoPlayback, displayEvents.length, allEvents.length, mappedStatus, activeClientRequestId, idsMatch, isWorking, showThinking, showOverlay, streamRequestId]);

  if (loading) {
    return (
      <Card className="flex flex-col flex-1 min-h-0">
        <CardHeader className="pb-2 shrink-0">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Live Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center min-h-0">
          <div className="text-sm text-muted-foreground">Loading activity stream...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="flex flex-col flex-1 min-h-0">
        <CardHeader className="pb-2 shrink-0">
          <CardTitle className="text-sm font-medium">Live Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-sm text-muted-foreground">{error}</div>
          <Button variant="outline" size="sm" onClick={fetchStream}>
            <RefreshCw className="h-3 w-3 mr-1" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const events = displayEvents;
  const hasEvents = events.length > 0;

  return (
    <Card className="flex flex-col flex-1 min-h-0">
      <CardHeader className="pb-2 shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Live Activity</CardTitle>
          <div className="flex items-center gap-2">
            {IS_DEV && (
              <button
                onClick={() => setDemoPlayback(prev => !prev)}
                className={cn(
                  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer select-none",
                  demoPlayback
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                    : "bg-gray-100 text-gray-500 dark:bg-gray-800/50 dark:text-gray-400"
                )}
                title={demoPlayback ? "Demo playback ON: events revealed with delay, min-visible and post-terminal holds active" : "Demo playback OFF: real-time event display"}
              >
                <Film className="h-3 w-3" />
                Demo {demoPlayback ? "ON" : "OFF"}
              </button>
            )}
            {hasActivePlan && isWorking && (
              <span className={cn(
                "px-1.5 py-0.5 rounded text-[10px] font-medium",
                isMultiStepPlan 
                  ? "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200"
                  : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200"
              )}>
                {isMultiStepPlan ? 'Multi-step' : 'Single action'}
              </span>
            )}
            <StatusBadge status={mappedStatus} />
            {lastFetch && (
              <span className="text-[10px] text-muted-foreground">
                {formatRelativeTime(lastFetch.toISOString())}
              </span>
            )}
          </div>
        </div>
        {hasEvents && stream?.title && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {stream.title}
          </p>
        )}
        {IS_DEV && (
          <p className="text-[9px] text-muted-foreground/50 font-mono mt-0.5 truncate">
            crid={activeClientRequestId ? activeClientRequestId.slice(0, 12) + '…' : 'none'}
            {streamRequestId && streamRequestId !== activeClientRequestId ? ` stream=${streamRequestId.slice(0, 8)}…` : ''}
          </p>
        )}
      </CardHeader>

      <CardContent className="flex-1 min-h-0 flex flex-col overflow-hidden p-0 relative">
        {showOverlay && <StartingOverlay />}
        
        {!hasEvents ? (
          <div className="h-full flex items-center justify-center p-6">
            <div className="text-center">
              {activeClientRequestId ? (
                <>
                  <Loader2 className="h-8 w-8 text-primary/50 mx-auto mb-2 animate-spin" />
                  <p className="text-sm text-muted-foreground">
                    Waiting for first agent action...
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    The agent is processing your request
                  </p>
                </>
              ) : (
                <>
                  <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No activity yet
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Send a message to see live updates
                  </p>
                </>
              )}
            </div>
          </div>
        ) : (
          <div 
            ref={scrollRef}
            className={cn(
              "flex-1 min-h-0 overflow-y-auto scrollbar-hidden transition-opacity duration-200",
              showOverlay && "opacity-0"
            )}
            onScroll={handleScroll}
          >
            <div className="px-4 pt-2 pb-12">
            {events.map((event: StreamEvent, index: number) => {
              const isLastEvent = index === events.length - 1;
              const last = isLastEvent && effectiveTerminal && !transientPhase;
              const terminal = isLastEvent && !transientPhase && isTerminalEvent(event, index, events);
              return (
                <TimelineEvent 
                  key={event.id} 
                  event={event} 
                  isFirst={index === 0}
                  isLast={last}
                  isTerminal={terminal}
                />
              );
            })}
            
            {transientPhase && (
              <TransientPhaseRow phase={transientPhase} />
            )}
            
            {!transientPhase && showThinking && isWorking && (
              <ThinkingIndicator variant="inline" />
            )}
            
            {effectiveTerminal && allRevealed && !transientPhase && (mappedStatus === 'completed' || mappedStatus === 'failed' || mappedStatus === 'stopped') && (
              <SequenceStatusRow status={mappedStatus} clientRequestId={activeClientRequestId} runId={stream?.run_id} />
            )}
            
            {isWorking && (
              <ThinkingIndicator variant="footer" />
            )}
            
            <div ref={bottomRef} className="h-10 shrink-0" />
            </div>
          </div>
        )}
      </CardContent>

      {!autoScroll && hasEvents && (
        <div className="absolute bottom-4 right-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              nearBottomRef.current = true;
              setAutoScroll(true);
              bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
            }}
          >
            <ChevronDown className="h-3 w-3 mr-1" />
            Jump to latest
          </Button>
        </div>
      )}
    </Card>
  );
}
