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
  | "field_primary_style"
  // UI-14: Brewery-specific field labels for lead detail/cards
  | "brewery_info_title"
  | "field_pub_type"
  | "field_rotation_style"
  | "field_cask_bias"
  | "field_cask_lines"
  | "field_keg_lines"
  | "field_serves_food"
  | "field_has_beer_garden"
  | "field_venue_notes"
  | "badge_serves_food"
  | "badge_beer_garden"
  // UI-15: Onboarding wizard labels
  | "onboarding_welcome_title"
  | "onboarding_welcome_subtitle"
  | "onboarding_welcome_bullet_1"
  | "onboarding_welcome_bullet_2"
  | "onboarding_welcome_bullet_3"
  | "onboarding_step2_title"
  | "onboarding_step2_subtitle"
  | "onboarding_step3_title"
  | "onboarding_step3_subtitle"
  | "onboarding_finish_button"
  | "onboarding_field_preferred_pub_type"
  | "onboarding_field_beer_range_pref"
  | "onboarding_field_rotation_pref"
  | "onboarding_field_country"
  | "onboarding_field_regions";

/**
 * Complete set of labels for a vertical
 */
export type VerticalLabels = Record<VerticalLabelKey, string>;

