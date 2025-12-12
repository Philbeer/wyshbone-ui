/**
 * V1-1.4: Brewery Vertical Schema
 * 
 * Single source of truth for brewery-specific fields.
 * These fields are stored directly on the leads table (Option A).
 * 
 * In V2, this may migrate to JSONB vertical_data or separate tables (Option B),
 * but all display labels and field configs will remain here.
 */

/**
 * Supported field types for brewery schema
 */
export type BreweryFieldType = 'text' | 'number' | 'boolean' | 'select';

/**
 * Select option definition
 */
export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Brewery field definition
 */
export interface BreweryFieldDef {
  /** Database column key (snake_case, matches Supabase) */
  key: BreweryFieldKey;
  /** Human-readable label for UI */
  label: string;
  /** Field type for input rendering */
  type: BreweryFieldType;
  /** Whether to show on lead cards in pipeline */
  displayInCard: boolean;
  /** Whether this field is filterable in search/filters */
  filterable: boolean;
  /** Options for select fields */
  options?: SelectOption[];
  /** Placeholder text for inputs */
  placeholder?: string;
}

/**
 * Valid brewery field keys (matches DB columns)
 */
export type BreweryFieldKey =
  | 'is_freehouse'
  | 'cask_lines'
  | 'keg_lines'
  | 'has_taproom'
  | 'annual_production_hl'
  | 'distribution_type'
  | 'beer_focus'
  | 'owns_pubs';

/**
 * Distribution type options
 */
export const DISTRIBUTION_TYPE_OPTIONS: SelectOption[] = [
  { value: 'local', label: 'Local only' },
  { value: 'regional', label: 'Regional' },
  { value: 'national', label: 'National' },
  { value: 'export', label: 'Export' },
  { value: 'mixed', label: 'Mixed' },
];

/**
 * Beer focus options
 */
export const BEER_FOCUS_OPTIONS: SelectOption[] = [
  { value: 'cask', label: 'Cask-focused' },
  { value: 'keg', label: 'Keg-focused' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'craft_keg', label: 'Craft keg' },
  { value: 'lager', label: 'Lager-focused' },
];

/**
 * Brewery fields schema definition
 * 
 * This is the single source of truth for all brewery-specific fields.
 * Used by:
 * - Lead detail panel for rendering edit forms
 * - Pipeline cards for displaying key info
 * - Filters for building filter UI
 * - Update payloads for mapping to API
 */
export const BREWERY_FIELDS: BreweryFieldDef[] = [
  {
    key: 'is_freehouse',
    label: 'Freehouse',
    type: 'boolean',
    displayInCard: true,
    filterable: true,
  },
  {
    key: 'cask_lines',
    label: 'Cask lines',
    type: 'number',
    displayInCard: true,
    filterable: true,
    placeholder: 'e.g. 4',
  },
  {
    key: 'keg_lines',
    label: 'Keg lines',
    type: 'number',
    displayInCard: true,
    filterable: true,
    placeholder: 'e.g. 8',
  },
  {
    key: 'has_taproom',
    label: 'Taproom',
    type: 'boolean',
    displayInCard: true,
    filterable: true,
  },
  {
    key: 'annual_production_hl',
    label: 'Annual production (hL)',
    type: 'number',
    displayInCard: false,
    filterable: true,
    placeholder: 'e.g. 5000',
  },
  {
    key: 'distribution_type',
    label: 'Distribution',
    type: 'select',
    displayInCard: false,
    filterable: true,
    options: DISTRIBUTION_TYPE_OPTIONS,
  },
  {
    key: 'beer_focus',
    label: 'Beer focus',
    type: 'select',
    displayInCard: false,
    filterable: true,
    options: BEER_FOCUS_OPTIONS,
  },
  {
    key: 'owns_pubs',
    label: 'Multi-site operator',
    type: 'boolean',
    displayInCard: false,
    filterable: true,
  },
];

/**
 * Get fields that should display on pipeline cards
 */
export function getCardDisplayFields(): BreweryFieldDef[] {
  return BREWERY_FIELDS.filter((f) => f.displayInCard);
}

/**
 * Get fields that are filterable
 */
export function getFilterableFields(): BreweryFieldDef[] {
  return BREWERY_FIELDS.filter((f) => f.filterable);
}

/**
 * Get a field definition by key
 */
export function getFieldByKey(key: BreweryFieldKey): BreweryFieldDef | undefined {
  return BREWERY_FIELDS.find((f) => f.key === key);
}

/**
 * Get label for a brewery field value
 * Handles select options to return human-readable labels
 */
export function getFieldValueLabel(
  key: BreweryFieldKey,
  value: string | number | boolean | null | undefined
): string {
  if (value === null || value === undefined) {
    return '—';
  }

  const field = getFieldByKey(key);
  if (!field) return String(value);

  // For boolean fields
  if (field.type === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  // For select fields, find the option label
  if (field.type === 'select' && field.options) {
    const option = field.options.find((o) => o.value === value);
    return option?.label ?? String(value);
  }

  // For number fields
  if (field.type === 'number') {
    return String(value);
  }

  return String(value);
}

/**
 * Format a brewery field for compact card display
 * Returns icon-friendly short format
 */
export function formatFieldForCard(
  key: BreweryFieldKey,
  value: string | number | boolean | null | undefined
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  switch (key) {
    case 'is_freehouse':
      return value ? 'Freehouse' : null;
    case 'cask_lines':
      return value ? `${value} cask` : null;
    case 'keg_lines':
      return value ? `${value} keg` : null;
    case 'has_taproom':
      return value ? 'Taproom' : null;
    default:
      return getFieldValueLabel(key, value);
  }
}

