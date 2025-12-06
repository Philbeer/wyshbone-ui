/**
 * UI-15: Brewery Onboarding Feature
 * UI-17: Onboarding Tour
 * 
 * Exports the brewery onboarding wizard, tour steps, and related utilities.
 */

export { BreweryOnboardingWizard } from "./BreweryOnboardingWizard";

// UI-17: Tour steps configuration
export { TOUR_STEPS, type TourStep, type TourStepId } from "./tourSteps";
export type { 
  BreweryOnboardingSettings, 
  PreferredPubType, 
  RotationPreference 
} from "./types";
export { DEFAULT_ONBOARDING_SETTINGS } from "./types";

