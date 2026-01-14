/**
 * UI-14: Brewery-specific field helpers for leads (pubs/venues).
 * 
 * This module provides utilities to extract and format brewery-relevant
 * information from lead data, specifically for the brewery vertical.
 */

import type { Lead, BreweryLeadMetadata, PubType, CaskBias } from "./types";

/**
 * Extracted brewery fields with formatted display values.
 * Used by UI components to render brewery-specific information.
 */
export interface BreweryLeadFields {
  /** Display label for pub type (e.g. "Freehouse", "Tied House") */
  pubTypeDisplay?: string;
  /** Raw pub type value */
  pubType?: PubType;
  /** Beer range summary (e.g. "4 cask, 6 keg") */
  beerRangeSummary?: string;
  /** Rotation style (e.g. "Rotating guests") */
  rotationStyle?: string;
  /** Cask/keg bias display (e.g. "Cask-led") */
  caskBiasDisplay?: string;
  /** Raw cask bias value */
  caskBias?: CaskBias;
  /** Whether venue serves food */
  servesFood?: boolean;
  /** Whether venue has beer garden */
  hasBeerGarden?: boolean;
  /** Any venue notes */
  venueNotes?: string;
  /** Whether any brewery fields are present */
  hasBreweryData: boolean;
}

/**
 * Human-readable labels for pub types
 */
const PUB_TYPE_LABELS: Record<PubType, string> = {
  freehouse: "Freehouse",
  tied: "Tied House",
  pubco: "Pub Co",
  group: "Group",
  independent: "Independent",
};

/**
 * Human-readable labels for cask bias
 */
const CASK_BIAS_LABELS: Record<CaskBias, string> = {
  "cask-led": "Cask-led",
  "keg-led": "Keg-led",
  balanced: "Balanced",
};

/**
 * Format pub type for display
 */
export function formatPubType(pubType: PubType | undefined): string | undefined {
  if (!pubType) return undefined;
  return PUB_TYPE_LABELS[pubType] ?? pubType;
}

/**
 * Format cask bias for display
 */
export function formatCaskBias(caskBias: CaskBias | undefined): string | undefined {
  if (!caskBias) return undefined;
  return CASK_BIAS_LABELS[caskBias] ?? caskBias;
}

/**
 * Generate a beer range summary from cask/keg line counts
 */
export function generateBeerRangeSummary(
  caskLines?: number,
  kegLines?: number,
  existingSummary?: string
): string | undefined {
  // Use existing summary if provided
  if (existingSummary) return existingSummary;
  
  // Generate from line counts
  if (caskLines === undefined && kegLines === undefined) return undefined;
  
  const parts: string[] = [];
  if (caskLines !== undefined && caskLines > 0) {
    parts.push(`${caskLines} cask`);
  }
  if (kegLines !== undefined && kegLines > 0) {
    parts.push(`${kegLines} keg`);
  }
  
  return parts.length > 0 ? parts.join(", ") : undefined;
}

/**
 * Extract brewery-specific fields from a lead.
 * 
 * This function normalizes brewery data from whatever source it's stored in
 * (breweryMetadata object or future backend fields) into a consistent format
 * for UI rendering.
 * 
 * @param lead The lead to extract brewery fields from
 * @returns Formatted brewery fields for display
 */
export function extractBreweryLeadFields(lead: Lead): BreweryLeadFields {
  const meta: BreweryLeadMetadata = lead.breweryMetadata ?? {};
  
  const pubType = meta.pubType;
  const caskBias = meta.caskBias;
  const beerRangeSummary = generateBeerRangeSummary(
    meta.caskLines,
    meta.kegLines,
    meta.beerRangeSummary
  );
  
  // Check if any brewery data is present
  const hasBreweryData = !!(
    pubType ||
    beerRangeSummary ||
    meta.rotationStyle ||
    caskBias ||
    meta.servesFood !== undefined ||
    meta.hasBeerGarden !== undefined
  );
  
  return {
    pubType,
    pubTypeDisplay: formatPubType(pubType),
    beerRangeSummary,
    rotationStyle: meta.rotationStyle,
    caskBias,
    caskBiasDisplay: formatCaskBias(caskBias),
    servesFood: meta.servesFood,
    hasBeerGarden: meta.hasBeerGarden,
    venueNotes: meta.venueNotes,
    hasBreweryData,
  };
}

/**
 * Generate a compact one-line summary of brewery info for table rows.
 * Example: "Freehouse · 4 cask / 6 keg"
 * 
 * @param lead The lead to summarize
 * @returns Short summary string or undefined if no brewery data
 */
export function getBrewerySummaryLine(lead: Lead): string | undefined {
  const fields = extractBreweryLeadFields(lead);
  
  if (!fields.hasBreweryData) return undefined;
  
  const parts: string[] = [];
  
  if (fields.pubTypeDisplay) {
    parts.push(fields.pubTypeDisplay);
  }
  
  if (fields.beerRangeSummary) {
    parts.push(fields.beerRangeSummary);
  }
  
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

