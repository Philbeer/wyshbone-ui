import { useState, useCallback } from "react";
import { MapPin, Phone, Globe, CheckCircle2, CircleDot, OctagonX, HelpCircle, AlertTriangle, ChevronDown, ChevronRight, BookOpen, Copy, Loader2, RefreshCw, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { resolveCanonicalStatus, type CanonicalStatus } from "@/utils/deliveryStatus";
import type { DeliverySummary, DeliveryLead } from "@/components/results/UserResultsView";
import type { VerificationSummaryPayload, ConstraintsExtractedPayload, LeadVerificationEntry } from "@/components/results/CvlArtefactViews";
import { emitTelemetry, type TelemetryEventType } from "@/api/telemetryClient";

export interface AppliedPolicy {
  policy_id?: string;
  rule_text?: string;
  source?: string;
  [key: string]: any;
}

export const DEFAULT_MAX_REPLANS = 3;

export interface PolicySnapshot {
  why_short: string;
  applied_policies?: AppliedPolicy[];
  max_replans?: number | null;
  max_replans_evidence?: string | null;
}

export interface RunResultBubbleProps {
  deliverySummary: DeliverySummary;
  verificationSummary?: VerificationSummaryPayload | null;
  constraintsExtracted?: ConstraintsExtractedPayload | null;
  leadVerifications?: LeadVerificationEntry[] | null;
  runId?: string | null;
  policySnapshot?: PolicySnapshot | null;
  provisional?: boolean;
  towerVerdict?: string | null;
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
  FAIL: AlertTriangle,
  UNAVAILABLE: HelpCircle,
};

const STATUS_COLORS: Record<CanonicalStatus, string> = {
  PASS: "text-green-600 dark:text-green-400",
  PARTIAL: "text-blue-600 dark:text-blue-400",
  STOP: "text-red-600 dark:text-red-400",
  FAIL: "text-red-600 dark:text-red-400",
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

function isLeadVerified(entry: LeadVerificationEntry): boolean {
  const checks = Array.isArray(entry.constraint_checks) ? entry.constraint_checks : [];
  if (checks.length === 0) return false;
  return checks.every(c => c.status === 'yes');
}

function buildVerifiedLeadIds(lvEntries: LeadVerificationEntry[] | null | undefined): Set<string> {
  const ids = new Set<string>();
  if (!lvEntries) return ids;
  for (const entry of lvEntries) {
    if (isLeadVerified(entry)) {
      ids.add(entry.lead_id);
    }
  }
  return ids;
}

type LocationStatus = "VERIFIED_GEO" | "SEARCH_BOUNDED" | "OUT_OF_AREA" | "UNKNOWN";

function getLocationStatus(lead: DeliveryLead): LocationStatus {
  const raw = (lead as any).location_status;
  if (typeof raw === "string") {
    const upper = raw.toUpperCase().trim();
    if (upper === "VERIFIED_GEO") return "VERIFIED_GEO";
    if (upper === "SEARCH_BOUNDED") return "SEARCH_BOUNDED";
    if (upper === "OUT_OF_AREA") return "OUT_OF_AREA";
  }
  return "UNKNOWN";
}

function hasLocationStatusData(leads: DeliveryLead[]): boolean {
  if (leads.length === 0) return false;
  const withStatus = leads.filter(l => {
    const raw = (l as any).location_status;
    return typeof raw === "string" && raw.trim().length > 0;
  });
  return withStatus.length === leads.length;
}

function isLeadInMatchSet(lead: DeliveryLead, matchSet: Set<string>): boolean {
  if (matchSet.size === 0) return false;
  const ids = matchLeadToId(lead);
  return ids.some(id => matchSet.has(id.toLowerCase().trim()));
}

interface LocationBuckets {
  verifiedGeo: DeliveryLead[];
  searchBounded: DeliveryLead[];
  outOfArea: DeliveryLead[];
  unknown: DeliveryLead[];
}

function splitLeadsByLocationStatus(leads: DeliveryLead[]): LocationBuckets {
  const buckets: LocationBuckets = { verifiedGeo: [], searchBounded: [], outOfArea: [], unknown: [] };
  for (const lead of leads) {
    const status = getLocationStatus(lead);
    switch (status) {
      case "VERIFIED_GEO": buckets.verifiedGeo.push(lead); break;
      case "SEARCH_BOUNDED": buckets.searchBounded.push(lead); break;
      case "OUT_OF_AREA": buckets.outOfArea.push(lead); break;
      default: buckets.unknown.push(lead); break;
    }
  }
  return buckets;
}

function matchLeadToId(lead: DeliveryLead): string[] {
  const candidates: string[] = [];
  const placeId = (lead as any).place_id || (lead as any).placeId;
  if (placeId) candidates.push(placeId);
  if (lead.name) candidates.push(lead.name);
  const nameNorm = lead.name?.toLowerCase().trim();
  if (nameNorm) candidates.push(nameNorm);
  return candidates;
}

function splitLeadsByVerification(
  allLeads: DeliveryLead[],
  verifiedExact: number,
  verifiedIds: Set<string>
): { matches: DeliveryLead[]; candidates: DeliveryLead[] } {
  if (verifiedIds.size === 0 && verifiedExact === 0) {
    return { matches: [], candidates: allLeads };
  }

  if (verifiedIds.size > 0) {
    const matches: DeliveryLead[] = [];
    const candidates: DeliveryLead[] = [];
    const verifiedIdsLower = new Set<string>();
    verifiedIds.forEach(id => verifiedIdsLower.add(id.toLowerCase().trim()));

    for (const lead of allLeads) {
      const ids = matchLeadToId(lead);
      const isMatch = ids.some(id => verifiedIdsLower.has(id.toLowerCase().trim()));
      if (isMatch) {
        matches.push(lead);
      } else {
        candidates.push(lead);
      }
    }

    console.log(`[RunResultBubble] splitLeadsByVerification: verifiedIds=${verifiedIds.size}, matched=${matches.length}, candidates=${candidates.length}, total=${allLeads.length}`);
    return { matches, candidates };
  }

  if (verifiedExact > 0 && verifiedExact >= allLeads.length) {
    return { matches: allLeads, candidates: [] };
  }

  return { matches: [], candidates: allLeads };
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
  target: { hasTarget: boolean; targetCount: number },
  towerVerdict?: string | null
): string {
  const exactLeads = Array.isArray(ds.delivered_exact) ? ds.delivered_exact.length : 0;
  const closestLeads = Array.isArray(ds.delivered_closest) ? ds.delivered_closest.length : 0;
  const totalDelivered = exactLeads + closestLeads;
  const totalCandidates = (verifiedExact === 0 ? exactLeads : 0) + closestLeads;

  const verdictUpper = (towerVerdict || "").toUpperCase();
  const isPartialOrStop = verdictUpper === "PARTIAL" || verdictUpper === "STOP";

  switch (canonical.status) {
    case "PASS":
      if (target.hasTarget) {
        return `I found ${verifiedExact} ${verifiedExact === 1 ? "result" : "results"} that match \u2014 that covers your request for ${target.targetCount}.`;
      }
      return `I found ${verifiedExact} ${verifiedExact === 1 ? "result" : "results"} that match what you asked for.`;

    case "PARTIAL":
      if (target.hasTarget) {
        if (isPartialOrStop) {
          return `Found ${totalDelivered} ${totalDelivered === 1 ? "candidate" : "candidates"}, but could not verify the requirement. Returned ${verifiedExact} of ${target.targetCount} requested.`;
        }
        return `Returned ${verifiedExact} of ${target.targetCount} requested. You can search more or broaden the criteria to try to reach ${target.targetCount}.`;
      }
      if (isPartialOrStop) {
        return `Found ${totalDelivered} ${totalDelivered === 1 ? "candidate" : "candidates"}, but could not verify the requirement.`;
      }
      return `I found ${totalDelivered} ${totalDelivered === 1 ? "result" : "results"} for your search.`;

    case "STOP": {
      const attr = extractUnverifiableAttribute(ds);
      if (target.hasTarget) {
        if (verifiedExact > 0 && !isPartialOrStop) {
          return `Returned ${verifiedExact} of ${target.targetCount} requested.`;
        }
        if (totalCandidates > 0) {
          return `Found ${totalCandidates} ${totalCandidates === 1 ? "candidate" : "candidates"}, but could not verify the requirement${attr ? ` (${attr})` : ""}.`;
        }
        return `Search stopped. No results could be confirmed for your criteria.`;
      }
      if (verifiedExact > 0 && !isPartialOrStop) {
        return `I found ${verifiedExact} ${verifiedExact === 1 ? "result" : "results"}.`;
      }
      if (totalCandidates > 0) {
        return `Found ${totalCandidates} ${totalCandidates === 1 ? "candidate" : "candidates"}, but could not verify the requirement${attr ? ` (${attr})` : ""}.`;
      }
      return `Search stopped. No results could be confirmed for your criteria.`;
    }

    case "FAIL":
      return `Search could not be completed. Results were not verified.`;

    case "UNAVAILABLE":
    default:
      return "Results are being processed.";
  }
}

type LeadBadgeStatus = 'verified' | 'candidate' | 'unverified';

function LeadBadge({ isVerified, unverifiableAttr, badgeStatus }: { isVerified: boolean; unverifiableAttr: string | null; badgeStatus?: LeadBadgeStatus }) {
  const effectiveStatus: LeadBadgeStatus = badgeStatus === 'unverified' ? 'unverified' : (isVerified ? 'verified' : (badgeStatus || 'candidate'));

  if (effectiveStatus === 'verified') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
        <CheckCircle2 className="h-2.5 w-2.5" /> Verified
      </span>
    );
  }

  if (unverifiableAttr) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
        <AlertTriangle className="h-2.5 w-2.5" /> {unverifiableAttr} not checked
      </span>
    );
  }

  if (effectiveStatus === 'unverified') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
        <HelpCircle className="h-2.5 w-2.5" /> Unverified
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
      Candidate
    </span>
  );
}

