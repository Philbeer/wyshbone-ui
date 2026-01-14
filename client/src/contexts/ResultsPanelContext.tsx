/**
 * ResultsPanelContext - Manages the right panel result display
 * 
 * Provides:
 * - Current active result data
 * - Methods to open/close results
 * - Result type for rendering
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export type ResultType = 
  | 'quick_search' 
  | 'deep_research' 
  | 'email_finder' 
  | 'scheduled_monitor' 
  | 'nudges'
  | null;

export interface ResultData {
  type: ResultType;
  data: unknown;
  title?: string;
  timestamp?: Date;
}

interface ResultsPanelContextType {
  // State
  isOpen: boolean;
  currentResult: ResultData | null;
  resultHistory: ResultData[];
  
  // Actions
  openResults: (type: ResultType, data: unknown, title?: string) => void;
  closeResults: () => void;
  clearResults: () => void;
}

// =============================================================================
// CONTEXT
// =============================================================================

const ResultsPanelContext = createContext<ResultsPanelContextType | undefined>(undefined);

// =============================================================================
// PROVIDER
// =============================================================================

export function ResultsPanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentResult, setCurrentResult] = useState<ResultData | null>(null);
  const [resultHistory, setResultHistory] = useState<ResultData[]>([]);

  const openResults = useCallback((type: ResultType, data: unknown, title?: string) => {
    const result: ResultData = {
      type,
      data,
      title,
      timestamp: new Date(),
    };
    
    setCurrentResult(result);
    setIsOpen(true);
    
    // Add to history (keep last 10)
    setResultHistory(prev => [result, ...prev.slice(0, 9)]);
    
    console.log('[ResultsPanel] Opened:', type, title);
  }, []);

  const closeResults = useCallback(() => {
    setIsOpen(false);
    // Don't clear currentResult - keep it for "reopen" functionality
    console.log('[ResultsPanel] Closed');
  }, []);

  const clearResults = useCallback(() => {
    setIsOpen(false);
    setCurrentResult(null);
    console.log('[ResultsPanel] Cleared');
  }, []);

  return (
    <ResultsPanelContext.Provider
      value={{
        isOpen,
        currentResult,
        resultHistory,
        openResults,
        closeResults,
        clearResults,
      }}
    >
      {children}
    </ResultsPanelContext.Provider>
  );
}

// =============================================================================
// HOOK
// =============================================================================

export function useResultsPanel() {
  const context = useContext(ResultsPanelContext);
  if (!context) {
    throw new Error('useResultsPanel must be used within a ResultsPanelProvider');
  }
  return context;
}

