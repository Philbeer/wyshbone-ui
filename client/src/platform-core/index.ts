/**
 * Platform Core - Public API
 * 
 * Exports all platform-core types and utilities for use across the UI.
 */

// Core pack types and registry
export * from './packs/pack-types';
export * from './packs/feature-registry';
export * from './packs/pack-registry';

// Pack state types and utilities
export * from './packs/pack-state-types';
export * from './packs/pack-state-source';

// Demo packs for development
export * from './packs/demo-packs';

// React context and hooks
export {
  PackProvider,
  usePackContext,
  useAvailablePacks,
  useEnabledPacks,
  useIsPackEnabled,
  useIsFeatureEnabled,
  usePackStateInitialized,
} from './packs/PackContext';
