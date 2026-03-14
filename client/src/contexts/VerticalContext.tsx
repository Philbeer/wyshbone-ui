/**
 * UI-16: Vertical State Management
 * 
 * Provides a single source of truth for the current vertical selection.
 * Persists to localStorage and exposes available verticals with labels.
 * 
 * TODO: When backend exposes a canonical vertical list, import from shared types.
 */

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import type { VerticalId } from "@/lib/verticals/types";

const STORAGE_KEY = "wyshbone.currentVerticalId";
const DEFAULT_VERTICAL: VerticalId = "generic"; // verticals hidden — defaulting to generic until re-enabled

// Valid vertical IDs - must match VerticalId type from lib/verticals/types.ts
const VALID_VERTICALS: VerticalId[] = ["brewery", "generic", "animal_physio", "other"];

/**
 * Information about a vertical for display in the UI
 */
export interface VerticalInfo {
  id: VerticalId;
  label: string;
  description?: string;
}

/**
 * Available verticals with user-friendly labels
 * TODO: Sync with backend vertical config when available
 */
export const AVAILABLE_VERTICALS: VerticalInfo[] = [
  {
    id: "brewery",
    label: "Breweries",
    description: "Pubs, bars, and hospitality venues",
  },
  {
    id: "generic",
    label: "Generic",
    description: "General business leads",
  },
  {
    id: "animal_physio",
    label: "Animal Physio",
    description: "Animal physiotherapy practices",
  },
  {
    id: "other",
    label: "Other",
    description: "Other industry verticals",
  },
];

interface VerticalState {
  currentVerticalId: VerticalId;
  setCurrentVerticalId: (id: VerticalId) => void;
  availableVerticals: VerticalInfo[];
  currentVerticalInfo: VerticalInfo;
}

const VerticalContext = createContext<VerticalState | undefined>(undefined);

/**
 * Validate a vertical ID string and return it if valid, or the default
 */
function validateVerticalId(value: string | null): VerticalId {
  if (value && VALID_VERTICALS.includes(value as VerticalId)) {
    return value as VerticalId;
  }
  return DEFAULT_VERTICAL;
}

/**
 * Load the initial vertical from localStorage, falling back to default
 */
function loadInitialVertical(): VerticalId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const validated = validateVerticalId(stored);
    
    // If stored value was invalid, overwrite with default
    if (stored && stored !== validated) {
      console.warn(`⚠️ Invalid vertical "${stored}" in localStorage, resetting to "${validated}"`);
      localStorage.setItem(STORAGE_KEY, validated);
    }
    
    return validated;
  } catch (e) {
    console.error("Failed to read vertical from localStorage:", e);
    return DEFAULT_VERTICAL;
  }
}

export function VerticalProvider({ children }: { children: ReactNode }) {
  const [currentVerticalId, setCurrentVerticalIdInternal] = useState<VerticalId>(loadInitialVertical);

  // Persist to localStorage whenever vertical changes
  const setCurrentVerticalId = useCallback((id: VerticalId) => {
    // Validate the ID before setting
    const validated = validateVerticalId(id);
    
    setCurrentVerticalIdInternal(validated);
    
    try {
      localStorage.setItem(STORAGE_KEY, validated);
      console.log(`🏭 Vertical changed to: ${validated}`);
    } catch (e) {
      console.error("Failed to save vertical to localStorage:", e);
    }
  }, []);

  // Find the current vertical info
  const currentVerticalInfo = AVAILABLE_VERTICALS.find(v => v.id === currentVerticalId) 
    ?? AVAILABLE_VERTICALS[0];

  const value: VerticalState = {
    currentVerticalId,
    setCurrentVerticalId,
    availableVerticals: AVAILABLE_VERTICALS,
    currentVerticalInfo,
  };

  return (
    <VerticalContext.Provider value={value}>
      {children}
    </VerticalContext.Provider>
  );
}

/**
 * Hook to access vertical state
 */
export function useVertical() {
  const context = useContext(VerticalContext);
  if (!context) {
    throw new Error("useVertical must be used within VerticalProvider");
  }
  return context;
}

/**
 * Get the current vertical ID from localStorage (for use outside React)
 * Returns the validated vertical ID
 */
export function getCurrentVerticalId(): VerticalId {
  return loadInitialVertical();
}

