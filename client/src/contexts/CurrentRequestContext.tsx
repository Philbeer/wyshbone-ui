import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface CurrentRequestContextType {
  currentClientRequestId: string | null;
  setCurrentClientRequestId: (id: string | null) => void;
}

const CurrentRequestContext = createContext<CurrentRequestContextType | null>(null);

export function CurrentRequestProvider({ children }: { children: ReactNode }) {
  const [currentClientRequestId, setCurrentClientRequestId] = useState<string | null>(null);
  
  return (
    <CurrentRequestContext.Provider value={{ currentClientRequestId, setCurrentClientRequestId }}>
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
