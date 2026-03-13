/* PHASE_6 */
import { useState, useCallback, useMemo } from "react";
import { MapPin, Phone, Globe, CheckCircle2, CircleDot, OctagonX, HelpCircle, AlertTriangle, ChevronDown, ChevronRight, BookOpen, Copy, Loader2, RefreshCw, Radar, ArrowRight, ShieldQuestion, Check, Minus, X as XIcon, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { resolveCanonicalStatus, type CanonicalStatus } from "@/utils/deliveryStatus";
import type { DeliverySummary, DeliveryLead } from "@/components/results/UserResultsView";
import type { VerificationSummaryPayload, ConstraintsExtractedPayload, LeadVerificationEntry, SemanticJudgementEntry } from "@/components/results/CvlArtefactViews";
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
  source: 'lead_pack' | 'contact_extract' | 'unknown';
  emailCount: number;
  phoneCount: number;
  leadsWithEmail: number;
  leadsWithPhone: number;
  emails: string[];
  phones: string[];
  debugInfo: {
    leadPackTotal: number;
    contactExtractTotal: number;
    leadPackMatched: number;
    contactExtractMatched: number;
    deliveredLeadCount: number;
    usedArtefactIds: string[];
    mappingNote?: string;
  };
}

export interface ReceiptAttributeOutcome {
  attribute_raw: string;
  matched_count: number;
  unknown_count?: number;
  matched_place_ids?: string[];
  evidence_refs?: Array<{ url?: string; snippet?: string; place_id?: string; matched_variant?: string }>;
}

export interface RunReceipt {
  unique_email_count?: number | null;
  unique_phone_count?: number | null;
  contacts_proven?: boolean | null;
  requested_count?: number | null;
  delivered_count?: number | null;
  narrative_lines?: string[] | null;
  tower_verdict?: string | null;
  outcomes?: {
    attributes?: ReceiptAttributeOutcome[];
  } | null;
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
  towerLabel?: string | null;
  towerProxyUsed?: string | null;
  towerStopTimePredicate?: boolean;
  planVersions?: PlanVersion[] | null;
  towerUnavailable?: boolean;
  contactCounts?: ContactCounts | null;
  runReceipt?: RunReceipt | null;
  semanticJudgements?: SemanticJudgementEntry[] | null;
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

/* PHASE_6: Updated status icons and colours for new status model */
const STATUS_ICONS: Record<CanonicalStatus, typeof CheckCircle2> = {
  PASS: CheckCircle2,
  PARTIAL: CircleDot,
  STOP: OctagonX,
  FAIL: AlertTriangle,
  ACCEPT_WITH_UNVERIFIED: AlertTriangle,
  CHANGE_PLAN: RotateCw,
  ERROR: AlertTriangle,
  UNAVAILABLE: HelpCircle,
};

const STATUS_COLORS: Record<CanonicalStatus, string> = {
  PASS: "text-green-600 dark:text-green-400",
  PARTIAL: "text-amber-600 dark:text-amber-400",
  STOP: "text-red-600 dark:text-red-400",
  FAIL: "text-red-600 dark:text-red-400",
  ACCEPT_WITH_UNVERIFIED: "text-amber-600 dark:text-amber-400",
  CHANGE_PLAN: "text-amber-600 dark:text-amber-400",
  ERROR: "text-red-600 dark:text-red-400",
  UNAVAILABLE: "text-muted-foreground",
};

/* PHASE_6: Constraint verdict type from backend lead_verification artefacts */
type ConstraintVerdict = 'VERIFIED' | 'PLAUSIBLE' | 'UNSUPPORTED' | 'CONTRADICTED' | 'UNKNOWN';

function toConstraintVerdict(status: string | undefined): ConstraintVerdict {
  if (!status) return 'UNKNOWN';
  const upper = status.toUpperCase().trim();
  if (upper === 'YES' || upper === 'VERIFIED' || upper === 'EXACT' || upper === 'SEARCH_BOUNDED') return 'VERIFIED';
  if (upper === 'PLAUSIBLE' || upper === 'LIKELY' || upper === 'WEAK_MATCH') return 'PLAUSIBLE';
  if (upper === 'NO' || upper === 'CONTRADICTED' || upper === 'FAILED') return 'CONTRADICTED';
  if (upper === 'UNSUPPORTED' || upper === 'NOT_FOUND') return 'UNSUPPORTED';
  return 'UNKNOWN';
}

/* PHASE_6: Map source tier strings to human-readable labels */
function formatSourceTier(sourceTier: string | undefined): string | null {
  if (!sourceTier) return null;
  const lower = sourceTier.toLowerCase().trim();
  const map: Record<string, string> = {
    first_party_website: "their website",
    website: "their website",
    search_snippet: "search result",
    snippet: "search result",
    directory_field: "directory listing",
    directory: "directory listing",
    lead_field: "listing data",
    listing: "listing data",
    external_source: "third-party source",
    external: "third-party source",
  };
  return map[lower] || sourceTier;
}

/* PHASE_6: Compact per-constraint verdict row for a single lead */
function ConstraintVerdictRow({ constraintId, verdict, isHard, reason, sourceTier }: {
  constraintId: string;
  verdict: ConstraintVerdict;
  isHard: boolean;
  reason?: string;
  sourceTier?: string | null;
}) {
  const sourceLabel = formatSourceTier(sourceTier || undefined);
  const isFailure = verdict === 'UNSUPPORTED' || verdict === 'CONTRADICTED';
  const isHardFailure = isHard && isFailure;

  const config: Record<ConstraintVerdict, { icon: typeof Check; color: string; symbol: string }> = {
    VERIFIED: { icon: Check, color: "text-green-600 dark:text-green-400", symbol: "✓" },
    PLAUSIBLE: { icon: Minus, color: "text-amber-600 dark:text-amber-400", symbol: "~" },
    UNSUPPORTED: { icon: Minus, color: "text-gray-400 dark:text-gray-500", symbol: "–" },
    CONTRADICTED: { icon: XIcon, color: "text-red-600 dark:text-red-400", symbol: "✗" },
    UNKNOWN: { icon: HelpCircle, color: "text-gray-400 dark:text-gray-500", symbol: "?" },
  };

  const c = config[verdict];
  const Icon = c.icon;

  const label = constraintId
    .replace(/_/g, ' ')
    .replace(/\b\w/g, ch => ch.toUpperCase());

  return (
    <div className={cn(
      "flex items-center gap-1.5 text-[11px] leading-tight",
      isHardFailure && "font-semibold"
    )}>
      <Icon className={cn("h-3 w-3 shrink-0", c.color)} />
      <span className={cn(
        isHardFailure ? "text-red-700 dark:text-red-300" : "text-foreground/80",
      )}>
        {label}
      </span>
      {sourceLabel && (verdict === 'VERIFIED' || verdict === 'PLAUSIBLE') && (
        <span className="text-[10px] text-muted-foreground">
          — from {sourceLabel}
        </span>
      )}
      {isHard && (
        <span className="text-[9px] px-1 py-px rounded bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400">
          hard
        </span>
      )}
    </div>
  );
}

/* PHASE_6: Per-lead constraint breakdown using lead_verification artefact data */
function ConstraintBreakdown({ checks }: { checks: import("@/components/results/CvlArtefactViews").LeadConstraintCheck[] }) {
  if (!checks || checks.length === 0) return null;

  const sorted = [...checks].sort((a, b) => {
    if (a.hard && !b.hard) return -1;
    if (!a.hard && b.hard) return 1;
    return 0;
  });

  return (
    <div className="mt-1.5 space-y-0.5 pl-0.5 border-l-2 border-border/40 ml-0.5 pl-2">
      {sorted.map((check, i) => (
        <ConstraintVerdictRow
          key={check.constraint_id || i}
          constraintId={check.constraint_id || `Constraint ${i + 1}`}
          verdict={toConstraintVerdict((check as any).constraint_verdict || check.status)}
          isHard={check.hard === true}
          reason={check.reason}
          sourceTier={(check as any).source_tier || (check as any).evidence_source}
        />
      ))}
    </div>
  );
}

/* PHASE_6: Prominent stop-reason block showing failing constraint details */
function FailingConstraintBanner({ deliverySummary }: { deliverySummary: DeliverySummary }) {
  const stopReason = deliverySummary.stop_reason;
  if (!stopReason) return null;

  const sr = typeof stopReason === 'string' ? { message: stopReason } : stopReason as any;
  const failingId = sr.failing_constraint_id || sr.constraint_id || null;
  const failingReason = sr.failing_constraint_reason || sr.reason || sr.message || null;

  if (!failingReason && !failingId) return null;

  return (
    <div className="flex items-start gap-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2">
      <OctagonX className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
      <div className="space-y-0.5">
        <p className="text-xs font-semibold text-red-700 dark:text-red-300">
          Stopped{failingId ? `: ${failingId.replace(/_/g, ' ')}` : ''}
        </p>
        {failingReason && (
          <p className="text-[11px] text-red-600 dark:text-red-400 leading-snug">
            {failingReason}
          </p>
        )}
      </div>
    </div>
  );
}

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
  if (entry.verified_exact === true) return true;
  if (entry.all_hard_satisfied === true) return true;
  const checks = Array.isArray(entry.constraint_checks) ? entry.constraint_checks : [];
  if (checks.length === 0) return false;
  const hardChecks = checks.filter(c => c.hard === true);
  if (hardChecks.length > 0) {
    return hardChecks.every(c => c.status === 'yes');
  }
  return checks.every(c => c.status === 'yes' || c.status === 'search_bounded');
}