function LocationBadge({ status }: { status: LocationStatus }) {
  switch (status) {
    case "VERIFIED_GEO":
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
          <MapPin className="h-2.5 w-2.5" /> Verified
        </span>
      );
    case "SEARCH_BOUNDED":
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
          <Radar className="h-2.5 w-2.5" /> Search-bounded (likely in area)
        </span>
      );
    case "OUT_OF_AREA":
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
          <OctagonX className="h-2.5 w-2.5" /> Out of area
        </span>
      );
    case "UNKNOWN":
    default:
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
          <HelpCircle className="h-2.5 w-2.5" /> Unknown
        </span>
      );
  }
}

function LeadRow({ lead, isVerified, unverifiableAttr, runId, showLocationBadge, badgeStatus }: { lead: DeliveryLead; isVerified: boolean; unverifiableAttr: string | null; runId?: string | null; showLocationBadge?: boolean; badgeStatus?: LeadBadgeStatus }) {
  const area = lead.location || "";
  const placeId = (lead as any).place_id || (lead as any).placeId;
  const mapsLink = placeId
    ? `https://www.google.com/maps/place/?q=place_id:${placeId}`
    : null;

  const handleCopy = () => {
    const parts = [lead.name, area, lead.phone, lead.website].filter(Boolean);
    navigator.clipboard.writeText(parts.join(" | ")).catch(() => {});
    if (runId) emitTelemetry(runId, "copy_contact", { leadName: lead.name });
  };

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0 group">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground truncate">{lead.name || "Unknown"}</span>
          <LeadBadge isVerified={isVerified} unverifiableAttr={isVerified ? null : unverifiableAttr} badgeStatus={badgeStatus} />
          {showLocationBadge && <LocationBadge status={getLocationStatus(lead)} />}
          <button onClick={handleCopy} className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted" title="Copy contact">
            <Copy className="h-3 w-3 text-muted-foreground" />
          </button>
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
  hasTarget,
}: {
  ds: DeliverySummary;
  canonical: ReturnType<typeof resolveCanonicalStatus>;
  runId?: string | null;
  hasTarget: boolean;
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
      label: "Search more results",
      message: "Search for more results in this area.",
      actionType: "widen_search",
    });
    if (attr) {
      actions.push({
        label: `Check websites for ${attr}`,
        message: `Check the websites of the results to confirm ${attr}.`,
        actionType: "check_websites",
        actionPayload: { attribute: attr },
      });
      actions.push({
        label: `Search without ${attr} filter`,
        message: `Search again without the ${attr} requirement.`,
        actionType: "remove_constraint",
        actionPayload: { attribute: attr },
      });
    }
    actions.push({
      label: "Try a different search",
      message: "Try a different search with different criteria.",
      actionType: "different_search",
    });
  }

  if (actions.length === 0) return null;

  const ACTION_TELEMETRY: Record<string, TelemetryEventType> = {
    widen_search: "widen_area_clicked",
    different_search: "best_effort_clicked",
  };

  return (
    <div className="space-y-1.5 pt-2">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {hasTarget ? "Next steps" : "Explore further"}
      </h4>
      <div className="flex flex-wrap gap-2">
        {actions.map((a, i) => (
          <Button
            key={i}
            variant="outline"
            size="sm"
            className="text-xs h-7"
            onClick={() => {
              const tel = ACTION_TELEMETRY[a.actionType];
              if (tel && runId) emitTelemetry(runId, tel, { actionType: a.actionType });
              dispatchFollowUp({
                message: a.message,
                parentRunId: runId,
                actionType: a.actionType,
                actionPayload: a.actionPayload,
              });
            }}
          >
            {a.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function LearningSection({ snapshot }: { snapshot: PolicySnapshot }) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const lines = (snapshot.why_short || '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .slice(0, 3);

  const showMaxReplans =
    snapshot.max_replans != null && snapshot.max_replans !== DEFAULT_MAX_REPLANS;

  if (lines.length === 0 && !showMaxReplans) return null;

  const hasDetails =
    (Array.isArray(snapshot.applied_policies) && snapshot.applied_policies.length > 0) ||
    !!snapshot.max_replans_evidence;

  return (
    <div className="space-y-1.5 pt-1">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
        <BookOpen className="h-3 w-3" />
        Learning
      </h4>
      <div className="space-y-0.5">
        {lines.map((line, i) => (
          <p key={i} className="text-xs text-foreground/80 leading-snug">{line}</p>
        ))}
        {showMaxReplans && (
          <p className="text-xs text-foreground/80 leading-snug">
            Max replans: {snapshot.max_replans} <span className="text-amber-600 dark:text-amber-400 font-medium">(learned)</span>
          </p>
        )}
      </div>
      {hasDetails && (
        <button
          className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setDetailsOpen(!detailsOpen)}
        >
          {detailsOpen ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
          Details
        </button>
      )}
      {detailsOpen && (
        <div className="ml-3 space-y-1 border-l border-border pl-2">
          {snapshot.applied_policies?.map((ap, i) => (
            <div key={i} className="text-[11px] text-muted-foreground leading-snug">
              {ap.rule_text || ap.policy_id || `Policy ${i + 1}`}
              {ap.source && <span className="ml-1 opacity-60">({ap.source})</span>}
            </div>
          ))}
          {snapshot.max_replans_evidence && (
            <div className="text-[11px] text-muted-foreground leading-snug">
              {snapshot.max_replans_evidence}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ArtefactsRetryBlock({ runId }: { runId?: string | null }) {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = useCallback(() => {
    setRetrying(true);
    window.dispatchEvent(new CustomEvent('wyshbone:retry_artefacts', {
      detail: { runId },
    }));
    setTimeout(() => setRetrying(false), 8000);
  }, [runId]);

  return (
    <div className="flex flex-col items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
        <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
          Results are still loading. This usually takes a few seconds.
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs gap-1.5"
        onClick={handleRetry}
        disabled={retrying}
      >
        {retrying ? (
          <><Loader2 className="h-3 w-3 animate-spin" /> Loading...</>
        ) : (
          <><RefreshCw className="h-3 w-3" /> Refresh results</>
        )}
      </Button>
    </div>
  );
}

function TrustErrorBlock({ verdict, runId }: { verdict: string; runId?: string | null }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 text-red-600 dark:text-red-400 shrink-0" />
        <p className="text-xs text-red-700 dark:text-red-300 font-medium">
          I can't trust these results because verification failed (Tower: {verdict.toUpperCase()}). Want me to retry with a cleaned query or ask a clarification question?
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={() => {
            dispatchFollowUp({
              message: "Retry the search with a clean query.",
              parentRunId: runId,
              actionType: "retry_clean",
            });
          }}
        >
          <RefreshCw className="h-3 w-3" /> Retry
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={() => {
            dispatchFollowUp({
              message: "Ask me a clarification question about what I need.",
              parentRunId: runId,
              actionType: "ask_clarification",
            });
          }}
        >
          <HelpCircle className="h-3 w-3" /> Ask me a question
        </Button>
      </div>
    </div>
  );
}

export default function RunResultBubble({
  deliverySummary,
  verificationSummary,
  constraintsExtracted,
  leadVerifications,
  runId,
  policySnapshot,
  provisional = false,
  towerVerdict,
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

  const isTrustFailure = canonical.status === "FAIL" ||
    (towerVerdict && ['fail', 'error'].includes(towerVerdict.toLowerCase()));

  const defaultBadgeStatus: LeadBadgeStatus =
    !leadVerifications || leadVerifications.length === 0 || isTrustFailure
      ? 'unverified'
      : 'candidate';

  const StatusIcon = STATUS_ICONS[canonical.status];
  const statusColor = STATUS_COLORS[canonical.status];
  const summaryText = buildSummaryText(deliverySummary, canonical, verifiedExact, target, towerVerdict);
  const unverifiableAttr = extractUnverifiableAttribute(deliverySummary);

  const exact = Array.isArray(deliverySummary.delivered_exact) ? deliverySummary.delivered_exact : [];
  const closest = Array.isArray(deliverySummary.delivered_closest) ? deliverySummary.delivered_closest : [];
  const allLeads = [...exact, ...closest];

  const verifiedIds = buildVerifiedLeadIds(leadVerifications);
  const { matches, candidates } = splitLeadsByVerification(allLeads, verifiedExact, verifiedIds);
  const useLocationBuckets = hasLocationStatusData(allLeads);
  const locationBuckets = useLocationBuckets ? splitLeadsByLocationStatus(allLeads) : null;
  const matchSetLower = new Set<string>();
  if (useLocationBuckets) {
    matches.forEach(lead => {
      matchLeadToId(lead).forEach(id => matchSetLower.add(id.toLowerCase().trim()));
    });
  }

  console.log(`[RunResultBubble] render: status=${canonical.status}, verifiedExact=${verifiedExact}, requested=${target.hasTarget ? target.targetCount : 'any'}, allLeads=${allLeads.length}, matches=${matches.length}, candidates=${candidates.length}, leadVerifications=${leadVerifications?.length ?? 'none'}, verifiedIds=${verifiedIds.size}, locationBuckets=${useLocationBuckets ? `geo=${locationBuckets!.verifiedGeo.length},bounded=${locationBuckets!.searchBounded.length},out=${locationBuckets!.outOfArea.length},unknown=${locationBuckets!.unknown.length}` : 'none'}`);

  return (
    <div className="space-y-3">
      {provisional && (
        <div className="flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
            Checking requirements… results may change
          </p>
        </div>
      )}

      {!provisional && deliverySummary.stop_reason === 'artefacts_unavailable' && (
        <ArtefactsRetryBlock runId={runId} />
      )}

      {!provisional && isTrustFailure && deliverySummary.stop_reason !== 'artefacts_unavailable' && (
        <TrustErrorBlock verdict={towerVerdict || deliverySummary.status || 'FAIL'} runId={runId} />
      )}

      {!provisional && !isTrustFailure && deliverySummary.stop_reason !== 'artefacts_unavailable' && (
        <div className="flex items-start gap-2">
          <StatusIcon className={cn("h-4 w-4 mt-0.5 shrink-0", statusColor)} />
          <p className="text-sm text-foreground leading-relaxed">{summaryText}</p>
        </div>
      )}

      {provisional && allLeads.length > 0 && (
        <div className="space-y-0.5">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Results ({allLeads.length} found so far)
          </h4>
          <div>
            {allLeads.map((lead, i) => (
              <LeadRow key={i} lead={lead} isVerified={false} unverifiableAttr={null} runId={runId} />
            ))}
          </div>
        </div>
      )}

      {!provisional && !isTrustFailure && useLocationBuckets && locationBuckets && (
        <>
          {locationBuckets.verifiedGeo.length > 0 && (
            <div className="space-y-0.5">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3 text-green-600 dark:text-green-400" /> Verified (geo) ({locationBuckets.verifiedGeo.length})</span>
              </h4>
              <div>
                {locationBuckets.verifiedGeo.map((lead, i) => (
                  <LeadRow key={i} lead={lead} isVerified={isLeadInMatchSet(lead, matchSetLower) || matchSetLower.size === 0} unverifiableAttr={null} runId={runId} showLocationBadge badgeStatus={defaultBadgeStatus} />
                ))}
              </div>
            </div>
          )}
          {locationBuckets.searchBounded.length > 0 && (
            <div className="space-y-0.5">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <span className="inline-flex items-center gap-1"><Radar className="h-3 w-3 text-blue-600 dark:text-blue-400" /> Search-bounded ({locationBuckets.searchBounded.length})</span>
              </h4>
              <div>
                {locationBuckets.searchBounded.map((lead, i) => (
                  <LeadRow key={i} lead={lead} isVerified={isLeadInMatchSet(lead, matchSetLower)} unverifiableAttr={null} runId={runId} showLocationBadge badgeStatus={defaultBadgeStatus} />
                ))}
              </div>
            </div>
          )}
          {locationBuckets.outOfArea.length > 0 && (
            <div className="space-y-0.5">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <span className="inline-flex items-center gap-1"><OctagonX className="h-3 w-3 text-red-600 dark:text-red-400" /> Out of area ({locationBuckets.outOfArea.length})</span>
              </h4>
              <div>
                {locationBuckets.outOfArea.map((lead, i) => (
                  <LeadRow key={i} lead={lead} isVerified={false} unverifiableAttr={null} runId={runId} showLocationBadge badgeStatus={defaultBadgeStatus} />
                ))}
              </div>
            </div>
          )}
          {locationBuckets.unknown.length > 0 && (
            <div className="space-y-0.5">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <span className="inline-flex items-center gap-1"><HelpCircle className="h-3 w-3 text-muted-foreground" /> Unknown ({locationBuckets.unknown.length})</span>
              </h4>
              <div>
                {locationBuckets.unknown.map((lead, i) => (
                  <LeadRow key={i} lead={lead} isVerified={isLeadInMatchSet(lead, matchSetLower)} unverifiableAttr={isLeadInMatchSet(lead, matchSetLower) ? null : unverifiableAttr} runId={runId} showLocationBadge badgeStatus={defaultBadgeStatus} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {!provisional && !isTrustFailure && !useLocationBuckets && matches.length > 0 && (
        <div className="space-y-0.5">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {canonical.status === "STOP" || canonical.status === "PARTIAL" ? `Results (${matches.length})` : `Matches (${matches.length})`}
          </h4>
          <div>
            {matches.map((lead, i) => (
              <LeadRow key={i} lead={lead} isVerified={true} unverifiableAttr={null} runId={runId} badgeStatus={defaultBadgeStatus} />
            ))}
          </div>
        </div>
      )}

      {!provisional && !isTrustFailure && !useLocationBuckets && candidates.length > 0 && (
        <div className="space-y-0.5">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{matches.length > 0 ? `Other results (${candidates.length})` : `Results (${candidates.length})`}</h4>
          <div>
            {candidates.map((lead, i) => (
              <LeadRow key={i} lead={lead} isVerified={false} unverifiableAttr={unverifiableAttr} runId={runId} badgeStatus={defaultBadgeStatus} />
            ))}
          </div>
        </div>
      )}

      {!provisional && policySnapshot && (policySnapshot.why_short || (policySnapshot.max_replans != null && policySnapshot.max_replans !== DEFAULT_MAX_REPLANS)) && (
        <LearningSection snapshot={policySnapshot} />
      )}

      {!provisional && <NextActionButtons ds={deliverySummary} canonical={canonical} runId={runId} hasTarget={target.hasTarget} />}
    </div>
  );
}
