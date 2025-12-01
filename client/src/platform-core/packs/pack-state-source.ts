/**
 * Pack State Source - Configuration sources for pack enablement
 * 
 * Provides a pluggable abstraction for where enabled pack/feature
 * configuration comes from. Currently provides a static demo source,
 * but designed for easy replacement with API/Supabase sources later.
 */

import type { PackStateConfig, PackStateSource } from './pack-state-types';

/**
 * Demo/static configuration source
 * Used during development and testing
 * 
 * Replace this with an API source in production:
 * @example
 * ```ts
 * export const apiPackStateSource: PackStateSource = {
 *   async getConfig() {
 *     const res = await fetch('/api/tenant/pack-config');
 *     return res.json();
 *   }
 * };
 * ```
 */
export const demoPackStateSource: PackStateSource = {
  getConfig(): PackStateConfig {
    // Demo config: enable breweries pack by default
    return {
      enabledPackIds: ['breweries'],
      featureOverrides: {},
    };
  },
};

/**
 * Create a static pack state source from a config object
 * Useful for testing or hardcoded configurations
 */
export function createStaticPackStateSource(config: PackStateConfig): PackStateSource {
  return {
    getConfig: () => config,
  };
}

/**
 * The current active pack state source
 * Change this to switch configuration sources globally
 */
let currentSource: PackStateSource = demoPackStateSource;

/**
 * Get the current pack state source
 */
export function getPackStateSource(): PackStateSource {
  return currentSource;
}

/**
 * Set a new pack state source
 * Call this at app startup to configure where pack config comes from
 */
export function setPackStateSource(source: PackStateSource): void {
  currentSource = source;
}