function getLeadVerificationId(entry: LeadVerificationEntry): string {
  return entry.lead_place_id || entry.lead_id || '';
}

function buildVerifiedLeadIds(lvEntries: LeadVerificationEntry[] | null | undefined): Set<string> {
  const ids = new Set<string>();
  if (!lvEntries) return ids;
  for (const entry of lvEntries) {
    if (isLeadVerified(entry)) {
      const id = getLeadVerificationId(entry);
      if (id) ids.add(id);
      if (entry.lead_name) ids.add(entry.lead_name.toLowerCase().trim());
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
  verifiedIds: Set<string>,
  hasVerificationData: boolean,
): { matches: DeliveryLead[]; candidates: DeliveryLead[] } {
  if (!hasVerificationData && verifiedIds.size === 0 && verifiedExact === 0) {
    return { matches: allLeads, candidates: [] };
  }

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
          const candidateNote = totalDelivered > verifiedExact ? ` (${totalDelivered - verifiedExact} other ${totalDelivered - verifiedExact === 1 ? "candidate was" : "candidates were"} found but not verified)` : "";
          return `Found ${verifiedExact} verified ${verifiedExact === 1 ? "match" : "matches"} of ${target.targetCount} requested${candidateNote}.`;
        }
        return `Returned ${verifiedExact} verified of ${target.targetCount} requested. You can search more or broaden the criteria to try to reach ${target.targetCount}.`;
      }
      if (isPartialOrStop) {
        if (verifiedExact > 0) {
          const candidateNote = totalDelivered > verifiedExact ? ` ${totalDelivered - verifiedExact} other ${totalDelivered - verifiedExact === 1 ? "candidate was" : "candidates were"} found but not verified.` : "";
          return `I found ${verifiedExact} verified ${verifiedExact === 1 ? "match" : "matches"}.${candidateNote}`;
        }
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
      const unverifiedCount = totalItems - verifiedExact;
      if (verifiedExact > 0 && unverifiedCount > 0) {
        if (target.hasTarget) {
          return `Found ${verifiedExact} verified ${verifiedExact === 1 ? "match" : "matches"} of ${target.targetCount} requested. ${unverifiedCount} other ${unverifiedCount === 1 ? "candidate" : "candidates"} could not be verified.`;
        }
        return `I found ${verifiedExact} verified ${verifiedExact === 1 ? "match" : "matches"}. ${unverifiedCount} other ${unverifiedCount === 1 ? "candidate" : "candidates"} could not be verified.`;
      }
      if (target.hasTarget) {
        return `Returned ${totalItems} ${totalItems === 1 ? "result" : "results"} for ${target.targetCount} requested, but not all could be verified against your requirements.`;
      }
      return `I found ${totalItems} ${totalItems === 1 ? "result" : "results"}, but not all could be verified against your requirements.`;
    }

    case "FAIL":
      return `Search could not be completed. Results were not verified.`;

    /* PHASE_6: Handle new status types */
    case "CHANGE_PLAN":
      return "The search plan is being revised. Results will update when ready.";

    case "ERROR":
      return "An error occurred during the search. You can try again.";

    case "UNAVAILABLE":
    default:
      return "Results are being processed.";
  }
}

type LeadBadgeStatus = 'verified' | 'weak_match' | 'candidate' | 'unverified' | 'none';

function LeadBadge({ isVerified, unverifiableAttr, badgeStatus }: { isVerified: boolean; unverifiableAttr: string | null; badgeStatus?: LeadBadgeStatus }) {
  if (badgeStatus === 'none') return null;
  const effectiveStatus: LeadBadgeStatus =
    isVerified ? 'verified' :
    badgeStatus === 'weak_match' ? 'weak_match' :
    badgeStatus === 'unverified' ? 'unverified' :
    (badgeStatus || 'candidate');

  if (effectiveStatus === 'verified') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
        <CheckCircle2 className="h-2.5 w-2.5" /> Verified
      </span>
    );
  }

  if (effectiveStatus === 'weak_match') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
        <CircleDot className="h-2.5 w-2.5" /> Weak match
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

