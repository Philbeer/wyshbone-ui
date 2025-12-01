/**
 * Pack State Tests
 * 
 * Tests for pack state management, selectors, and hooks.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

import { PackRegistry } from '../pack-registry';
import {
  packDefinitionToInfo,
  deriveEnabledFeatures,
  type PackStateConfig,
} from '../pack-state-types';
import {
  setPackStateSource,
  createStaticPackStateSource,
  demoPackStateSource,
} from '../pack-state-source';
import {
  PackProvider,
  useAvailablePacks,
  useEnabledPacks,
  useIsPackEnabled,
  useIsFeatureEnabled,
  usePackStateInitialized,
} from '../PackContext';
import type { UIPackDefinition } from '../pack-types';

// Test pack definitions
const testBrewPack: UIPackDefinition = {
  meta: {
    id: 'test-brew',
    name: 'Test Brewery Pack',
    version: '1.0.0',
    description: 'Test brewery pack',
  },
  features: {
    'brew-products': {
      id: 'brew-products',
      label: 'Products',
      enabledByDefault: true,
    },
    'brew-inventory': {
      id: 'brew-inventory',
      label: 'Inventory',
      enabledByDefault: true,
    },
  },
};

const testCoffeePack: UIPackDefinition = {
  meta: {
    id: 'test-coffee',
    name: 'Test Coffee Pack',
    version: '1.0.0',
    description: 'Test coffee pack',
  },
  features: {
    'coffee-products': {
      id: 'coffee-products',
      label: 'Coffee Products',
      enabledByDefault: true,
    },
    'coffee-premium': {
      id: 'coffee-premium',
      label: 'Premium Features',
      enabledByDefault: false,
    },
  },
};

// Wrapper component for testing hooks
function createWrapper(config?: PackStateConfig) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(PackProvider, null, children);
  };
}

describe('Pack State Types', () => {
  describe('packDefinitionToInfo', () => {
    it('should convert UIPackDefinition to PackInfo', () => {
      const info = packDefinitionToInfo(testBrewPack);

      expect(info.id).toBe('test-brew');
      expect(info.name).toBe('Test Brewery Pack');
      expect(info.version).toBe('1.0.0');
      expect(info.description).toBe('Test brewery pack');
      expect(info.featureIds).toEqual(['brew-products', 'brew-inventory']);
    });
  });

  describe('deriveEnabledFeatures', () => {
    it('should derive enabled features from enabled packs', () => {
      const enabledPackIds = new Set(['test-brew']);
      const allPacks = [testBrewPack, testCoffeePack];

      const enabledFeatures = deriveEnabledFeatures(enabledPackIds, allPacks);

      expect(enabledFeatures.has('brew-products')).toBe(true);
      expect(enabledFeatures.has('brew-inventory')).toBe(true);
      expect(enabledFeatures.has('coffee-products')).toBe(false);
    });

    it('should respect enabledByDefault=false', () => {
      const enabledPackIds = new Set(['test-coffee']);
      const allPacks = [testCoffeePack];

      const enabledFeatures = deriveEnabledFeatures(enabledPackIds, allPacks);

      expect(enabledFeatures.has('coffee-products')).toBe(true);
      expect(enabledFeatures.has('coffee-premium')).toBe(false);
    });

    it('should apply feature overrides', () => {
      const enabledPackIds = new Set(['test-coffee']);
      const allPacks = [testCoffeePack];
      const overrides = { 'coffee-premium': true, 'coffee-products': false };

      const enabledFeatures = deriveEnabledFeatures(
        enabledPackIds,
        allPacks,
        overrides
      );

      expect(enabledFeatures.has('coffee-premium')).toBe(true);
      expect(enabledFeatures.has('coffee-products')).toBe(false);
    });
  });
});

describe('Pack State Source', () => {
  it('should return demo config from demoPackStateSource', () => {
    const config = demoPackStateSource.getConfig() as PackStateConfig;
    expect(config.enabledPackIds).toContain('breweries');
  });

  it('should create static source from config', () => {
    const config: PackStateConfig = {
      enabledPackIds: ['custom-pack'],
      featureOverrides: { 'some-feature': true },
    };
    const source = createStaticPackStateSource(config);
    const result = source.getConfig() as PackStateConfig;

    expect(result.enabledPackIds).toEqual(['custom-pack']);
    expect(result.featureOverrides).toEqual({ 'some-feature': true });
  });
});

describe('Pack Context Hooks', () => {
  beforeEach(() => {
    // Reset registry and source before each test
    PackRegistry.clear();

    // Register test packs
    PackRegistry.register(testBrewPack);
    PackRegistry.register(testCoffeePack);

    // Set up test config source
    setPackStateSource(
      createStaticPackStateSource({
        enabledPackIds: ['test-brew'],
        featureOverrides: {},
      })
    );
  });

  describe('useAvailablePacks', () => {
    it('should return all packs from PackRegistry', async () => {
      const { result } = renderHook(() => useAvailablePacks(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        // Should have at least our 2 test packs (may also have demo packs)
        expect(result.current.length).toBeGreaterThanOrEqual(2);
      });

      const packIds = result.current.map((p) => p.id);
      expect(packIds).toContain('test-brew');
      expect(packIds).toContain('test-coffee');
    });

    it('should include correct pack metadata', async () => {
      const { result } = renderHook(() => useAvailablePacks(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.length).toBeGreaterThanOrEqual(2);
      });

      const brewPack = result.current.find((p) => p.id === 'test-brew');
      expect(brewPack?.name).toBe('Test Brewery Pack');
      expect(brewPack?.version).toBe('1.0.0');
    });
  });

  describe('useEnabledPacks', () => {
    it('should return only enabled packs', async () => {
      const { result } = renderHook(() => useEnabledPacks(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.length).toBe(1);
      });

      expect(result.current[0].id).toBe('test-brew');
    });

    it('should return subset of valid pack ids', async () => {
      const { result: allResult } = renderHook(() => useAvailablePacks(), {
        wrapper: createWrapper(),
      });
      const { result: enabledResult } = renderHook(() => useEnabledPacks(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(allResult.current.length).toBeGreaterThanOrEqual(2);
        expect(enabledResult.current.length).toBeGreaterThanOrEqual(1);
      });

      const allIds = allResult.current.map((p) => p.id);
      const enabledIds = enabledResult.current.map((p) => p.id);

      // All enabled IDs should be in allPacks
      for (const id of enabledIds) {
        expect(allIds).toContain(id);
      }
    });
  });

  describe('useIsPackEnabled', () => {
    it('should return true for enabled pack', async () => {
      const { result } = renderHook(() => useIsPackEnabled('test-brew'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current).toBe(true);
      });
    });

    it('should return false for disabled pack', async () => {
      const { result } = renderHook(() => useIsPackEnabled('test-coffee'), {
        wrapper: createWrapper(),
      });

      // Need to wait for initialization
      await waitFor(
        () => {
          // Hook should stabilize
        },
        { timeout: 100 }
      );

      expect(result.current).toBe(false);
    });

    it('should return false for non-existent pack', async () => {
      const { result } = renderHook(() => useIsPackEnabled('non-existent'), {
        wrapper: createWrapper(),
      });

      await waitFor(
        () => {
          // Hook should stabilize
        },
        { timeout: 100 }
      );

      expect(result.current).toBe(false);
    });
  });

  describe('useIsFeatureEnabled', () => {
    it('should return true for enabled feature in enabled pack', async () => {
      const { result } = renderHook(() => useIsFeatureEnabled('brew-products'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current).toBe(true);
      });
    });

    it('should return false for feature in disabled pack', async () => {
      const { result } = renderHook(
        () => useIsFeatureEnabled('coffee-products'),
        {
          wrapper: createWrapper(),
        }
      );

      await waitFor(
        () => {
          // Hook should stabilize
        },
        { timeout: 100 }
      );

      expect(result.current).toBe(false);
    });

    it('should return false for non-existent feature', async () => {
      const { result } = renderHook(
        () => useIsFeatureEnabled('non-existent-feature'),
        {
          wrapper: createWrapper(),
        }
      );

      await waitFor(
        () => {
          // Hook should stabilize
        },
        { timeout: 100 }
      );

      expect(result.current).toBe(false);
    });
  });

  describe('usePackStateInitialized', () => {
    it('should return true after initialization', async () => {
      const { result } = renderHook(() => usePackStateInitialized(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current).toBe(true);
      });
    });
  });
});

