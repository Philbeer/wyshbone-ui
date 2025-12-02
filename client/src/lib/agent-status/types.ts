/**
 * Agent Status Types
 * 
 * Defines the possible states of the AI agent in the UI.
 */

export type AgentStatus = "idle" | "thinking" | "running" | "error";

/**
 * Status metadata for display purposes
 */
export interface AgentStatusInfo {
  status: AgentStatus;
  label: string;
  colorClass: string;
  dotColorClass: string;
}

/**
 * Get display info for a given status
 */
export function getAgentStatusInfo(status: AgentStatus): AgentStatusInfo {
  switch (status) {
    case "idle":
      return {
        status,
        label: "Idle",
        colorClass: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
        dotColorClass: "bg-gray-500",
      };
    case "thinking":
      return {
        status,
        label: "Thinking",
        colorClass: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
        dotColorClass: "bg-blue-500",
      };
    case "running":
      return {
        status,
        label: "Running",
        colorClass: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
        dotColorClass: "bg-amber-500",
      };
    case "error":
      return {
        status,
        label: "Error",
        colorClass: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
        dotColorClass: "bg-red-500",
      };
  }
}

