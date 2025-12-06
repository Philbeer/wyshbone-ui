import type { VerticalLabels } from "./types";

/**
 * Generic/default labels for the UI.
 * 
 * Used when no specific vertical is set or for non-brewery verticals.
 */
export const genericLabels: VerticalLabels = {
  // Lead-related labels
  lead_singular: "lead",
  lead_plural: "leads",
  lead_singular_cap: "Lead",
  lead_plural_cap: "Leads",

  // Page titles and subtitles
  lead_finder_title: "Lead Finder",
  lead_finder_subtitle: "Search for new leads and business opportunities.",
  pipeline_title: "Lead Pipeline",
  pipeline_subtitle: "Track your leads and sales progress.",

  // Navigation
  nav_leads: "Leads",

  // Table headers
  table_business_name: "Business Name",

  // Empty states
  empty_leads_title: "No leads yet",
  empty_leads_description: "AI-generated leads will appear here once connected to the lead generation pipeline.",

  // Generic field labels (not used in generic mode, but required by type)
  field_beer_range: "Product Range",
  field_primary_style: "Primary Style",

  // UI-14: Generic fallbacks for brewery labels (not typically shown in generic mode)
  brewery_info_title: "Business Info",
  field_pub_type: "Business Type",
  field_rotation_style: "Style",
  field_cask_bias: "Preference",
  field_cask_lines: "Primary Lines",
  field_keg_lines: "Secondary Lines",
  field_serves_food: "Services Food",
  field_has_beer_garden: "Outdoor Space",
  field_venue_notes: "Notes",
  badge_serves_food: "Serves food",
  badge_beer_garden: "Outdoor space",

  // UI-15: Generic onboarding labels (fallbacks)
  onboarding_welcome_title: "Welcome to Wyshbone",
  onboarding_welcome_subtitle: "Let's get you set up to find new leads.",
  onboarding_welcome_bullet_1: "Define your ideal customer profile",
  onboarding_welcome_bullet_2: "Set your target territory",
  onboarding_welcome_bullet_3: "Start finding leads that match",
  onboarding_step2_title: "Your Ideal Customers",
  onboarding_step2_subtitle: "Tell us about the customers you want to work with.",
  onboarding_step3_title: "Where You Want to Grow",
  onboarding_step3_subtitle: "Define your target territory for finding new leads.",
  onboarding_finish_button: "Start finding leads",
  onboarding_field_preferred_pub_type: "Preferred business type",
  onboarding_field_beer_range_pref: "Product range preference",
  onboarding_field_rotation_pref: "Style preference",
  onboarding_field_country: "Country",
  onboarding_field_regions: "Target regions or cities",
};

