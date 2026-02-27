import { useState, useEffect, useCallback } from "react";
import { Zap, Shield } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type GoogleQueryMode = "TEXT_ONLY" | "BIASED_STABLE";

const STORAGE_KEY = "wyshbone.google_query_mode";

export function getGoogleQueryMode(): GoogleQueryMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "TEXT_ONLY" || stored === "BIASED_STABLE") return stored;
  } catch {}
  return "BIASED_STABLE";
}

export function GoogleQueryModeToggle() {
  const [mode, setMode] = useState<GoogleQueryMode>(getGoogleQueryMode);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, mode); } catch {}
  }, [mode]);

  const toggle = useCallback(() => {
    setMode((prev) => (prev === "TEXT_ONLY" ? "BIASED_STABLE" : "TEXT_ONLY"));
  }, []);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={toggle}
          className={cn(
            "h-7 rounded-md flex items-center gap-1 px-1.5 transition-all duration-150",
            "bg-muted/60 hover:bg-muted border border-border/50"
          )}
        >
          <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap hidden lg:inline">Google Query:</span>
          <div className="flex rounded-sm overflow-hidden border border-border/40">
            <span
              className={cn(
                "px-1.5 py-0.5 text-[10px] font-medium transition-colors cursor-pointer",
                mode === "TEXT_ONLY"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={(e) => { e.stopPropagation(); setMode("TEXT_ONLY"); }}
            >
              <Zap className="h-2.5 w-2.5 inline mr-0.5 -mt-px" />Fast
            </span>
            <span
              className={cn(
                "px-1.5 py-0.5 text-[10px] font-medium transition-colors cursor-pointer",
                mode === "BIASED_STABLE"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={(e) => { e.stopPropagation(); setMode("BIASED_STABLE"); }}
            >
              <Shield className="h-2.5 w-2.5 inline mr-0.5 -mt-px" />Stable
            </span>
          </div>
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        className="bg-popover border border-border shadow-lg"
      >
        <span className="text-xs">
          Google Query Mode: {mode === "TEXT_ONLY" ? "Fast (TEXT_ONLY)" : "Stable (BIASED_STABLE)"}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
