/**
 * BrewCRM Utility Functions
 * 
 * Reusable utilities for brewery-specific CRM operations.
 * Extracted and adapted from the legacy brewery-crm-replit project.
 */

// Duty calculation utilities
export {
  calculateDuty,
  calculateDutyWithUllage,
  getDutyBand,
  getDutyRate,
  formatDutyBand,
  UK_DUTY_RATES,
  DUTY_BAND_THRESHOLDS,
  type DutyBand,
  type DutyRates,
} from './duty';

// ID generation utilities
export {
  generateOrderNumber,
  generateBatchNumber,
  generateContainerId,
  generateProductSku,
  isValidOrderNumber,
  isValidBatchNumber,
  isValidContainerId,
  isValidProductSku,
  ID_PATTERNS,
} from './ids';

// Formatting utilities
export {
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
  type Currency,
  type VolumeUnit,
} from './formatting';

// Status utilities
export {
  getStatusColor,
  getStatusBadgeVariant,
  formatStatus,
  getBatchStatusOptions,
  getOrderStatusOptions,
  getContainerStatusOptions,
  getDeliveryRunStatusOptions,
  type BatchStatus,
  type OrderStatus,
  type ContainerStatus,
  type DeliveryRunStatus,
  type InventoryStockStatus,
  type AnyStatus,
  type StatusColorClasses,
} from './status';

