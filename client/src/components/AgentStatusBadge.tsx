/**
 * AgentStatusBadge Component
 * 
 * A small pill/badge that shows the current agent state (Idle, Thinking, Running, Error).
 * Uses Tailwind for styling with a colored dot + text label.
 */

import { AgentStatus, getAgentStatusInfo } from "@/lib/agent-status";

interface AgentStatusBadgeProps {
  status: AgentStatus;
  className?: string;
}

export function AgentStatusBadge({ status, className = "" }: AgentStatusBadgeProps) {
  const info = getAgentStatusInfo(status);
  
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${info.colorClass} ${className}`}
      data-testid="agent-status-badge"
      data-status={status}
    >
      <span 
        className={`w-2 h-2 rounded-full mr-1.5 ${info.dotColorClass} ${
          status === "thinking" || status === "running" ? "animate-pulse" : ""
        }`}
      />
      {info.label}
    </span>
  );
}

export default AgentStatusBadge;

