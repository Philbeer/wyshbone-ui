import { useState } from "react";
import { ChevronDown, ChevronRight, History } from "lucide-react";

export interface PlanVersion {
  version: number;
  created_at: string;
  what_changed: string;
  replan_trigger?: string;
}

export interface PlanVersionTimelineProps {
  versions: PlanVersion[];
}

export function PlanVersionTimeline({ versions }: PlanVersionTimelineProps) {
  const [expanded, setExpanded] = useState(false);

  if (!versions || versions.length <= 1) return null;

  return (
    <div className="space-y-1 pt-1">
      <button
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <History className="h-3 w-3" />
        Plan versions ({versions.length})
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {expanded && (
        <div className="ml-1 border-l-2 border-border pl-3 space-y-2 py-1">
          {versions.map((v) => (
            <div key={v.version} className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                  v{v.version}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {new Date(v.created_at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="text-xs text-foreground/80 leading-snug ml-7">
                {v.what_changed}
              </p>
              {v.replan_trigger && (
                <p className="text-[11px] text-muted-foreground ml-7">
                  Trigger: {v.replan_trigger}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
