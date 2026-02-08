import { createContext, useContext, useState, type ReactNode, type SetStateAction, type Dispatch } from "react";

interface CurrentRequestContextType {
  currentClientRequestId: string | null;
  setCurrentClientRequestId: Dispatch<SetStateAction<string | null>>;
  pinnedClientRequestId: string | null;
  setPinnedClientRequestId: Dispatch<SetStateAction<string | null>>;
  lastCompletedClientRequestId: string | null;
  setLastCompletedClientRequestId: Dispatch<SetStateAction<string | null>>;
}

const CurrentRequestContext = createContext<CurrentRequestContextType | null>(null);

export function CurrentRequestProvider({ children }: { children: ReactNode }) {
  const [currentClientRequestId, setCurrentClientRequestId] = useState<string | null>(null);
  const [pinnedClientRequestId, setPinnedClientRequestId] = useState<string | null>(null);
  const [lastCompletedClientRequestId, setLastCompletedClientRequestId] = useState<string | null>(null);
  
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
