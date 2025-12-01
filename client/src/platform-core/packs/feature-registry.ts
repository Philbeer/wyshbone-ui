/**
 * Feature Registry - In-memory registry for all features across all packs
 * 
 * A lightweight, synchronous, pure registry that stores pack definitions
 * and provides lookup methods for packs and features.
 */

import type { UIPackDefinition, UIFeatureDefinition } from './pack-types';

/**
 * Internal registry map storing all registered packs
 */
const registry: Map<string, UIPackDefinition> = new Map();

/**
 * Register a pack in the registry
 * @param pack - The pack definition to register
 * @throws Error if a pack with the same ID already exists
 */
export function registerPack(pack: UIPackDefinition): void {
  if (registry.has(pack.meta.id)) {
    throw new Error(`Pack with ID "${pack.meta.id}" is already registered`);
  }
  registry.set(pack.meta.id, pack);
}

/**
 * Get a pack by its ID
 * @param id - The pack ID to look up
 * @returns The pack definition, or undefined if not found
 */
export function getPack(id: string): UIPackDefinition | undefined {
  return registry.get(id);
}

/**
 * Get all registered packs
 * @returns Array of all registered pack definitions
 */
export function getAllPacks(): UIPackDefinition[] {
  return Array.from(registry.values());
}

/**
 * Get a specific feature from a pack
 * @param packId - The pack ID containing the feature
 * @param featureId - The feature ID to look up
 * @returns The feature definition, or undefined if pack or feature not found
 */
export function getFeature(
  packId: string,
  featureId: string
): UIFeatureDefinition | undefined {
  const pack = registry.get(packId);
  if (!pack) {
    return undefined;
  }
  return pack.features[featureId];
}

/**
 * Clear the registry (useful for testing)
 * @internal
 */
export function clearRegistry(): void {
  registry.clear();
}

