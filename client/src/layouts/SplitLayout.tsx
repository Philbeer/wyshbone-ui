/**
 * SplitLayout - Desktop split-screen layout (Agent First Architecture)
 * 
 * Left Panel (40%): Agent chat interface - always visible
 * Right Panel (60%): Contextual workspace (CRM, activity, etc.)
 * 
 * Both panels scroll independently. The left panel has the agent status
 * always visible at the top.
 */

import { ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface SplitLayoutProps {
  children: ReactNode;
  className?: string;
}

export function SplitLayout({ children, className }: SplitLayoutProps) {
  const isMobile = useIsMobile();

  // On mobile, we don't use split layout - mobile has its own layout
  if (isMobile) {
    return <>{children}</>;
  }

  return (
    <div className={cn("flex h-full w-full overflow-hidden", className)}>
      {/* Left Panel - deprecated AgentChatPanel (hidden unless dev flag set) */}
      <div className="w-[40%] min-w-[320px] max-w-[500px] border-r border-border flex flex-col bg-sidebar">
        <div className="flex flex-col h-full items-center justify-center p-6 text-muted-foreground text-center gap-2">
          <span className="text-sm font-medium">Agent Panel (deprecated)</span>
          <span className="text-xs">This layout is no longer active.</span>
        </div>
      </div>

      {/* Right Panel - Contextual Workspace (60%) */}
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col bg-background">
        {children}
      </div>
    </div>
  );
}

export default SplitLayout;


