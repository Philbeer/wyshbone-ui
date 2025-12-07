/**
 * UI-20: Demo Mode Hook
 * 
 * Provides a simple way to detect and toggle demo mode.
 * Demo mode shows sample brewery data without requiring real auth or backend.
 * 
 * Detection:
 * - URL param: ?demo=1 enables demo mode and persists to localStorage
 * - localStorage: wyshbone.ui.demoMode stores the current state
 */

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'wyshbone.ui.demoMode';

/**
 * Check if demo mode is enabled via URL param or localStorage
 */
function getInitialDemoMode(): boolean {
  // Check URL param first
  if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('demo') === '1') {
      // Persist to localStorage
      localStorage.setItem(STORAGE_KEY, 'true');
      return true;
    }
  }
  
  // Fall back to localStorage
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  }
  
  return false;
}

export interface DemoModeState {
  /** Whether demo mode is currently active */
  demoMode: boolean;
  /** Enable demo mode and persist to localStorage */
  enableDemoMode: () => void;
  /** Disable demo mode and clear from localStorage */
  disableDemoMode: () => void;
  /** Toggle demo mode */
  toggleDemoMode: () => void;
}

/**
 * Hook to manage demo mode state.
 * 
 * Usage:
 * ```ts
 * const { demoMode, enableDemoMode, disableDemoMode } = useDemoMode();
 * 
 * if (demoMode) {
 *   // Show demo data
 * } else {
 *   // Show real data
 * }
 * ```
 */
export function useDemoMode(): DemoModeState {
  const [demoMode, setDemoMode] = useState<boolean>(() => getInitialDemoMode());

  // Sync with URL param on mount and URL changes
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('demo') === '1' && !demoMode) {
      setDemoMode(true);
      localStorage.setItem(STORAGE_KEY, 'true');
    }
  }, [demoMode]);

  const enableDemoMode = useCallback(() => {
    setDemoMode(true);
    localStorage.setItem(STORAGE_KEY, 'true');
  }, []);

  const disableDemoMode = useCallback(() => {
    setDemoMode(false);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const toggleDemoMode = useCallback(() => {
    setDemoMode(prev => {
      const newValue = !prev;
      if (newValue) {
        localStorage.setItem(STORAGE_KEY, 'true');
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
      return newValue;
    });
  }, []);

  return {
    demoMode,
    enableDemoMode,
    disableDemoMode,
    toggleDemoMode,
  };
}

/**
 * Standalone function to check demo mode without hook.
 * Useful for non-React code or initial checks.
 */
export function isDemoMode(): boolean {
  return getInitialDemoMode();
}

