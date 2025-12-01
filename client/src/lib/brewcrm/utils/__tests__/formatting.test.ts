import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatCurrencyFromPence,
  formatDate,
  formatDateTime,
  formatISODate,
  formatPeriod,
  formatVolume,
  formatMillilitresToLitres,
  formatLitresToHectolitres,
  formatAbv,
  formatVatRate,
  getTimeAgo,
} from '../formatting';

describe('formatCurrency', () => {
  it('formats GBP by default', () => {
    const result = formatCurrency(1234.56);
    expect(result).toContain('1,234.56');
    expect(result).toContain('£');
  });

  it('formats USD', () => {
    const result = formatCurrency(1234.56, 'USD');
    expect(result).toContain('1,234.56');
    expect(result).toContain('$');
  });

  it('formats EUR', () => {
    const result = formatCurrency(1234.56, 'EUR');
    expect(result).toContain('1.234,56'); // German locale uses comma for decimals
    expect(result).toContain('€');
  });

  it('handles zero', () => {
    const result = formatCurrency(0);
    expect(result).toBe('£0.00');
  });

  it('handles negative values', () => {
    const result = formatCurrency(-50);
    expect(result).toContain('50.00');
  });
});

describe('formatCurrencyFromPence', () => {
  it('converts pence to pounds', () => {
    expect(formatCurrencyFromPence(12345)).toBe('£123.45');
  });

  it('handles zero pence', () => {
    expect(formatCurrencyFromPence(0)).toBe('£0.00');
  });

  it('handles small amounts', () => {
    expect(formatCurrencyFromPence(50)).toBe('£0.50');
  });
});

describe('formatDate', () => {
  it('formats Date objects', () => {
    const date = new Date('2024-11-29');
    const result = formatDate(date);
    expect(result).toBe('29 Nov 2024');
  });

  it('formats date strings', () => {
    const result = formatDate('2024-03-15');
    expect(result).toBe('15 Mar 2024');
  });

  it('formats timestamps', () => {
    const timestamp = new Date('2024-06-01').getTime();
    const result = formatDate(timestamp);
    expect(result).toBe('1 Jun 2024');
  });
});

describe('formatDateTime', () => {
  it('includes time component', () => {
    const date = new Date('2024-11-29T14:30:00');
    const result = formatDateTime(date);
    expect(result).toContain('29 Nov 2024');
    expect(result).toContain('14:30');
  });
});

describe('formatISODate', () => {
  it('returns YYYY-MM-DD format', () => {
    const date = new Date('2024-11-29T14:30:00Z');
    const result = formatISODate(date);
    expect(result).toBe('2024-11-29');
  });
});

describe('formatPeriod', () => {
  it('formats YYYY-MM as month name and year', () => {
    expect(formatPeriod('2024-11')).toBe('November 2024');
    expect(formatPeriod('2024-01')).toBe('January 2024');
    expect(formatPeriod('2023-06')).toBe('June 2023');
  });
});

describe('formatVolume', () => {
  it('formats with litres by default', () => {
    expect(formatVolume(1234.5)).toBe('1,234.5 L');
  });

  it('formats with specified unit', () => {
    expect(formatVolume(10, 'HL')).toBe('10.0 HL');
    expect(formatVolume(500, 'ml')).toBe('500.0 ml');
  });

  it('respects decimal places', () => {
    expect(formatVolume(123.456, 'L', 2)).toBe('123.46 L');
    expect(formatVolume(123.456, 'L', 0)).toBe('123 L');
  });
});

describe('formatMillilitresToLitres', () => {
  it('converts and formats correctly', () => {
    expect(formatMillilitresToLitres(1000)).toBe('1.0 L');
    expect(formatMillilitresToLitres(500)).toBe('0.5 L');
    expect(formatMillilitresToLitres(1500)).toBe('1.5 L');
  });

  it('respects decimal places', () => {
    expect(formatMillilitresToLitres(1234, 2)).toBe('1.23 L');
  });
});

describe('formatLitresToHectolitres', () => {
  it('converts and formats correctly', () => {
    expect(formatLitresToHectolitres(100)).toBe('1.00 HL');
    expect(formatLitresToHectolitres(1000)).toBe('10.00 HL');
    expect(formatLitresToHectolitres(50)).toBe('0.50 HL');
  });
});

describe('formatAbv', () => {
  it('formats ABV percentage', () => {
    expect(formatAbv(4.5)).toBe('4.5% ABV');
    expect(formatAbv(5)).toBe('5.0% ABV');
  });

  it('respects decimal places', () => {
    expect(formatAbv(4.56, 2)).toBe('4.56% ABV');
    expect(formatAbv(4.5, 0)).toBe('5% ABV');
  });
});

describe('formatVatRate', () => {
  it('converts basis points to percentage', () => {
    expect(formatVatRate(2000)).toBe('20.0%');
    expect(formatVatRate(500)).toBe('5.0%');
    expect(formatVatRate(0)).toBe('0.0%');
  });
});

describe('getTimeAgo', () => {
  it('returns "Today" for current date', () => {
    const now = new Date();
    expect(getTimeAgo(now)).toBe('Today');
  });

  it('returns "Yesterday" for previous day', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(getTimeAgo(yesterday)).toBe('Yesterday');
  });

  it('returns days ago for recent dates', () => {
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    expect(getTimeAgo(fiveDaysAgo)).toBe('5 days ago');
  });

  it('returns weeks ago for 7-30 days', () => {
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    expect(getTimeAgo(twoWeeksAgo)).toBe('2 weeks ago');
  });

  it('returns months ago for 30+ days', () => {
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setDate(twoMonthsAgo.getDate() - 60);
    expect(getTimeAgo(twoMonthsAgo)).toBe('2 months ago');
  });
});

