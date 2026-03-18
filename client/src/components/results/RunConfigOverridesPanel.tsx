import { useState } from "react";
import { Settings2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface RunConfigOverrides {
  speed_mode?: "faster" | "balanced" | "stricter";
  replan_ceiling?: number;
  ignore_learned_policy?: boolean;
}

export interface RunConfigOverridesPanelProps {
  overrides: RunConfigOverrides;
  onChange: (overrides: RunConfigOverrides) => void;
}

const SPEED_OPTIONS: { value: RunConfigOverrides["speed_mode"]; label: string; description: string }[] = [
  { value: "faster", label: "Faster", description: "Fewer verification passes, quicker results" },
  { value: "balanced", label: "Balanced", description: "Default verification depth" },
  { value: "stricter", label: "Stricter", description: "More thorough verification, takes longer" },
];

export function RunConfigOverridesPanel({ overrides, onChange }: RunConfigOverridesPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const hasOverrides = overrides.speed_mode !== "balanced" ||
    overrides.replan_ceiling !== undefined ||
    overrides.ignore_learned_policy;

  return (
    <div className="space-y-1.5">
      <button
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <Settings2 className="h-3.5 w-3.5" />
        <span>Run overrides</span>
        {hasOverrides && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            active
          </span>
        )}
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {expanded && (
        <div className="pl-5 space-y-3 py-1">
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-foreground/70 uppercase tracking-wide">
              Speed / Thoroughness
            </label>
            <div className="flex gap-1">
              {SPEED_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  variant={overrides.speed_mode === opt.value ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs flex-1"
                  onClick={() => onChange({ ...overrides, speed_mode: opt.value })}
                  title={opt.description}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-foreground/70 uppercase tracking-wide">
              Replan ceiling (0-3)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={3}
                step={1}
                value={overrides.replan_ceiling ?? 3}
                onChange={(e) =>
                  onChange({ ...overrides, replan_ceiling: parseInt(e.target.value, 10) })
                }
                className="flex-1 h-1.5 accent-primary"
              />
              <span className="text-xs font-mono text-foreground/70 w-4 text-center">
                {overrides.replan_ceiling ?? 3}
              </span>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={overrides.ignore_learned_policy || false}
              onChange={(e) =>
                onChange({ ...overrides, ignore_learned_policy: e.target.checked })
              }
              className="rounded border-border accent-primary"
            />
            <span className="text-xs text-foreground/70">
              Ignore learned policy for this run
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
