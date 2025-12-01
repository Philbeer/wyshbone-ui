/**
 * Formatting Utilities for BrewCRM
 * 
 * Helpers for consistent formatting of currency, dates, volumes, and other values.
 */

export type Currency = 'GBP' | 'USD' | 'EUR';

const CURRENCY_CONFIG: Record<Currency, { locale: string; currency: string }> = {
  GBP: { locale: 'en-GB', currency: 'GBP' },
  USD: { locale: 'en-US', currency: 'USD' },
  EUR: { locale: 'de-DE', currency: 'EUR' },
};

/**
 * Formats a number as currency.
 * 
 * @param amount - Amount in major units (e.g., pounds, dollars)
 * @param currency - Currency code (defaults to GBP)
 * @returns Formatted currency string
 * 
 * @example
 * formatCurrency(1234.56) // "£1,234.56"
 * formatCurrency(1234.56, 'USD') // "$1,234.56"
 */
export function formatCurrency(amount: number, currency: Currency = 'GBP'): string {
  const config = CURRENCY_CONFIG[currency];
  return new Intl.NumberFormat(config.locale, {
    style: 'currency',
    currency: config.currency,
  }).format(amount);
}

/**
 * Formats a number from pence/cents to currency.
 * 
 * @param amountPence - Amount in minor units (pence/cents)
 * @param currency - Currency code (defaults to GBP)
 * @returns Formatted currency string
 * 
 * @example
 * formatCurrencyFromPence(123456) // "£1,234.56"
 */
export function formatCurrencyFromPence(amountPence: number, currency: Currency = 'GBP'): string {
  return formatCurrency(amountPence / 100, currency);
}

/**
 * Formats a date in UK format (DD MMM YYYY).
 * 
 * @param date - Date to format (string, Date, or timestamp)
 * @returns Formatted date string
 * 
 * @example
 * formatDate(new Date('2024-11-29')) // "29 Nov 2024"
 */
export function formatDate(date: string | Date | number): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
}

/**
 * Formats a date and time in UK format.
 * 
 * @param date - Date to format
 * @returns Formatted datetime string
 * 
 * @example
 * formatDateTime(new Date()) // "29 Nov 2024, 14:30"
 */
export function formatDateTime(date: string | Date | number): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

/**
 * Formats a date as ISO date string (YYYY-MM-DD).
 * 
 * @param date - Date to format
 * @returns ISO date string
 */
export function formatISODate(date: string | Date | number): string {
  return new Date(date).toISOString().split('T')[0];
}

/**
 * Formats a period string (YYYY-MM) for display.
 * 
 * @param period - Period string in YYYY-MM format
 * @returns Formatted period string (e.g., "November 2024")
 */
export function formatPeriod(period: string): string {
  const [year, month] = period.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export type VolumeUnit = 'L' | 'HL' | 'ml' | 'gal';

/**
 * Formats a volume with unit.
 * 
 * @param volume - Volume value
 * @param unit - Volume unit (defaults to 'L')
 * @param decimals - Number of decimal places (defaults to 1)
 * @returns Formatted volume string
 * 
 * @example
 * formatVolume(1234.567) // "1,234.6 L"
 * formatVolume(10, 'HL') // "10.0 HL"
 */
export function formatVolume(volume: number, unit: VolumeUnit = 'L', decimals: number = 1): string {
  return `${volume.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${unit}`;
}

/**
 * Converts millilitres to litres and formats.
 * 
 * @param millilitres - Volume in millilitres
 * @param decimals - Number of decimal places
 * @returns Formatted volume string in litres
 */
export function formatMillilitresToLitres(millilitres: number, decimals: number = 1): string {
  return formatVolume(millilitres / 1000, 'L', decimals);
}

/**
 * Converts litres to hectolitres and formats.
 * 
 * @param litres - Volume in litres
 * @param decimals - Number of decimal places
 * @returns Formatted volume string in hectolitres
 */
export function formatLitresToHectolitres(litres: number, decimals: number = 2): string {
  return formatVolume(litres / 100, 'HL', decimals);
}

/**
 * Formats ABV percentage.
 * 
 * @param abv - ABV value (e.g., 4.5 for 4.5%)
 * @param decimals - Number of decimal places
 * @returns Formatted ABV string
 * 
 * @example
 * formatAbv(4.5) // "4.5% ABV"
 */
export function formatAbv(abv: number, decimals: number = 1): string {
  return `${abv.toFixed(decimals)}% ABV`;
}

/**
 * Formats a VAT rate from basis points.
 * 
 * @param basisPoints - VAT rate in basis points (e.g., 2000 = 20%)
 * @returns Formatted VAT rate string
 * 
 * @example
 * formatVatRate(2000) // "20.0%"
 * formatVatRate(500) // "5.0%"
 */
export function formatVatRate(basisPoints: number): string {
  return `${(basisPoints / 100).toFixed(1)}%`;
}

/**
 * Gets a relative time description (e.g., "2 days ago").
 * 
 * @param date - Date to compare
 * @returns Relative time string
 */
export function getTimeAgo(date: string | Date | number): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  } else {
    const months = Math.floor(diffDays / 30);
    return `${months} month${months > 1 ? 's' : ''} ago`;
  }
}

