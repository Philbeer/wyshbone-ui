/**
 * AgentStatusContext
 * 
 * Provides global agent status tracking. Updates automatically based on:
 * - Plan creation → thinking
 * - Plan approval → running  
 * - Chat message triggers → thinking
 * - Completion or idle timeout → idle
 * - Errors → error
 * 
 * Uses the publishEvent/useEvent system for event-driven updates.
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { AgentStatus } from "@/lib/agent-status";
import { useEvent } from "@/lib/events";

interface AgentStatusContextType {
  status: AgentStatus;
  setStatus: (status: AgentStatus) => void;
  setError: (message?: string) => void;
  clearError: () => void;
  errorMessage?: string;
}

const AgentStatusContext = createContext<AgentStatusContextType | undefined>(undefined);

// Auto-reset to idle after this many ms of inactivity
const IDLE_TIMEOUT_MS = 30000;

export function AgentStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatusInternal] = useState<AgentStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [idleTimeoutId, setIdleTimeoutId] = useState<NodeJS.Timeout | null>(null);

  // Clear any existing idle timeout
  const clearIdleTimeout = useCallback(() => {
    if (idleTimeoutId) {
      clearTimeout(idleTimeoutId);
      setIdleTimeoutId(null);
    }
  }, [idleTimeoutId]);

  // Set status with auto-idle timeout for transient states
  const setStatus = useCallback((newStatus: AgentStatus) => {
    clearIdleTimeout();
    setStatusInternal(newStatus);

    // Auto-reset to idle after timeout for thinking/running states
    if (newStatus === "thinking" || newStatus === "running") {
      const timeoutId = setTimeout(() => {
        setStatusInternal("idle");
      }, IDLE_TIMEOUT_MS);
      setIdleTimeoutId(timeoutId);
    }

    // Clear error when transitioning away from error state
    if (newStatus !== "error") {
      setErrorMessage(undefined);
    }
  }, [clearIdleTimeout]);

  const setError = useCallback((message?: string) => {
    clearIdleTimeout();
    setStatusInternal("error");
    setErrorMessage(message);

    // Auto-clear error after timeout
    const timeoutId = setTimeout(() => {
      setStatusInternal("idle");
      setErrorMessage(undefined);
    }, IDLE_TIMEOUT_MS);
    setIdleTimeoutId(timeoutId);
  }, [clearIdleTimeout]);

  const clearError = useCallback(() => {
    if (status === "error") {
      setStatus("idle");
    }
  }, [status, setStatus]);

  // Listen for PLAN_CREATED → thinking
  useEvent("PLAN_CREATED", () => {
    setStatus("thinking");
  });

  // Listen for PLAN_APPROVED → running
  useEvent("PLAN_APPROVED", () => {
    setStatus("running");
  });

  // Listen for PLAN_UPDATED → could indicate progress
  useEvent("PLAN_UPDATED", (event) => {
    if (event.payload.status === "completed" || event.payload.status === "failed") {
      setStatus(event.payload.status === "failed" ? "error" : "idle");
    } else if (event.payload.status === "executing") {
      setStatus("running");
    }
  });

  // Listen for CHAT_MESSAGE_SENT → thinking (agent is processing)
  useEvent("CHAT_MESSAGE_SENT", () => {
    setStatus("thinking");
  });

  // Listen for CHAT_MESSAGE_RECEIVED → idle (agent responded)
  useEvent("CHAT_MESSAGE_RECEIVED", () => {
    setStatus("idle");
  });

  // Listen for AGENT_STARTED → running
  useEvent("AGENT_STARTED", () => {
    setStatus("running");
  });

  // Listen for AGENT_STOPPED → idle or error
  useEvent("AGENT_STOPPED", (event) => {
    if (event.payload.reason === "error") {
      setError("Agent encountered an error");
    } else {
      setStatus("idle");
    }
  });

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (idleTimeoutId) {
        clearTimeout(idleTimeoutId);
      }
    };
  }, [idleTimeoutId]);

  const value: AgentStatusContextType = {
    status,
    setStatus,
    setError,
    clearError,
    errorMessage,
  };

  return (
    <AgentStatusContext.Provider value={value}>
      {children}
    </AgentStatusContext.Provider>
  );
}

/**
 * Hook to access agent status
 */
export function useAgentStatus(): AgentStatusContextType {
  const context = useContext(AgentStatusContext);
  if (!context) {
    throw new Error("useAgentStatus must be used within an AgentStatusProvider");
  }
  return context;
}

/**
 * Hook to get just the current status (convenience)
 */
export function useAgentStatusValue(): AgentStatus {
  const { status } = useAgentStatus();
  return status;
}

