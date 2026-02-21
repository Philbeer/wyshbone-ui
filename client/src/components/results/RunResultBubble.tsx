import { MapPin, Phone, Globe, CheckCircle2, CircleDot, OctagonX, HelpCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { resolveCanonicalStatus, type CanonicalStatus } from "@/utils/deliveryStatus";
import type { DeliverySummary, DeliveryLead } from "@/components/results/UserResultsView";
import type { VerificationSummaryPayload, ConstraintsExtractedPayload } from "@/components/results/CvlArtefactViews";

export interface RunResultBubbleProps {
  deliverySummary: DeliverySummary;
  verificationSummary?: VerificationSummaryPayload | null;
  constraintsExtracted?: ConstraintsExtractedPayload | null;
  runId?: string | null;
}

function dispatchFollowUp(params: {
  message: string;
  parentRunId?: string | null;
  actionType: string;
  actionPayload?: Record<string, any>;
}) {
  window.dispatchEvent(
    new CustomEvent("wyshbone-prefill-chat", {
      detail: {
        message: params.message,
        metadata: {
          follow_up: {
            parent_run_id: params.parentRunId ?? null,
            action_type: params.actionType,
            action_payload: params.actionPayload ?? {},
          },
        },
      },
    })
  );
}

const STATUS_ICONS: Record<CanonicalStatus, typeof CheckCircle2> = {
  PASS: CheckCircle2,
  PARTIAL: CircleDot,
  STOP: OctagonX,
  UNAVAILABLE: HelpCircle,
};

const STATUS_COLORS: Record<CanonicalStatus, string> = {
  PASS: "text-green-600 dark:text-green-400",
  PARTIAL: "text-blue-600 dark:text-blue-400",
  STOP: "text-red-600 dark:text-red-400",
  UNAVAILABLE: "text-muted-foreground",
};

function extractUnverifiableAttribute(ds: DeliverySummary): string | null {
  const stopReason = ds.stop_reason;
  if (!stopReason) return null;
  const msg = typeof stopReason === "string" ? stopReason : (stopReason as any)?.message || "";
  const lower = msg.toLowerCase();
  const attrs = ["live music", "craft beer", "dog friendly", "dog-friendly", "outdoor seating", "beer garden", "real ale", "sunday roast", "quiz night", "karaoke", "pool table", "darts", "sky sports", "bt sport", "gluten free", "vegan", "vegetarian", "wifi", "parking"];
  for (const attr of attrs) {
    if (lower.includes(attr)) return attr;
  }
  const match = lower.match(/(?:couldn't|cannot|can't|unable to)\s+(?:verify|confirm|check)\s+(?:whether|if|that)?\s*(?:they\s+)?(?:have\s+|offer\s+)?(.+?)(?:\.|$)/);
  if (match?.[1]) {
    const cleaned = match[1].replace(/['"]/g, "").trim();
    if (cleaned.length > 2 && cleaned.length < 50) return cleaned;
  }
  return null;
}

function resolveVerifiedCount(
  ds: DeliverySummary,
  vs?: VerificationSummaryPayload | null
): number {
  if (vs && typeof vs.verified_exact_count === "number") {
    return vs.verified_exact_count;
  }
  return ds.verified_exact_count ?? 0;
}

function resolveHasTargetCount(
  ds: DeliverySummary,
  ce?: ConstraintsExtractedPayload | null
): { hasTarget: boolean; targetCount: number } {
  if (ce) {
    const rcu = ce.requested_count_user;
    if (rcu === null || rcu === undefined || (rcu as any) === "any") {
      return { hasTarget: false, targetCount: 0 };
    }
    if (typeof rcu === "number" && rcu > 0) {
      return { hasTarget: true, targetCount: rcu };
    }
  }
  const rc = ds.requested_count;
  if (typeof rc === "number" && rc > 0) {
    return { hasTarget: true, targetCount: rc };
  }
  return { hasTarget: false, targetCount: 0 };
}

function buildSummaryText(
  ds: DeliverySummary,
  canonical: ReturnType<typeof resolveCanonicalStatus>,
  verifiedExact: number,
  target: { hasTarget: boolean; targetCount: number }
): string {
  const exactLeads = Array.isArray(ds.delivered_exact) ? ds.delivered_exact.length : 0;
  const closestLeads = Array.isArray(ds.delivered_closest) ? ds.delivered_closest.length : 0;
  const totalCandidates = (verifiedExact === 0 ? exactLeads : 0) + closestLeads;

  switch (canonical.status) {
    case "PASS":
      if (target.hasTarget) {
        return `I found ${verifiedExact} ${verifiedExact === 1 ? "result" : "results"} that match — that covers your request for ${target.targetCount}.`;
      }
      return `I found ${verifiedExact} ${verifiedExact === 1 ? "result" : "results"} that match what you asked for.`;

    case "PARTIAL":
      if (target.hasTarget) {
        return `I found ${verifiedExact} verified ${verifiedExact === 1 ? "result" : "results"}, but that\u2019s short of the ${target.targetCount} you requested.`;
      }
      return `I found ${verifiedExact} verified ${verifiedExact === 1 ? "result" : "results"}, but not as many as I\u2019d hoped.`;

    case "STOP": {
      const attr = extractUnverifiableAttribute(ds);
      if (verifiedExact > 0) {
        return `I found ${verifiedExact} ${verifiedExact === 1 ? "result" : "results"} that match.`;
      }
      if (attr && totalCandidates > 0) {
        return `I found ${totalCandidates} possible ${totalCandidates === 1 ? "result" : "results"}, but I couldn\u2019t confirm ${attr}.`;
      }
      if (totalCandidates > 0) {
        return `I found ${totalCandidates} possible ${totalCandidates === 1 ? "result" : "results"}, but couldn\u2019t fully verify them.`;
      }
      return `I couldn\u2019t find any matches for that.`;
    }

    case "UNAVAILABLE":
    default:
      return "Results are being processed.";
  }
}

function LeadBadge({ isVerified, unverifiableAttr }: { isVerified: boolean; unverifiableAttr: string | null }) {
  if (isVerified) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
        <CheckCircle2 className="h-2.5 w-2.5" /> Verified match
      </span>
    );
  }

  if (unverifiableAttr) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
        <AlertTriangle className="h-2.5 w-2.5" /> Not confirmed: {unverifiableAttr}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
      Candidate
    </span>
  );
}

