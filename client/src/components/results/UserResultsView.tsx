import { useState } from "react";
import { MapPin, Phone, Globe, Info, CheckCircle2, CircleDot, OctagonX, HelpCircle, ThumbsUp, RotateCcw, X, Download, Loader2, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ConstraintsSectionInline, VerificationSectionInline } from "@/components/results/CvlArtefactViews";
import { resolveCanonicalStatus, STATUS_CONFIG, type CanonicalStatus, type StopReason } from "@/utils/deliveryStatus";
import { acceptResult, retryGoal, abandonGoal, exportData } from "@/api/feedbackClient";
import { emitTelemetry, type TelemetryEventType } from "@/api/telemetryClient";
import { WhatWasLearnedPanel } from "@/components/results/WhatWasLearnedPanel";
import type { RuleUpdate } from "@/types/afr";

export interface DeliveryLead {
  name?: string;
  location?: string;
  phone?: string;
  website?: string;
  soft_violations?: string[];
  [key: string]: any;
}

export interface DeliverySummary {
  status?: string | null;
  stop_reason?: StopReason | { message?: string; code?: string } | string | null;
  delivered_exact?: DeliveryLead[];
  delivered_closest?: DeliveryLead[];
  shortfall?: number;
  requested_count?: number;
  delivered_count?: number;
  verified_exact_count?: number;
  suggested_next_question?: string | null;
  relaxations?: string[];
}

const STATUS_ICONS: Record<CanonicalStatus, typeof CheckCircle2> = {
  PASS: CheckCircle2,
  PARTIAL: CircleDot,
  STOP: OctagonX,
  FAIL: AlertTriangle,
  ACCEPT_WITH_UNVERIFIED: AlertTriangle,
  UNAVAILABLE: HelpCircle,
};

function prefillChat(message: string) {
  window.dispatchEvent(new CustomEvent("wyshbone-prefill-chat", { detail: message }));
}

function LeadCard({ lead, showViolations }: { lead: DeliveryLead; showViolations?: boolean }) {
  const violations = showViolations && Array.isArray(lead.soft_violations) && lead.soft_violations.length > 0
    ? lead.soft_violations
    : null;

  return (
    <div className="rounded-lg border bg-card px-4 py-3 space-y-1.5">
      {lead.name && (
        <p className="text-sm font-semibold text-foreground leading-tight">{lead.name}</p>
      )}
      {lead.location && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" />
          <span>{lead.location}</span>
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {lead.phone && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Phone className="h-3 w-3 shrink-0" />
            <span className="font-mono">{lead.phone}</span>
          </div>
        )}
        {lead.website && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
            <Globe className="h-3 w-3 shrink-0" />
            <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline truncate max-w-[220px]">
              {lead.website}
            </a>
          </div>
        )}
      </div>
      {violations && (
        <p className="text-[11px] text-muted-foreground/50 leading-snug pt-0.5">
          {violations.join(" · ")}
        </p>
      )}
    </div>
  );
}

function NextActionsSection({ suggestedQuestion, shortfall, requestedCount, onClose }: { suggestedQuestion: string | null; shortfall: number | null; requestedCount: number | null; onClose?: () => void }) {
  const target = requestedCount ?? "the original number";
  const q = (suggestedQuestion || "").toLowerCase();
  const actions: Array<{ label: string; message: string; variant?: "default" | "outline" }> = [];

  if (q.includes("nearby")) {
    actions.push({ label: "Include nearby", message: `Ok, include nearby results. Try to reach ${target}.`, variant: "default" });
    actions.push({ label: "Keep it strict", message: `Keep the constraints strict. If you can't reach ${target}, stop and explain.`, variant: "outline" });
  } else if (q.includes("similar")) {
    actions.push({ label: "Include similar", message: `Ok, include similar results. Try to reach ${target}.`, variant: "default" });
    actions.push({ label: "Keep it strict", message: `Keep the constraints strict. If you can't reach ${target}, stop and explain.`, variant: "outline" });
  } else if (q.includes("broaden")) {
    actions.push({ label: "Broaden criteria", message: `Ok, broaden the criteria sensibly and try to reach ${target}. Tell me what you relaxed.`, variant: "default" });
    actions.push({ label: "Keep it strict", message: `Keep the constraints strict. If you can't reach ${target}, stop and explain.`, variant: "outline" });
  } else if (shortfall != null && shortfall > 0) {
    actions.push({ label: "Broaden criteria", message: `Ok, broaden the criteria sensibly and try to reach ${target}. Tell me what you relaxed.`, variant: "default" });
    actions.push({ label: "Keep it strict", message: `Keep the constraints strict. If you can't reach ${target}, stop and explain.`, variant: "outline" });
  }

  actions.push({ label: "Try a different search", message: `Try a different approach to find ${target} while keeping the original constraints.`, variant: "outline" });

  if (actions.length === 1 && shortfall == null) return null;

  const handleClick = (message: string) => {
    prefillChat(message);
    onClose?.();
  };

  return (
    <section className="space-y-3 pt-1">
      <h3 className="text-sm font-semibold text-foreground">Next actions</h3>
      <div className="flex flex-wrap gap-2">
        {actions.map((action, i) => (
          <Button key={i} variant={action.variant || "outline"} size="sm" className="text-xs" onClick={() => handleClick(action.message)}>
            {action.label}
          </Button>
        ))}
      </div>
    </section>
  );
}

