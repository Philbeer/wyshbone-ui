/**
 * V1-1.5: Lead field options for dropdowns/selects
 * 
 * These define the available options for lead fields in the UI.
 * Values are snake_case for DB storage, labels are user-friendly.
 */

export interface SelectOption {
  value: string;
  label: string;
}

// ============================================
// Status Options (pipeline stage)
// ============================================
export const STATUS_OPTIONS: SelectOption[] = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'replied', label: 'Replied' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
];

// ============================================
// Entity Type Options (what kind of business)
// ============================================
export const ENTITY_TYPE_OPTIONS: SelectOption[] = [
  { value: 'pub', label: 'Pub' },
  { value: 'brewery', label: 'Brewery' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'coffee_shop', label: 'Coffee Shop' },
  { value: 'pub_group', label: 'Pub Group' },
  { value: 'hospitality_group', label: 'Hospitality Group' },
];

// ============================================
// Relationship Role Options
// ============================================
export const RELATIONSHIP_ROLE_OPTIONS: SelectOption[] = [
  { value: 'prospect', label: 'Prospect' },
  { value: 'customer', label: 'Customer' },
  { value: 'supplier', label: 'Supplier' },
  { value: 'partner', label: 'Partner' },
];

// ============================================
// Priority Tag Options
// ============================================
export const PRIORITY_TAG_OPTIONS: SelectOption[] = [
  { value: 'prospect', label: 'Prospect' },
  { value: 'active', label: 'Active' },
  { value: 'contact_made', label: 'Contact Made' },
  { value: 'high_quality', label: 'High Quality' },
  { value: 'very_high_quality', label: 'Very High Quality' },
  { value: 'do_not_contact', label: 'Do Not Contact' },
  { value: 'special_attention', label: 'Special Attention' },
];

// ============================================
// Helper functions
// ============================================

/**
 * Get label for a value from options array
 */
export function getOptionLabel(options: SelectOption[], value: string | null | undefined): string {
  if (!value) return '—';
  return options.find(opt => opt.value === value)?.label ?? value;
}

/**
 * Sentinel value for "Not set" in Select components
 * Radix Select doesn't allow empty string values, so we use this.
 */
export const NONE_VALUE = '__none__';

/**
 * Check if a select value is the "none" sentinel
 */
export function isNoneValue(value: string | undefined): boolean {
  return value === NONE_VALUE || value === undefined || value === '';
}

/**
 * Convert null/undefined to NONE_VALUE for Select, or return actual value
 */
export function toSelectValue(value: string | null | undefined): string | undefined {
  return value ?? undefined;
}

/**
 * Convert Select value to DB value (NONE_VALUE becomes null)
 */
export function fromSelectValue(value: string | undefined): string | null {
  if (!value || value === NONE_VALUE) return null;
  return value;
}

