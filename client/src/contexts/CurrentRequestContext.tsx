import { createContext, useContext, useState, useCallback, type ReactNode, type SetStateAction, type Dispatch } from "react";

const MAX_RECENT_RUNS = 5;

interface RunEntry {
  crid: string;
  label: string;
  startedAt: number;
}

interface CurrentRequestContextType {
  currentClientRequestId: string | null;
  setCurrentClientRequestId: Dispatch<SetStateAction<string | null>>;
  pinnedClientRequestId: string | null;
  setPinnedClientRequestId: Dispatch<SetStateAction<string | null>>;
  lastCompletedClientRequestId: string | null;
  setLastCompletedClientRequestId: Dispatch<SetStateAction<string | null>>;
  recentRuns: RunEntry[];
  addRecentRun: (crid: string, label?: string) => void;
  clearRecentRuns: () => void;
  userPinned: boolean;
  setUserPinned: Dispatch<SetStateAction<boolean>>;
}

const CurrentRequestContext = createContext<CurrentRequestContextType | null>(null);

export function CurrentRequestProvider({ children }: { children: ReactNode }) {
  const [currentClientRequestId, setCurrentClientRequestId] = useState<string | null>(null);
  const [pinnedClientRequestId, setPinnedClientRequestId] = useState<string | null>(null);
  const [lastCompletedClientRequestId, setLastCompletedClientRequestId] = useState<string | null>(null);
  const [recentRuns, setRecentRuns] = useState<RunEntry[]>([]);
  const [userPinned, setUserPinned] = useState(false);

  const addRecentRun = useCallback((crid: string, label?: string) => {
    setRecentRuns(prev => {
      if (prev.some(r => r.crid === crid)) return prev;
      const entry: RunEntry = {
        crid,
        label: label || `Run ${prev.length + 1}`,
        startedAt: Date.now(),
      };
      const updated = [entry, ...prev];
      return updated.slice(0, MAX_RECENT_RUNS);
    });
  }, []);

  const clearRecentRuns = useCallback(() => {
    setRecentRuns([]);
    setUserPinned(false);
  }, []);
  
  return (
    <CurrentRequestContext.Provider value={{
      currentClientRequestId, setCurrentClientRequestId,
      pinnedClientRequestId, setPinnedClientRequestId,
      lastCompletedClientRequestId, setLastCompletedClientRequestId,
      recentRuns, addRecentRun, clearRecentRuns,
      userPinned, setUserPinned,
    }}>
      {children}
    </CurrentRequestContext.Provider>
  );
}

export function useCurrentRequest() {
  const context = useContext(CurrentRequestContext);
  if (!context) {
    throw new Error("useCurrentRequest must be used within a CurrentRequestProvider");
  }
  return context;
}
