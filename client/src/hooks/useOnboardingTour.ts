/**
 * UI-17: Onboarding Tour Controller Hook
 * 
 * Manages tour state (open/closed, current step) and persistence.
 * Persists completion to localStorage so the tour only auto-opens once.
 */

import { useState, useEffect, useCallback } from 'react';
import { TOUR_STEPS } from '@/features/onboarding/tourSteps';

const STORAGE_KEY = 'wyshbone.ui.onboardingTour.completed';

export interface OnboardingTourState {
  /** Whether the tour overlay is currently visible */
  isTourOpen: boolean;
  /** Current step index (0-based) */
  currentStepIndex: number;
  /** Total number of steps */
  totalSteps: number;
  /** Whether user has completed the tour (persisted) */
  hasCompletedTour: boolean;
  /** Current step data */
  currentStep: typeof TOUR_STEPS[number] | null;
  /** Actions */
  startTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
  finishTour: () => void;
  skipTour: () => void;
}

/**
 * Hook to manage onboarding tour state
 */
export function useOnboardingTour(): OnboardingTourState {
  const [isTourOpen, setIsTourOpen] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [hasCompletedTour, setHasCompletedTour] = useState(() => {
    // Initialize from localStorage
    return localStorage.getItem(STORAGE_KEY) === 'true';
  });
  const [hasAutoOpened, setHasAutoOpened] = useState(false);

  const totalSteps = TOUR_STEPS.length;
  const currentStep = isTourOpen ? TOUR_STEPS[currentStepIndex] : null;

  // Auto-open tour on first visit (after a short delay to let the UI settle)
  useEffect(() => {
    if (!hasCompletedTour && !hasAutoOpened && !isTourOpen) {
      const timer = setTimeout(() => {
        setIsTourOpen(true);
        setHasAutoOpened(true);
      }, 1000); // 1 second delay to let the app fully render

      return () => clearTimeout(timer);
    }
  }, [hasCompletedTour, hasAutoOpened, isTourOpen]);

  const startTour = useCallback(() => {
    setCurrentStepIndex(0);
    setIsTourOpen(true);
  }, []);

  const nextStep = useCallback(() => {
    if (currentStepIndex < totalSteps - 1) {
      setCurrentStepIndex(prev => prev + 1);
    }
  }, [currentStepIndex, totalSteps]);

  const prevStep = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
    }
  }, [currentStepIndex]);

  const markCompleted = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setHasCompletedTour(true);
    setIsTourOpen(false);
    setCurrentStepIndex(0);
  }, []);

  const finishTour = useCallback(() => {
    markCompleted();
  }, [markCompleted]);

  const skipTour = useCallback(() => {
    markCompleted();
  }, [markCompleted]);

  return {
    isTourOpen,
    currentStepIndex,
    totalSteps,
    hasCompletedTour,
    currentStep,
    startTour,
    nextStep,
    prevStep,
    finishTour,
    skipTour,
  };
}