/* PHASE_6: LeadRow now accepts optional leadVerificationEntry for per-constraint breakdown */
function LeadRow({ lead, isVerified, unverifiableAttr, runId, showLocationBadge, badgeStatus, leadVerificationEntry }: { lead: DeliveryLead; isVerified: boolean; unverifiableAttr: string | null; runId?: string | null; showLocationBadge?: boolean; badgeStatus?: LeadBadgeStatus; leadVerificationEntry?: import("@/components/results/CvlArtefactViews").LeadVerificationEntry | null }) {
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
        {(() => {
          const ev = Array.isArray((lead as any).evidence) ? (lead as any).evidence : [];
          const matchReason = (lead as any).match_reason || (lead as any).match_summary || '';
          const evidenceSourceUrl = (lead as any).evidence_source_url || '';

          const firstEvidence = ev.length > 0 ? ev[0] : null;
          const snippet = firstEvidence
            ? (typeof firstEvidence === 'string'
              ? firstEvidence
              : (firstEvidence?.snippet || firstEvidence?.quote || firstEvidence?.summary || ''))
            : '';

          if (!snippet && !matchReason) return null;

          return (
            <div className="mt-1 space-y-0.5 pl-0.5">
              {matchReason && (
                <div className="text-[11px] text-emerald-600 dark:text-emerald-400 leading-snug">
                  {matchReason}
                </div>
              )}
              {snippet && (
                <div className="text-[11px] text-muted-foreground/80 italic leading-snug">
                  "{snippet.length > 120 ? snippet.slice(0, 120) + '…' : snippet}"
                </div>
              )}
              {evidenceSourceUrl && (
                <a href={evidenceSourceUrl.startsWith('http') ? evidenceSourceUrl : `https://${evidenceSourceUrl}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-400 hover:underline truncate block max-w-[250px]">
                  Source: {evidenceSourceUrl.replace(/^https?:\/\//, '').slice(0, 60)}
                </a>
              )}
            </div>
          );
        })()}
        {/* PHASE_6: Per-constraint breakdown from lead_verification artefact */}
        {leadVerificationEntry && Array.isArray(leadVerificationEntry.constraint_checks) && leadVerificationEntry.constraint_checks.length > 0 && (
          <ConstraintBreakdown checks={leadVerificationEntry.constraint_checks} />
        )}
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

export interface AttributeOutcome {
  attribute_raw: string;
  matched_count: number;
  unknown_count: number;
  total_checked: number;
  matched_lead_ids: string[];
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
  attributeOutcomes?: AttributeOutcome[];
  contactDebug?: ContactCounts['debugInfo'] & {
    emails: string[];
    phones: string[];
  };
}

export function buildAttributeOutcomes(
  constraintsExtracted?: ConstraintsExtractedPayload | null,
  leadVerifications?: LeadVerificationEntry[] | null,
): AttributeOutcome[] {
  if (!constraintsExtracted?.constraints?.length) return [];
  if (!leadVerifications?.length) return [];
  const attrConstraints = constraintsExtracted.constraints.filter(
    c => (c.kind || '').toLowerCase() === 'has_attribute' || (c.field || '').toLowerCase() === 'attribute'
  );
  if (attrConstraints.length === 0) return [];

  return attrConstraints.map(ac => {
    let matched = 0;
    let unknown = 0;
    const matchedIds: string[] = [];
    for (const lv of leadVerifications) {
      const checks = Array.isArray(lv.constraint_checks) ? lv.constraint_checks : [];
      const check = checks.find(ch => ch.constraint_id === ac.id);
      if (!check || check.status === 'unknown') {
        unknown++;
      } else if (check.status === 'yes') {
        matched++;
        matchedIds.push(lv.lead_id);
      }
    }
    return {
      attribute_raw: typeof ac.value === 'string' ? ac.value : String(ac.value ?? ac.label ?? ac.id),
      matched_count: matched,
      unknown_count: unknown,
      total_checked: leadVerifications.length,
      matched_lead_ids: matchedIds,
    };
  });
}


export function buildRunNarrative(
  deliverySummary: DeliverySummary,
  searchQueryCompiled?: SearchQueryCompiled | null,
  constraintsExtracted?: ConstraintsExtractedPayload | null,
  towerVerdict?: string | null,
  contactCounts?: ContactCounts | null,
  attributeOutcomes?: AttributeOutcome[] | null,
  hasReceiptAttributes?: boolean,
  verifiedMatchCount?: number,
): RunNarrative {
  const exact = Array.isArray(deliverySummary.delivered_exact) ? deliverySummary.delivered_exact : [];
  const closest = Array.isArray(deliverySummary.delivered_closest) ? deliverySummary.delivered_closest : [];
  const allLeads = [...exact, ...closest];
  const deliveredCount = allLeads.length;

  const hasVerificationTruth = typeof verifiedMatchCount === 'number' && verifiedMatchCount >= 0;
  const primaryCount = hasVerificationTruth && verifiedMatchCount > 0 ? verifiedMatchCount : deliveredCount;
  const candidateOnlyCount = hasVerificationTruth ? deliveredCount - verifiedMatchCount : 0;

  const requestedCount = constraintsExtracted?.requested_count_user ??
    deliverySummary.requested_count ??
    searchQueryCompiled?.requested_count ??
    null;

  const candidateCount = searchQueryCompiled?.final_returned_count ?? deliverySummary.delivered_count ?? null;

  const titleCase = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase());
  const query = searchQueryCompiled?.interpreted_query || '';
  const location = searchQueryCompiled?.interpreted_location || '';

  const contactCountsSource: string = contactCounts?.source ?? 'unknown';
  const emailFoundCount = contactCounts?.emailCount ?? 0;
  const phoneFoundCount = contactCounts?.phoneCount ?? 0;
  const countsProven = contactCountsSource === 'lead_pack' || contactCountsSource === 'contact_extract';

  const tv = (towerVerdict || '').toLowerCase();
  const isTrustFailure = tv === 'fail' || tv === 'error' || tv === 'stop';

  const lines: string[] = [];
  const outcomes = attributeOutcomes ?? [];
  const receiptHasPositiveMatch = hasReceiptAttributes && outcomes.some(ao => ao.matched_count > 0);

  const entityWord = query || 'businesses';
  const locationPart = location ? ` in ${titleCase(location)}` : '';

  if (hasVerificationTruth && verifiedMatchCount > 0) {
    lines.push(`I found ${verifiedMatchCount} verified ${verifiedMatchCount === 1 ? 'match' : 'matches'}${locationPart}.`);
    if (candidateOnlyCount > 0) {
      lines.push(`${candidateOnlyCount} other ${candidateOnlyCount === 1 ? 'candidate was' : 'candidates were'} found but could not be verified.`);
    }
  } else if (primaryCount > 0) {
    lines.push(`I found ${primaryCount} ${entityWord}${locationPart}.`);
  } else if (candidateCount != null && candidateCount > 0) {
    lines.push(`I searched Google Places for ${entityWord}${locationPart} and found ${candidateCount} possible ${candidateCount === 1 ? 'match' : 'matches'}.`);
  } else {
    lines.push(`I searched Google Places for ${entityWord}${locationPart}.`);
  }

  for (const ao of outcomes) {
    if (ao.matched_count > 0) {
      lines.push(`${ao.matched_count} of ${ao.total_checked} mention '${ao.attribute_raw}' online.`);
    } else if (ao.unknown_count > 0 && ao.unknown_count === ao.total_checked) {
      lines.push(`I wasn't able to confirm which ones mention '${ao.attribute_raw}' online.`);
    } else if (ao.unknown_count > 0) {
      const checked = ao.total_checked - ao.unknown_count;
      lines.push(`I checked ${checked} website${checked !== 1 ? 's' : ''} but none mention '${ao.attribute_raw}'. ${ao.unknown_count} could not be checked.`);
    } else if (ao.total_checked > 0) {
      lines.push(`None of the ${ao.total_checked} websites I checked mention '${ao.attribute_raw}' online.`);
    }
  }

  if (countsProven) {
    if (emailFoundCount > 0 || phoneFoundCount > 0) {
      const contactParts: string[] = [];
      if (emailFoundCount > 0) {
        contactParts.push(`${emailFoundCount} ${emailFoundCount === 1 ? 'email' : 'emails'}`);
      }
      if (phoneFoundCount > 0) {
        contactParts.push(`${phoneFoundCount} phone ${phoneFoundCount === 1 ? 'number' : 'numbers'}`);
      }
      lines.push(`I found ${contactParts.join(' and ')} from the websites I checked.`);
    } else {
      lines.push('I checked the websites I could access, but didn\u2019t find public contact details for those venues.');
    }
  } else {
    lines.push('I checked websites where available for contact details. Results varied by venue.');
  }

  if (isTrustFailure && !receiptHasPositiveMatch) {
    lines.push("I found some results but couldn't check everything. Some details may be incomplete.");
  } else if (deliveredCount === 0) {
    lines.push('No results could be delivered for this search.');
  }

  return {
    lines,
    isTrustFailure: isTrustFailure && !receiptHasPositiveMatch,
    emailFoundCount,
    phoneFoundCount,
    deliveredCount,
    requestedCount,
    candidateCount,
    towerVerdict: towerVerdict || null,
    contactCountsSource,
    attributeOutcomes: outcomes,
    contactDebug: contactCounts ? { ...contactCounts.debugInfo, emails: contactCounts.emails, phones: contactCounts.phones } : undefined,
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

function ReceiptInlineLine({ narrative, runReceipt }: { narrative: RunNarrative; runReceipt?: RunReceipt | null }) {
  const isDev = import.meta.env.VITE_SHOW_RECEIPT_IN_BUBBLE === 'true' && import.meta.env.MODE !== 'production';
  if (!isDev) return null;

  if (!runReceipt) {
    return (
      <p className="text-[11px] text-muted-foreground font-mono mt-1">
        Receipt (backend): not available
      </p>
    );
  }

  const proven = runReceipt.contacts_proven === true;
  const rEmails = proven && runReceipt.unique_email_count != null ? runReceipt.unique_email_count : null;
  const rPhones = proven && runReceipt.unique_phone_count != null ? runReceipt.unique_phone_count : null;

  if (!proven || rEmails == null || rPhones == null) {
    return (
      <p className="text-[11px] text-muted-foreground font-mono mt-1">
        Receipt (backend): contacts unknown (proven=false)
      </p>
    );
  }

  const dEmails = narrative.emailFoundCount;
  const dPhones = narrative.phoneFoundCount;
  const emailMismatch = rEmails !== dEmails;
  const phoneMismatch = rPhones !== dPhones;
  const hasMismatch = emailMismatch || phoneMismatch;

  return (
    <div className="mt-1 space-y-0.5">
      <p className="text-[11px] text-muted-foreground font-mono">
        Receipt (backend): emails={rEmails} phones={rPhones} proven=true
      </p>
      {hasMismatch && (
        <p className="text-[11px] font-mono font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 inline shrink-0" />
          WARNING: mismatch vs receipt
        </p>
      )}
      {hasMismatch && (
        <p className="text-[11px] font-mono text-amber-600 dark:text-amber-400">
          UI: emails={dEmails} phones={dPhones} | Receipt: emails={rEmails} phones={rPhones}
        </p>
      )}
    </div>
  );
}

function ReceiptComparison({ narrative, runReceipt }: { narrative: RunNarrative; runReceipt?: RunReceipt | null }) {
  if (!runReceipt) {
    return (
      <div className="text-[10px] text-muted-foreground font-mono pt-1 border-t border-border/50 mt-1">
        Receipt: not available for this run
      </div>
    );
  }

  const receiptProven = runReceipt.contacts_proven === true;
  const receiptEmails = receiptProven && runReceipt.unique_email_count != null ? runReceipt.unique_email_count : null;
  const receiptPhones = receiptProven && runReceipt.unique_phone_count != null ? runReceipt.unique_phone_count : null;

  const derivedEmails = narrative.emailFoundCount;
  const derivedPhones = narrative.phoneFoundCount;

  const emailMismatch = receiptEmails != null && receiptEmails !== derivedEmails;
  const phoneMismatch = receiptPhones != null && receiptPhones !== derivedPhones;
  const hasMismatch = emailMismatch || phoneMismatch;

  const receiptTower = runReceipt.tower_verdict;
  const receiptTowerLower = (receiptTower || '').toLowerCase();
  const towerAccepted = ['pass', 'accept', 'accept_with_unverified'].includes(receiptTowerLower);
  const towerRejected = ['fail', 'stop', 'error'].includes(receiptTowerLower);

  return (
    <div className="space-y-0.5 text-[10px] font-mono pt-1 border-t border-border/50 mt-1">
      <div className="font-semibold text-muted-foreground uppercase tracking-wider text-[9px]">Receipt comparison</div>
      <div className="flex gap-x-6">
        <div className="text-muted-foreground">
          Derived: emails={derivedEmails} phones={derivedPhones}
        </div>
        <div className="text-muted-foreground">
          Receipt: emails={receiptEmails ?? 'unknown'} phones={receiptPhones ?? 'unknown'}
          {!receiptProven && <span className="ml-1 text-amber-600 dark:text-amber-400">(unproven)</span>}
        </div>
      </div>
      {hasMismatch && (
        <div className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 inline" />
          Mismatch: UI derived counts != run_receipt
          {emailMismatch && <span className="font-normal ml-1">[emails: {derivedEmails} vs {receiptEmails}]</span>}
          {phoneMismatch && <span className="font-normal ml-1">[phones: {derivedPhones} vs {receiptPhones}]</span>}
        </div>
      )}
      {receiptTower && (
        <div className={cn(
          "flex items-center gap-1",
          towerAccepted && "text-green-600 dark:text-green-400",
          towerRejected && "text-red-600 dark:text-red-400",
          !towerAccepted && !towerRejected && "text-muted-foreground"
        )}>
          Tower: {towerAccepted ? 'receipt verified' : towerRejected ? 'receipt failed verification' : `receipt verdict=${receiptTower}`}
        </div>
      )}
      {runReceipt.delivered_count != null && (
        <div className="text-muted-foreground">
          Receipt delivered={runReceipt.delivered_count}
          {runReceipt.requested_count != null && <span> requested={runReceipt.requested_count}</span>}
        </div>
      )}
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
  towerLabel,
  towerProxyUsed,
  towerUnavailable,
  runId,
  narrative,
  runReceipt,
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
  towerLabel?: string | null;
  towerProxyUsed?: string | null;
  towerUnavailable?: boolean;
  runId?: string | null;
  narrative: RunNarrative;
  runReceipt?: RunReceipt | null;
}) {
  const [open, setOpen] = useState(false);

  const displayLabel = towerLabel || (towerVerdict || '').toUpperCase();
  const tv = (towerVerdict || '').toUpperCase();
  const isMixed = displayLabel.startsWith('MIXED');
  const tvColor = isMixed
    ? 'text-amber-700 dark:text-amber-300'
    : ['PASS', 'ACCEPT', 'ACCEPT_WITH_UNVERIFIED'].includes(tv)
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
              <span className={cn("font-semibold", tvColor)}>{displayLabel}</span>
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

          {/* PHASE_6: Upgraded constraint summary with richer verdicts */}
          {constraintsExtracted && Array.isArray(constraintsExtracted.constraints) && constraintsExtracted.constraints.length > 0 && (
            <div>
              <p className="text-muted-foreground font-medium mb-1">Constraints</p>
              <div className="rounded border divide-y">
                {constraintsExtracted.constraints.map(c => {
                  const vsResult = verificationSummary?.constraint_results?.find((r: any) => r.constraint_id === c.id);
                  const verdict = vsResult ? toConstraintVerdict((vsResult as any).constraint_verdict || (vsResult as any).status) : null;
                  const failureReason = vsResult ? ((vsResult as any).reason || (vsResult as any).failing_constraint_reason) : null;
                  const verdictConfig: Record<ConstraintVerdict, { label: string; cls: string }> = {
                    VERIFIED: { label: "Verified", cls: "text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20" },
                    PLAUSIBLE: { label: "Plausible", cls: "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20" },
                    UNSUPPORTED: { label: "Unsupported", cls: "text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/30" },
                    CONTRADICTED: { label: "Contradicted", cls: "text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20" },
                    UNKNOWN: { label: "Unknown", cls: "text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/30" },
                  };
                  const vc = verdict ? verdictConfig[verdict] : null;
                  const evidenceReq = (c as any).evidence_requirement || (c as any).evidence_source;
                  return (
                    <div key={c.id} className="px-2 py-1.5 space-y-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex-1 min-w-0 truncate">{c.label || `${c.field}${c.op ? ` ${c.op}` : ''} ${c.value}`}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {vc && (
                            <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium", vc.cls)}>
                              {vc.label}
                            </span>
                          )}
                          <span className={cn(
                            "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium",
                            c.hardness === 'hard' ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300" :
                            c.hardness === 'soft' ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300" :
                            "bg-gray-50 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400"
                          )}>
                            {c.hardness || 'unknown'}
                          </span>
                        </div>
                      </div>
                      {evidenceReq && (
                        <p className="text-[10px] text-muted-foreground pl-0.5">requires {evidenceReq} evidence</p>
                      )}
                      {failureReason && (verdict === 'UNSUPPORTED' || verdict === 'CONTRADICTED' || verdict === 'UNKNOWN') && (
                        <p className="text-[10px] text-red-600 dark:text-red-400 pl-0.5">{failureReason}</p>
                      )}
                    </div>
                  );
                })}
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
              {towerVerdict && <span>tower={towerVerdict}{towerLabel && towerLabel !== towerVerdict.toUpperCase() ? ` [${towerLabel}]` : ''}</span>}
              {runId && <span>run={runId.slice(0, 12)}</span>}
            </div>
            <div className="text-[10px] text-muted-foreground font-mono">
              Contact counts source: <span className="font-semibold">{narrative.contactCountsSource}</span>
              {narrative.contactCountsSource === 'unknown' && ' (could not map artefacts to delivered leads)'}
            </div>
            {narrative.contactDebug && (
              <div className="space-y-0.5 text-[10px] text-muted-foreground font-mono">
                <div>
                  lead_pack: {narrative.contactDebug.leadPackMatched}/{narrative.contactDebug.leadPackTotal} matched
                  {' | '}contact_extract: {narrative.contactDebug.contactExtractMatched}/{narrative.contactDebug.contactExtractTotal} matched
                  {' | '}delivered: {narrative.contactDebug.deliveredLeadCount}
                </div>
                {narrative.contactDebug.usedArtefactIds.length > 0 && (
                  <div>artefact_ids: {narrative.contactDebug.usedArtefactIds.map(id => id.slice(0, 8)).join(', ')}</div>
                )}
                {narrative.contactDebug.emails.length > 0 && (
                  <div>emails: {narrative.contactDebug.emails.map(e => {
                    const parts = e.split('@');
                    return parts.length === 2 ? `***@${parts[1]}` : '***';
                  }).join(', ')}</div>
                )}
                {narrative.contactDebug.phones.length > 0 && (
                  <div>phones: {narrative.contactDebug.phones.map(p => p.slice(0, -4).replace(/./g, '*') + p.slice(-4)).join(', ')}</div>
                )}
                {narrative.contactDebug.mappingNote && (
                  <div className="text-amber-600 dark:text-amber-400">{narrative.contactDebug.mappingNote}</div>
                )}
              </div>
            )}

            {import.meta.env.VITE_SHOW_RECEIPT_COMPARISON === 'true' && (
              <ReceiptComparison
                narrative={narrative}
                runReceipt={runReceipt}
              />
            )}
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

function StillWorkingBlock() {
  return (
    <div className="flex items-center gap-2 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2">
      <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600 dark:text-blue-400 shrink-0" />
      <p className="text-xs text-blue-700 dark:text-blue-300 font-medium">
        Still working — this search is taking longer than usual. Results will appear when ready.
      </p>
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
        <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600 dark:text-amber-400 shrink-0" />
        <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
          Run still processing or persisting — retrying.
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
    <div className="flex flex-col items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
        <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
          Some results couldn't be fully checked. You may want to retry or refine your search.
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
    run_timeout: "Run timed out waiting for results",
    run_not_persisted: "Run failed to start",
  };
  return map[reason] || reason.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function RunTimeoutBlock({ stopReason }: { stopReason: string }) {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = useCallback(() => {
    setRetrying(true);
    window.dispatchEvent(new CustomEvent('wyshbone:retry_last_message'));
    setTimeout(() => setRetrying(false), 5000);
  }, []);

  const message = stopReason === 'run_not_persisted'
    ? "The run failed to start — it wasn't recorded by the system. This can happen if the server was busy."
    : "The run timed out waiting for results. The server may still be processing, but the UI stopped waiting.";

  return (
    <div className="flex flex-col items-start gap-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 text-red-600 dark:text-red-400 shrink-0" />
        <p className="text-xs text-red-700 dark:text-red-300 font-medium">
          {message}
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
          <><Loader2 className="h-3 w-3 animate-spin" /> Retrying...</>
        ) : (
          <><RefreshCw className="h-3 w-3" /> Retry</>
        )}
      </Button>
    </div>
  );
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

/* PHASE_6: CollapsedCandidates now accepts findLeadVerification for per-constraint breakdown */
function CollapsedCandidates({ leads, unverifiableAttr, runId, getLeadBadgeStatus, findLeadVerification }: {
  leads: DeliveryLead[];
  unverifiableAttr: string | null;
  runId?: string | null;
  getLeadBadgeStatus: (lead: DeliveryLead) => LeadBadgeStatus;
  findLeadVerification?: (lead: DeliveryLead) => import("@/components/results/CvlArtefactViews").LeadVerificationEntry | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-0.5">
      <button
        className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors w-full text-left"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Other candidates — not verified ({leads.length})
      </button>
      {open && (
        <div className="pl-4 border-l border-border/50">
          <p className="text-[11px] text-muted-foreground mb-1">
            These were found in discovery but could not be verified against your requirements.
          </p>
          {leads.map((lead, i) => (
            <LeadRow key={i} lead={lead} isVerified={false} unverifiableAttr={unverifiableAttr} runId={runId} badgeStatus={getLeadBadgeStatus(lead)} leadVerificationEntry={findLeadVerification?.(lead) ?? null} />
          ))}
        </div>
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
  towerLabel,
  towerProxyUsed,
  towerStopTimePredicate,
  planVersions,
  towerUnavailable,
  contactCounts,
  runReceipt,
  semanticJudgements,
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
  const PASS_VERDICTS = ['pass', 'accept', 'accept_with_unverified'];
  const isFinalDeliveryPass = PASS_VERDICTS.includes(towerVerdictLower);
  const isTrustFailure = !isFinalDeliveryPass && (
    canonical.status === "FAIL" ||
    (towerVerdict && ['fail', 'error'].includes(towerVerdictLower))
  );

  const effectiveTowerDisplay = towerLabel || (towerVerdict ? towerVerdict.toUpperCase() : null);

  const isMixedVerdict = isFinalDeliveryPass && towerLabel && /mixed|step.*failed/i.test(towerLabel);

  const isTimePredicateStop = !!(towerStopTimePredicate && (canonical.status === 'STOP' || canonical.status === 'FAIL'));

  const towerVerdictUpper = (towerVerdict || "").toUpperCase().replace(/[\s-]/g, '_');
  const isExplicitAcceptWithUnverified = towerVerdictUpper === 'ACCEPT_WITH_UNVERIFIED';

  const exact = Array.isArray(deliverySummary.delivered_exact) ? deliverySummary.delivered_exact : [];
  const closest = Array.isArray(deliverySummary.delivered_closest) ? deliverySummary.delivered_closest : [];
  const allLeads = [...exact, ...closest];

  const hasResults = allLeads.length > 0 || (deliverySummary.delivered_count ?? 0) > 0;

  const verifiedIds = buildVerifiedLeadIds(leadVerifications);
  const weakMatchIds = new Set<string>();

  const hasSemanticData = Array.isArray(semanticJudgements) && semanticJudgements.length > 0;
  if (hasSemanticData) {
    for (const sj of semanticJudgements!) {
      const status = sj.tower_status?.toLowerCase();
      const hasSnippets = Array.isArray(sj.matched_snippets) && sj.matched_snippets.length > 0;
      if (status === 'weak_match') {
        weakMatchIds.add(sj.lead_id);
        if (sj.lead_name) weakMatchIds.add(sj.lead_name.toLowerCase().trim());
      } else if (status === 'strong_match' || status === 'match' || (status !== 'no_evidence' && status !== 'stubbed' && hasSnippets)) {
        verifiedIds.add(sj.lead_id);
        if (sj.lead_name) verifiedIds.add(sj.lead_name.toLowerCase().trim());
      }
    }
  }
  const receiptAttrsForIds = runReceipt?.outcomes?.attributes;
  if (Array.isArray(receiptAttrsForIds)) {
    for (const ra of receiptAttrsForIds) {
      if (Array.isArray(ra.matched_place_ids)) {
        for (const pid of ra.matched_place_ids) verifiedIds.add(pid);
      }
    }
  }
  const allPositiveIds = new Set<string>();
  verifiedIds.forEach(id => allPositiveIds.add(id));
  weakMatchIds.forEach(id => allPositiveIds.add(id));

  const hasReceiptAttrData = Array.isArray(receiptAttrsForIds) && receiptAttrsForIds.length > 0;
  const hasVerificationData = (leadVerifications && leadVerifications.length > 0) || hasSemanticData || hasReceiptAttrData;
  const { matches, candidates } = splitLeadsByVerification(allLeads, verifiedExact, allPositiveIds, hasVerificationData);
  const hasUnverifiedLeads = hasVerificationData && (isTrustFailure || isTimePredicateStop || candidates.length > 0);

  const defaultBadgeStatus: LeadBadgeStatus = hasUnverifiedLeads ? 'unverified' : 'candidate';

  function getLeadBadgeStatus(lead: DeliveryLead): LeadBadgeStatus {
    const ids = matchLeadToId(lead);
    const idsLower = ids.map(id => id.toLowerCase().trim());
    for (const id of idsLower) {
      if (verifiedIds.has(id)) return 'verified';
    }
    for (const id of idsLower) {
      if (weakMatchIds.has(id)) return 'weak_match';
    }
    return defaultBadgeStatus;
  }

  const hasWebsiteEvidenceConstraint = Array.isArray(constraintsExtracted?.constraints) &&
    constraintsExtracted!.constraints!.some(c =>
      c.kind === 'website_evidence' ||
      (c.field || '').toLowerCase() === 'website'
    );
  const verificationPolicy: string | null = (constraintsExtracted as any)?.verification_policy ?? null;
  const showEvidenceBadges =
    hasWebsiteEvidenceConstraint ||
    (verificationPolicy !== null && verificationPolicy !== 'DIRECTORY_VERIFIED') ||
    hasVerificationData;

  function effectiveGetLeadBadgeStatus(lead: DeliveryLead): LeadBadgeStatus {
    return showEvidenceBadges ? getLeadBadgeStatus(lead) : 'none';
  }

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

  const hasUnknownAttributeConstraints = (() => {
    if (!isFinalDeliveryPass || isTrustFailure) return false;
    if (!constraintsExtracted?.constraints?.length) return false;
    if (!verificationSummary?.constraint_results?.length) return false;
    const attrConstraintIds = new Set(
      constraintsExtracted.constraints
        .filter(c => (c.kind || '').toLowerCase() === 'has_attribute' || (c.field || '').toLowerCase() === 'attribute')
        .map(c => c.id)
    );
    if (attrConstraintIds.size === 0) return false;
    const attrResults = verificationSummary.constraint_results.filter(r => attrConstraintIds.has(r.constraint_id));
    return attrResults.length > 0 && attrResults.every(r => r.status === 'unknown');
  })();

  const useLocationBuckets = hasLocationStatusData(allLeads);
  const locationBuckets = useLocationBuckets ? splitLeadsByLocationStatus(allLeads) : null;
  const matchSetLower = new Set<string>();
  if (useLocationBuckets) {
    matches.forEach(lead => {
      matchLeadToId(lead).forEach(id => matchSetLower.add(id.toLowerCase().trim()));
    });
  }

  /* PHASE_6: Build lookup map for lead_verification entries by lead ID/name */
  const leadVerificationMap = useMemo(() => {
    const map = new Map<string, import("@/components/results/CvlArtefactViews").LeadVerificationEntry>();
    if (!leadVerifications) return map;
    for (const entry of leadVerifications) {
      if (entry.lead_place_id) map.set(entry.lead_place_id.toLowerCase().trim(), entry);
      if (entry.lead_id) map.set(entry.lead_id.toLowerCase().trim(), entry);
      if (entry.lead_name) map.set(entry.lead_name.toLowerCase().trim(), entry);
    }
    return map;
  }, [leadVerifications]);

  /* PHASE_6: Look up lead_verification entry for a given lead */
  function findLeadVerification(lead: DeliveryLead): import("@/components/results/CvlArtefactViews").LeadVerificationEntry | null {
    const ids = matchLeadToId(lead);
    for (const id of ids) {
      const entry = leadVerificationMap.get(id.toLowerCase().trim());
      if (entry) return entry;
    }
    return null;
  }

  /* PHASE_6: Ensure no green on runs with zero verified leads */
  const hasZeroVerifiedLeads = hasVerificationData && verifiedIds.size === 0 && matches.length === 0;
  if (hasZeroVerifiedLeads && effectiveCanonical.status === 'PASS') {
    effectiveCanonical = { status: "PARTIAL", stop_reason: null };
  }

  console.log(`[RunResultBubble] render: status=${effectiveCanonical.status} (raw=${canonical.status}), verifiedExact=${verifiedExact}, requested=${target.hasTarget ? target.targetCount : 'any'}, allLeads=${allLeads.length}, matches=${matches.length}, candidates=${candidates.length}, hasVerificationData=${hasVerificationData}, hasReceiptAttrData=${hasReceiptAttrData}, hasSemanticData=${hasSemanticData}, leadVerifications=${leadVerifications?.length ?? 'none'}, semanticJudgements=${semanticJudgements?.length ?? 'none'}, verifiedIds=${verifiedIds.size}, weakMatchIds=${weakMatchIds.size}, hasUnverifiedLeads=${hasUnverifiedLeads}, defaultBadgeStatus=${defaultBadgeStatus}, useLocationBuckets=${useLocationBuckets}, renderBranch=${provisional ? 'provisional' : useLocationBuckets ? 'location-buckets' : hasReceiptAttrData ? 'receipt-attrs' : 'default'}`);

  const attrOutcomes = buildAttributeOutcomes(constraintsExtracted, leadVerifications);

  const receiptAttrs = runReceipt?.outcomes?.attributes;
  const receiptAttrMatchIds = new Set<string>();
  if (Array.isArray(receiptAttrs)) {
    for (const ra of receiptAttrs) {
      if (Array.isArray(ra.matched_place_ids)) {
        for (const pid of ra.matched_place_ids) receiptAttrMatchIds.add(pid);
      }
    }
  }

  const hasReceiptAttributes = Array.isArray(receiptAttrs) && receiptAttrs.length > 0;
  const effectiveAttrOutcomes = hasReceiptAttributes
    ? receiptAttrs!.map(ra => ({
        attribute_raw: ra.attribute_raw,
        matched_count: ra.matched_count,
        unknown_count: ra.unknown_count ?? 0,
        total_checked: ra.matched_count + (ra.unknown_count ?? 0),
        matched_lead_ids: ra.matched_place_ids ?? [],
      } satisfies AttributeOutcome))
    : attrOutcomes;

  const narrative = !provisional ? buildRunNarrative(deliverySummary, searchQueryCompiled, constraintsExtracted, towerVerdict, contactCounts, effectiveAttrOutcomes, hasReceiptAttributes, hasVerificationData ? matches.length : undefined) : null;

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

      {!provisional && deliverySummary.stop_reason === 'still_working' && !hasResults && (
        <StillWorkingBlock />
      )}

      {!provisional && deliverySummary.stop_reason === 'artefacts_unavailable' && !hasResults && (
        <ArtefactsRetryBlock runId={runId} />
      )}

      {!provisional && (deliverySummary.stop_reason === 'run_timeout' || deliverySummary.stop_reason === 'run_not_persisted') && !hasResults && (
        <RunTimeoutBlock stopReason={deliverySummary.stop_reason} />
      )}

      {/* PHASE_6: Prominent stop-reason with failing constraint details */}
      {!provisional && effectiveCanonical.status === 'STOP' && deliverySummary.stop_reason && deliverySummary.stop_reason !== 'still_working' && deliverySummary.stop_reason !== 'artefacts_unavailable' && deliverySummary.stop_reason !== 'run_timeout' && deliverySummary.stop_reason !== 'run_not_persisted' && (
        <FailingConstraintBanner deliverySummary={deliverySummary} />
      )}

      {!provisional && isTrustFailure && !hasReceiptAttributes && deliverySummary.stop_reason !== 'artefacts_unavailable' && deliverySummary.stop_reason !== 'run_timeout' && deliverySummary.stop_reason !== 'run_not_persisted' && deliverySummary.stop_reason !== 'still_working' && (
        <TrustErrorBlock verdict={effectiveTowerDisplay || deliverySummary.status || 'FAIL'} runId={runId} />
      )}

      {!provisional && isTrustFailure && hasReceiptAttributes && deliverySummary.stop_reason !== 'artefacts_unavailable' && deliverySummary.stop_reason !== 'still_working' && (
        <div className="flex items-center gap-1.5 rounded px-2 py-1 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 w-fit">
          <AlertTriangle className="h-3 w-3 text-amber-500 dark:text-amber-400 shrink-0" />
          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Tower: {(effectiveTowerDisplay || 'FAIL').toUpperCase()}</span>
        </div>
      )}

      {!provisional && !isTrustFailure && isMixedVerdict && deliverySummary.stop_reason !== 'artefacts_unavailable' && (
        <div className="flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
            Some steps failed verification, but the run completed. Results may be partially unverified.
          </p>
        </div>
      )}

      {!provisional && !isTrustFailure && !isMixedVerdict && hasUnknownAttributeConstraints && !hasReceiptAttributes && (
        <div className="flex items-center gap-2 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2">
          <ShieldQuestion className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
          <p className="text-xs text-blue-700 dark:text-blue-300 font-medium">
            I found results, but I couldn't verify which ones mention {unverifiableAttr ? `"${unverifiableAttr}"` : 'this attribute'} on their website.
          </p>
        </div>
      )}

      {!provisional && narrative && (deliverySummary.stop_reason !== 'artefacts_unavailable' || hasResults) && (deliverySummary.stop_reason !== 'still_working' || hasResults) && (
        <>
          <HumanSummary narrative={narrative} />
          <ReceiptInlineLine narrative={narrative} runReceipt={runReceipt} />
        </>
      )}

      {/* PHASE_6: All LeadRow calls now pass leadVerificationEntry for per-constraint breakdown */}
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
                  <LeadRow key={i} lead={lead} isVerified={hasVerificationData && (isLeadInMatchSet(lead, matchSetLower) || matchSetLower.size === 0)} unverifiableAttr={null} runId={runId} showLocationBadge badgeStatus={hasVerificationData ? getLeadBadgeStatus(lead) : 'none'} leadVerificationEntry={findLeadVerification(lead)} />
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
                  <LeadRow key={i} lead={lead} isVerified={hasVerificationData && isLeadInMatchSet(lead, matchSetLower)} unverifiableAttr={null} runId={runId} showLocationBadge badgeStatus={hasVerificationData ? getLeadBadgeStatus(lead) : 'none'} leadVerificationEntry={findLeadVerification(lead)} />
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
                  <LeadRow key={i} lead={lead} isVerified={false} unverifiableAttr={null} runId={runId} showLocationBadge badgeStatus={hasVerificationData ? getLeadBadgeStatus(lead) : 'none'} leadVerificationEntry={findLeadVerification(lead)} />
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
                  <LeadRow key={i} lead={lead} isVerified={hasVerificationData && isLeadInMatchSet(lead, matchSetLower)} unverifiableAttr={hasVerificationData && isLeadInMatchSet(lead, matchSetLower) ? null : (hasVerificationData ? unverifiableAttr : null)} runId={runId} showLocationBadge badgeStatus={hasVerificationData ? getLeadBadgeStatus(lead) : 'none'} leadVerificationEntry={findLeadVerification(lead)} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {!provisional && !useLocationBuckets && hasReceiptAttributes && (() => {
        if (receiptAttrMatchIds.size === 0) {
          return allLeads.length > 0 ? (
            <div className="space-y-0.5">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Results ({allLeads.length})
              </h4>
              <div>
                {allLeads.map((lead, i) => (
                  <LeadRow key={i} lead={lead} isVerified={false} unverifiableAttr={unverifiableAttr} runId={runId} badgeStatus={getLeadBadgeStatus(lead)} leadVerificationEntry={findLeadVerification(lead)} />
                ))}
              </div>
            </div>
          ) : null;
        }
        const getLeadId = (l: any) => l.place_id || l.id || '';
        const anyMatchedIds = new Set<string>();
        for (const ra of receiptAttrs!) {
          for (const pid of ra.matched_place_ids ?? []) anyMatchedIds.add(pid);
        }
        const remaining = allLeads.filter(l => !anyMatchedIds.has(getLeadId(l)));
        return (
          <>
            {receiptAttrs!.map((ra, attrIdx) => {
              const matchSet = new Set(ra.matched_place_ids ?? []);
              const sectionLeads = allLeads.filter(l => matchSet.has(getLeadId(l)));
              if (sectionLeads.length === 0) return null;
              return (
                <div key={attrIdx} className="space-y-0.5">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Verified &mdash; mentions &lsquo;{ra.attribute_raw}&rsquo; ({sectionLeads.length})
                  </h4>
                  <div>
                    {sectionLeads.map((lead, i) => (
                      <LeadRow key={i} lead={lead} isVerified={true} unverifiableAttr={null} runId={runId} badgeStatus={getLeadBadgeStatus(lead)} leadVerificationEntry={findLeadVerification(lead)} />
                    ))}
                  </div>
                </div>
              );
            })}
            {remaining.length > 0 && (
              <CollapsedCandidates leads={remaining} unverifiableAttr={unverifiableAttr} runId={runId} getLeadBadgeStatus={getLeadBadgeStatus} findLeadVerification={findLeadVerification} />
            )}
          </>
        );
      })()}

      {!provisional && !useLocationBuckets && !hasReceiptAttributes && matches.length > 0 && (
        <div className="space-y-0.5">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {hasVerificationData ? `Verified matches (${matches.length})` : `Results (${matches.length})`}
          </h4>
          <div>
            {matches.map((lead, i) => (
              <LeadRow key={i} lead={lead} isVerified={hasVerificationData} unverifiableAttr={null} runId={runId} badgeStatus={hasVerificationData ? getLeadBadgeStatus(lead) : 'none'} leadVerificationEntry={findLeadVerification(lead)} />
            ))}
          </div>
        </div>
      )}

      {!provisional && !useLocationBuckets && !hasReceiptAttributes && candidates.length > 0 && (
        hasVerificationData && matches.length > 0 ? (
          <CollapsedCandidates leads={candidates} unverifiableAttr={unverifiableAttr} runId={runId} getLeadBadgeStatus={getLeadBadgeStatus} findLeadVerification={findLeadVerification} />
        ) : (
          <div className="space-y-0.5">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Results ({candidates.length})</h4>
            <div>
              {candidates.map((lead, i) => (
                <LeadRow key={i} lead={lead} isVerified={false} unverifiableAttr={unverifiableAttr} runId={runId} badgeStatus={getLeadBadgeStatus(lead)} leadVerificationEntry={findLeadVerification(lead)} />
              ))}
            </div>
          </div>
        )
      )}

      {!provisional && narrative && (deliverySummary.stop_reason !== 'still_working' || hasResults) && (
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
          towerLabel={towerLabel}
          towerProxyUsed={towerProxyUsed}
          towerUnavailable={towerUnavailable}
          runId={runId}
          narrative={narrative}
          runReceipt={runReceipt}
        />
      )}

      {!provisional && (deliverySummary.stop_reason !== 'still_working' || hasResults) && <NextActionButtons ds={deliverySummary} canonical={effectiveCanonical} runId={runId} hasTarget={target.hasTarget} />}

      {!provisional && (!isTrustFailure || hasReceiptAttributes) && (deliverySummary.stop_reason !== 'still_working' || hasResults) && (
        <FeedbackButtons runId={runId} />
      )}
    </div>
  );
}
