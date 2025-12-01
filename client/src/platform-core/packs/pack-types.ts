/**
 * Pack Types - Core contracts for UI Pack system
 * 
 * These types define how the UI understands and works with Packs.
 * Mirrors the Supervisor's core contracts but adapted for frontend use.
 */

/**
 * Metadata describing a Pack
 */
export interface UIPackMetadata {
  /** Unique pack ID, e.g. "breweries", "coffee-roasteries" */
  id: string;
  /** Human-readable label */
  name: string;
  /** Semantic version, e.g. "1.0.0" */
  version: string;
  /** Optional description of the pack */
  description?: string;
}

/**
 * Unique identifier for a feature within a pack
 */
export type UIFeatureId = string;

/**
 * Definition of a single feature within a pack
 */
export interface UIFeatureDefinition {
  /** Unique feature identifier */
  id: UIFeatureId;
  /** Human-readable label */
  label: string;
  /** Optional description of the feature */
  description?: string;
  /** Whether this feature is enabled by default */
  enabledByDefault?: boolean;
}

/**
 * Complete definition of a Pack including metadata and features
 */
export interface UIPackDefinition {
  /** Pack metadata */
  meta: UIPackMetadata;
  /** Map of feature IDs to their definitions */
  features: Record<UIFeatureId, UIFeatureDefinition>;
}

