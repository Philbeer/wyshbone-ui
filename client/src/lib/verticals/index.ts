/**
 * Vertical Labels System
 * 
 * Provides industry-specific UI labels based on the user's CRM settings.
 * Currently supports: brewery (leads/venues), generic (leads/businesses)
 * 
 * Usage:
 *   const { labels, isLoading } = useVerticalLabels();
 *   // labels.nav_leads → "Leads" (brewery) or "Leads" (generic)
 */

import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/contexts/UserContext";
import type { VerticalId, VerticalLabels, VerticalLabelKey } from "./types";
import { breweryLabels } from "./brewery";
import { genericLabels } from "./generic";

// Re-export types
export type { VerticalId, VerticalLabels, VerticalLabelKey };

/**
 * Registry of label sets by vertical
 */
const LABEL_SETS: Record<VerticalId, VerticalLabels> = {
  brewery: breweryLabels,
  generic: genericLabels,
  animal_physio: genericLabels, // TODO: Add animal_physio labels if needed
  other: genericLabels,
};

/**
 * Get labels for a specific vertical ID
 */
export function getVerticalLabels(verticalId: VerticalId): VerticalLabels {
  return LABEL_SETS[verticalId] ?? genericLabels;
}

/**
 * Hook to get vertical-aware labels based on user's CRM settings.
 * 
 * Fetches the industryVertical from CRM settings API and returns
 * the appropriate label set.
 * 
 * @returns { labels, verticalId, isLoading }
 */
export function useVerticalLabels() {
  const { user } = useUser();
  
  const { data: settings, isLoading } = useQuery<{ industryVertical?: string }>({
    queryKey: ['/api/crm/settings', user.id],
    enabled: !!user.id,
  });

  // Default to brewery for demo purposes, can be changed to "generic" if needed
  // TODO: Once CRM settings are reliably populated, default to "generic"
  const verticalId: VerticalId = 
    (settings?.industryVertical as VerticalId) || "brewery";
  
  const labels = getVerticalLabels(verticalId);

  return {
    labels,
    verticalId,
    isLoading,
  };
}

/**
 * Standalone function to get a single label by key.
 * Useful for components that can't use hooks.
 * 
 * @param verticalId The vertical identifier
 * @param key The label key to retrieve
 * @returns The label string
 */
export function getLabel(verticalId: VerticalId, key: VerticalLabelKey): string {
  return getVerticalLabels(verticalId)[key];
}

