import { useState } from "react";
import { RefreshCw, Layout, Bot } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAgentFirst } from "@/contexts/AgentFirstContext";
import { cn } from "@/lib/utils";

interface LayoutToggleProps {
  variant?: "floating" | "inline";
}

export function LayoutToggle({ variant = "floating" }: LayoutToggleProps) {
  const { isAgentFirstEnabled, toggleAgentFirst } = useAgentFirst();
  const [isToggling, setIsToggling] = useState(false);

  const handleToggle = () => {
    setIsToggling(true);
    toggleAgentFirst();
    setTimeout(() => {
      window.location.reload();
    }, 300);
  };

  const button = (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={handleToggle}
          disabled={isToggling}
          className={cn(
            "h-7 rounded-md flex items-center justify-center transition-all duration-200",
            "bg-muted/60 hover:bg-muted border border-border/50",
            variant === "inline"
              ? "gap-1.5 px-2 opacity-100"
              : "w-7 opacity-50 hover:opacity-100",
            isToggling && "animate-spin"
          )}
        >
          {isToggling ? (
            <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
          ) : isAgentFirstEnabled ? (
            <Bot className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <Layout className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          {variant === "inline" && !isToggling && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {isAgentFirstEnabled ? "Classic" : "Agent-First"}
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent 
        side={variant === "inline" ? "bottom" : "left"}
        className="bg-popover border border-border shadow-lg"
      >
        <span className="text-xs">
          {isAgentFirstEnabled ? "Switch to Classic" : "Switch to Agent-First"}
        </span>
      </TooltipContent>
    </Tooltip>
  );

  if (variant === "inline") {
    return button;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {button}
    </div>
  );
}

export default LayoutToggle;
