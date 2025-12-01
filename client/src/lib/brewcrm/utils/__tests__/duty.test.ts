import { describe, it, expect } from 'vitest';
import {
  calculateDuty,
  calculateDutyWithUllage,
  getDutyBand,
  getDutyRate,
  formatDutyBand,
  UK_DUTY_RATES,
  DUTY_BAND_THRESHOLDS,
} from '../duty';

describe('getDutyBand', () => {
  it('returns exempt for ABV below 1.2%', () => {
    expect(getDutyBand(0)).toBe('exempt');
    expect(getDutyBand(0.5)).toBe('exempt');
    expect(getDutyBand(1.19)).toBe('exempt');
  });

  it('returns reduced for ABV 1.2% - 2.8%', () => {
    expect(getDutyBand(1.2)).toBe('reduced');
    expect(getDutyBand(2.0)).toBe('reduced');
    expect(getDutyBand(2.79)).toBe('reduced');
  });

  it('returns standard for ABV 2.8% - 7.5%', () => {
    expect(getDutyBand(2.8)).toBe('standard');
    expect(getDutyBand(4.5)).toBe('standard');
    expect(getDutyBand(7.49)).toBe('standard');
  });

  it('returns higher for ABV 7.5%+', () => {
    expect(getDutyBand(7.5)).toBe('higher');
    expect(getDutyBand(10.0)).toBe('higher');
    expect(getDutyBand(15.0)).toBe('higher');
  });
});

describe('getDutyRate', () => {
  it('returns 0 for exempt band', () => {
    expect(getDutyRate(0.5)).toBe(0);
  });

  it('returns reduced rate for reduced band', () => {
    expect(getDutyRate(2.0)).toBe(UK_DUTY_RATES.reducedRate);
  });

  it('returns standard rate for standard band', () => {
    expect(getDutyRate(5.0)).toBe(UK_DUTY_RATES.standardRate);
  });

  it('returns higher rate for higher band', () => {
    expect(getDutyRate(10.0)).toBe(UK_DUTY_RATES.higherRate);
  });
});

describe('calculateDuty', () => {
  it('returns 0 for zero volume', () => {
    expect(calculateDuty(0, 5.0)).toBe(0);
  });

  it('returns 0 for zero ABV', () => {
    expect(calculateDuty(1000, 0)).toBe(0);
  });

  it('returns 0 for negative values', () => {
    expect(calculateDuty(-100, 5.0)).toBe(0);
    expect(calculateDuty(100, -5.0)).toBe(0);
  });

  it('returns 0 for exempt ABV (<1.2%)', () => {
    expect(calculateDuty(1000, 0.5)).toBe(0);
    expect(calculateDuty(1000, 1.1)).toBe(0);
  });

  it('calculates duty correctly for standard rate beer', () => {
    // 1000 litres of 5% ABV beer
    // = 10 hectolitres × 5% × £21.01
    // = 10 × 5 × 21.01
    // = £1050.50
    const result = calculateDuty(1000, 5.0);
    expect(result).toBeCloseTo(1050.50, 2);
  });

  it('calculates duty correctly for reduced rate beer', () => {
    // 1000 litres of 2% ABV beer
    // = 10 hectolitres × 2% × £8.42
    // = 10 × 2 × 8.42
    // = £168.40
    const result = calculateDuty(1000, 2.0);
    expect(result).toBeCloseTo(168.40, 2);
  });

  it('calculates duty correctly for higher rate beer', () => {
    // 1000 litres of 9% ABV beer
    // = 10 hectolitres × 9% × £28.50
    // = 10 × 9 × 28.50
    // = £2565.00
    const result = calculateDuty(1000, 9.0);
    expect(result).toBeCloseTo(2565.00, 2);
  });

  it('calculates duty for typical cask (72 pints = ~41 litres)', () => {
    // 41 litres of 4% ABV beer
    // = 0.41 hectolitres × 4% × £21.01
    // = 0.41 × 4 × 21.01
    // = £34.4564
    const result = calculateDuty(41, 4.0);
    expect(result).toBeCloseTo(34.46, 1);
  });
});

describe('calculateDutyWithUllage', () => {
  it('deducts ullage from dutiable volume', () => {
    // 1000L sold, 50L ullage → 950L dutiable
    // 950L of 5% ABV = 9.5 HL × 5 × £21.01 = £997.975
    const result = calculateDutyWithUllage(1000, 1000, 50, 5.0);
    expect(result).toBeCloseTo(997.98, 1);
  });

  it('returns 0 if ullage exceeds volume sold', () => {
    const result = calculateDutyWithUllage(1000, 100, 150, 5.0);
    expect(result).toBe(0);
  });

  it('calculates based on volume sold, not produced', () => {
    // Produced 1000L, sold 800L, ullage 50L → 750L dutiable
    const result = calculateDutyWithUllage(1000, 800, 50, 5.0);
    const expected = calculateDuty(750, 5.0);
    expect(result).toBeCloseTo(expected, 2);
  });
});

describe('formatDutyBand', () => {
  it('formats exempt band', () => {
    expect(formatDutyBand('exempt')).toBe('Exempt (< 1.2%)');
  });

  it('formats reduced band', () => {
    expect(formatDutyBand('reduced')).toBe('Reduced Rate (1.2% - 2.8%)');
  });

  it('formats standard band', () => {
    expect(formatDutyBand('standard')).toBe('Standard Rate (2.8% - 7.5%)');
  });

  it('formats higher band', () => {
    expect(formatDutyBand('higher')).toBe('Higher Rate (> 7.5%)');
  });
});

describe('UK_DUTY_RATES', () => {
  it('has expected 2024 rates', () => {
    expect(UK_DUTY_RATES.reducedRate).toBe(8.42);
    expect(UK_DUTY_RATES.standardRate).toBe(21.01);
    expect(UK_DUTY_RATES.higherRate).toBe(28.50);
  });
});

describe('DUTY_BAND_THRESHOLDS', () => {
  it('has expected thresholds', () => {
    expect(DUTY_BAND_THRESHOLDS.minimum).toBe(1.2);
    expect(DUTY_BAND_THRESHOLDS.reducedToStandard).toBe(2.8);
    expect(DUTY_BAND_THRESHOLDS.standardToHigher).toBe(7.5);
  });
});

