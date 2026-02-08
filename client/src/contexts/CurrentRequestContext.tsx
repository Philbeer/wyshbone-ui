import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface CurrentRequestContextType {
  currentClientRequestId: string | null;
  setCurrentClientRequestId: (id: string | null) => void;
  pinnedClientRequestId: string | null;
  setPinnedClientRequestId: (id: string | null) => void;
  lastCompletedClientRequestId: string | null;
  setLastCompletedClientRequestId: (id: string | null) => void;
}

const CurrentRequestContext = createContext<CurrentRequestContextType | null>(null);

export function CurrentRequestProvider({ children }: { children: ReactNode }) {
  const [currentClientRequestId, _setCurrentClientRequestId] = useState<string | null>(null);
  const [pinnedClientRequestId, _setPinnedClientRequestId] = useState<string | null>(null);
  const [lastCompletedClientRequestId, _setLastCompletedClientRequestId] = useState<string | null>(null);
  
  const setCurrentClientRequestId = useCallback((id: string | null) => {
    console.log(`[ID_SET] setCurrentClientRequestId: ${id?.slice(0,8) ?? 'null'}`);
    console.trace('[ID_SET] setCurrentClientRequestId caller');
    _setCurrentClientRequestId(id);
  }, []);

  const setPinnedClientRequestId = useCallback((id: string | null) => {
    console.log(`[ID_SET] setPinnedClientRequestId: ${id?.slice(0,8) ?? 'null'}`);
    _setPinnedClientRequestId(id);
  }, []);

  const setLastCompletedClientRequestId = useCallback((id: string | null) => {
    console.log(`[ID_SET] setLastCompletedClientRequestId: ${id?.slice(0,8) ?? 'null'}`);
    _setLastCompletedClientRequestId(id);
  }, []);
  
  return (
    <CurrentRequestContext.Provider value={{ currentClientRequestId, setCurrentClientRequestId, pinnedClientRequestId, setPinnedClientRequestId, lastCompletedClientRequestId, setLastCompletedClientRequestId }}>
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
