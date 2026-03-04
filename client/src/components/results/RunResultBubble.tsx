import { useState, useCallback } from "react";
import { MapPin, Phone, Globe, CheckCircle2, CircleDot, OctagonX, HelpCircle, AlertTriangle, ChevronDown, ChevronRight, BookOpen, Copy, Loader2, RefreshCw, Radar, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { resolveCanonicalStatus, type CanonicalStatus } from "@/utils/deliveryStatus";
import type { DeliverySummary, DeliveryLead } from "@/components/results/UserResultsView";
import type { VerificationSummaryPayload, ConstraintsExtractedPayload, LeadVerificationEntry } from "@/components/results/CvlArtefactViews";
import { emitTelemetry, type TelemetryEventType } from "@/api/telemetryClient";
import { StopReasonBadge } from "@/components/results/StopReasonBadge";
import { FeedbackButtons } from "@/components/results/FeedbackButtons";
import { PlanVersionTimeline, type PlanVersion } from "@/components/results/PlanVersionTimeline";
import type { PolicyApplied, LearningUpdate, SearchQueryCompiled } from "@/utils/policyFormatters";
import { getSourceBadge, getPolicyKnobLabel, formatPolicyValue, formatMetricsTrigger } from "@/utils/policyFormatters";

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

export interface ContactCounts {
  source: 'lead_pack' | 'contact_extract' | 'delivery_leads' | 'unknown';
  emailCount: number;
  phoneCount: number;
  leadsWithEmail: number;
  leadsWithPhone: number;
}

export interface RunResultBubbleProps {
  deliverySummary: DeliverySummary;
  verificationSummary?: VerificationSummaryPayload | null;
  constraintsExtracted?: ConstraintsExtractedPayload | null;
  leadVerifications?: LeadVerificationEntry[] | null;
  runId?: string | null;
  policySnapshot?: PolicySnapshot | null;
  policyApplied?: PolicyApplied | null;
  learningUpdate?: LearningUpdate | null;
  searchQueryCompiled?: SearchQueryCompiled | null;
  provisional?: boolean;
  towerVerdict?: string | null;
  towerProxyUsed?: string | null;
  towerStopTimePredicate?: boolean;
  planVersions?: PlanVersion[] | null;
  towerUnavailable?: boolean;
  contactCounts?: ContactCounts | null;
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
  ACCEPT_WITH_UNVERIFIED: AlertTriangle,
  UNAVAILABLE: HelpCircle,
};

const STATUS_COLORS: Record<CanonicalStatus, string> = {
  PASS: "text-green-600 dark:text-green-400",
  PARTIAL: "text-blue-600 dark:text-blue-400",
  STOP: "text-red-600 dark:text-red-400",
  FAIL: "text-red-600 dark:text-red-400",
  ACCEPT_WITH_UNVERIFIED: "text-amber-600 dark:text-amber-400",
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

    case "ACCEPT_WITH_UNVERIFIED": {
      const totalItems = (Array.isArray(ds.delivered_exact) ? ds.delivered_exact.length : 0) +
        (Array.isArray(ds.delivered_closest) ? ds.delivered_closest.length : 0);
      if (target.hasTarget) {
        return `Returned ${totalItems} ${totalItems === 1 ? "result" : "results"} for ${target.targetCount} requested, but not all could be verified against your requirements.`;
      }
      return `I found ${totalItems} ${totalItems === 1 ? "result" : "results"}, but not all could be verified against your requirements.`;
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

  if (canonical.status === "STOP" || canonical.status === "PARTIAL" || canonical.status === "ACCEPT_WITH_UNVERIFIED") {
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

export interface RunNarrative {
  lines: string[];
  isTrustFailure: boolean;
  emailFoundCount: number;
  phoneFoundCount: number;
  deliveredCount: number;
  requestedCount: number | null;
  candidateCount: number | null;
  towerVerdict: string | null;
  contactCountsSource: string;
}

function countContactsFromLeads(allLeads: DeliveryLead[]): { emailCount: number; phoneCount: number; leadsWithEmail: number; leadsWithPhone: number } {
  let leadsWithEmail = 0;
  let leadsWithPhone = 0;
  for (const lead of allLeads) {
    const emails = (lead as any).emails || (lead as any).email;
    if (Array.isArray(emails) && emails.length > 0) {
      leadsWithEmail++;
    } else if (typeof emails === 'string' && emails.trim().length > 0) {
      leadsWithEmail++;
    }
    const phone = lead.phone || (lead as any).phones;
    if (Array.isArray(phone) && phone.length > 0) {
      leadsWithPhone++;
    } else if (typeof phone === 'string' && phone.trim().length > 0) {
      leadsWithPhone++;
    }
  }
  return { emailCount: leadsWithEmail, phoneCount: leadsWithPhone, leadsWithEmail, leadsWithPhone };
}

export function buildRunNarrative(
  deliverySummary: DeliverySummary,
  searchQueryCompiled?: SearchQueryCompiled | null,
  constraintsExtracted?: ConstraintsExtractedPayload | null,
  towerVerdict?: string | null,
  contactCounts?: ContactCounts | null,
): RunNarrative {
  const exact = Array.isArray(deliverySummary.delivered_exact) ? deliverySummary.delivered_exact : [];
  const closest = Array.isArray(deliverySummary.delivered_closest) ? deliverySummary.delivered_closest : [];
  const allLeads = [...exact, ...closest];
  const deliveredCount = allLeads.length;

  const requestedCount = constraintsExtracted?.requested_count_user ??
    deliverySummary.requested_count ??
    searchQueryCompiled?.requested_count ??
    null;

  const candidateCount = searchQueryCompiled?.final_returned_count ?? deliverySummary.delivered_count ?? null;

  const titleCase = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase());
  const query = searchQueryCompiled?.interpreted_query || '';
  const location = searchQueryCompiled?.interpreted_location || '';

  let emailFoundCount: number;
  let phoneFoundCount: number;
  let contactCountsSource: string;

  if (contactCounts && (contactCounts.source === 'lead_pack' || contactCounts.source === 'contact_extract')) {
    emailFoundCount = contactCounts.emailCount;
    phoneFoundCount = contactCounts.phoneCount;
    contactCountsSource = contactCounts.source;
  } else {
    const fromLeads = countContactsFromLeads(allLeads);
    emailFoundCount = fromLeads.leadsWithEmail;
    phoneFoundCount = fromLeads.leadsWithPhone;
    contactCountsSource = (fromLeads.leadsWithEmail > 0 || fromLeads.leadsWithPhone > 0) ? 'delivery_leads' : 'unknown';
  }

  const countsProven = contactCountsSource === 'lead_pack' || contactCountsSource === 'contact_extract';
  const countsKnown = countsProven || (emailFoundCount > 0 || phoneFoundCount > 0);

  const tv = (towerVerdict || '').toLowerCase();
  const isTrustFailure = tv === 'fail' || tv === 'error' || tv === 'stop';

  const lines: string[] = [];

  const entityWord = query || 'businesses';
  const locationPart = location ? ` in ${titleCase(location)}` : '';
  if (candidateCount != null && candidateCount > 0) {
    lines.push(`I searched Google Places for ${entityWord}${locationPart} and found ${candidateCount} possible ${candidateCount === 1 ? 'match' : 'matches'}.`);
  } else {
    lines.push(`I searched Google Places for ${entityWord}${locationPart}.`);
  }

  lines.push('I checked websites where available to look for contact details.');

  if (countsKnown) {
    const contactParts: string[] = [];
    if (emailFoundCount > 0) {
      contactParts.push(`${emailFoundCount} public ${emailFoundCount === 1 ? 'email' : 'emails'}`);
    }
    if (phoneFoundCount > 0) {
      contactParts.push(`${phoneFoundCount} phone ${phoneFoundCount === 1 ? 'number' : 'numbers'}`);
    }
    if (contactParts.length > 0) {
      lines.push(`I found ${contactParts.join(' and ')}.`);
    } else if (countsProven) {
      lines.push('I checked but couldn\u2019t find any public contact details on the pages available.');
    } else {
      lines.push('Results varied by venue.');
    }
  } else if (deliveredCount > 0) {
    lines.push('Results varied by venue.');
  }

  if (isTrustFailure) {
    lines.push("I found some matches, but I couldn\u2019t verify everything, so I\u2019m not fully confident in these results.");
  } else if (deliveredCount > 0) {
    if (requestedCount != null && requestedCount > 0) {
      lines.push(`I selected ${deliveredCount} ${entityWord} for you${requestedCount !== deliveredCount ? ` (you asked for ${requestedCount})` : ''}.`);
    } else {
      lines.push(`I selected ${deliveredCount} ${entityWord} for you.`);
    }
  } else {
    lines.push('No results could be delivered for this search.');
  }

  return {
    lines,
    isTrustFailure,
    emailFoundCount,
    phoneFoundCount,
    deliveredCount,
    requestedCount,
    candidateCount,
    towerVerdict: towerVerdict || null,
    contactCountsSource,
  };
}

function HumanSummary({ narrative }: { narrative: RunNarrative }) {
  return (
    <div className="space-y-1" data-testid="human-summary">
      {narrative.lines.map((line, i) => (
        <p key={i} className="text-sm text-foreground leading-relaxed">{line}</p>
      ))}
    </div>
  );
}

function TechnicalDetails({
  deliverySummary,
  effectiveCanonical,
  searchQueryCompiled,
  constraintsExtracted,
  verificationSummary,
  policySnapshot,
  policyApplied,
  learningUpdate,
  planVersions,
  towerVerdict,
  towerProxyUsed,
  towerUnavailable,
  runId,
  narrative,
}: {
  deliverySummary: DeliverySummary;
  effectiveCanonical: ReturnType<typeof resolveCanonicalStatus>;
  searchQueryCompiled?: SearchQueryCompiled | null;
  constraintsExtracted?: ConstraintsExtractedPayload | null;
  verificationSummary?: VerificationSummaryPayload | null;
  policySnapshot?: PolicySnapshot | null;
  policyApplied?: PolicyApplied | null;
  learningUpdate?: LearningUpdate | null;
  planVersions?: PlanVersion[] | null;
  towerVerdict?: string | null;
  towerProxyUsed?: string | null;
  towerUnavailable?: boolean;
  runId?: string | null;
  narrative: RunNarrative;
}) {
  const [open, setOpen] = useState(false);

  const tv = (towerVerdict || '').toUpperCase();
  const tvColor = ['PASS', 'ACCEPT', 'ACCEPT_WITH_UNVERIFIED'].includes(tv)
    ? 'text-green-700 dark:text-green-300'
    : ['FAIL', 'ERROR', 'STOP'].includes(tv)
      ? 'text-red-700 dark:text-red-300'
      : 'text-muted-foreground';

  return (
    <div className="pt-1">
      <button
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {open ? 'Hide details' : 'Show details'}
      </button>
      {open && (
        <div className="mt-2 space-y-3 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs" data-testid="technical-details">
          {towerVerdict && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-medium">Verdict:</span>
              <span className={cn("font-semibold", tvColor)}>{tv}</span>
            </div>
          )}
          {towerProxyUsed && (
            <p className="text-muted-foreground">Time proxy used: {towerProxyUsed}</p>
          )}
          {towerUnavailable && (
            <p className="text-muted-foreground">Quality check was not available for this run.</p>
          )}

          {searchQueryCompiled && (
            <SearchSummaryBlock sqc={searchQueryCompiled} />
          )}

          {constraintsExtracted && Array.isArray(constraintsExtracted.constraints) && constraintsExtracted.constraints.length > 0 && (
            <div>
              <p className="text-muted-foreground font-medium mb-1">Constraints</p>
              <div className="rounded border divide-y">
                {constraintsExtracted.constraints.map(c => (
                  <div key={c.id} className="px-2 py-1 flex items-center justify-between">
                    <span>{c.label || `${c.field}${c.op ? ` ${c.op}` : ''} ${c.value}`}</span>
                    <span className="text-[10px] text-muted-foreground">{c.hardness}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {verificationSummary && (
            <div className="flex gap-3">
              {verificationSummary.verified_exact_count != null && (
                <span>Verified: <span className="font-semibold text-green-600 dark:text-green-400">{verificationSummary.verified_exact_count}</span></span>
              )}
              {verificationSummary.requested_count_user != null && (
                <span>Requested: <span className="font-semibold">{verificationSummary.requested_count_user}</span></span>
              )}
              {verificationSummary.budget_used != null && verificationSummary.budget_total != null && (
                <span>Budget: {verificationSummary.budget_used}/{verificationSummary.budget_total}</span>
              )}
            </div>
          )}

          {(effectiveCanonical.status === "STOP" || effectiveCanonical.status === "FAIL") && deliverySummary.stop_reason && deliverySummary.stop_reason !== 'artefacts_unavailable' && (
            <StopReasonBadge stopReason={deliverySummary.stop_reason} />
          )}

          {planVersions && planVersions.length > 1 && (
            <PlanVersionTimeline versions={planVersions} />
          )}

          {(policyApplied || (policySnapshot && (policySnapshot.why_short || (policySnapshot.max_replans != null && policySnapshot.max_replans !== DEFAULT_MAX_REPLANS)))) && (
            <AppliedPolicySection policyApplied={policyApplied} snapshot={policySnapshot} />
          )}

          {learningUpdate && (
            <LearningDeltaSection learningUpdate={learningUpdate} />
          )}

          <div className="space-y-1 pt-1 border-t border-border">
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-muted-foreground font-mono">
              <span>status={effectiveCanonical.status}</span>
              <span>delivered={narrative.deliveredCount}</span>
              <span>candidates={narrative.candidateCount ?? 'n/a'}</span>
              <span>emails={narrative.emailFoundCount}</span>
              <span>phones={narrative.phoneFoundCount}</span>
              {towerVerdict && <span>tower={towerVerdict}</span>}
              {runId && <span>run={runId.slice(0, 12)}</span>}
            </div>
            <div className="text-[10px] text-muted-foreground font-mono">
              Contact counts source: <span className="font-semibold">{narrative.contactCountsSource}</span>
              {narrative.contactCountsSource === 'unknown' && ' (no artefact data available, counts may be inaccurate)'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AppliedPolicySection({ policyApplied, snapshot }: { policyApplied?: PolicyApplied | null; snapshot?: PolicySnapshot | null }) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const hasPolicyApplied = policyApplied && policyApplied.final_policy && Object.keys(policyApplied.final_policy).length > 0;
  const hasSnapshot = snapshot && (snapshot.why_short || (snapshot.max_replans != null && snapshot.max_replans !== DEFAULT_MAX_REPLANS));

  if (!hasPolicyApplied && !hasSnapshot) return null;

  const learnedUsed = policyApplied?.learned_used === true;

  const displayKnobs = ["result_count", "verification_level", "search_budget_pages", "radius_escalation"];
  const fp = policyApplied?.final_policy || {};
  const sources = policyApplied?.knob_sources || {};
  const knobs = displayKnobs.filter(k => fp[k] != null);

  const snapshotLines = (snapshot?.why_short || '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .slice(0, 3);

  const showMaxReplans = snapshot?.max_replans != null && snapshot.max_replans !== DEFAULT_MAX_REPLANS;

  const hasExpandableDetails =
    (Array.isArray(snapshot?.applied_policies) && snapshot!.applied_policies!.length > 0) ||
    !!snapshot?.max_replans_evidence;

  return (
    <div className="space-y-1.5 pt-1">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
        <BookOpen className="h-3 w-3" />
        Applied policy
      </h4>

      {learnedUsed && (
        <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
          Learned settings applied
          {policyApplied!.source_run_ids && policyApplied!.source_run_ids.length > 0 && (
            <span className="font-normal text-muted-foreground ml-1">
              (from {policyApplied!.source_run_ids.length} prior run{policyApplied!.source_run_ids.length > 1 ? "s" : ""})
            </span>
          )}
        </p>
      )}

      {policyApplied && !learnedUsed && (
        <p className="text-[10px] text-muted-foreground">Using default settings</p>
      )}

      {knobs.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {knobs.map(k => {
            const badge = getSourceBadge(sources[k] || "default");
            return (
              <span key={k} className="inline-flex items-center gap-1 text-[11px] text-foreground/80">
                <span>{getPolicyKnobLabel(k)}:</span>
                <span className="font-medium">{formatPolicyValue(fp[k])}</span>
                <span className={cn("inline-flex items-center px-1 py-px rounded text-[9px] font-medium", badge.className)}>
                  {badge.label}
                </span>
              </span>
            );
          })}
        </div>
      )}

      {snapshotLines.length > 0 && (
        <div className="space-y-0.5">
          {snapshotLines.map((line, i) => (
            <p key={i} className="text-xs text-foreground/80 leading-snug">{line}</p>
          ))}
        </div>
      )}

      {showMaxReplans && (
        <p className="text-xs text-foreground/80 leading-snug">
          Replan ceiling: {snapshot!.max_replans}
        </p>
      )}

      {hasExpandableDetails && (
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
          {snapshot?.applied_policies?.map((ap, i) => (
            <div key={i} className="text-[11px] text-muted-foreground leading-snug">
              {ap.rule_text || ap.policy_id || `Policy ${i + 1}`}
              {ap.source && <span className="ml-1 opacity-60">({ap.source})</span>}
            </div>
          ))}
          {snapshot?.max_replans_evidence && (
            <div className="text-[11px] text-muted-foreground leading-snug">
              {snapshot.max_replans_evidence}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LearningDeltaSection({ learningUpdate }: { learningUpdate: LearningUpdate }) {
  if (!learningUpdate.changed_fields || learningUpdate.changed_fields.length === 0) return null;

  const triggerText = formatMetricsTrigger(learningUpdate.metrics_trigger);

  return (
    <div className="space-y-1.5 pt-1">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
        <ArrowRight className="h-3 w-3" />
        What changed since last time
      </h4>

      <div className="space-y-1">
        {learningUpdate.changed_fields.map((delta, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[11px] text-foreground/80">
            <span className="font-medium">{getPolicyKnobLabel(delta.field)}:</span>
            <span className="text-muted-foreground">{formatPolicyValue(delta.before)}</span>
            <ArrowRight className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
            <span className="font-medium">{formatPolicyValue(delta.after)}</span>
          </div>
        ))}
      </div>

      {learningUpdate.tower_reason && (
        <p className="text-[11px] text-muted-foreground leading-snug">
          {learningUpdate.tower_reason}
        </p>
      )}

      {triggerText && (
        <p className="text-[10px] text-muted-foreground/70 leading-snug">
          Trigger: {triggerText}
        </p>
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

function formatStopReason(reason: string): string {
  const map: Record<string, string> = {
    budget_exhausted: "Search budget exhausted",
    no_more_results: "No more results available",
    radius_limit: "Radius limit reached",
    target_met: "Target met",
    timeout: "Search timed out",
    manual_stop: "Manually stopped",
    tower_stopped: "Quality check stopped run",
    run_halted: "Run halted",
  };
  return map[reason] || reason.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function SearchSummaryBlock({ sqc }: { sqc: SearchQueryCompiled }) {
  const titleCase = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase());
  const triedParts: string[] = [];
  if (sqc.radius_escalated) triedParts.push("Radius escalated");
  if (sqc.pages_budget_used != null) triedParts.push(`${sqc.pages_budget_used} page${sqc.pages_budget_used !== 1 ? "s" : ""} searched`);
  if (sqc.query_broadened) triedParts.push("Query broadened");

  const isUnderfilled = sqc.requested_count != null && sqc.final_returned_count != null && sqc.final_returned_count < sqc.requested_count;

  return (
    <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs space-y-1" data-testid="search-summary">
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-muted-foreground">
        {sqc.interpreted_location && (
          <span><span className="font-medium text-foreground">Location:</span> {titleCase(sqc.interpreted_location)}</span>
        )}
        {sqc.interpreted_query && (
          <span><span className="font-medium text-foreground">Query:</span> {sqc.interpreted_query}</span>
        )}
        {sqc.requested_count != null && (
          <span><span className="font-medium text-foreground">Target:</span> {sqc.requested_count}</span>
        )}
        {sqc.final_returned_count != null && (
          <span className={isUnderfilled ? "text-amber-600 dark:text-amber-400" : ""}>
            <span className="font-medium text-foreground">Got:</span> {sqc.final_returned_count}
          </span>
        )}
      </div>
      {triedParts.length > 0 && (
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Tried:</span> {triedParts.join(" · ")}
        </p>
      )}
      {sqc.stop_reason && (
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Stop reason:</span> {formatStopReason(sqc.stop_reason)}
        </p>
      )}
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
  policyApplied,
  learningUpdate,
  searchQueryCompiled,
  provisional = false,
  towerVerdict,
  towerProxyUsed,
  towerStopTimePredicate,
  planVersions,
  towerUnavailable,
  contactCounts,
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

  const towerVerdictLower = (towerVerdict || '').toLowerCase();
  const isFinalDeliveryPass = ['pass', 'accept', 'accept_with_unverified'].includes(towerVerdictLower);
  const isTrustFailure = !isFinalDeliveryPass && (
    canonical.status === "FAIL" ||
    (towerVerdict && ['fail', 'error'].includes(towerVerdictLower))
  );

  const isTimePredicateStop = !!(towerStopTimePredicate && (canonical.status === 'STOP' || canonical.status === 'FAIL'));

  const hasUnverifiedLeads = !leadVerifications || leadVerifications.length === 0 || isTrustFailure || isTimePredicateStop;

  const defaultBadgeStatus: LeadBadgeStatus = hasUnverifiedLeads ? 'unverified' : 'candidate';

  const towerVerdictUpper = (towerVerdict || "").toUpperCase().replace(/[\s-]/g, '_');
  const isExplicitAcceptWithUnverified = towerVerdictUpper === 'ACCEPT_WITH_UNVERIFIED';

  const exact = Array.isArray(deliverySummary.delivered_exact) ? deliverySummary.delivered_exact : [];
  const closest = Array.isArray(deliverySummary.delivered_closest) ? deliverySummary.delivered_closest : [];
  const allLeads = [...exact, ...closest];

  const verifiedIds = buildVerifiedLeadIds(leadVerifications);
  const { matches, candidates } = splitLeadsByVerification(allLeads, verifiedExact, verifiedIds);

  const verifiedExactCoversAll = verifiedExact >= allLeads.length && allLeads.length > 0;

  const hasAnyUnverifiedResults = allLeads.length > 0 && !verifiedExactCoversAll && (
    hasUnverifiedLeads || candidates.length > 0 || matches.length < allLeads.length
  );

  let effectiveCanonical = canonical;
  if (isExplicitAcceptWithUnverified) {
    effectiveCanonical = { status: "ACCEPT_WITH_UNVERIFIED", stop_reason: null };
  } else if (canonical.status === "PASS" && hasAnyUnverifiedResults) {
    effectiveCanonical = { status: "ACCEPT_WITH_UNVERIFIED", stop_reason: null };
    console.log(`[RunResultBubble] Downgraded PASS → ACCEPT_WITH_UNVERIFIED: allLeads=${allLeads.length}, matches=${matches.length}, candidates=${candidates.length}, hasUnverifiedLeads=${hasUnverifiedLeads}`);
  }

  const unverifiableAttr = extractUnverifiableAttribute(deliverySummary);

  const useLocationBuckets = hasLocationStatusData(allLeads);
  const locationBuckets = useLocationBuckets ? splitLeadsByLocationStatus(allLeads) : null;
  const matchSetLower = new Set<string>();
  if (useLocationBuckets) {
    matches.forEach(lead => {
      matchLeadToId(lead).forEach(id => matchSetLower.add(id.toLowerCase().trim()));
    });
  }

  console.log(`[RunResultBubble] render: status=${effectiveCanonical.status} (raw=${canonical.status}), verifiedExact=${verifiedExact}, requested=${target.hasTarget ? target.targetCount : 'any'}, allLeads=${allLeads.length}, matches=${matches.length}, candidates=${candidates.length}, leadVerifications=${leadVerifications?.length ?? 'none'}, verifiedIds=${verifiedIds.size}, locationBuckets=${useLocationBuckets ? `geo=${locationBuckets!.verifiedGeo.length},bounded=${locationBuckets!.searchBounded.length},out=${locationBuckets!.outOfArea.length},unknown=${locationBuckets!.unknown.length}` : 'none'}`);

  const narrative = !provisional ? buildRunNarrative(deliverySummary, searchQueryCompiled, constraintsExtracted, towerVerdict, contactCounts) : null;

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

      {!provisional && narrative && deliverySummary.stop_reason !== 'artefacts_unavailable' && (
        <HumanSummary narrative={narrative} />
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

      {!provisional && useLocationBuckets && locationBuckets && (
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

      {!provisional && !useLocationBuckets && matches.length > 0 && (
        <div className="space-y-0.5">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Results ({matches.length})
          </h4>
          <div>
            {matches.map((lead, i) => (
              <LeadRow key={i} lead={lead} isVerified={true} unverifiableAttr={null} runId={runId} badgeStatus={defaultBadgeStatus} />
            ))}
          </div>
        </div>
      )}

      {!provisional && !useLocationBuckets && candidates.length > 0 && (
        <div className="space-y-0.5">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{matches.length > 0 ? `Other results (${candidates.length})` : `Results (${candidates.length})`}</h4>
          <div>
            {candidates.map((lead, i) => (
              <LeadRow key={i} lead={lead} isVerified={false} unverifiableAttr={unverifiableAttr} runId={runId} badgeStatus={defaultBadgeStatus} />
            ))}
          </div>
        </div>
      )}

      {!provisional && narrative && (
        <TechnicalDetails
          deliverySummary={deliverySummary}
          effectiveCanonical={effectiveCanonical}
          searchQueryCompiled={searchQueryCompiled}
          constraintsExtracted={constraintsExtracted}
          verificationSummary={verificationSummary}
          policySnapshot={policySnapshot}
          policyApplied={policyApplied}
          learningUpdate={learningUpdate}
          planVersions={planVersions}
          towerVerdict={towerVerdict}
          towerProxyUsed={towerProxyUsed}
          towerUnavailable={towerUnavailable}
          runId={runId}
          narrative={narrative}
        />
      )}

      {!provisional && <NextActionButtons ds={deliverySummary} canonical={effectiveCanonical} runId={runId} hasTarget={target.hasTarget} />}

      {!provisional && !isTrustFailure && (
        <FeedbackButtons runId={runId} />
      )}
    </div>
  );
}
