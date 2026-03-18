import { useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import type { PolicySnapshot } from "@/components/results/RunResultBubble";
import type { PolicyApplied } from "@/utils/policyFormatters";
import { getSourceBadge, getPolicyKnobLabel, formatPolicyValue } from "@/utils/policyFormatters";

export interface PreRunBannerProps {
  policySnapshot?: PolicySnapshot | null;
  policyApplied?: PolicyApplied | null;
  loading?: boolean;
}

export function PreRunBanner({ policySnapshot, policyApplied, loading }: PreRunBannerProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (!policySnapshot && !policyApplied && !loading) return null;

  const hasSnapshot = policySnapshot && policySnapshot.why_short;
  const learnedUsed = policyApplied?.learned_used === true;

  return (
    <div className="rounded-lg border border-blue-200 dark:border-blue-800/50 bg-blue-50/50 dark:bg-blue-950/30 px-3 py-2.5 space-y-1.5">
      <div className="flex items-center gap-2">
        <BookOpen className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
        <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
          Why this approach
        </span>
        {loading && !hasSnapshot && !policyApplied && (
          <Loader2 className="h-3 w-3 animate-spin text-blue-500 dark:text-blue-400" />
        )}
      </div>
      {hasSnapshot ? (
        <>
          <p className="text-xs text-foreground/80 leading-snug pl-5">
            {policySnapshot.why_short.split("\n").filter(Boolean).slice(0, 2).join(". ")}
          </p>
          {policySnapshot.max_replans != null && (
            <p className="text-xs text-foreground/70 leading-snug pl-5">
              Replan ceiling: {policySnapshot.max_replans}
            </p>
          )}
          {policyApplied && (
            <CompactPolicyLine policyApplied={policyApplied} />
          )}
          {policySnapshot.applied_policies && policySnapshot.applied_policies.length > 0 && (
            <>
              <button
                className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors pl-5"
                onClick={() => setDetailsOpen(!detailsOpen)}
              >
                {detailsOpen ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
                Applied policies ({policySnapshot.applied_policies.length})
              </button>
              {detailsOpen && (
                <div className="ml-5 pl-2 border-l border-blue-200 dark:border-blue-800/50 space-y-0.5">
                  {policySnapshot.applied_policies.map((ap, i) => (
                    <div key={i} className="text-[11px] text-muted-foreground leading-snug">
                      {ap.rule_text || ap.policy_id || `Policy ${i + 1}`}
                      {ap.source && <span className="ml-1 opacity-60">({ap.source})</span>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      ) : policyApplied ? (
        <CompactPolicyLine policyApplied={policyApplied} />
      ) : loading ? (
        <p className="text-xs text-foreground/60 leading-snug pl-5">
          Loading run settings…
        </p>
      ) : null}

      {!learnedUsed && !loading && (policyApplied || hasSnapshot) && !policyApplied?.learned_used && policyApplied != null && (
        <p className="text-[10px] text-muted-foreground pl-5">Using default settings</p>
      )}
    </div>
  );
}

function CompactPolicyLine({ policyApplied }: { policyApplied: PolicyApplied }) {
  const fp = policyApplied.final_policy;
  const sources = policyApplied.knob_sources || {};
  const displayKnobs = ["result_count", "verification_level", "search_budget_pages", "radius_escalation"];
  const knobs = displayKnobs.filter(k => fp[k] != null);

  if (knobs.length === 0) return null;

  return (
    <div className="pl-5 space-y-1">
      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Applied policy</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {knobs.map(k => {
          const badge = getSourceBadge(sources[k] || "default");
          return (
            <span key={k} className="inline-flex items-center gap-1 text-[11px] text-foreground/80">
              <span>{getPolicyKnobLabel(k)}:</span>
              <span className="font-medium">{formatPolicyValue(fp[k])}</span>
              <span className={`inline-flex items-center px-1 py-px rounded text-[9px] font-medium ${badge.className}`}>
                {badge.label}
              </span>
            </span>
          );
        })}
      </div>
      {policyApplied.learned_used && policyApplied.source_run_ids && policyApplied.source_run_ids.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          Learned from {policyApplied.source_run_ids.length} prior run{policyApplied.source_run_ids.length > 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
