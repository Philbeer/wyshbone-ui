/**
 * UK Beer Duty Calculation Utilities
 * 
 * Based on UK HMRC beer duty rates (2024).
 * Duty is calculated per hectolitre (100 litres) per % ABV.
 * 
 * Rate bands:
 * - 1.2% - 2.8% ABV: £8.42 per HL per % ABV (reduced rate)
 * - 2.8% - 7.5% ABV: £21.01 per HL per % ABV (standard rate)
 * - 7.5%+ ABV: £28.50 per HL per % ABV (higher rate)
 * 
 * Small Brewery Relief may apply for qualifying breweries.
 */

export interface DutyRates {
  /** Rate for 1.2% - 2.8% ABV (£ per HL per % ABV) */
  reducedRate: number;
  /** Rate for 2.8% - 7.5% ABV (£ per HL per % ABV) */
  standardRate: number;
  /** Rate for 7.5%+ ABV (£ per HL per % ABV) */
  higherRate: number;
}

/**
 * UK beer duty rates as of 2024
 */
export const UK_DUTY_RATES: DutyRates = {
  reducedRate: 8.42,
  standardRate: 21.01,
  higherRate: 28.50,
};

/**
 * Duty band thresholds (ABV percentages)
 */
export const DUTY_BAND_THRESHOLDS = {
  /** Minimum ABV for dutiable beer */
  minimum: 1.2,
  /** Threshold between reduced and standard rate */
  reducedToStandard: 2.8,
  /** Threshold between standard and higher rate */
  standardToHigher: 7.5,
} as const;

export type DutyBand = 'exempt' | 'reduced' | 'standard' | 'higher';

/**
 * Determines the duty band for a given ABV percentage.
 * 
 * @param abvPercent - Alcohol by volume percentage (e.g., 4.5 for 4.5% ABV)
 * @returns The duty band classification
 */
export function getDutyBand(abvPercent: number): DutyBand {
  if (abvPercent < DUTY_BAND_THRESHOLDS.minimum) {
    return 'exempt';
  }
  if (abvPercent < DUTY_BAND_THRESHOLDS.reducedToStandard) {
    return 'reduced';
  }
  if (abvPercent < DUTY_BAND_THRESHOLDS.standardToHigher) {
    return 'standard';
  }
  return 'higher';
}

/**
 * Gets the duty rate (£ per HL per % ABV) for a given ABV percentage.
 * 
 * @param abvPercent - Alcohol by volume percentage (e.g., 4.5 for 4.5% ABV)
 * @param rates - Optional custom rates (defaults to UK 2024 rates)
 * @returns The duty rate in £ per hectolitre per % ABV, or 0 if exempt
 */
export function getDutyRate(abvPercent: number, rates: DutyRates = UK_DUTY_RATES): number {
  const band = getDutyBand(abvPercent);
  switch (band) {
    case 'exempt':
      return 0;
    case 'reduced':
      return rates.reducedRate;
    case 'standard':
      return rates.standardRate;
    case 'higher':
      return rates.higherRate;
  }
}

/**
 * Calculates UK beer duty for a given volume and ABV.
 * 
 * Formula: (volume in litres / 100) × ABV% × rate per HL per % ABV
 * 
 * @param volumeLitres - Volume in litres
 * @param abvPercent - Alcohol by volume percentage (e.g., 4.5 for 4.5% ABV)
 * @param rates - Optional custom rates (defaults to UK 2024 rates)
 * @returns Duty amount in GBP (£)
 * 
 * @example
 * // 1000 litres of 5% ABV beer at standard rate
 * calculateDuty(1000, 5.0) // Returns: 1050.50 (10 HL × 5% × £21.01)
 */
export function calculateDuty(
  volumeLitres: number,
  abvPercent: number,
  rates: DutyRates = UK_DUTY_RATES
): number {
  if (volumeLitres <= 0 || abvPercent <= 0) {
    return 0;
  }

  const rate = getDutyRate(abvPercent, rates);
  if (rate === 0) {
    return 0;
  }

  // Convert litres to hectolitres (divide by 100)
  const hectolitres = volumeLitres / 100;
  
  // Duty = hectolitres × ABV% × rate
  return hectolitres * abvPercent * rate;
}

/**
 * Calculates duty with ullage (wastage) deduction.
 * 
 * @param volumeProducedLitres - Total volume produced in litres
 * @param volumeSoldLitres - Volume sold/released for duty in litres
 * @param ullageLitres - Wastage/ullage volume in litres (deductible)
 * @param abvPercent - Alcohol by volume percentage
 * @param rates - Optional custom rates
 * @returns Duty amount in GBP (£) after ullage deduction
 */
export function calculateDutyWithUllage(
  volumeProducedLitres: number,
  volumeSoldLitres: number,
  ullageLitres: number,
  abvPercent: number,
  rates: DutyRates = UK_DUTY_RATES
): number {
  // Duty is owed on volume sold minus allowable ullage
  const dutiableVolume = Math.max(0, volumeSoldLitres - ullageLitres);
  return calculateDuty(dutiableVolume, abvPercent, rates);
}

/**
 * Formats a duty band for display.
 * 
 * @param band - The duty band
 * @returns Human-readable band description
 */
export function formatDutyBand(band: DutyBand): string {
  switch (band) {
    case 'exempt':
      return 'Exempt (< 1.2%)';
    case 'reduced':
      return 'Reduced Rate (1.2% - 2.8%)';
    case 'standard':
      return 'Standard Rate (2.8% - 7.5%)';
    case 'higher':
      return 'Higher Rate (> 7.5%)';
  }
}

