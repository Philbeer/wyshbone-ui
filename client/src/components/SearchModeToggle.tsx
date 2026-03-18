import { useState, useCallback } from "react";
import { MapPin, Sparkles } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type SearchMode = "gp_cascade" | "gpt4o_primary";

let _currentSearchMode: SearchMode = "gp_cascade";

export function getSearchMode(): SearchMode {
  return _currentSearchMode;
}

export function SearchModeToggle() {
  const [mode, setMode] = useState<SearchMode>("gp_cascade");

  const handleSet = useCallback((next: SearchMode) => {
    setMode(next);
    _currentSearchMode = next;
  }, []);

  const toggle = useCallback(() => {
    handleSet(mode === "gp_cascade" ? "gpt4o_primary" : "gp_cascade");
  }, [mode, handleSet]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={toggle}
          className={cn(
            "h-7 rounded-md flex items-center gap-1 px-1.5 transition-all duration-150",
            "bg-muted/60 hover:bg-muted border border-border/50"
          )}
          data-testid="search-mode-toggle"
        >
          <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap hidden lg:inline">
            Search Mode:
          </span>
          <div className="flex rounded-sm overflow-hidden border border-border/40">
            <span
              className={cn(
                "px-1.5 py-0.5 text-[10px] font-medium transition-colors cursor-pointer",
                mode === "gp_cascade"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={(e) => { e.stopPropagation(); handleSet("gp_cascade"); }}
              data-testid="search-mode-gp"
            >
              <MapPin className="h-2.5 w-2.5 inline mr-0.5 -mt-px" />GP
            </span>
            <span
              className={cn(
                "px-1.5 py-0.5 text-[10px] font-medium transition-colors cursor-pointer",
                mode === "gpt4o_primary"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={(e) => { e.stopPropagation(); handleSet("gpt4o_primary"); }}
              data-testid="search-mode-gpt4o"
            >
              <Sparkles className="h-2.5 w-2.5 inline mr-0.5 -mt-px" />GPT-4o
            </span>
          </div>
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        className="bg-popover border border-border shadow-lg"
      >
        <span className="text-xs">
          Search Mode:{" "}
          {mode === "gp_cascade"
            ? "Google Places (gp_cascade) — current pipeline"
            : "GPT-4o Search (gpt4o_primary) — AI-driven discovery & verification"}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
