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
    <div className="fixed bottom-6 right-6 z-50">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={handleToggle}
            disabled={isToggling}
            size="lg"
            className={cn(
              "h-14 w-14 rounded-full shadow-lg transition-all duration-300",
              "hover:shadow-xl hover:scale-105",
              "bg-gradient-to-br",
              isAgentFirstEnabled 
                ? "from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70" 
                : "from-chart-1 to-chart-1/80 hover:from-chart-1/90 hover:to-chart-1/70",
              isToggling && "animate-spin"
            )}
          >
            {isToggling ? (
              <RefreshCw className="h-6 w-6 text-white" />
            ) : isAgentFirstEnabled ? (
              <Bot className="h-6 w-6 text-white" />
            ) : (
              <Layout className="h-6 w-6 text-white" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent 
          side="left" 
          className="bg-popover border border-border shadow-lg"
        >
          <div className="flex flex-col gap-1">
            <span className="font-medium">
              {isAgentFirstEnabled ? "Switch to Classic Layout" : "Switch to Agent-First Layout"}
            </span>
            <span className="text-xs text-muted-foreground">
              Currently: {isAgentFirstEnabled ? "Agent-First (Split Screen)" : "Classic (Sidebar)"}
            </span>
          </div>
        </TooltipContent>
      </Tooltip>
      
      {/* Current mode label - visible on larger screens */}
      <div className="hidden lg:flex absolute -left-32 top-1/2 -translate-y-1/2 items-center gap-2 opacity-60 hover:opacity-100 transition-opacity">
        <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
          {isAgentFirstEnabled ? "Agent-First" : "Classic"}
        </span>
      </div>
    </div>
  );
}

export default LayoutToggle;


