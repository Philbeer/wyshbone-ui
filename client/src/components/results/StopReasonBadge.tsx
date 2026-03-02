import { useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { mapStopReason } from "@/utils/stopReasonMap";

export interface StopReasonBadgeProps {
  stopReason: string | { message?: string; code?: string } | null | undefined;
}

export function StopReasonBadge({ stopReason }: StopReasonBadgeProps) {
  const [showRaw, setShowRaw] = useState(false);
  const mapped = mapStopReason(stopReason);

  if (!mapped) return null;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="text-xs font-medium text-foreground/80">{mapped.label}</span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug pl-[18px]">
        {mapped.description}
      </p>
      {mapped.rawCode && mapped.rawCode !== mapped.label && (
        <button
          className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors pl-[18px]"
          onClick={() => setShowRaw(!showRaw)}
        >
          {showRaw ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
          Raw code
        </button>
      )}
      {showRaw && (
        <code className="block text-[10px] text-muted-foreground bg-muted/50 rounded px-2 py-1 ml-[18px] font-mono break-all">
          {mapped.rawCode}
        </code>
      )}
    </div>
  );
}
