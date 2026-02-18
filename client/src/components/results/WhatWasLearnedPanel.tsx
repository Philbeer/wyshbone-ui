import { Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RuleUpdate } from "@/types/afr";

interface WhatWasLearnedPanelProps {
  ruleUpdates: RuleUpdate[];
  maxItems?: number;
}

const CONFIDENCE_STYLE: Record<string, { label: string; className: string }> = {
  high: { label: "High confidence", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200" },
  med: { label: "Medium confidence", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200" },
  low: { label: "Low confidence", className: "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400" },
};

export function WhatWasLearnedPanel({ ruleUpdates, maxItems = 3 }: WhatWasLearnedPanelProps) {
  const active = ruleUpdates.filter(r => r.status === "active").slice(0, maxItems);

  if (active.length === 0) return null;

  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
          What was learned
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Insights gathered during this run.
        </p>
      </div>
      <div className="space-y-2">
        {active.map((rule) => {
          const conf = CONFIDENCE_STYLE[rule.confidence] || CONFIDENCE_STYLE.low;
          return (
            <div key={rule.id} className="rounded-lg border bg-card px-3 py-2.5 space-y-1.5">
              <p className="text-sm text-foreground leading-snug">{rule.rule_text}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium", conf.className)}>
                  {conf.label}
                </span>
                {rule.evidence_run_ids && rule.evidence_run_ids.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    Based on {rule.evidence_run_ids.length} run{rule.evidence_run_ids.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              {rule.reason && (
                <p className="text-[11px] text-muted-foreground leading-snug">{rule.reason}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
