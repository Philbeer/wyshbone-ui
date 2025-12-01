/**
 * Pack State Types - State management types for pack/feature system
 * 
 * Defines the shape of pack state and configuration sources.
 * Designed to be pluggable for future tenant-specific configs.
 */

import type { UIPackDefinition, UIFeatureId } from './pack-types';

/**
 * Serializable pack info for state storage
 * A lighter version of UIPackDefinition for state
 */
export interface PackInfo {
  id: string;
  name: string;
  version: string;
  description?: string;
  featureIds: UIFeatureId[];
}

/**
 * The core pack state shape
 * Serializable and suitable for state management
 */
export interface PackState {
  /** All registered packs (derived from PackRegistry) */
  allPacks: PackInfo[];
  /** Set of pack IDs that are enabled for the current tenant */
  enabledPackIds: Set<string>;
  /** Set of feature IDs that are enabled (derived from enabled packs + overrides) */
  enabledFeatureIds: Set<string>;
  /** Whether state has been initialized */
  initialized: boolean;
}

/**
 * Configuration for which packs/features are enabled
 * This is what a tenant config source would provide
 */
export interface PackStateConfig {
  /** Pack IDs that are enabled */
  enabledPackIds: string[];
  /** Optional feature-level overrides (featureId → enabled) */
  featureOverrides?: Record<string, boolean>;
}

/**
 * Abstract source for pack state configuration
 * Implement this interface to provide tenant-specific configs
 * 
 * @example Future API implementation:
 * ```ts
 * const apiSource: PackStateSource = {
 *   async getConfig() {
 *     const res = await fetch('/api/tenant/pack-config');
 *     return res.json();
 *   }
 * };
 * ```
 */
export interface PackStateSource {
  /** Get the current pack configuration */
  getConfig(): PackStateConfig | Promise<PackStateConfig>;
}

/**
 * Helper to convert UIPackDefinition to PackInfo for state
 */
export function packDefinitionToInfo(pack: UIPackDefinition): PackInfo {
  return {
    id: pack.meta.id,
    name: pack.meta.name,
    version: pack.meta.version,
    description: pack.meta.description,
    featureIds: Object.keys(pack.features),
  };
}

/**
 * Derive enabled feature IDs from enabled packs and registry
 */
export function deriveEnabledFeatures(
  enabledPackIds: Set<string>,
  allPacks: UIPackDefinition[],
  featureOverrides?: Record<string, boolean>
): Set<string> {
  const enabledFeatures = new Set<string>();

  for (const pack of allPacks) {
    if (!enabledPackIds.has(pack.meta.id)) continue;

    for (const [featureId, feature] of Object.entries(pack.features)) {
      // Check for override first
      if (featureOverrides && featureId in featureOverrides) {
        if (featureOverrides[featureId]) {
          enabledFeatures.add(featureId);
        }
        continue;
      }

      // Default: enabled if pack is enabled and feature is enabled by default (or no default specified)
      if (feature.enabledByDefault !== false) {
        enabledFeatures.add(featureId);
      }
    }
  }

  return enabledFeatures;
}

