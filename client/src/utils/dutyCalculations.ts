/**
 * Utility functions for calculating UK beer duty rates based on ABV
 *
 * UK Beer Duty Rates (2024):
 * - Low strength (≤ 3.4% ABV): £8.42 per hectolitre per percentage point
 * - Standard strength (3.5% - 8.5% ABV): £19.08 per hectolitre per percentage point
 * - High strength (> 8.5% ABV): £24.77 per hectolitre per percentage point
 */

export type DutyBand = 'beer_low_strength' | 'beer_standard' | 'beer_high_strength';

interface DutyRateInfo {
  dutyBand: DutyBand;
  ratePerHlPercent: number; // Rate in £ per hectolitre per percentage point
}

/**
 * Calculate the duty band and rate based on ABV percentage
 * @param abvPercent ABV as a percentage (e.g., 4.5 for 4.5%)
 * @returns Duty band and rate information
 */
export function calculateDutyRate(abvPercent: number): DutyRateInfo {
  if (abvPercent <= 3.4) {
    return {
      dutyBand: 'beer_low_strength',
      ratePerHlPercent: 8.42,
    };
  }

  if (abvPercent <= 8.5) {
    return {
      dutyBand: 'beer_standard',
      ratePerHlPercent: 19.08,
    };
  }

  return {
    dutyBand: 'beer_high_strength',
    ratePerHlPercent: 24.77,
  };
}

/**
 * Convert ABV from Untappd format (float percentage) to database format (basis points)
 * @param abvPercent ABV as a percentage (e.g., 4.5 for 4.5%)
 * @returns ABV in basis points (e.g., 450 for 4.5%)
 */
export function abvPercentToBasisPoints(abvPercent: number): number {
  return Math.round(abvPercent * 100);
}

/**
 * Convert ABV from database format (basis points) to percentage
 * @param basisPoints ABV in basis points (e.g., 450 for 4.5%)
 * @returns ABV as a percentage (e.g., 4.5 for 4.5%)
 */
export function abvBasisPointsToPercent(basisPoints: number): number {
  return basisPoints / 100;
}

/**
 * Get a human-readable duty band label
 * @param dutyBand The duty band identifier
 * @returns Human-readable label
 */
export function getDutyBandLabel(dutyBand: DutyBand): string {
  const labels: Record<DutyBand, string> = {
    beer_low_strength: 'Low Strength (≤3.4% ABV)',
    beer_standard: 'Standard (3.5-8.5% ABV)',
    beer_high_strength: 'High Strength (>8.5% ABV)',
  };

  return labels[dutyBand] || dutyBand;
}
