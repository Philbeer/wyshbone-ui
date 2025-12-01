/**
 * Pack Registry - High-level wrapper for UI code to interact with packs
 * 
 * Provides a clean API surface for registering and querying packs.
 * Wraps the lower-level feature-registry functions.
 */

import type { UIPackDefinition, UIFeatureDefinition } from './pack-types';
import {
  registerPack as featureRegistryRegister,
  getPack as featureRegistryGetPack,
  getAllPacks,
  getFeature as featureRegistryGetFeature,
  clearRegistry,
} from './feature-registry';

/**
 * System configuration for active pack and enabled features
 * In-memory only - no persistence
 */
export interface UISystemConfig {
  /** Currently active pack ID, or null if none */
  activePackId: string | null;
  /** Map of feature IDs to their enabled state */
  enabledFeatures: Record<string, boolean>;
}

/**
 * PackRegistry - Static class providing the main API for pack management
 */
export const PackRegistry = {
  /**
   * Register a pack in the registry
   * @param pack - The pack definition to register
   * @throws Error if a pack with the same ID already exists
   */
  register(pack: UIPackDefinition): void {
    featureRegistryRegister(pack);
  },

  /**
   * Get a pack by its ID
   * @param id - The pack ID to look up
   * @returns The pack definition, or undefined if not found
   */
  getPack(id: string): UIPackDefinition | undefined {
    return featureRegistryGetPack(id);
  },

  /**
   * Get a specific feature from a pack
   * @param packId - The pack ID containing the feature
   * @param featureId - The feature ID to look up
   * @returns The feature definition, or undefined if pack or feature not found
   */
  getFeature(packId: string, featureId: string): UIFeatureDefinition | undefined {
    return featureRegistryGetFeature(packId, featureId);
  },

  /**
   * List all registered packs
   * @returns Array of all registered pack definitions
   */
  listPacks(): UIPackDefinition[] {
    return getAllPacks();
  },

  /**
   * Clear the registry (useful for testing)
   * @internal
   */
  clear(): void {
    clearRegistry();
  },
} as const;