function FeedbackButtons({ goalId, runId }: { goalId?: string | null; runId?: string | null }) {
  const [pending, setPending] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [showMarkWrong, setShowMarkWrong] = useState(false);
  const [wrongReason, setWrongReason] = useState("");

  const FEEDBACK_TELEMETRY: Record<string, TelemetryEventType> = {
    accept: "accept_results",
    retry: "retry_same_constraints",
    export: "export_csv",
  };

  const handle = async (action: string, fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setPending(action);
    const tel = FEEDBACK_TELEMETRY[action];
    if (tel && runId) emitTelemetry(runId, tel);
    const result = await fn();
    setPending(null);
    if (result.ok) setDone(action);
  };

  const handleMarkWrong = () => {
    if (runId) emitTelemetry(runId, "mark_wrong", { reason: wrongReason || "unspecified" });
    setShowMarkWrong(false);
    setWrongReason("");
    setDone("mark_wrong");
  };

  if (done) {
    const labels: Record<string, string> = {
      accept: "Result accepted",
      retry: "Retrying...",
      abandon: "Goal abandoned",
      export: "Exported",
      mark_wrong: "Marked as wrong",
    };
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
        {labels[done] || "Done"}
      </div>
    );
  }

  return (
    <section className="pt-3 border-t space-y-2">
      <h3 className="text-sm font-semibold text-foreground">Your feedback</h3>
      <div className="flex flex-wrap gap-2">
        <Button variant="default" size="sm" className="text-xs" disabled={!!pending} onClick={() => handle("accept", () => acceptResult(goalId ?? null, runId ?? null))}>
          {pending === "accept" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ThumbsUp className="h-3 w-3 mr-1" />}
          Accept
        </Button>
        <Button variant="outline" size="sm" className="text-xs" disabled={!!pending} onClick={() => handle("retry", () => retryGoal(goalId ?? null, runId ?? null))}>
          {pending === "retry" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RotateCcw className="h-3 w-3 mr-1" />}
          Retry
        </Button>
        <Button variant="outline" size="sm" className="text-xs" disabled={!!pending} onClick={() => handle("abandon", () => abandonGoal(goalId ?? null, runId ?? null))}>
          {pending === "abandon" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <X className="h-3 w-3 mr-1" />}
          Abandon
        </Button>
        <Button variant="outline" size="sm" className="text-xs" disabled={!!pending} onClick={() => handle("export", () => exportData(goalId ?? null, runId ?? null))}>
          {pending === "export" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Download className="h-3 w-3 mr-1" />}
          Export
        </Button>
        <Button variant="outline" size="sm" className="text-xs" disabled={!!pending} onClick={() => setShowMarkWrong(!showMarkWrong)}>
          <AlertTriangle className="h-3 w-3 mr-1" />
          Mark wrong
        </Button>
      </div>
      {showMarkWrong && (
        <div className="flex items-center gap-2 pt-1">
          <input
            type="text"
            value={wrongReason}
            onChange={(e) => setWrongReason(e.target.value)}
            placeholder="Brief reason (optional)"
            className="flex-1 text-xs border rounded px-2 py-1 bg-background text-foreground placeholder:text-muted-foreground"
          />
          <Button variant="default" size="sm" className="text-xs h-7" onClick={handleMarkWrong}>
            Submit
          </Button>
        </div>
      )}
    </section>
  );
}

