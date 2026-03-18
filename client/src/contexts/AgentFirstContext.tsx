/**
 * AgentFirstContext - Feature flag for Agent-First UI Architecture
 * 
 * Controls whether to show:
 * - Old UI: Traditional sidebar + chat layout
 * - New UI: Split-screen agent-first layout (40/60 split)
 * 
 * Stored in localStorage for persistence.
 */

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface AgentFirstContextType {
  isAgentFirstEnabled: boolean;
  setAgentFirstEnabled: (enabled: boolean) => void;
  toggleAgentFirst: () => void;
}

const AgentFirstContext = createContext<AgentFirstContextType | undefined>(undefined);

const STORAGE_KEY = "wyshbone_agent_first_ui";

export function AgentFirstProvider({ children }: { children: ReactNode }) {
  const [isAgentFirstEnabled, setIsAgentFirstEnabled] = useState<boolean>(false);

  useEffect(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }, []);

  const setAgentFirstEnabled = (enabled: boolean) => {
    setIsAgentFirstEnabled(enabled);
  };

  const toggleAgentFirst = () => {
    setIsAgentFirstEnabled((prev) => !prev);
  };

  return (
    <AgentFirstContext.Provider
      value={{
        isAgentFirstEnabled,
        setAgentFirstEnabled,
        toggleAgentFirst,
      }}
    >
      {children}
    </AgentFirstContext.Provider>
  );
}

export function useAgentFirst(): AgentFirstContextType {
  const context = useContext(AgentFirstContext);
  if (!context) {
    throw new Error("useAgentFirst must be used within an AgentFirstProvider");
  }
  return context;
}

export function useIsAgentFirstEnabled(): boolean {
  const { isAgentFirstEnabled } = useAgentFirst();
  return isAgentFirstEnabled;
}