function LeadRow({ lead, isVerified, unverifiableAttr }: { lead: DeliveryLead; isVerified: boolean; unverifiableAttr: string | null }) {
  const area = lead.location || "";
  const placeId = (lead as any).place_id || (lead as any).placeId;
  const mapsLink = placeId
    ? `https://www.google.com/maps/place/?q=place_id:${placeId}`
    : null;

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground truncate">{lead.name || "Unknown"}</span>
          <LeadBadge isVerified={isVerified} unverifiableAttr={isVerified ? null : unverifiableAttr} />
        </div>
        {area && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{area}</span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {lead.website && (
            <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-500 hover:underline truncate max-w-[200px]">
              <Globe className="h-3 w-3 shrink-0" />
              <span className="truncate">{lead.website.replace(/^https?:\/\//, "")}</span>
            </a>
          )}
          {mapsLink && (
            <a href={mapsLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-500 hover:underline">
              <MapPin className="h-3 w-3 shrink-0" />
              Map
            </a>
          )}
          {lead.phone && isVerified && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-mono">
              <Phone className="h-3 w-3 shrink-0" />
              {lead.phone}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function NextActionButtons({
  ds,
  canonical,
  runId,
}: {
  ds: DeliverySummary;
  canonical: ReturnType<typeof resolveCanonicalStatus>;
  runId?: string | null;
}) {
  const attr = extractUnverifiableAttribute(ds);
  const actions: Array<{
    label: string;
    message: string;
    actionType: string;
    actionPayload?: Record<string, any>;
  }> = [];

  if (canonical.status === "STOP" || canonical.status === "PARTIAL") {
    actions.push({
      label: "Widen the search area",
      message: "Widen the search area and try again.",
      actionType: "widen_search",
    });
    if (attr) {
      actions.push({
        label: `Check websites for ${attr}`,
        message: `Check the websites of the candidates to confirm ${attr}.`,
        actionType: "check_websites",
        actionPayload: { attribute: attr },
      });
      actions.push({
        label: `Remove ${attr} requirement`,
        message: `Remove the ${attr} requirement and find me results without it.`,
        actionType: "remove_constraint",
        actionPayload: { attribute: attr },
      });
    }
    actions.push({
      label: "Return best-effort list",
      message: "Return the best-effort list of candidates you found.",
      actionType: "return_best_effort",
    });
  }

  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 pt-2">
      {actions.map((a, i) => (
        <Button
          key={i}
          variant="outline"
          size="sm"
          className="text-xs h-7"
          onClick={() =>
            dispatchFollowUp({
              message: a.message,
              parentRunId: runId,
              actionType: a.actionType,
              actionPayload: a.actionPayload,
            })
          }
        >
          {a.label}
        </Button>
      ))}
    </div>
  );
}

export default function RunResultBubble({
  deliverySummary,
  verificationSummary,
  constraintsExtracted,
  runId,
}: RunResultBubbleProps) {
  const verifiedExact = resolveVerifiedCount(deliverySummary, verificationSummary);
  const target = resolveHasTargetCount(deliverySummary, constraintsExtracted);

  const canonical = resolveCanonicalStatus({
    status: deliverySummary.status,
    stop_reason: deliverySummary.stop_reason,
    delivered_count: deliverySummary.delivered_count,
    requested_count: target.hasTarget ? target.targetCount : undefined,
    verified_exact_count: verifiedExact,
  });

  const StatusIcon = STATUS_ICONS[canonical.status];
  const statusColor = STATUS_COLORS[canonical.status];
  const summaryText = buildSummaryText(deliverySummary, canonical, verifiedExact, target);
  const unverifiableAttr = extractUnverifiableAttribute(deliverySummary);

  const exact = Array.isArray(deliverySummary.delivered_exact) ? deliverySummary.delivered_exact : [];
  const closest = Array.isArray(deliverySummary.delivered_closest) ? deliverySummary.delivered_closest : [];
  const allLeads = [...exact, ...closest];

  const hasVerifiedLeadsToShow = verifiedExact > 0 && allLeads.length > 0;
  const showExact = verifiedExact > 0 && exact.length > 0;
  const showVerifiedFromAll = verifiedExact > 0 && exact.length === 0 && allLeads.length > 0;
  const showCandidates = !hasVerifiedLeadsToShow && closest.length > 0;
  const showExactAsCandidates = !hasVerifiedLeadsToShow && exact.length > 0 && closest.length === 0;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <StatusIcon className={cn("h-4 w-4 mt-0.5 shrink-0", statusColor)} />
        <p className="text-sm text-foreground leading-relaxed">{summaryText}</p>
      </div>

      {showExact && (
        <div className="space-y-0.5">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Matches</h4>
          <div>
            {exact.map((lead, i) => (
              <LeadRow key={i} lead={lead} isVerified={true} unverifiableAttr={null} />
            ))}
          </div>
        </div>
      )}

      {showVerifiedFromAll && (
        <div className="space-y-0.5">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Matches</h4>
          <div>
            {allLeads.slice(0, verifiedExact).map((lead, i) => (
              <LeadRow key={i} lead={lead} isVerified={true} unverifiableAttr={null} />
            ))}
          </div>
        </div>
      )}

      {showCandidates && (
        <div className="space-y-0.5">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Candidates (not confirmed)</h4>
          <div>
            {closest.map((lead, i) => (
              <LeadRow key={i} lead={lead} isVerified={false} unverifiableAttr={unverifiableAttr} />
            ))}
          </div>
        </div>
      )}

      {showExactAsCandidates && (
        <div className="space-y-0.5">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Candidates (not confirmed)</h4>
          <div>
            {exact.map((lead, i) => (
              <LeadRow key={i} lead={lead} isVerified={false} unverifiableAttr={unverifiableAttr} />
            ))}
          </div>
        </div>
      )}

      <NextActionButtons ds={deliverySummary} canonical={canonical} runId={runId} />
    </div>
  );
}