function ClosestResultsCollapsed({ closest }: { closest: DeliveryLead[] }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="space-y-2">
      <button
        className="flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors w-full text-left"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        Other candidates — not verified ({closest.length})
      </button>
      {open && (
        <div className="pl-3 border-l border-border/50">
          <p className="text-xs text-muted-foreground mb-2">
            These were found in discovery but could not be verified against your requirements.
          </p>
          <div className="space-y-2">
            {closest.map((lead, i) => (
              <LeadCard key={i} lead={lead} showViolations />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default function UserResultsView({
  deliverySummary,
  onClose,
  constraintsPayload,
  verificationPayload,
  evidencePayload,
  ruleUpdates,
  goalId,
  runId,
}: {
  deliverySummary: DeliverySummary;
  onClose?: () => void;
  constraintsPayload?: any;
  verificationPayload?: any;
  evidencePayload?: any;
  ruleUpdates?: RuleUpdate[];
  goalId?: string | null;
  runId?: string | null;
}) {
  const exact = Array.isArray(deliverySummary.delivered_exact) ? deliverySummary.delivered_exact : [];
  const closest = Array.isArray(deliverySummary.delivered_closest) ? deliverySummary.delivered_closest : [];
  const shortfall = deliverySummary.shortfall ?? null;
  const hasCvl = !!constraintsPayload;
  const requestedCount = deliverySummary.requested_count ?? null;
  const deliveredCount = deliverySummary.delivered_count ?? null;
  const suggestedQuestion = deliverySummary.suggested_next_question ?? null;
  const verifiedExactCount = deliverySummary.verified_exact_count ?? 0;
  const hasVerifiedExact = verifiedExactCount > 0;

  const canonical = resolveCanonicalStatus({
    status: deliverySummary.status,
    stop_reason: deliverySummary.stop_reason,
    delivered_count: deliveredCount,
    requested_count: requestedCount,
    verified_exact_count: deliverySummary.verified_exact_count,
  });

  const config = STATUS_CONFIG[canonical.status];
  const StatusIcon = STATUS_ICONS[canonical.status];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold", config.badge)}>
          <StatusIcon className="h-3.5 w-3.5" />
          {config.label}
        </span>
        <p className="text-sm text-muted-foreground">{config.description}</p>
      </div>

      {canonical.status === "STOP" && canonical.stop_reason?.message && (
        <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-900/10 px-4 py-3 flex items-start gap-2.5">
          <OctagonX className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
          <div className="text-sm text-foreground/80 leading-relaxed">
            <p className="font-medium text-foreground mb-0.5">Why it stopped</p>
            <p>{canonical.stop_reason.message}</p>
          </div>
        </div>
      )}

      {requestedCount != null && deliveredCount != null && (
        <div className="flex gap-4">
          <div className="flex-1 rounded-lg border bg-muted/30 p-2.5 text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Delivered</p>
            <p className="text-xl font-bold text-foreground mt-0.5">{deliveredCount}</p>
          </div>
          <div className="flex-1 rounded-lg border bg-muted/30 p-2.5 text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Requested</p>
            <p className="text-xl font-bold text-foreground mt-0.5">{requestedCount}</p>
          </div>
        </div>
      )}

      {constraintsPayload && (
        <ConstraintsSectionInline constraintsPayload={constraintsPayload} verificationPayload={verificationPayload} />
      )}

      {verificationPayload && (
        <VerificationSectionInline verificationPayload={verificationPayload} evidencePayload={evidencePayload} />
      )}

      {exact.length === 0 && closest.length === 0 && shortfall == null && canonical.status !== "STOP" && (
        <p className="text-sm text-muted-foreground">No results to display.</p>
      )}

      {exact.length > 0 && hasVerifiedExact && (
        <section className="space-y-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Verified matches ({exact.length})</h3>
            <p className="text-xs text-muted-foreground mt-0.5">These meet all your stated requirements.</p>
          </div>
          <div className="space-y-2">
            {exact.map((lead, i) => (
              <LeadCard key={i} lead={lead} />
            ))}
          </div>
        </section>
      )}

      {exact.length > 0 && !hasVerifiedExact && (
        <section className="space-y-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Results</h3>
            <p className="text-xs text-muted-foreground mt-0.5">These results were found for your search.</p>
          </div>
          <div className="space-y-2">
            {exact.map((lead, i) => (
              <LeadCard key={i} lead={lead} showViolations />
            ))}
          </div>
        </section>
      )}

      {closest.length > 0 && hasVerifiedExact && (
        <ClosestResultsCollapsed closest={closest} />
      )}

      {closest.length > 0 && !hasVerifiedExact && (
        <section className="space-y-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Closest results</h3>
            <p className="text-xs text-muted-foreground mt-0.5">These are the nearest alternatives once soft constraints were relaxed.</p>
          </div>
          <div className="space-y-2">
            {closest.map((lead, i) => (
              <LeadCard key={i} lead={lead} showViolations />
            ))}
          </div>
        </section>
      )}

      {shortfall != null && shortfall > 0 && canonical.status !== "STOP" && (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 flex items-start gap-2.5">
          <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="text-sm text-foreground/80 leading-relaxed">
            <p className="font-medium text-foreground mb-0.5">What's missing</p>
            {requestedCount != null && deliveredCount != null && (
              <p>{hasCvl ? 'Requested' : 'Target (system)'} {requestedCount}, delivered {deliveredCount}.</p>
            )}
            <p>{shortfall} more could not be found that meet all your requirements.</p>
          </div>
        </div>
      )}

      {ruleUpdates && ruleUpdates.length > 0 && (
        <WhatWasLearnedPanel ruleUpdates={ruleUpdates} />
      )}

      {canonical.status !== "STOP" && (suggestedQuestion || (shortfall != null && shortfall > 0)) && (
        <NextActionsSection suggestedQuestion={suggestedQuestion} shortfall={shortfall} requestedCount={requestedCount} onClose={onClose} />
      )}

      <FeedbackButtons goalId={goalId} runId={runId} />
    </div>
  );
}
