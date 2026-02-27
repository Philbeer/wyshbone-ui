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
  Zap, Brain, Send, Sparkles, Eye, Package, GitBranch, Globe
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUser } from "@/contexts/UserContext";
import { usePlan } from "@/contexts/PlanContext";
import UserResultsView from "@/components/results/UserResultsView";
import type { DeliverySummary } from "@/components/results/UserResultsView";
import { FactoryStateView, FactoryDecisionView, RunConfigurationView } from "@/components/results/FactoryTimelineView";
import FactoryTimelineView from "@/components/results/FactoryTimelineView";
import {
  ConstraintsExtractedView,
  ConstraintCapabilityCheckView,
  VerificationSummaryView,
  VerificationEvidenceView,
  LeadVerificationView,
} from "@/components/results/CvlArtefactViews";
import { useToast } from "@/hooks/use-toast";

const IS_DEV = import.meta.env.DEV;

const MIN_VISIBLE_RUN_MS = 500;
const POST_TERMINAL_HOLD_MS = 60000;
const POST_TERMINAL_CATCHUP_MS = 8000;
const POST_TERMINAL_POLL_MS = 2000;

const THINKING_MS = 0;
const WORKING_MS = 0;
const EVENT_GAP_MS = 0;
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
    change_plan: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', label: 'Plan Changed' },
    retry: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', label: 'Retrying' },
    abandon: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', label: 'Abandoned' },
    stop: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', label: 'Stopped' },
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
  const stopReason = parsed?.stop_reason ?? parsed?.halt_reason ?? '';

  return (
    <div className="space-y-3">
      {verdict && (
        <TowerVerdictBadge verdict={verdict} score={score} />
      )}

      {stopReason && (
        <div className="rounded-lg border border-orange-200 dark:border-orange-800/50 bg-orange-50/50 dark:bg-orange-900/10 p-3">
          <p className="text-[10px] uppercase tracking-wide text-orange-600 dark:text-orange-400 font-medium mb-1">Stop Reason</p>
          <p className="text-sm text-foreground/90 leading-relaxed">{stopReason}</p>
        </div>
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

function PlanArtefactView({ payload }: { payload: any }) {
  const parsed = parsePayload(payload);
  const version = parsed?.version ?? parsed?.plan_version ?? 1;
  const title = parsed?.title ?? `Plan v${version}`;
  const goal = parsed?.original_user_goal ?? parsed?.user_goal ?? parsed?.goal ?? '';
  const steps = parsed?.steps ?? parsed?.plan_steps ?? parsed?.actions ?? [];
  const constraints = parsed?.constraints ?? [];
  const assumptions = parsed?.assumptions ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold",
          "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
        )}>
          <ListChecks className="h-4 w-4" />
          {title}
        </span>
      </div>

      {goal && (
        <div className="rounded-lg border border-blue-200 dark:border-blue-800/50 bg-blue-50/50 dark:bg-blue-900/10 p-3">
          <p className="text-[10px] uppercase tracking-wide text-blue-600 dark:text-blue-400 font-medium mb-1">Original User Goal</p>
          <p className="text-sm text-foreground font-medium leading-relaxed">{goal}</p>
        </div>
      )}

      {Array.isArray(steps) && steps.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-2">
            Steps ({steps.length})
          </p>
          <div className="space-y-2">
            {steps.map((step: any, i: number) => {
              const tool = step.tool ?? step.action ?? step.type ?? '';
              const args = step.args ?? step.parameters ?? step.params ?? step.input ?? {};
              const desc = step.description ?? step.label ?? step.summary ?? '';
              const argEntries = typeof args === 'object' && args !== null ? Object.entries(args) : [];

              return (
                <div key={i} className="rounded-lg border bg-card p-3">
                  <div className="flex items-start gap-2">
                    <span className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {tool && (
                          <span className="text-xs font-mono bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 px-1.5 py-0.5 rounded font-semibold">
                            {tool}
                          </span>
                        )}
                        {desc && (
                          <span className="text-xs text-muted-foreground">{desc}</span>
                        )}
                      </div>
                      {argEntries.length > 0 && (
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                          {argEntries.map(([k, v]) => (
                            <span key={k} className="text-[11px] text-foreground/80">
                              <span className="text-muted-foreground font-medium">{k}:</span>{' '}
                              <span className="font-mono">{typeof v === 'string' ? v : JSON.stringify(v)}</span>
                            </span>
                          ))}
                        </div>
                      )}
                      {typeof step === 'string' && (
                        <p className="text-xs text-foreground/80">{step}</p>
                      )}
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
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">Constraints</p>
          <ul className="space-y-1">
            {constraints.map((c: any, i: number) => (
              <li key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-amber-500" />
                <span>{typeof c === 'string' ? c : c.description || c.text || JSON.stringify(c)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {Array.isArray(assumptions) && assumptions.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">Assumptions</p>
          <ul className="space-y-1">
            {assumptions.map((a: any, i: number) => (
              <li key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                <MessageSquare className="h-3 w-3 mt-0.5 shrink-0 text-blue-500" />
                <span>{typeof a === 'string' ? a : a.description || a.text || JSON.stringify(a)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!goal && (!Array.isArray(steps) || steps.length === 0) && (!Array.isArray(constraints) || constraints.length === 0) && (!Array.isArray(assumptions) || assumptions.length === 0) && (
        <pre className="text-xs bg-muted/50 rounded p-3 overflow-x-auto max-h-96 whitespace-pre-wrap font-mono">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      )}
    </div>
  );
}

function TowerJudgementView({ payload }: { payload: any }) {
  const parsed = parsePayload(payload);
  const verdict = parsed?.verdict ?? parsed?.decision ?? '';
  const score = parsed?.score ?? parsed?.confidence ?? null;
  const reason = parsed?.reason ?? parsed?.rationale ?? parsed?.explanation ?? '';
  const stopReason = parsed?.stop_reason ?? parsed?.halt_reason ?? '';
  const delivered = parsed?.delivered ?? parsed?.delivered_count ?? null;
  const requested = parsed?.requested ?? parsed?.requested_count ?? null;

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
              <p className={cn("text-2xl font-bold mt-0.5", delivered >= (requested ?? 0) ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400")}>{delivered}</p>
            </div>
          )}
        </div>
      )}
      {stopReason && (
        <div className="rounded-lg border border-orange-200 dark:border-orange-800/50 bg-orange-50/50 dark:bg-orange-900/10 p-3">
          <p className="text-[10px] uppercase tracking-wide text-orange-600 dark:text-orange-400 font-medium mb-1">Stop Reason</p>
          <p className="text-sm text-foreground/90 leading-relaxed">{stopReason}</p>
        </div>
      )}
      {reason && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1">Rationale</p>
          <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap bg-muted/30 rounded p-2">{reason}</p>
        </div>
      )}
      {!verdict && !reason && !stopReason && (
        <pre className="text-xs bg-muted/50 rounded p-3 overflow-x-auto max-h-96 whitespace-pre-wrap font-mono">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      )}
    </div>
  );
}

function DeliverySummaryView({ payload }: { payload: any }) {
  const parsed = parsePayload(payload);
  const exactMatches: Lead[] = Array.isArray(parsed?.exact_matches) ? parsed.exact_matches : [];
  const closestMatches: Lead[] = Array.isArray(parsed?.closest_matches) ? parsed.closest_matches : [];
  const targetCount: number | null = parsed?.target_count ?? parsed?.requested ?? null;
  const deliveredCount: number | null = parsed?.delivered_count ?? null;
  const shortfall = (targetCount != null && deliveredCount != null) ? Math.max(0, targetCount - deliveredCount) : null;
  const suggestedNextQuestion: string | null = parsed?.suggested_next_question ?? null;

  const renderLeadRow = (lead: Lead, i: number) => {
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
  };

  const renderTable = (leads: Lead[]) => (
    <div className="overflow-x-auto rounded border max-h-64 overflow-y-auto">
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
          {leads.map(renderLeadRow)}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      {(targetCount != null || deliveredCount != null) && (
        <div className="flex gap-4">
          {targetCount != null && (
            <div className="flex-1 rounded-lg border bg-muted/30 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Target (system)</p>
              <p className="text-2xl font-bold text-foreground mt-0.5">{targetCount}</p>
            </div>
          )}
          {deliveredCount != null && (
            <div className="flex-1 rounded-lg border bg-muted/30 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Delivered</p>
              <p className={cn("text-2xl font-bold mt-0.5", shortfall === 0 || shortfall === null ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400")}>{deliveredCount}</p>
            </div>
          )}
        </div>
      )}

      {shortfall != null && shortfall > 0 && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50/60 dark:bg-amber-900/15 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              Shortfall: {shortfall} of {targetCount} not delivered
            </p>
            <p className="text-xs text-amber-700/80 dark:text-amber-400/70 mt-0.5">
              The search could not find enough results matching your criteria.
            </p>
          </div>
        </div>
      )}

      {exactMatches.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
            Exact matches ({exactMatches.length})
          </p>
          {renderTable(exactMatches)}
        </div>
      )}

      {closestMatches.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
            Closest matches ({closestMatches.length})
          </p>
          {renderTable(closestMatches)}
        </div>
      )}

      {exactMatches.length === 0 && closestMatches.length === 0 && (
        <div className="text-sm text-muted-foreground py-6 text-center">
          <p className="font-medium">No matches found</p>
          <p className="text-xs mt-1">This delivery produced no matching results.</p>
        </div>
      )}

      {suggestedNextQuestion && (
        <div className="rounded-lg border border-blue-200 dark:border-blue-800/50 bg-blue-50/50 dark:bg-blue-900/10 p-3">
          <p className="text-[10px] uppercase tracking-wide text-blue-600 dark:text-blue-400 font-medium mb-1">Suggested next question</p>
          <p className="text-sm text-foreground/90 leading-relaxed italic">"{suggestedNextQuestion}"</p>
        </div>
      )}
    </div>
  );
}

function WebSearchResultsView({ payload }: { payload: any }) {
  const parsed = parsePayload(payload);
  const results: any[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.results)
      ? parsed.results
      : Array.isArray(parsed?.items)
        ? parsed.items
        : [];

  if (results.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">Not available</p>;
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {results.map((r, i) => (
        <div key={i} className="rounded border p-2.5 space-y-1">
          <div className="flex items-start gap-2">
            <Globe className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              {(r.url || r.link) ? (
                <a
                  href={r.url || r.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline leading-tight block"
                >
                  {r.title || r.url || r.link}
                </a>
              ) : (
                <p className="text-xs font-medium text-foreground leading-tight">{r.title || 'Untitled'}</p>
              )}
              {r.snippet && (
                <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{r.snippet}</p>
              )}
              {r.description && !r.snippet && (
                <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{r.description}</p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function WebVisitPageCard({ page }: { page: any }) {
  const [expanded, setExpanded] = useState(false);
  const content = page.content || page.text || page.body || page.extracted_text || '';
  const hasContent = content.length > 0;

  return (
    <div className="rounded border overflow-hidden">
      <div className="flex items-center gap-2 p-2.5 bg-muted/30">
        <FileSearch className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
        <div className="min-w-0 flex-1">
          {(page.url || page.link) ? (
            <a
              href={page.url || page.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline truncate block"
            >
              {page.title || (page.url || page.link || '').replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)}
            </a>
          ) : (
            <p className="text-xs font-medium text-foreground">{page.title || 'Page visit'}</p>
          )}
          {page.status_code && (
            <span className={cn(
              "inline-block text-[10px] font-mono px-1 rounded mt-0.5",
              page.status_code >= 200 && page.status_code < 300
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
            )}>
              {page.status_code}
            </span>
          )}
        </div>
        {hasContent && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        )}
      </div>
      {expanded && hasContent && (
        <div className="border-t p-2.5">
          <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto font-mono leading-relaxed">
            {content.slice(0, 3000)}{content.length > 3000 ? '\n\n… truncated' : ''}
          </pre>
        </div>
      )}
    </div>
  );
}

function WebVisitPagesView({ payload }: { payload: any }) {
  const parsed = parsePayload(payload);
  const pages: any[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.pages)
      ? parsed.pages
      : Array.isArray(parsed?.visits)
        ? parsed.visits
        : parsed?.url ? [parsed] : [];

  if (pages.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">Not available</p>;
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {pages.map((page, i) => <WebVisitPageCard key={i} page={page} />)}
    </div>
  );
}

function ContactExtractView({ payload }: { payload: any }) {
  const parsed = parsePayload(payload);
  const contacts: any[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.contacts)
      ? parsed.contacts
      : Array.isArray(parsed?.results)
        ? parsed.results
        : parsed?.email || parsed?.name ? [parsed] : [];

  if (contacts.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">Not available</p>;
  }

  return (
    <div className="overflow-x-auto rounded border max-h-96 overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="bg-muted/60 sticky top-0">
          <tr>
            <th className="text-left px-2 py-1.5 font-medium">Name</th>
            <th className="text-left px-2 py-1.5 font-medium">Email</th>
            <th className="text-left px-2 py-1.5 font-medium">Role</th>
            <th className="text-left px-2 py-1.5 font-medium">Source</th>
            <th className="text-left px-2 py-1.5 font-medium">Confidence</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {contacts.map((c, i) => (
            <tr key={i} className="hover:bg-muted/20">
              <td className="px-2 py-1.5 font-medium">{c.name || c.full_name || c.first_name ? `${c.first_name || ''} ${c.last_name || ''}`.trim() : '-'}</td>
              <td className="px-2 py-1.5 text-muted-foreground font-mono text-[11px]">{c.email || c.email_address || '-'}</td>
              <td className="px-2 py-1.5 text-muted-foreground">{c.role || c.title || c.position || '-'}</td>
              <td className="px-2 py-1.5 text-muted-foreground">{c.source || c.provider || '-'}</td>
              <td className="px-2 py-1.5 text-center">
                {(c.confidence != null || c.score != null) ? (
                  <span className={cn(
                    "inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold",
                    (c.confidence === 'high' || (c.score && c.score >= 0.8))
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                      : (c.confidence === 'low' || (c.score && c.score < 0.5))
                        ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                  )}>
                    {c.confidence || (c.score != null ? `${Math.round(c.score * 100)}%` : '-')}
                  </span>
                ) : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeadPackCard({ lead }: { lead: any }) {
  const [expanded, setExpanded] = useState(false);
  const name = lead.name || lead.business_name || lead.title || 'Unknown';
  const loc = lead.location || lead.address || lead.city || lead.postcode || null;
  const contacts: any[] = Array.isArray(lead.contacts) ? lead.contacts : [];
  const notes = lead.notes || lead.summary || lead.research_summary || null;
  const hasDetail = contacts.length > 0 || notes || lead.website || lead.phone;

  return (
    <div className="rounded border overflow-hidden">
      <button
        onClick={() => hasDetail && setExpanded(!expanded)}
        className={cn(
          "w-full flex items-center gap-2 p-2.5 text-left",
          hasDetail ? "hover:bg-muted/20 cursor-pointer" : "cursor-default"
        )}
      >
        <Package className="h-3.5 w-3.5 text-primary shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground">{name}</p>
          {loc && <p className="text-[11px] text-muted-foreground">{loc}</p>}
        </div>
        {lead.score != null && (
          <span className="inline-block bg-primary/10 text-primary rounded px-1.5 py-0.5 font-mono text-[10px] shrink-0">
            {lead.score}
          </span>
        )}
        {hasDetail && (
          expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
      </button>
      {expanded && (
        <div className="border-t p-2.5 space-y-2 bg-muted/10">
          {(lead.phone || lead.phone_number) && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-medium">Phone:</span>
              <span className="font-mono">{lead.phone || lead.phone_number}</span>
            </div>
          )}
          {(lead.website || lead.url) && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-medium text-muted-foreground">Website:</span>
              <a href={lead.website || lead.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline truncate">
                {(lead.website || lead.url || '').replace(/^https?:\/\/(www\.)?/, '').slice(0, 50)}
              </a>
            </div>
          )}
          {lead.email && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-medium">Email:</span>
              <span className="font-mono text-[11px]">{lead.email}</span>
            </div>
          )}
          {contacts.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1">Contacts ({contacts.length})</p>
              <div className="rounded border divide-y">
                {contacts.map((c: any, ci: number) => (
                  <div key={ci} className="px-2 py-1.5 text-xs flex items-center gap-3">
                    <span className="font-medium">{c.name || c.full_name || '-'}</span>
                    {c.email && <span className="font-mono text-[11px] text-muted-foreground">{c.email}</span>}
                    {(c.role || c.title) && <span className="text-muted-foreground">{c.role || c.title}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {notes && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1">Notes</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LeadPackView({ payload }: { payload: any }) {
  const parsed = parsePayload(payload);
  const leads: any[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.leads)
      ? parsed.leads
      : Array.isArray(parsed?.pack)
        ? parsed.pack
        : parsed?.name || parsed?.business_name ? [parsed] : [];

  if (leads.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">Not available</p>;
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {leads.map((lead, i) => <LeadPackCard key={i} lead={lead} />)}
    </div>
  );
}

function AskLeadQuestionResultView({ payload }: { payload: any }) {
  const parsed = parsePayload(payload);

  const question = parsed?.question || parsed?.query || null;
  const answer = parsed?.answer || parsed?.result || parsed?.response || null;
  const leadName = parsed?.lead_name || parsed?.business_name || parsed?.name || null;
  const sources: any[] = Array.isArray(parsed?.sources) ? parsed.sources : [];
  const confidence = parsed?.confidence || parsed?.score || null;

  if (!answer && !question) {
    return <p className="text-sm text-muted-foreground py-4 text-center">Not available</p>;
  }

  return (
    <div className="space-y-3">
      {leadName && (
        <div className="flex items-center gap-2">
          <Package className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-xs font-semibold text-foreground">{leadName}</span>
          {confidence && (
            <span className={cn(
              "inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold",
              confidence === 'high' ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                : confidence === 'low' ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
            )}>
              {typeof confidence === 'number' ? `${Math.round(confidence * 100)}%` : confidence}
            </span>
          )}
        </div>
      )}
      {question && (
        <div className="rounded-lg border border-blue-200 dark:border-blue-800/50 bg-blue-50/50 dark:bg-blue-900/10 p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-blue-600 dark:text-blue-400 font-medium mb-1">Question</p>
          <p className="text-xs text-foreground/90 leading-relaxed">{question}</p>
        </div>
      )}
      {answer && (
        <div className="rounded-lg border bg-muted/20 p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1">Answer</p>
          <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{answer}</p>
        </div>
      )}
      {sources.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1">Sources ({sources.length})</p>
          <div className="space-y-1">
            {sources.map((s, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[11px]">
                <Globe className="h-3 w-3 text-blue-500 mt-0.5 shrink-0" />
                {(s.url || s.link) ? (
                  <a href={s.url || s.link} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline truncate">
                    {s.title || (s.url || s.link || '').replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)}
                  </a>
                ) : (
                  <span className="text-muted-foreground">{s.title || s.text || JSON.stringify(s)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
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
    case 'tower_judgement':
      return <TowerJudgementView payload={artefact.payload_json} />;
    case 'plan':
      return <PlanArtefactView payload={artefact.payload_json} />;
    case 'delivery_summary':
      return <DeliverySummaryView payload={artefact.payload_json} />;
    case 'factory_state':
      return <FactoryStateView payload={artefact.payload_json} />;
    case 'factory_decision':
      return <FactoryDecisionView payload={artefact.payload_json} />;
    case 'run_configuration':
      return <RunConfigurationView payload={artefact.payload_json} />;
    case 'constraints_extracted':
      return <ConstraintsExtractedView payload={artefact.payload_json} />;
    case 'constraint_capability_check':
      return <ConstraintCapabilityCheckView payload={artefact.payload_json} />;
    case 'verification_summary':
      return <VerificationSummaryView payload={artefact.payload_json} />;
    case 'verification_evidence':
      return <VerificationEvidenceView payload={artefact.payload_json} />;
    case 'lead_verification':
      return <LeadVerificationView payload={artefact.payload_json} />;
    case 'web_search_results':
      return <WebSearchResultsView payload={artefact.payload_json} />;
    case 'web_visit_pages':
      return <WebVisitPagesView payload={artefact.payload_json} />;
    case 'contact_extract':
      return <ContactExtractView payload={artefact.payload_json} />;
    case 'lead_pack':
      return <LeadPackView payload={artefact.payload_json} />;
    case 'ask_lead_question_result':
      return <AskLeadQuestionResultView payload={artefact.payload_json} />;
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
  tower_judgement: { label: 'Tower Verdict', icon: '🧠' },
  plan: { label: 'Plan', icon: '📐' },
  delivery_summary: { label: 'Delivery Summary', icon: '📦' },
  factory_state: { label: 'Factory State', icon: '🏭' },
  factory_decision: { label: 'Decision', icon: '⚙️' },
  factory_timeline: { label: 'Factory Timeline', icon: '🏭' },
  run_configuration: { label: 'Run Config', icon: '📋' },
  constraints_extracted: { label: 'Constraints', icon: '🛡️' },
  constraint_capability_check: { label: 'Capability Check', icon: '🔍' },
  verification_summary: { label: 'Verification', icon: '✅' },
  verification_evidence: { label: 'Evidence', icon: '📎' },
  lead_verification: { label: 'Lead Checks', icon: '🔎' },
  web_search_results: { label: 'Web Search', icon: '🌐' },
  web_visit_pages: { label: 'Page Visits', icon: '📄' },
  contact_extract: { label: 'Contacts', icon: '👤' },
  lead_pack: { label: 'Lead Pack', icon: '📦' },
  ask_lead_question_result: { label: 'Lead Q&A', icon: '❓' },
};

interface TowerEvidenceEvent {
  id: string;
  ts: string;
  type: string;
  summary: string;
  details?: Record<string, any>;
}

function EvidenceSection({ clientRequestId, runId, preloadedArtefacts }: { clientRequestId?: string | null; runId?: string | null; preloadedArtefacts?: Artefact[] }) {
  const [events, setEvents] = useState<TowerEvidenceEvent[]>([]);
  const [judgementArtefact, setJudgementArtefact] = useState<Artefact | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!clientRequestId && !runId) return;

    const extractTowerEvents = (data: StreamResponse | null) => {
      if (!data?.events) return;
      const towerEvents = data.events.filter(e => {
        const t = e.type?.toLowerCase() || '';
        return t.startsWith('tower_') || t === 'judgement_received';
      });
      if (towerEvents.length > 0) {
        setEvents(towerEvents.map(e => ({
          id: e.id,
          ts: e.ts,
          type: e.type,
          summary: e.summary || humanizeEventType(e.type),
          details: e.details as Record<string, any>,
        })));
      }
      return towerEvents.length;
    };

    if (preloadedArtefacts && preloadedArtefacts.length > 0) {
      const tj = preloadedArtefacts.find(r => r.type === 'tower_judgement');
      if (tj) setJudgementArtefact(tj);
    }

    if (clientRequestId) {
      fetch(`/api/afr/stream?client_request_id=${encodeURIComponent(clientRequestId)}`)
        .then(res => res.ok ? res.json() : null)
        .then(extractTowerEvents)
        .catch(() => {});
    }

    if (!preloadedArtefacts?.some(r => r.type === 'tower_judgement')) {
      const artefactUrl = runId
        ? `/api/afr/artefacts?runId=${encodeURIComponent(runId)}`
        : clientRequestId
          ? `/api/afr/artefacts?client_request_id=${encodeURIComponent(clientRequestId)}`
          : null;
      if (artefactUrl) {
        fetch(artefactUrl)
          .then(res => res.ok ? res.json() : [])
          .then((rows: Artefact[]) => {
            const tj = rows.find(r => r.type === 'tower_judgement');
            if (tj) setJudgementArtefact(tj);
          })
          .catch(() => {});
      }
    }
  }, [clientRequestId, runId]);

  if (events.length === 0 && !judgementArtefact) return null;

  return (
    <div className="mt-3 border-t pt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs font-medium text-purple-600 dark:text-purple-400 hover:underline"
      >
        <Eye className="h-3 w-3" />
        {expanded ? 'Hide evidence' : `Evidence (${events.length} Tower event${events.length !== 1 ? 's' : ''}${judgementArtefact ? ' + judgement' : ''})`}
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {expanded && (
        <div className="mt-2 space-y-2">
          {events.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Tower AFR Events</p>
              <div className="rounded border bg-muted/30 divide-y">
                {events.map((evt) => (
                  <div key={evt.id} className="px-2 py-1.5 flex items-start gap-2">
                    <Brain className="h-3 w-3 text-purple-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground">{evt.summary || humanizeEventType(evt.type)}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{new Date(evt.ts).toLocaleString()}</p>
                      {evt.details?.verdict && (
                        <span className={cn("inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold",
                          evt.details.verdict === 'accept' ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200"
                          : evt.details.verdict === 'stop' ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
                        )}>
                          {String(evt.details.verdict).toUpperCase()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {judgementArtefact && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Tower Judgement Artefact</p>
              <div className="rounded border bg-purple-50/50 dark:bg-purple-900/10 p-2">
                <p className="text-[10px] text-muted-foreground font-mono">ID: {judgementArtefact.id}</p>
                {judgementArtefact.summary && (
                  <p className="text-xs text-foreground mt-0.5">{judgementArtefact.summary}</p>
                )}
                <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                  Created: {new Date(judgementArtefact.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const FACTORY_TYPES = new Set(['factory_state', 'factory_decision']);

function ResultsModal({ clientRequestId, runId, open, onOpenChange }: { clientRequestId?: string | null; runId?: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [artefacts, setArtefacts] = useState<Artefact[]>([]);
  const [allArtefacts, setAllArtefacts] = useState<Artefact[]>([]);
  const [activeTab, setActiveTab] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || (!runId && !clientRequestId)) return;
    setLoading(true);
    setError(null);
    setArtefacts([]);
    setAllArtefacts([]);
    setActiveTab('');

    const url = runId
      ? `/api/afr/artefacts?runId=${encodeURIComponent(runId)}`
      : `/api/afr/artefacts?client_request_id=${encodeURIComponent(clientRequestId!)}`;

    const fullUrl = `${window.location.origin}${url}`;
    console.log(`[ResultsModal] Fetching artefacts — runId=${runId || 'n/a'} crid=${clientRequestId?.slice(0, 12) || 'n/a'} url=${fullUrl}`);

    fetch(url)
      .then(res => {
        console.log(`[ResultsModal] Response status=${res.status} contentLength=${res.headers.get('content-length') || 'unknown'}`);
        if (!res.ok) throw new Error('Failed to fetch results');
        return res.json();
      })
      .then((rows: Artefact[]) => {
        const uniqueRunIds = Array.from(new Set(rows.map(r => r.run_id)));
        console.log(`[ResultsModal] Got ${rows.length} artefact(s) — types: [${rows.map(r => r.type).join(', ')}] runIds: [${uniqueRunIds.join(', ')}]`);
        setAllArtefacts(rows);

        const hasFactory = rows.some(r => FACTORY_TYPES.has(r.type));
        const byType = new Map<string, Artefact>();
        const typeOrder = ['run_configuration', 'plan', 'constraints_extracted', 'constraint_capability_check', 'run_summary', 'plan_update', 'tower_judgement', 'verification_summary', 'verification_evidence', 'lead_verification', 'web_search_results', 'web_visit_pages', 'contact_extract', 'deep_research_result', 'leads_list', 'lead_pack', 'ask_lead_question_result', 'delivery_summary', 'factory_timeline', 'email_drafts', 'plan_result', 'chat_response'];

        for (const row of rows) {
          if (FACTORY_TYPES.has(row.type)) continue;
          const existing = byType.get(row.type);
          if (!existing || new Date(row.created_at) > new Date(existing.created_at)) {
            byType.set(row.type, row);
          }
        }

        if (hasFactory) {
          byType.set('factory_timeline', { id: 'virtual_factory_timeline', run_id: rows[0]?.run_id || '', type: 'factory_timeline', title: 'Factory Timeline', summary: '', payload_json: {}, created_at: new Date().toISOString() } as Artefact);
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
                : allArtefacts.length !== artefacts.length
                  ? `${allArtefacts.length} artefact${allArtefacts.length === 1 ? '' : 's'} from this run (${artefacts.length} unique type${artefacts.length === 1 ? '' : 's'})`
                  : `${allArtefacts.length} artefact${allArtefacts.length === 1 ? '' : 's'} from this run`}
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
          const verdictArtefact = artefacts.find(a => a.type === 'tower_judgement');
          const verdictSource = verdictArtefact || artefacts.find(a => {
            const p = parsePayload(a.payload_json);
            return p?.verdict && (a.type === 'run_summary' || a.type === 'plan_update' || p?.tower_judgement_received);
          });
          const hasPlanUpdate = artefacts.some(a => a.type === 'plan_update');
          const planVersion = hasPlanUpdate ? 2 : 1;
          const hasTowerJudgement = !!verdictArtefact;
          const hasLeads = artefacts.some(a => a.type === 'leads_list');

          const leadsArtefact = artefacts.find(a => a.type === 'leads_list');
          const leadsPayload = leadsArtefact ? parsePayload(leadsArtefact.payload_json) : null;
          const leadsArray = leadsPayload
            ? (Array.isArray(leadsPayload) ? leadsPayload : Array.isArray(leadsPayload?.leads) ? leadsPayload.leads : Array.isArray(leadsPayload?.results) ? leadsPayload.results : [])
            : [];
          const deliveredCount = leadsArray.length;
          const targetCount = leadsPayload?.target_count ?? leadsPayload?.requested ?? leadsPayload?.requested_count ?? null;

          const summaryPayload = artefacts.find(a => a.type === 'run_summary') ? parsePayload(artefacts.find(a => a.type === 'run_summary')!.payload_json) : null;
          const towerPayload = verdictArtefact ? parsePayload(verdictArtefact.payload_json) : null;

          const cvlConstraints = artefacts.find(a => a.type === 'constraints_extracted');
          const cvlVerification = artefacts.find(a => a.type === 'verification_summary');
          const cvlConstraintsParsed = cvlConstraints ? parsePayload(cvlConstraints.payload_json) : null;
          const cvlVerificationParsed = cvlVerification ? parsePayload(cvlVerification.payload_json) : null;
          const hasCvl = !!cvlConstraints;

          const effectiveTarget = hasCvl
            ? (cvlConstraintsParsed?.requested_count_user ?? cvlVerificationParsed?.requested_count_user ?? null)
            : (targetCount ?? null);
          const effectiveDelivered = hasCvl
            ? (cvlVerificationParsed?.verified_exact_count ?? towerPayload?.delivered ?? summaryPayload?.delivered ?? (hasLeads ? deliveredCount : null))
            : (towerPayload?.delivered ?? summaryPayload?.delivered ?? (hasLeads ? deliveredCount : null));
          
          return (
            <div className="space-y-2 mb-2">
              <div className="flex flex-wrap items-center gap-2">
                {verdictSource && (() => {
                  const p = parsePayload(verdictSource.payload_json);
                  return <TowerVerdictBadge verdict={p.verdict} score={p.score ?? p.confidence} />;
                })()}
                <span className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold",
                  planVersion > 1 
                    ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300" 
                    : "bg-gray-100 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400"
                )}>
                  <ListChecks className="h-3 w-3" />
                  Plan v{planVersion}
                </span>
              </div>

              {(effectiveTarget != null || effectiveDelivered != null) && (
                <div className="flex items-center gap-3 text-xs">
                  {effectiveTarget != null && (
                    <span className="text-muted-foreground">
                      {hasCvl ? 'Requested' : 'Target (system)'}: <span className="font-semibold text-foreground">{effectiveTarget}</span>
                    </span>
                  )}
                  {effectiveDelivered != null && (
                    <span className="text-muted-foreground">
                      {hasCvl ? 'Verified' : 'Delivered'}: <span className={cn("font-semibold", effectiveDelivered >= (effectiveTarget ?? 0) ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400")}>{effectiveDelivered}</span>
                    </span>
                  )}
                  {effectiveTarget != null && effectiveDelivered != null && (
                    <span className={cn("font-mono text-[10px] px-1.5 py-0.5 rounded",
                      effectiveDelivered >= effectiveTarget 
                        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300" 
                        : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                    )}>
                      {Math.round((effectiveDelivered / effectiveTarget) * 100)}%
                    </span>
                  )}
                </div>
              )}

              {!hasTowerJudgement && hasLeads && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-900/10 p-2.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                    Run finished execution but Tower judgement missing. Results have not been quality-verified.
                  </p>
                </div>
              )}
            </div>
          );
        })()}
        {!loading && !error && artefacts.length > 0 && !artefacts.some(a => a.type === 'leads_list') && !artefacts.some(a => a.type === 'delivery_summary') && !artefacts.some(a => a.type === 'deep_research_result') && !artefacts.some(a => a.type === 'run_summary') && !artefacts.some(a => a.type === 'plan_update') && !artefacts.some(a => a.type === 'tower_judgement') && (() => {
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
                {activeTab === 'factory_timeline'
                  ? <FactoryTimelineView artefacts={allArtefacts.filter(a => FACTORY_TYPES.has(a.type) || a.type === 'tower_judgement')} />
                  : <ArtefactRenderer artefact={activeArtefact} />
                }
              </>
            )}
            <EvidenceSection clientRequestId={clientRequestId} runId={runId} preloadedArtefacts={allArtefacts} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const FACTORY_ARTEFACT_TYPES = new Set(['run_configuration', 'factory_state', 'factory_decision', 'tower_judgement']);

function UserResultsModal({ clientRequestId, runId, open, onOpenChange }: { clientRequestId?: string | null; runId?: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [deliverySummary, setDeliverySummary] = useState<DeliverySummary | null>(null);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [tldr, setTldr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cvlConstraints, setCvlConstraints] = useState<any>(null);
  const [cvlVerification, setCvlVerification] = useState<any>(null);
  const [cvlEvidence, setCvlEvidence] = useState<any>(null);
  const [ruleUpdates, setRuleUpdates] = useState<any[]>([]);
  const [resolvedRunId, setResolvedRunId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (!clientRequestId && !runId) {
      setError("No narrative available for this run yet.");
      return;
    }

    setLoading(true);
    setError(null);
    setDeliverySummary(null);
    setNarrative(null);
    setTldr(null);
    setCvlConstraints(null);
    setCvlVerification(null);
    setCvlEvidence(null);
    setRuleUpdates([]);
    setResolvedRunId(runId || null);

    const fullUrl = runId
      ? `/api/afr/artefacts?runId=${encodeURIComponent(runId)}`
      : `/api/afr/artefacts?client_request_id=${encodeURIComponent(clientRequestId!)}`;

    const fetchBundle = async (rid: string) => {
      try {
        const res = await fetch(`/api/afr/runs/${encodeURIComponent(rid)}`);
        if (res.ok) {
          const bundle = await res.json();
          if (Array.isArray(bundle.related_rule_updates)) {
            setRuleUpdates(bundle.related_rule_updates);
          }
        }
      } catch {}
    };

    fetch(fullUrl)
      .then(res => {
        if (!res.ok) throw new Error("Failed to fetch results");
        return res.json();
      })
      .then(async (rows: Artefact[]) => {
        const constraintsArt = rows.find(r => r.type === "constraints_extracted");
        const verificationArt = rows.find(r => r.type === "verification_summary");
        const evidenceArt = rows.find(r => r.type === "verification_evidence");
        if (constraintsArt) setCvlConstraints(parsePayload(constraintsArt.payload_json));
        if (verificationArt) setCvlVerification(parsePayload(verificationArt.payload_json));
        if (evidenceArt) setCvlEvidence(parsePayload(evidenceArt.payload_json));

        const effectiveRunId = runId || (rows.length > 0 ? rows[0].run_id : null);
        if (effectiveRunId) {
          setResolvedRunId(effectiveRunId);
          fetchBundle(effectiveRunId);
        }

        const narrativeArtefact = rows.find(r => r.type === "run_narrative");
        if (narrativeArtefact) {
          const parsed = parsePayload(narrativeArtefact.payload_json);
          const text = parsed?.full_explanation || parsed?.markdown || parsed?.narrative || (typeof parsed === 'string' ? parsed : null);
          if (text) {
            if (parsed?.tldr && typeof parsed.tldr === 'string') {
              setTldr(parsed.tldr);
            }
            setNarrative(text);
            return;
          }
        }

        const dsArtefact = rows.find(r => r.type === "delivery_summary");
        if (dsArtefact) {
          const parsed = parsePayload(dsArtefact.payload_json);
          if (parsed && typeof parsed === "object") {
            setDeliverySummary(parsed as DeliverySummary);
            return;
          }
        }

        const hasFactory = rows.some(r => FACTORY_ARTEFACT_TYPES.has(r.type));
        if (hasFactory && runId) {
          try {
            const sessionId = localStorage.getItem('wyshbone_sid');
            const explainRes = await fetch('/api/dev/explain-run', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...(sessionId ? { 'x-session-id': sessionId } : {}) },
              body: JSON.stringify({ runId }),
            });
            if (explainRes.ok) {
              const data = await explainRes.json();
              if (data.report_markdown) {
                setNarrative(data.report_markdown);
                return;
              }
            }
          } catch {}
        }

        setError("No narrative available for this run yet.");
      })
      .catch(() => setError("No narrative available for this run yet."))
      .finally(() => setLoading(false));
  }, [open, clientRequestId, runId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{narrative ? "Details" : "Results"}</DialogTitle>
          <DialogDescription className="sr-only">Run details</DialogDescription>
        </DialogHeader>
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && !loading && (
          <p className="text-sm text-muted-foreground py-6 text-center">{error}</p>
        )}
        {deliverySummary && !loading && !error && (
          <UserResultsView deliverySummary={deliverySummary} onClose={() => onOpenChange(false)} constraintsPayload={cvlConstraints} verificationPayload={cvlVerification} evidencePayload={cvlEvidence} ruleUpdates={ruleUpdates} runId={resolvedRunId} />
        )}
        {narrative && !loading && !error && (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {tldr && (
              <div className="bg-muted/50 border border-border rounded-md px-3 py-2.5 mb-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">TL;DR</p>
                <p className="text-sm font-medium text-foreground leading-snug">{tldr}</p>
              </div>
            )}
            {narrative.split('\n').map((line, i) => {
              if (line.startsWith('## ')) {
                return <h3 key={i} className="text-sm font-semibold mt-4 mb-1.5">{line.slice(3)}</h3>;
              }
              if (!line.trim()) return null;
              const parts = line.split(/(\*\*[^*]+\*\*)/g);
              return (
                <p key={i} className="text-sm text-foreground leading-relaxed mb-1.5">
                  {parts.map((part, j) =>
                    part.startsWith('**') && part.endsWith('**')
                      ? <strong key={j}>{part.slice(2, -2)}</strong>
                      : part
                  )}
                </p>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StopActionButtons() {
  const { toast } = useToast();

  const handleStopAction = (label: string, chatMessage: string) => {
    toast({ title: "Not wired yet", description: `"${label}" will be available in a future update.` });
    window.dispatchEvent(new CustomEvent("wyshbone-prefill-chat", { detail: chatMessage }));
  };

  return (
    <div className="px-1 pb-2 space-y-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Actions</p>
      <div className="flex flex-wrap gap-1.5">
        <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={() => handleStopAction("Verify via websites", "Verify these leads by checking their websites directly.")}>
          Verify via websites
        </Button>
        <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={() => handleStopAction("Broaden radius", "Broaden the search radius and try again.")}>
          Broaden radius
        </Button>
        <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={() => handleStopAction("Relax constraint", "Relax the strictest constraint and try again.")}>
          Relax constraint
        </Button>
        <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={() => handleStopAction("Return current results", "Return the results found so far.")}>
          Return current results
        </Button>
      </div>
    </div>
  );
}

function SequenceStatusRow({ status, clientRequestId, runId, towerVerdict, towerMissing, chatMode, towerRationale }: { status: "completed" | "failed" | "stopped" | "awaiting_judgement" | "replanning"; clientRequestId?: string | null; runId?: string | null; towerVerdict?: string | null; towerMissing?: boolean; chatMode?: boolean; towerRationale?: string | null }) {
  const [showResults, setShowResults] = useState(false);
  const [showUserResults, setShowUserResults] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [rerunRequested, setRerunRequested] = useState(false);
  const [pollStatus, setPollStatus] = useState<'idle' | 'polling' | 'success' | 'error'>('idle');
  const mountRef = useRef(Date.now());
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!towerMissing) return;
    const interval = setInterval(() => {
      setElapsed(Date.now() - mountRef.current);
    }, 1000);
    return () => clearInterval(interval);
  }, [towerMissing]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  const judgementTimedOut = towerMissing && elapsed >= 30000;

  const handleRerunJudgement = async () => {
    if (!runId || rerunRequested) return;
    setRerunRequested(true);
    setPollStatus('idle');
    try {
      const payload: Record<string, string> = { runId };
      if (clientRequestId) payload.crid = clientRequestId;
      const resp = await fetch('/api/supervisor/request-judgement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const errBody = await resp.text();
        console.error('[RequestJudgement] Server error:', resp.status, errBody);
        setRerunRequested(false);
        setPollStatus('error');
      } else {
        const result = await resp.json();
        console.log('[RequestJudgement] Success:', result);
        setPollStatus('polling');
        let attempts = 0;
        const maxAttempts = 20;
        const pollInterval = 3000;

        const poll = async () => {
          attempts++;
          try {
            const url = runId
              ? `/api/afr/artefacts?runId=${encodeURIComponent(runId)}`
              : clientRequestId
                ? `/api/afr/artefacts?client_request_id=${encodeURIComponent(clientRequestId)}`
                : null;
            if (!url) { setPollStatus('error'); return; }
            
            const artefactRes = await fetch(url);
            if (artefactRes.ok) {
              const artefacts = await artefactRes.json();
              const hasJudgement = artefacts.some((a: any) => a.type === 'tower_judgement');
              if (hasJudgement) {
                setPollStatus('success');
                setRerunRequested(false);
                return;
              }
            }

            if (attempts >= maxAttempts) {
              setPollStatus('error');
              setRerunRequested(false);
              return;
            }
            pollTimerRef.current = setTimeout(poll, pollInterval);
          } catch {
            if (attempts >= maxAttempts) {
              setPollStatus('error');
              setRerunRequested(false);
            } else {
              pollTimerRef.current = setTimeout(poll, pollInterval);
            }
          }
        };
        pollTimerRef.current = setTimeout(poll, pollInterval);
      }
    } catch (err) {
      console.error('[RequestJudgement] Failed:', err);
      setRerunRequested(false);
      setPollStatus('error');
    }
  };

  const config: Record<string, { icon: typeof CheckCircle2; label: string; className: string }> = {
    completed: { 
      icon: CheckCircle2, 
      label: towerVerdict
        ? `Sequence complete — Tower: ${towerVerdict.toUpperCase()}`
        : "Sequence complete", 
      className: "text-green-500/70" 
    },
    failed: { 
      icon: XCircle, 
      label: "Sequence failed", 
      className: "text-red-500/70" 
    },
    stopped: { 
      icon: AlertTriangle, 
      label: towerVerdict === 'stop' ? "Stopped by Tower" : "Sequence stopped", 
      className: "text-orange-500/70" 
    },
    awaiting_judgement: { 
      icon: Brain, 
      label: chatMode
          ? "Tower pending"
          : towerVerdict && towerVerdict !== 'accept'
            ? `Awaiting judgement (verdict: ${towerVerdict})`
            : "Awaiting Tower judgement", 
      className: "text-purple-500/70" 
    },
    replanning: { 
      icon: ListChecks, 
      label: "Replanning (Tower requested changes)", 
      className: "text-purple-500/70" 
    },
  };
  
  const { icon: Icon, label, className } = config[status] || config.stopped;
  const showViewResults = (clientRequestId || runId) && (status === 'completed' || status === 'stopped' || status === 'awaiting_judgement' || status === 'replanning');
  const showRequestJudgement = towerMissing && runId && (status === 'completed' || status === 'awaiting_judgement');
  
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 py-2 px-1 border-t border-border/50 mt-2 overflow-hidden">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={cn("h-4 w-4 shrink-0", className)} />
          <span className={cn("text-xs font-medium truncate", className)}>{label}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {showRequestJudgement && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs px-2 gap-1 border-purple-300 text-purple-600 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-400 dark:hover:bg-purple-900/20"
              onClick={handleRerunJudgement}
              disabled={rerunRequested}
            >
              <RefreshCw className={cn("h-3 w-3", rerunRequested && "animate-spin")} />
              {rerunRequested ? 'Requested' : 'Manual: Request judgement'}
            </Button>
          )}
          {showViewResults && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs px-2 gap-1"
                data-view-results="true"
                onClick={() => {
                  console.log(`[ViewResults] Button clicked — runId=${runId || 'n/a'} crid=${clientRequestId?.slice(0, 12) || 'n/a'}`);
                  setShowResults(true);
                }}
              >
                <Eye className="h-3 w-3" />
                View results
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs px-2 gap-1"
                onClick={() => setShowUserResults(true)}
              >
                <Package className="h-3 w-3" />
                Details
              </Button>
            </>
          )}
        </div>
      </div>
      {towerMissing && judgementTimedOut && pollStatus !== 'polling' && pollStatus !== 'success' && (
        <div className="px-1 pb-1">
          <p className="text-[10px] text-muted-foreground/70">
            Tower evaluation in progress. Results may still be available.
          </p>
        </div>
      )}
      {pollStatus === 'polling' && (
        <div className="px-1 pb-1 flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin text-purple-500" />
          <p className="text-[10px] text-purple-600 dark:text-purple-400">
            Waiting for Tower verdict...
          </p>
        </div>
      )}
      {pollStatus === 'success' && (
        <div className="px-1 pb-1 flex items-center gap-1.5">
          <CheckCircle2 className="h-3 w-3 text-green-500" />
          <p className="text-[10px] text-green-600 dark:text-green-400">
            Tower verdict received.
          </p>
        </div>
      )}
      {pollStatus === 'error' && (
        <div className="px-1 pb-1 flex items-center gap-1.5">
          <XCircle className="h-3 w-3 text-red-500" />
          <p className="text-[10px] text-red-500/80">
            Could not confirm Tower verdict. Try again or check results.
          </p>
        </div>
      )}
      {(towerVerdict === 'stop' || towerVerdict === 'change_plan') && towerRationale && (
        <div className="px-1 pb-1">
          <div className="rounded-lg border border-orange-200 dark:border-orange-800/50 bg-orange-50/50 dark:bg-orange-900/10 p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-orange-600 dark:text-orange-400 font-medium mb-1">Why this was stopped</p>
            <p className="text-xs text-foreground/80 leading-relaxed">{towerRationale}</p>
          </div>
        </div>
      )}
      {(towerVerdict === 'stop' || towerVerdict === 'change_plan' || status === 'stopped') && (
        <StopActionButtons />
      )}
      {(clientRequestId || runId) && (
        <>
          <ResultsModal clientRequestId={clientRequestId} runId={runId} open={showResults} onOpenChange={setShowResults} />
          <UserResultsModal clientRequestId={clientRequestId} runId={runId} open={showUserResults} onOpenChange={setShowUserResults} />
        </>
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

type OverallStatus = 'idle' | 'routing' | 'planning' | 'executing' | 'finalizing' | 'deep_research' | 'awaiting_judgement' | 'replanning' | 'completed' | 'failed' | 'stopped';

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
    awaiting_judgement: { icon: Brain, label: "Awaiting judgement", className: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200" },
    replanning: { icon: ListChecks, label: "Replanning", className: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200" },
    completed: { icon: CheckCircle2, label: "Completed", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200" },
    failed: { icon: XCircle, label: "Failed", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200" },
    stopped: { icon: AlertTriangle, label: "Stopped", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200" },
  };

  const { icon: Icon, label, className } = config[status] || config.idle;
  const isAnimated = ['routing', 'planning', 'executing', 'finalizing', 'deep_research', 'awaiting_judgement', 'replanning'].includes(status);
  
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
    plan_updated: { icon: GitBranch, className: "text-indigo-400" },
    artefact_created: { icon: Package, className: "text-emerald-500" },
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
    tower_verdict: { icon: Brain, className: "text-purple-500" },
    tower_call_started: { icon: Eye, className: "text-purple-400" },
    tower_call_completed: { icon: Brain, className: "text-purple-500" },
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

function TruthStrip({ runId }: { runId?: string | null }) {
  const [dbArtefacts, setDbArtefacts] = useState<Array<{ type: string; created_at?: string }>>([]);
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  useEffect(() => {
    if (!runId) { setFetchState('idle'); setDbArtefacts([]); return; }
    let cancelled = false;
    setFetchState('loading');
    fetch(`/api/afr/artefacts?runId=${encodeURIComponent(runId)}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((rows: any[]) => {
        if (cancelled) return;
        setDbArtefacts(Array.isArray(rows) ? rows : []);
        setFetchState('done');
      })
      .catch(() => { if (!cancelled) setFetchState('error'); });
    return () => { cancelled = true; };
  }, [runId]);

  if (!runId || fetchState === 'idle' || fetchState === 'loading') return null;

  const artefactTypes = new Set(dbArtefacts.map(a => a.type));
  const hasArtefact = artefactTypes.has('leads_list') || artefactTypes.has('plan_result') || artefactTypes.has('step_result') || artefactTypes.has('deep_research_result') || artefactTypes.has('run_summary') || artefactTypes.has('delivery_summary');
  const hasTowerVerdict = artefactTypes.has('tower_judgement');
  const hasRunStored = dbArtefacts.length > 0;

  const indicators = [
    { label: 'Artefact persisted', ok: hasArtefact, missing: 'Not persisted' },
    { label: 'Tower verdict', ok: hasTowerVerdict, missing: 'Missing' },
    { label: 'Run stored', ok: hasRunStored, missing: 'Not persisted' },
  ];

  return (
    <div className="mx-2 my-2 p-2 rounded-md bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 overflow-hidden">
      <div className="flex items-center gap-1 mb-1">
        <Eye className="h-3 w-3 text-purple-500" />
        <span className="text-[10px] font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wide">
          DB Truth Strip
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {indicators.map(({ label, ok, missing }) => (
          <div key={label} className="flex items-center gap-1">
            {ok ? (
              <CheckCircle2 className="h-3 w-3 text-green-500" />
            ) : (
              <XCircle className="h-3 w-3 text-red-400" />
            )}
            <span className={cn(
              "text-[10px] font-medium",
              ok ? "text-green-700 dark:text-green-300" : "text-red-600 dark:text-red-400"
            )}>
              {ok ? label : `${label}: ${missing}`}
            </span>
          </div>
        ))}
      </div>
      {fetchState === 'error' && (
        <p className="text-[10px] text-red-500 mt-1">Failed to fetch artefacts from DB</p>
      )}
    </div>
  );
}

type ActorType = 'UI' | 'Supervisor' | 'Tower';

function deriveActor(event: StreamEvent): ActorType {
  const meta = event.details as any;
  if (meta?.actor) {
    const a = meta.actor.toLowerCase();
    if (a === 'tower') return 'Tower';
    if (a === 'ui' || a === 'user' || a === 'client') return 'UI';
    if (a === 'supervisor' || a === 'worker') return 'Supervisor';
  }
  if (isTowerEvent(event)) return 'Tower';
  const t = event.type?.toLowerCase() || '';
  const action = event.details?.action?.toLowerCase() || '';
  if (t === 'user_message' || t === 'user_message_received' || action === 'user_message_received') return 'UI';
  if (t === 'router' || t === 'routing') return 'UI';
  if (t === 'direct_response' || t === 'stream') return 'UI';
  return 'Supervisor';
}

const ACTOR_STYLES: Record<ActorType, string> = {
  UI: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  Supervisor: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  Tower: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
};

function ActorBadge({ actor }: { actor: ActorType }) {
  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none", ACTOR_STYLES[actor])}>
      {actor}
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

  const actor = deriveActor(event);
  const tower = actor === 'Tower';
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
                <ActorBadge actor={actor} />
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
                <ActorBadge actor={actor} />
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

          {tower && (event.type === 'tower_judgement' || event.type === 'tower_verdict' || event.type === 'judgement_received') && (() => {
            const d = event.details as Record<string, any> | undefined;
            const verdict = d?.verdict as string | undefined;
            const rationale = (d?.rationale || d?.reason || d?.summary) as string | undefined;
            const requested = d?.requested as number | undefined;
            const delivered = d?.delivered as number | undefined;
            const confidence = d?.confidence as number | undefined;
            return (
              <div className="mt-1 space-y-1">
                <div className="flex flex-wrap gap-1.5 items-center">
                  {verdict && (
                    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none",
                      verdict === 'accept' ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200"
                      : verdict === 'stop' ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
                    )}>
                      {verdict.toUpperCase()}
                    </span>
                  )}
                  {requested != null && delivered != null && (
                    <span className="text-[10px] text-muted-foreground">
                      {delivered}/{requested} delivered
                    </span>
                  )}
                  {confidence != null && (
                    <span className="text-[10px] text-muted-foreground">
                      confidence: {Math.round(confidence * 100)}%
                    </span>
                  )}
                </div>
                {rationale && (
                  <p className="text-[10px] text-muted-foreground/80 italic leading-snug line-clamp-2">
                    {rationale}
                  </p>
                )}
              </div>
            );
          })()}

          {event.type === 'artefact_created' && (() => {
            const d = event.details as Record<string, any> | undefined;
            const artefactType = (d?.artefact_type || d?.type || d?.action) as string | undefined;
            const deliveredCount = d?.delivered_count as number | undefined;
            const runId = event.run_id || d?.runId;
            const typeName = artefactType ? artefactType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Result';
            return (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium leading-none bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
                  {typeName}
                </span>
                {deliveredCount != null && (
                  <span className="text-[10px] text-muted-foreground">
                    {deliveredCount} item{deliveredCount !== 1 ? 's' : ''}
                  </span>
                )}
                {runId && (
                  <button
                    onClick={() => {
                      console.log(`[ViewArtefact] runId=${runId} type=${artefactType}`);
                      const viewResultsBtn = document.querySelector<HTMLButtonElement>('[data-view-results]');
                      if (viewResultsBtn) viewResultsBtn.click();
                    }}
                    className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline font-medium"
                  >
                    View
                  </button>
                )}
              </div>
            );
          })()}

          {event.type === 'plan_updated' && (
            <div className="mt-1 flex items-center gap-1.5">
              <GitBranch className="h-3 w-3 text-indigo-400" />
              <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">
                {(event.details as any)?.version ? `Plan v${(event.details as any).version} created` : 'Plan v2 created'}
              </span>
            </div>
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

  const timingsRef = useRef({ thinkingMs: DEMO_THINKING_MS, workingMs: DEMO_WORKING_MS, gapMs: DEMO_EVENT_GAP_MS });
  timingsRef.current = {
    thinkingMs: DEMO_THINKING_MS,
    workingMs: DEMO_WORKING_MS,
    gapMs: DEMO_EVENT_GAP_MS,
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
    if (isDemoMode) {
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
    }
  }, [allEvents, clientRequestId, kickPlayer, kick, isDemoMode]);

  useEffect(() => {
    return () => { cancelRef.current++; };
  }, []);

  if (!isDemoMode) {
    return { displayEvents: allEvents, transientPhase: null };
  }

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
    case 'tower_verdict':
      return runType;
    case 'artefact_created':
      return 'artefact_created';
    case 'plan_updated':
      return 'plan_updated';
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
    tower_judgement: 'Tower verdict received',
    tower_evaluation_completed: 'Tower evaluation completed',
    tower_decision_stop: 'Tower decided to stop execution',
    tower_decision_change_plan: 'Tower decided to change plan',
    tower_call_started: 'Tower evaluation started',
    tower_call_completed: 'Tower evaluation completed',
    tower_verdict: 'Tower verdict received',
    artefact_created: 'Artefact created',
    plan_updated: 'Plan updated',
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
    case 'tower_verdict': {
      const verdict = action;
      return verdict ? `Tower verdict: ${verdict.toUpperCase()}` : 'Tower verdict received';
    }
    case 'tower_call_started':
      return 'Tower evaluation started';
    case 'tower_call_completed':
      return 'Tower evaluation completed';
    case 'tower_evaluation_completed':
      return 'Tower evaluation completed';
    case 'tower_decision_stop':
      return 'Tower decided to stop execution';
    case 'tower_decision_change_plan':
      return 'Tower decided to change plan';
    case 'artefact_created': {
      const artefactType = action || label || 'result';
      const typeName = artefactType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return `Artefact created: ${typeName}`;
    }
    case 'plan_updated':
      return label || 'Plan v2 created';
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
const OVERLAY_DURATION_MS = 0;
const TERMINAL_STABILITY_MS = 800;
const DEBUG_TERMINAL = false;

const ACTIVE_STATUSES = ['routing', 'planning', 'executing', 'deep_research', 'running', 'in_progress', 'awaiting_judgement', 'replanning'];
const TERMINAL_STATUSES = ['completed', 'failed', 'stopped'];

interface TowerAwareResult {
  towerVerdict: string | null;
  towerRationale: string | null;
  derivedStatus: OverallStatus | null;
  isLeadRun: boolean;
  towerMissing: boolean;
}

function deriveTowerAwareStatus(events: StreamEvent[], serverTerminalState: 'completed' | 'failed' | 'stopped' | null, artefacts?: Array<{ type: string; payload_json?: any }>, chatMode?: boolean): TowerAwareResult {
  let lastTowerVerdict: string | null = null;
  let lastTowerRationale: string | null = null;
  let hasRunCompleted = false;
  let hasRunStopped = false;
  let hasTowerJudgement = false;
  let hasToolCompleted = false;
  let isLeadRun = false;
  let hasTowerJudgementArtefact = false;

  const LEAD_ARTEFACT_TYPES = ['leads_list', 'plan_result', 'delivery_summary'];

  if (artefacts?.length) {
    isLeadRun = artefacts.some(a => LEAD_ARTEFACT_TYPES.includes(a.type));
    const towerArtefact = artefacts.find(a => a.type === 'tower_judgement');
    if (towerArtefact) {
      hasTowerJudgement = true;
      hasTowerJudgementArtefact = true;
      const p = towerArtefact.payload_json;
      if (p?.verdict && typeof p.verdict === 'string') {
        lastTowerVerdict = p.verdict.toLowerCase();
      }
      if (p?.rationale && typeof p.rationale === 'string') {
        lastTowerRationale = p.rationale;
      } else if (p?.reason && typeof p.reason === 'string') {
        lastTowerRationale = p.reason;
      }
    }
  }

  if (!isLeadRun) {
    for (const e of events) {
      const t = e.type?.toLowerCase() || '';
      if (t === 'artefact_created' || t === 'artifact_created') {
        const artType = (e.details as any)?.artefact_type || (e.details as any)?.type || '';
        if (LEAD_ARTEFACT_TYPES.includes(artType)) {
          isLeadRun = true;
          break;
        }
      }
    }
  }

  // Tower verdict is ONLY derived from DB artefact rows (polledArtefacts).
  // SSE activity events are NOT used — they are observability signals, not truth.

  for (const e of events) {
    const t = e.type?.toLowerCase() || '';
    if (t === 'run_completed') hasRunCompleted = true;
    if (t === 'run_stopped' || t === 'plan_execution_halted') hasRunStopped = true;
    if (t === 'tool_call_completed') hasToolCompleted = true;
  }

  if (lastTowerVerdict === 'stop' || hasRunStopped) {
    return { towerVerdict: lastTowerVerdict || 'stop', towerRationale: lastTowerRationale, derivedStatus: 'stopped', isLeadRun, towerMissing: !hasTowerJudgement };
  }

  if (serverTerminalState === 'stopped') {
    return { towerVerdict: lastTowerVerdict || 'stop', towerRationale: lastTowerRationale, derivedStatus: 'stopped', isLeadRun, towerMissing: !hasTowerJudgement };
  }

  if (lastTowerVerdict === 'change_plan' || lastTowerVerdict === 'retry') {
    return { towerVerdict: lastTowerVerdict, towerRationale: lastTowerRationale, derivedStatus: 'replanning', isLeadRun, towerMissing: false };
  }

  const isTerminal = serverTerminalState === 'completed' || hasRunCompleted;

  if (isTerminal) {
    if (hasTowerJudgement) {
      return { towerVerdict: lastTowerVerdict, towerRationale: lastTowerRationale, derivedStatus: 'completed', isLeadRun, towerMissing: false };
    }
    return { towerVerdict: lastTowerVerdict, towerRationale: lastTowerRationale, derivedStatus: 'completed', isLeadRun, towerMissing: true };
  }

  if (hasToolCompleted && !hasTowerJudgement && !serverTerminalState) {
    return { towerVerdict: null, towerRationale: null, derivedStatus: 'awaiting_judgement', isLeadRun, towerMissing: true };
  }

  return { towerVerdict: lastTowerVerdict, towerRationale: lastTowerRationale, derivedStatus: null, isLeadRun, towerMissing: !hasTowerJudgement };
}

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
  const confirmedTerminalAtRef = useRef<number | null>(null);
  const [catchUpDone, setCatchUpDone] = useState(false);
  
  const [demoPlayback, setDemoPlayback] = useState(false);
  const [towerLoopChatMode, setTowerLoopChatMode] = useState(() => {
    if (!IS_DEV) return false;
    try { return localStorage.getItem('TOWER_LOOP_CHAT_MODE') === 'true'; } catch { return false; }
  });

  const [minVisibleHold, setMinVisibleHold] = useState(false);
  const [postTerminalHold, setPostTerminalHold] = useState(false);
  const [polledArtefacts, setPolledArtefacts] = useState<Array<{ type: string; payload_json?: any }>>([]);
  const [userVisibleComplete, setUserVisibleComplete] = useState(false);
  const frozenEventIdsRef = useRef<string[] | null>(null);
  const prevClientRequestIdRef = useRef<string | null | undefined>(null);
  const [canonicalRunId, setCanonicalRunId] = useState<string | null>(null);
  const [canonicalRunIdStatus, setCanonicalRunIdStatus] = useState<'idle' | 'loading' | 'found' | 'not_found' | 'error'>('idle');
  const artefactPollRef = useRef<NodeJS.Timeout | null>(null);
  const artefactPollStartRef = useRef<number | null>(null);
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
  const fetchInFlightRef = useRef(false);
  
  const streamRequestId = stream?.client_request_id;
  const idsMatch = !!(activeClientRequestId && streamRequestId && activeClientRequestId === streamRequestId);

  const rawEvents = useMemo(() => stream?.events || [], [stream?.events]);
  const rawEventsRef = useRef<StreamEvent[]>(rawEvents);
  rawEventsRef.current = rawEvents;
  const allEvents = rawEvents;
  const frozenDisplayEvents = useMemo(() => {
    if (confirmedTerminal && !catchUpDone) {
      return rawEvents;
    }
    if (userVisibleComplete && frozenEventIdsRef.current != null && frozenEventIdsRef.current.length > 0) {
      const frozenIdSet = new Set(frozenEventIdsRef.current);
      const hasNewEvents = rawEvents.some((ev: any) => !frozenIdSet.has(ev.id));
      if (hasNewEvents) {
        frozenEventIdsRef.current = rawEvents.map((ev: any) => ev.id);
        return rawEvents;
      }
      const idOrder = frozenEventIdsRef.current;
      const idSet = new Set(idOrder);
      const matched = rawEvents.filter((e: any) => idSet.has(e.id));
      matched.sort((a: any, b: any) => idOrder.indexOf(a.id) - idOrder.indexOf(b.id));
      return matched.length > 0 ? matched : rawEvents;
    }
    return rawEvents;
  }, [rawEvents, userVisibleComplete, confirmedTerminal, catchUpDone]);
  const effectiveDemoPlayback = demoPlayback && !activeClientRequestId;
  const { displayEvents, transientPhase } = usePacedPlaybackQueue(frozenDisplayEvents, effectiveDemoPlayback, activeClientRequestId);
  const allRevealed = displayEvents.length >= frozenDisplayEvents.length;

  const fetchStream = useCallback(async () => {
    if (!activeClientRequestId) {
      setStream(null);
      setLoading(false);
      return;
    }

    if (fetchInFlightRef.current) {
      return;
    }
    fetchInFlightRef.current = true;

    const controller = new AbortController();
    fetchAbortRef.current = controller;

    try {
      const params = new URLSearchParams();
      params.set('client_request_id', activeClientRequestId);
      
      params.set('_t', String(Date.now()));
      const response = await fetch(`/api/afr/stream?${params.toString()}`, { signal: controller.signal, cache: 'no-store' });
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
      if (err?.name === 'AbortError') {
        fetchInFlightRef.current = false;
        return;
      }
      console.error("[LiveActivityPanel] Fetch error:", err);
      setError("Could not load activity stream.");
    } finally {
      fetchInFlightRef.current = false;
      setLoading(false);
    }
  }, [user?.id, activeClientRequestId, autoScroll]);

  useEffect(() => {
    fetchStream();
  }, [fetchStream]);

  useEffect(() => {
    if (!activeClientRequestId) {
      setCanonicalRunId(null);
      setCanonicalRunIdStatus('idle');
      return;
    }

    let cancelled = false;
    let retryInterval: NodeJS.Timeout | null = null;
    let resolved = false;
    const startedAt = Date.now();
    setCanonicalRunIdStatus('loading');

    const handleRunIdEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.runId && detail?.clientRequestId === activeClientRequestId) {
        console.log(`[CanonicalRunId] Instant resolve from SSE: runId=${detail.runId}`);
        setCanonicalRunId(detail.runId);
        setCanonicalRunIdStatus('found');
        resolved = true;
        if (retryInterval) { clearInterval(retryInterval); retryInterval = null; }
        fetchStream();
      }
    };
    window.addEventListener('wyshbone:run_id', handleRunIdEvent);

    const resolve = async () => {
      if (resolved || cancelled) return;
      if (Date.now() - startedAt > 30_000) {
        console.log('[CanonicalRunId] Timeout (30s), stopping retries');
        if (retryInterval) { clearInterval(retryInterval); retryInterval = null; }
        return;
      }
      try {
        const resp = await fetch(`/api/afr/run-id?crid=${encodeURIComponent(activeClientRequestId)}`);
        if (cancelled) return;
        if (!resp.ok) {
          setCanonicalRunIdStatus('error');
          return;
        }
        const data = await resp.json();
        if (cancelled) return;
        if (data.runId) {
          console.log(`[CanonicalRunId] Resolved crid=${activeClientRequestId.slice(0, 12)}... → runId=${data.runId}`);
          setCanonicalRunId(data.runId);
          setCanonicalRunIdStatus('found');
          resolved = true;
          if (retryInterval) { clearInterval(retryInterval); retryInterval = null; }
        } else {
          setCanonicalRunIdStatus('not_found');
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('[CanonicalRunId] Error resolving:', err);
          setCanonicalRunIdStatus('error');
        }
      }
    };

    resolve();
    retryInterval = setInterval(resolve, 3000);

    return () => {
      cancelled = true;
      window.removeEventListener('wyshbone:run_id', handleRunIdEvent);
      if (retryInterval) clearInterval(retryInterval);
    };
  }, [activeClientRequestId, fetchStream]);

  useEffect(() => {
    if (activeClientRequestId !== prevClientRequestIdRef.current) {
      setUserVisibleComplete(false);
      frozenEventIdsRef.current = null;
      confirmedTerminalAtRef.current = null;
      setCatchUpDone(false);
      prevClientRequestIdRef.current = activeClientRequestId;
    }
    if (!activeClientRequestId) {
      return;
    }
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.clientRequestId === activeClientRequestId) {
        if (IS_DEV) console.log('[LiveActivityPanel] User-visible results final for crid:', activeClientRequestId.slice(0, 12));
        setUserVisibleComplete(true);
        frozenEventIdsRef.current = rawEventsRef.current.map((ev) => ev.id);
      }
    };
    window.addEventListener('wyshbone:results_final', handler);
    return () => window.removeEventListener('wyshbone:results_final', handler);
  }, [activeClientRequestId]);

  const effectiveRunIdForPolling = canonicalRunId;
  const hasTowerInPolled = polledArtefacts.some(a => a.type === 'tower_judgement');
  useEffect(() => {
    if (artefactPollRef.current) {
      clearInterval(artefactPollRef.current);
      artefactPollRef.current = null;
    }

    if (!effectiveRunIdForPolling || hasTowerInPolled) return;

    artefactPollStartRef.current = Date.now();
    console.log(`[ArtefactPoll] Starting auto-poll for canonicalRunId=${effectiveRunIdForPolling} (stream.run_id=${stream?.run_id || 'n/a'})`);

    const stopPoll = () => {
      if (artefactPollRef.current) {
        clearInterval(artefactPollRef.current);
        artefactPollRef.current = null;
      }
    };

    const poll = async () => {
      try {
        const elapsed = Date.now() - (artefactPollStartRef.current || Date.now());
        if (elapsed > 90_000) {
          console.log('[ArtefactPoll] Timeout reached (90s), stopping poll');
          stopPoll();
          return;
        }

        const [artefactResp, statusResp] = await Promise.all([
          fetch(`/api/afr/artefacts?runId=${encodeURIComponent(effectiveRunIdForPolling)}`),
          activeClientRequestId
            ? fetch(`/api/afr/run-id?crid=${encodeURIComponent(activeClientRequestId)}`)
            : Promise.resolve(null),
        ]);

        let runStatus: string | null = null;
        if (statusResp && statusResp.ok) {
          const statusData = await statusResp.json();
          runStatus = statusData.status;
        }

        if (!artefactResp.ok) return;
        const rows = await artefactResp.json();
        if (Array.isArray(rows) && rows.length > 0) {
          console.log(`[ArtefactPoll] Got ${rows.length} artefact(s) — types: [${rows.map((r: any) => r.type).join(', ')}] runStatus=${runStatus}`);
          setPolledArtefacts(rows);
          const hasTower = rows.some((r: any) => r.type === 'tower_judgement');
          if (hasTower) {
            console.log('[ArtefactPoll] tower_judgement found, stopping poll');
            stopPoll();
          } else if (runStatus === 'completed' || runStatus === 'failed' || runStatus === 'stopped') {
            console.log(`[ArtefactPoll] Run is ${runStatus}, stopping poll (no tower judgement)`);
            stopPoll();
          }
        }
      } catch (err) {
        console.warn('[ArtefactPoll] Error:', err);
      }
    };

    poll();
    artefactPollRef.current = setInterval(poll, 3000);

    return () => {
      if (artefactPollRef.current) {
        clearInterval(artefactPollRef.current);
        artefactPollRef.current = null;
      }
    };
  }, [effectiveRunIdForPolling, hasTowerInPolled]);

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
      fetchInFlightRef.current = false;
      
      setConfirmedTerminal(false);
      setShowThinking(false);
      terminalEventCountRef.current = null;
      prevEventCount.current = 0;
      
      setStream(null);
      setPolledArtefacts([]);
      
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
    if (confirmedTerminal) {
      if (catchUpDone) return;
      const termAt = confirmedTerminalAtRef.current;
      if (!termAt) return;

      if (IS_DEV) console.log(`[LiveActivityPanel] Post-terminal catch-up: polling every ${POST_TERMINAL_POLL_MS}ms for ${POST_TERMINAL_CATCHUP_MS / 1000}s`);
      fetchStream();
      const interval = setInterval(fetchStream, POST_TERMINAL_POLL_MS);
      const timeout = setTimeout(() => {
        clearInterval(interval);
        setCatchUpDone(true);
        if (IS_DEV) console.log('[LiveActivityPanel] Post-terminal catch-up complete');
      }, POST_TERMINAL_CATCHUP_MS);
      return () => { clearInterval(interval); clearTimeout(timeout); };
    }

    const isActive = stream?.status && !['idle', 'completed', 'failed'].includes(stream.status) && (stream?.status as string) !== 'stopped';
    const hasActiveRequest = !!activeClientRequestId;
    const intervalMs = isActive || hasActiveRequest ? 1500 : 10000;

    const interval = setInterval(fetchStream, intervalMs);
    return () => clearInterval(interval);
  }, [stream?.status, fetchStream, activeClientRequestId, confirmedTerminal, catchUpDone]);

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
        confirmedTerminalAtRef.current = null;
        setCatchUpDone(false);
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
          confirmedTerminalAtRef.current = Date.now();
          terminalStabilityTimerRef.current = null;
          window.dispatchEvent(new CustomEvent('wyshbone:activity_terminal', {
            detail: { runId: stream?.run_id || null, clientRequestId: activeClientRequestId || null },
          }));
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
    const isRunActive = hasActiveRequest && !confirmedTerminal && !showOverlay && !userVisibleComplete;
    
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
  }, [activeClientRequestId, confirmedTerminal, showOverlay, userVisibleComplete, stream?.event_count]);

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

  const towerAware = useMemo(() => {
    return deriveTowerAwareStatus(allEvents, stream?.terminal_state as any || null, polledArtefacts.length > 0 ? polledArtefacts : undefined, towerLoopChatMode);
  }, [allEvents, stream?.terminal_state, towerLoopChatMode, polledArtefacts]);

  const isFinalising = false;

  const mappedStatus: OverallStatus = (() => {
    if (userVisibleComplete) {
      return 'completed';
    }

    if (activeClientRequestId && !idsMatch) {
      return 'executing';
    }
    
    if (!stream) return 'idle';
    
    if (!activeClientRequestId && stream.is_terminal) {
      if (postTerminalHold) {
        if (towerAware.derivedStatus) return towerAware.derivedStatus;
        return stream.terminal_state || 'idle';
      }
      return 'idle';
    }
    
    if (activeClientRequestId && !stream.ui_ready) {
      return 'executing';
    }
    
    if (idsMatch && stream.is_terminal && stream.terminal_state && effectiveTerminal) {
      if (towerAware.derivedStatus) return towerAware.derivedStatus;
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
      if (towerAware.derivedStatus === 'awaiting_judgement') return 'awaiting_judgement';
      if (towerAware.derivedStatus === 'replanning') return 'replanning';
      const hasDeepResearch = stream.events.some(e => 
        e.type.includes('deep_research') && e.status === 'running'
      );
      if (hasDeepResearch) return 'deep_research';
      return 'executing';
    }
    return 'idle';
  })();
  
  const isWorking = !showOverlay && !userVisibleComplete && (
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
        userVisibleComplete,
        isFinalising,
        eventCount: stream?.event_count || 0,
      });
    }
  }, [stream?.is_terminal, stream?.terminal_state, stream?.ui_ready, stream?.run_id, stream?.event_count, confirmedTerminal, effectiveTerminal, minVisibleHold, postTerminalHold, demoPlayback, displayEvents.length, allEvents.length, mappedStatus, activeClientRequestId, idsMatch, isWorking, showThinking, showOverlay, userVisibleComplete, isFinalising, streamRequestId]);

  if (loading) {
    return (
      <Card className="flex flex-col flex-1 min-h-0 overflow-hidden">
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
      <Card className="flex flex-col flex-1 min-h-0 overflow-hidden">
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
    <Card className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <CardHeader className="pb-2 shrink-0">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <CardTitle className="text-sm font-medium shrink-0">Live Activity</CardTitle>
          <div className="flex flex-wrap items-center gap-1.5 justify-end min-w-0">
            {IS_DEV && (
              <button
                onClick={() => {
                  const next = !towerLoopChatMode;
                  setTowerLoopChatMode(next);
                  try {
                    localStorage.setItem('TOWER_LOOP_CHAT_MODE', String(next));
                    window.dispatchEvent(new CustomEvent('tower-chat-mode-changed', { detail: next }));
                  } catch {}
                }}
                className={cn(
                  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer select-none",
                  towerLoopChatMode
                    ? "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200"
                    : "bg-gray-100 text-gray-500 dark:bg-gray-800/50 dark:text-gray-400"
                )}
                title={towerLoopChatMode ? "Tower Chat Mode ON: runs require Tower verdict to show Completed" : "Tower Chat Mode OFF: standard status derivation"}
              >
                <Brain className="h-3 w-3" />
                Tower {towerLoopChatMode ? "ON" : "OFF"}
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
            {hasEvents && (effectiveTerminal || towerAware.towerVerdict) && !towerAware.towerMissing && (
              <span className={cn(
                "px-1.5 py-0.5 rounded text-[10px] font-medium",
                towerAware.towerVerdict === 'accept'
                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200"
                  : towerAware.towerVerdict === 'stop'
                    ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200"
                    : "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200"
              )}>
                Tower: {(towerAware.towerVerdict || 'evaluated').toUpperCase()}
              </span>
            )}
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
            <div className="px-4 pt-2 pb-2 overflow-x-hidden">
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
            
            {effectiveTerminal && allRevealed && !transientPhase && (
              <TruthStrip runId={canonicalRunId || stream?.run_id} />
            )}
            
            {effectiveTerminal && allRevealed && !transientPhase && (mappedStatus === 'completed' || mappedStatus === 'failed' || mappedStatus === 'stopped' || mappedStatus === 'awaiting_judgement' || mappedStatus === 'replanning') && (
              <SequenceStatusRow status={mappedStatus as any} clientRequestId={activeClientRequestId} runId={canonicalRunId || stream?.run_id} towerVerdict={towerAware.towerVerdict} towerMissing={towerAware.towerMissing} chatMode={towerLoopChatMode} towerRationale={towerAware.towerRationale} />
            )}
            {IS_DEV && activeClientRequestId && (
              <div className="mt-1 px-2 py-1 rounded bg-gray-100 dark:bg-gray-800/50 text-[10px] font-mono text-muted-foreground/70 space-y-0.5 overflow-hidden">
                <div className="truncate">crid: {activeClientRequestId.slice(0, 16)}...</div>
                <div className="truncate">streamRunId: {stream?.run_id || 'n/a'}</div>
                <div className="truncate">canonicalRunId: {canonicalRunId || `(${canonicalRunIdStatus})`}</div>
                <div className="truncate">pollingWith: {effectiveRunIdForPolling || 'none'}</div>
              </div>
            )}
            
            {isWorking && (
              <ThinkingIndicator variant="footer" />
            )}

            
            <div ref={bottomRef} className="h-4 shrink-0" />
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
