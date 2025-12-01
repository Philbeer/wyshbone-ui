/**
 * ID Generation Utilities for BrewCRM
 * 
 * Generates human-readable, sortable IDs for orders, batches, and containers.
 * Format patterns include date components for easy identification.
 */

/**
 * Pads a number with leading zeros.
 */
function padNumber(num: number, length: number): string {
  return String(num).padStart(length, '0');
}

/**
 * Gets date components from a Date object.
 */
function getDateComponents(date: Date = new Date()) {
  return {
    year: date.getFullYear(),
    yearShort: date.getFullYear().toString().slice(-2),
    month: padNumber(date.getMonth() + 1, 2),
    day: padNumber(date.getDate(), 2),
  };
}

/**
 * Generates a random number string of specified length.
 */
function randomDigits(length: number): string {
  const max = Math.pow(10, length);
  return padNumber(Math.floor(Math.random() * max), length);
}

/**
 * Generates an order number in format: ORD-YYYYMMDD-XXX
 * 
 * @param date - Optional date (defaults to now)
 * @returns Order number string
 * 
 * @example
 * generateOrderNumber() // "ORD-20241129-472"
 */
export function generateOrderNumber(date: Date = new Date()): string {
  const { year, month, day } = getDateComponents(date);
  const sequence = randomDigits(3);
  return `ORD-${year}${month}${day}-${sequence}`;
}

/**
 * Generates a batch number in format: XXX-YYYYMMDD-XX
 * where XXX is the first 3 characters of the product type (uppercase).
 * 
 * @param productType - Product type/style (e.g., "IPA", "Stout", "Lager")
 * @param date - Optional date (defaults to now)
 * @returns Batch number string
 * 
 * @example
 * generateBatchNumber("IPA") // "IPA-20241129-42"
 * generateBatchNumber("Stout") // "STO-20241129-17"
 */
export function generateBatchNumber(productType: string, date: Date = new Date()): string {
  const { year, month, day } = getDateComponents(date);
  const prefix = productType.substring(0, 3).toUpperCase();
  const sequence = randomDigits(2);
  return `${prefix}-${year}${month}${day}-${sequence}`;
}

/**
 * Generates a container ID in format: XXX-YYMM-XXXX
 * where XXX is the first 3 characters of the container type (uppercase).
 * 
 * @param containerType - Container type (e.g., "cask", "keg", "bottle")
 * @param date - Optional date (defaults to now)
 * @returns Container ID string
 * 
 * @example
 * generateContainerId("cask") // "CAS-2411-3847"
 * generateContainerId("keg") // "KEG-2411-9201"
 */
export function generateContainerId(containerType: string, date: Date = new Date()): string {
  const { yearShort, month } = getDateComponents(date);
  const prefix = containerType.substring(0, 3).toUpperCase();
  const sequence = randomDigits(4);
  return `${prefix}-${yearShort}${month}-${sequence}`;
}

/**
 * Generates a product SKU in format: XXX-XXXX
 * where the first part is derived from the product name.
 * 
 * @param productName - Product name
 * @returns SKU string
 * 
 * @example
 * generateProductSku("Summer Ale") // "SUM-8472"
 */
export function generateProductSku(productName: string): string {
  const prefix = productName.substring(0, 3).toUpperCase();
  const sequence = randomDigits(4);
  return `${prefix}-${sequence}`;
}

/**
 * Regular expression patterns for validating generated IDs.
 */
export const ID_PATTERNS = {
  /** Matches ORD-YYYYMMDD-XXX */
  orderNumber: /^ORD-\d{8}-\d{3}$/,
  /** Matches XXX-YYYYMMDD-XX */
  batchNumber: /^[A-Z]{3}-\d{8}-\d{2}$/,
  /** Matches XXX-YYMM-XXXX */
  containerId: /^[A-Z]{3}-\d{4}-\d{4}$/,
  /** Matches XXX-XXXX */
  productSku: /^[A-Z]{3}-\d{4}$/,
} as const;

/**
 * Validates an order number format.
 */
export function isValidOrderNumber(value: string): boolean {
  return ID_PATTERNS.orderNumber.test(value);
}

/**
 * Validates a batch number format.
 */
export function isValidBatchNumber(value: string): boolean {
  return ID_PATTERNS.batchNumber.test(value);
}

/**
 * Validates a container ID format.
 */
export function isValidContainerId(value: string): boolean {
  return ID_PATTERNS.containerId.test(value);
}

/**
 * Validates a product SKU format.
 */
export function isValidProductSku(value: string): boolean {
  return ID_PATTERNS.productSku.test(value);
}

