/**
 * Pack Context - React context for pack/feature state
 * 
 * Provides hooks for accessing pack information throughout the app:
 * - useAvailablePacks() - all registered packs
 * - useEnabledPacks() - only enabled packs for current tenant
 * - useIsPackEnabled(packId) - check if a pack is enabled
 * - useIsFeatureEnabled(featureId) - check if a feature is enabled
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  type ReactNode,
} from 'react';
import { PackRegistry } from './pack-registry';
import { getPackStateSource } from './pack-state-source';
import { demoPacks } from './demo-packs';
import {
  type PackState,
  type PackInfo,
  packDefinitionToInfo,
  deriveEnabledFeatures,
} from './pack-state-types';

/**
 * Context value shape
 */
interface PackContextValue {
  /** Current pack state */
  state: PackState;
  /** Check if a specific pack is enabled */
  isPackEnabled: (packId: string) => boolean;
  /** Check if a specific feature is enabled */
  isFeatureEnabled: (featureId: string) => boolean;
  /** Refresh state from source (useful after config changes) */
  refresh: () => Promise<void>;
}

const PackContext = createContext<PackContextValue | undefined>(undefined);

/**
 * Initialize the pack registry with demo packs
 * Called once at provider mount
 */
function initializeRegistry(): void {
  // Register demo packs if not already registered
  for (const pack of demoPacks) {
    try {
      PackRegistry.register(pack);
    } catch {
      // Pack already registered, ignore
    }
  }
}

/**
 * PackProvider - Wraps the app to provide pack state
 * 
 * @example
 * ```tsx
 * <PackProvider>
 *   <App />
 * </PackProvider>
 * ```
 */
export function PackProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PackState>({
    allPacks: [],
    enabledPackIds: new Set(),
    enabledFeatureIds: new Set(),
    initialized: false,
  });

  const loadState = useCallback(async () => {
    // Initialize registry with demo packs
    initializeRegistry();

    // Get all packs from registry
    const allPackDefinitions = PackRegistry.listPacks();
    const allPacks: PackInfo[] = allPackDefinitions.map(packDefinitionToInfo);

    // Get enabled config from source
    const source = getPackStateSource();
    const config = await Promise.resolve(source.getConfig());

    // Build enabled sets
    const enabledPackIds = new Set(
      config.enabledPackIds.filter((id) =>
        allPacks.some((p) => p.id === id)
      )
    );

    const enabledFeatureIds = deriveEnabledFeatures(
      enabledPackIds,
      allPackDefinitions,
      config.featureOverrides
    );

    setState({
      allPacks,
      enabledPackIds,
      enabledFeatureIds,
      initialized: true,
    });
  }, []);

  // Initialize on mount
  useEffect(() => {
    loadState();
  }, [loadState]);

  // Memoized check functions
  const isPackEnabled = useCallback(
    (packId: string) => state.enabledPackIds.has(packId),
    [state.enabledPackIds]
  );

  const isFeatureEnabled = useCallback(
    (featureId: string) => state.enabledFeatureIds.has(featureId),
    [state.enabledFeatureIds]
  );

  const value = useMemo<PackContextValue>(
    () => ({
      state,
      isPackEnabled,
      isFeatureEnabled,
      refresh: loadState,
    }),
    [state, isPackEnabled, isFeatureEnabled, loadState]
  );

  return <PackContext.Provider value={value}>{children}</PackContext.Provider>;
}

/**
 * Hook to access the full pack context
 * @throws Error if used outside PackProvider
 */
export function usePackContext(): PackContextValue {
  const context = useContext(PackContext);
  if (!context) {
    throw new Error('usePackContext must be used within PackProvider');
  }
  return context;
}

/**
 * Hook to get all available packs (whether enabled or not)
 * @returns Array of pack info objects
 */
export function useAvailablePacks(): PackInfo[] {
  const { state } = usePackContext();
  return state.allPacks;
}

/**
 * Hook to get only enabled packs for the current tenant
 * @returns Array of enabled pack info objects
 */
export function useEnabledPacks(): PackInfo[] {
  const { state } = usePackContext();
  return useMemo(
    () => state.allPacks.filter((pack) => state.enabledPackIds.has(pack.id)),
    [state.allPacks, state.enabledPackIds]
  );
}

/**
 * Hook to check if a specific pack is enabled
 * @param packId - The pack ID to check
 * @returns true if the pack is enabled
 */
export function useIsPackEnabled(packId: string): boolean {
  const { isPackEnabled } = usePackContext();
  return isPackEnabled(packId);
}

/**
 * Hook to check if a specific feature is enabled
 * @param featureId - The feature ID to check
 * @returns true if the feature is enabled
 */
export function useIsFeatureEnabled(featureId: string): boolean {
  const { isFeatureEnabled } = usePackContext();
  return isFeatureEnabled(featureId);
}

/**
 * Hook to get pack state initialization status
 * @returns true if pack state has been initialized
 */
export function usePackStateInitialized(): boolean {
  const { state } = usePackContext();
  return state.initialized;
}

