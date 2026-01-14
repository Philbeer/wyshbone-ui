/**
 * UI-15: Brewery Onboarding Types
 * 
 * Types for the 3-step brewery onboarding wizard.
 */

/**
 * Pub type preferences for brewery users
 */
export type PreferredPubType = 
  | "freehouse" 
  | "pubco" 
  | "micropub" 
  | "mixed" 
  | "any";

/**
 * Rotation preference for beer selection
 */
export type RotationPreference = 
  | "rotating" 
  | "core_only" 
  | "either";

/**
 * Onboarding settings captured during the wizard.
 * 
 * These are stored per-user/account and influence Lead Finder defaults
 * and any AI-driven recommendations.
 */
export interface BreweryOnboardingSettings {
  /** Step 2: Preferred pub type(s) */
  preferredPubType?: PreferredPubType;
  
  /** Step 2: Beer range preference description (free text) */
  beerRangePreference?: string;
  
  /** Step 2: Rotation preference */
  rotationPreference?: RotationPreference;
  
  /** Step 3: Primary country for territory */
  primaryCountry?: string;

  /** Step 3: Focus regions (array of validated location names) */
  focusRegions?: string[];
  
  /** Whether onboarding has been completed */
  completed?: boolean;
  
  /** Timestamp when onboarding was completed */
  completedAt?: string;
}

/**
 * Default onboarding settings for new users
 */
export const DEFAULT_ONBOARDING_SETTINGS: BreweryOnboardingSettings = {
  preferredPubType: "any",
  beerRangePreference: "",
  rotationPreference: "either",
  primaryCountry: "United Kingdom",
  focusRegions: [],
  completed: false,
};

