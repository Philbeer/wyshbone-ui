/**
 * Vertical-aware labels system for industry-specific UI copy.
 * 
 * This allows the UI to display brewery-specific terminology like "pubs"
 * instead of generic "leads" when the user's industry vertical is set to "brewery".
 */

/**
 * Supported industry verticals
 */
export type VerticalId = "brewery" | "generic" | "animal_physio" | "other";

/**
 * Keys for all label strings used in the UI
 */
export type VerticalLabelKey =
  // Lead-related labels
  | "lead_singular"
  | "lead_plural"
  | "lead_singular_cap"
  | "lead_plural_cap"
  // Page titles and subtitles
  | "lead_finder_title"
  | "lead_finder_subtitle"
  | "pipeline_title"
  | "pipeline_subtitle"
  // Navigation
  | "nav_leads"
  // Table headers
  | "table_business_name"
  // Empty states
  | "empty_leads_title"
  | "empty_leads_description"
  // Fields (for future vertical-specific fields)
  | "field_beer_range"
  | "field_primary_style";

/**
 * Complete set of labels for a vertical
 */
export type VerticalLabels = Record<VerticalLabelKey, string>;

