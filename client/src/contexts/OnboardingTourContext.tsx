/**
 * UI-17: Onboarding Tour Context
 * 
 * Provides tour state to the entire app via React Context.
 * Wraps the useOnboardingTour hook so any component can access or control the tour.
 */

import { createContext, useContext, ReactNode } from 'react';
import { useOnboardingTour, type OnboardingTourState } from '@/hooks/useOnboardingTour';

const OnboardingTourContext = createContext<OnboardingTourState | null>(null);

interface OnboardingTourProviderProps {
  children: ReactNode;
}

export function OnboardingTourProvider({ children }: OnboardingTourProviderProps) {
  const tourState = useOnboardingTour();

  return (
    <OnboardingTourContext.Provider value={tourState}>
      {children}
    </OnboardingTourContext.Provider>
  );
}

/**
 * Hook to access tour state from any component
 */
export function useOnboardingTourContext(): OnboardingTourState {
  const context = useContext(OnboardingTourContext);
  if (!context) {
    throw new Error('useOnboardingTourContext must be used within OnboardingTourProvider');
  }
  return context;
}

