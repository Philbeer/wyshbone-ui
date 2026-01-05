/**
 * Onboarding Wizard Context
 *
 * Manages global state for the onboarding wizard flow:
 * - Tracks whether wizards are open/closed
 * - Controls sequential flow (General → Brewery)
 * - Provides methods to open/close wizards
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface OnboardingWizardContextType {
  isGeneralWizardOpen: boolean;
  isBreweryWizardOpen: boolean;
  openGeneralWizard: () => void;
  closeGeneralWizard: () => void;
  openBreweryWizard: () => void;
  closeBreweryWizard: () => void;
}

const OnboardingWizardContext = createContext<OnboardingWizardContextType | undefined>(undefined);

export function OnboardingWizardProvider({ children }: { children: ReactNode }) {
  const [isGeneralWizardOpen, setIsGeneralWizardOpen] = useState(false);
  const [isBreweryWizardOpen, setIsBreweryWizardOpen] = useState(false);

  const openGeneralWizard = useCallback(() => {
    setIsGeneralWizardOpen(true);
  }, []);

  const closeGeneralWizard = useCallback(() => {
    setIsGeneralWizardOpen(false);
  }, []);

  const openBreweryWizard = useCallback(() => {
    setIsGeneralWizardOpen(false); // Close general wizard
    setIsBreweryWizardOpen(true);
  }, []);

  const closeBreweryWizard = useCallback(() => {
    setIsBreweryWizardOpen(false);
  }, []);

  return (
    <OnboardingWizardContext.Provider
      value={{
        isGeneralWizardOpen,
        isBreweryWizardOpen,
        openGeneralWizard,
        closeGeneralWizard,
        openBreweryWizard,
        closeBreweryWizard,
      }}
    >
      {children}
    </OnboardingWizardContext.Provider>
  );
}

export function useOnboardingWizard() {
  const context = useContext(OnboardingWizardContext);
  if (!context) {
    throw new Error("useOnboardingWizard must be used within OnboardingWizardProvider");
  }
  return context;
}
