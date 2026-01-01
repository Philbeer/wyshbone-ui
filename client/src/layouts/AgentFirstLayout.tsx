/**
 * AgentFirstLayout - The main responsive layout wrapper for Agent-First UI
 * 
 * Desktop (>768px):
 * - Split-screen: Left panel (40%) = Agent Chat, Right panel (60%) = Workspace
 * 
 * Mobile (<=768px):
 * - Full-screen agent chat with bottom navigation
 * - CRM accessible but with desktop prompt
 */

import { ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { AgentChatPanel } from "@/components/agent/AgentChatPanel";
import { MobileLayout } from "./MobileLayout";
import { cn } from "@/lib/utils";

interface AgentFirstLayoutProps {
  children: ReactNode;
  className?: string;
  onSendMessage?: (message: string) => void;
}

export function AgentFirstLayout({ 
  children, 
  className,
  onSendMessage 
}: AgentFirstLayoutProps) {
  const isMobile = useIsMobile();

  // Mobile Layout
  if (isMobile) {
    return (
      <MobileLayout className={className}>
        {children}
      </MobileLayout>
    );
  }

  // Desktop Split-Screen Layout
  return (
    <div className={cn("agent-split-layout", className)}>
      {/* Left Panel - Agent Chat (40%) */}
      <div className="agent-left-panel">
        <AgentChatPanel onSendMessage={onSendMessage} />
      </div>

      {/* Right Panel - Contextual Workspace (60%) */}
      <div className="agent-right-panel">
        {children}
      </div>
    </div>
  );
}

export default AgentFirstLayout;


