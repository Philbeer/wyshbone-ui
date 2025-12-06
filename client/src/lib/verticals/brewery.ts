import type { VerticalLabels } from "./types";

/**
 * Brewery-specific labels for the UI.
 * 
 * Uses pub/venue terminology instead of generic business/lead language.
 * Keep it professional - avoid overly casual brewery slang.
 */
export const breweryLabels: VerticalLabels = {
  // Lead-related labels
  lead_singular: "pub",
  lead_plural: "pubs",
  lead_singular_cap: "Pub",
  lead_plural_cap: "Pubs",

  // Page titles and subtitles
  lead_finder_title: "Find new pubs for your beer",
  lead_finder_subtitle: "Search for pubs and venues that could stock your range.",
  pipeline_title: "Pub Pipeline",
  pipeline_subtitle: "Track your pub prospects and sales progress.",

  // Navigation
  nav_leads: "Pubs",

  // Table headers
  table_business_name: "Pub Name",

  // Empty states
  empty_leads_title: "No pubs yet",
  empty_leads_description: "AI-generated pub leads will appear here once connected to the lead generation pipeline.",

  // Brewery-specific fields
  field_beer_range: "Beer Range",
  field_primary_style: "Primary Beer Style",

  // UI-14: Brewery-specific field labels for lead detail/cards
  brewery_info_title: "Pub & Beer Info",
  field_pub_type: "Pub Type",
  field_rotation_style: "Rotation",
  field_cask_bias: "Cask / Keg Bias",
  field_cask_lines: "Cask Lines",
  field_keg_lines: "Keg Lines",
  field_serves_food: "Kitchen",
  field_has_beer_garden: "Outdoor Space",
  field_venue_notes: "Notes",
  badge_serves_food: "Serves food",
  badge_beer_garden: "Beer garden",

  // UI-15: Onboarding wizard labels
  onboarding_welcome_title: "Welcome to Wyshbone for Breweries",
  onboarding_welcome_subtitle: "Let's get you set up to find new pubs for your beer.",
  onboarding_welcome_bullet_1: "Define your ideal pub profile",
  onboarding_welcome_bullet_2: "Set your target territory",
  onboarding_welcome_bullet_3: "Start finding pubs that match",
  onboarding_step2_title: "Your Ideal Pubs",
  onboarding_step2_subtitle: "Tell us about the pubs you want to work with.",
  onboarding_step3_title: "Where You Want to Grow",
  onboarding_step3_subtitle: "Define your target territory for finding new pubs.",
  onboarding_finish_button: "Start finding pubs",
  onboarding_field_preferred_pub_type: "Preferred pub type",
  onboarding_field_beer_range_pref: "Beer range preference",
  onboarding_field_rotation_pref: "Rotation preference",
  onboarding_field_country: "Country",
  onboarding_field_regions: "Target regions or cities",
};

