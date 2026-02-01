/**
 * LayoutToggle - Floating button to switch between Classic and Agent-First layouts
 * 
 * Fixed position in bottom-right corner, always visible.
 * Toggles localStorage setting and reloads the page.
 */

import { useState } from "react";
import { RefreshCw, Layout, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAgentFirst } from "@/contexts/AgentFirstContext";
import { cn } from "@/lib/utils";

export function LayoutToggle() {
  const { isAgentFirstEnabled, toggleAgentFirst } = useAgentFirst();
  const [isToggling, setIsToggling] = useState(false);

  const handleToggle = () => {
    setIsToggling(true);
    
    // Toggle the setting
    toggleAgentFirst();
    
    // Reload after a brief delay to show the animation
    setTimeout(() => {
      window.location.reload();
    }, 300);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleToggle}
            disabled={isToggling}
            className={cn(
              "h-7 w-7 rounded-md flex items-center justify-center transition-all duration-200",
              "bg-muted/60 hover:bg-muted border border-border/50",
              "opacity-50 hover:opacity-100",
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
          </button>
        </TooltipTrigger>
        <TooltipContent 
          side="left" 
          className="bg-popover border border-border shadow-lg"
        >
          <span className="text-xs">
            {isAgentFirstEnabled ? "Switch to Classic" : "Switch to Agent-First"}
          </span>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

export default LayoutToggle;


