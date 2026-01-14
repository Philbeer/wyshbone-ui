/**
 * UI-20: Demo Mode Context
 * 
 * Provides demo mode state throughout the app.
 * Components can check demoMode to decide whether to use demo data.
 */

import { createContext, useContext, ReactNode } from 'react';
import { useDemoMode, type DemoModeState } from '@/hooks/useDemoMode';

const DemoModeContext = createContext<DemoModeState | undefined>(undefined);

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const demoState = useDemoMode();
  
  return (
    <DemoModeContext.Provider value={demoState}>
      {children}
    </DemoModeContext.Provider>
  );
}

/**
 * Hook to access demo mode state.
 * 
 * Usage:
 * ```tsx
 * const { demoMode, enableDemoMode, disableDemoMode } = useDemoModeContext();
 * 
 * if (demoMode) {
 *   return <DemoContent />;
 * }
 * return <RealContent />;
 * ```
 */
export function useDemoModeContext(): DemoModeState {
  const context = useContext(DemoModeContext);
  if (context === undefined) {
    throw new Error('useDemoModeContext must be used within a DemoModeProvider');
  }
  return context;
}

