/**
 * Pack Registry Tests
 * 
 * Tests for the Pack and Feature Registry system.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PackRegistry } from '../pack-registry';
import type { UIPackDefinition } from '../pack-types';

// Mock pack definitions for testing
const createMockPack = (id: string, features: string[]): UIPackDefinition => ({
  meta: {
    id,
    name: `${id.charAt(0).toUpperCase()}${id.slice(1)} Pack`,
    version: '1.0.0',
    description: `A mock ${id} pack for testing`,
  },
  features: Object.fromEntries(
    features.map((featureId) => [
      featureId,
      {
        id: featureId,
        label: `${featureId.charAt(0).toUpperCase()}${featureId.slice(1)} Feature`,
        description: `Description for ${featureId}`,
        enabledByDefault: true,
      },
    ])
  ),
});

describe('PackRegistry', () => {
  // Clear registry before each test to ensure isolation
  beforeEach(() => {
    PackRegistry.clear();
  });

  describe('Test 1: Register Pack', () => {
    it('should register a pack with 2 features and retrieve it correctly', () => {
      // Create a mock pack with 2 features
      const mockPack = createMockPack('breweries', ['inventory', 'orders']);

      // Register the pack
      PackRegistry.register(mockPack);

      // Assert registry has it
      const retrievedPack = PackRegistry.getPack('breweries');
      expect(retrievedPack).toBeDefined();

      // Assert pack metadata matches
      expect(retrievedPack?.meta.id).toBe('breweries');
      expect(retrievedPack?.meta.name).toBe('Breweries Pack');
      expect(retrievedPack?.meta.version).toBe('1.0.0');
      expect(retrievedPack?.meta.description).toBe('A mock breweries pack for testing');

      // Assert features are present
      expect(Object.keys(retrievedPack?.features ?? {}).length).toBe(2);
      expect(retrievedPack?.features['inventory']).toBeDefined();
      expect(retrievedPack?.features['orders']).toBeDefined();
    });
  });

  describe('Test 2: Retrieve Feature', () => {
    it('should retrieve a feature by pack and feature id with correct values', () => {
      // Create and register a pack
      const mockPack = createMockPack('coffee-roasteries', ['roasting', 'blending']);
      PackRegistry.register(mockPack);

      // Retrieve feature by pack + feature id
      const feature = PackRegistry.getFeature('coffee-roasteries', 'roasting');

      // Assert correct label and values
      expect(feature).toBeDefined();
      expect(feature?.id).toBe('roasting');
      expect(feature?.label).toBe('Roasting Feature');
      expect(feature?.description).toBe('Description for roasting');
      expect(feature?.enabledByDefault).toBe(true);
    });

    it('should return undefined for non-existent feature', () => {
      const mockPack = createMockPack('test-pack', ['feature1']);
      PackRegistry.register(mockPack);

      const feature = PackRegistry.getFeature('test-pack', 'non-existent');
      expect(feature).toBeUndefined();
    });

    it('should return undefined for non-existent pack', () => {
      const feature = PackRegistry.getFeature('non-existent-pack', 'some-feature');
      expect(feature).toBeUndefined();
    });
  });

  describe('Test 3: Multiple Packs', () => {
    it('should register and list multiple packs', () => {
      // Register two packs
      const brewPack = createMockPack('breweries', ['inventory', 'orders']);
      const coffeePack = createMockPack('coffee-roasteries', ['roasting', 'blending', 'cupping']);

      PackRegistry.register(brewPack);
      PackRegistry.register(coffeePack);

      // Assert both show in listPacks()
      const allPacks = PackRegistry.listPacks();
      expect(allPacks.length).toBe(2);

      const packIds = allPacks.map((p) => p.meta.id);
      expect(packIds).toContain('breweries');
      expect(packIds).toContain('coffee-roasteries');
    });
  });

  describe('Test 4: Overwrite Prevention', () => {
    it('should throw an error when registering a pack with an existing id', () => {
      // Register a pack
      const mockPack = createMockPack('breweries', ['inventory']);
      PackRegistry.register(mockPack);

      // Attempt to register another pack with the same ID
      const duplicatePack = createMockPack('breweries', ['orders']);

      // Assert it throws an error
      expect(() => PackRegistry.register(duplicatePack)).toThrowError(
        'Pack with ID "breweries" is already registered'
      );
    });
  });
});

