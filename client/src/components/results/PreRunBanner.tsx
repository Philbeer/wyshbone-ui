import { useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import type { PolicySnapshot } from "@/components/results/RunResultBubble";

export interface PreRunBannerProps {
  policySnapshot?: PolicySnapshot | null;
  loading?: boolean;
}

export function PreRunBanner({ policySnapshot, loading }: PreRunBannerProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (!policySnapshot && !loading) return null;

  const hasSnapshot = policySnapshot && policySnapshot.why_short;

  return (
    <div className="rounded-lg border border-blue-200 dark:border-blue-800/50 bg-blue-50/50 dark:bg-blue-950/30 px-3 py-2.5 space-y-1.5">
      <div className="flex items-center gap-2">
        <BookOpen className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
        <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
          Why this approach
        </span>
        {loading && !hasSnapshot && (
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
      ) : (
        <p className="text-xs text-foreground/60 leading-snug pl-5">
          Using learned settings for this query shape (will show details when ready).
        </p>
      )}
    </div>
  );
}
