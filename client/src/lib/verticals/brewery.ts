import type { VerticalLabels } from "./types";

/**
 * Brewery-specific labels for the UI.
 * 
 * Uses lead/venue terminology for consistency across verticals.
 * Keep it professional - avoid overly casual brewery slang.
 */
export const breweryLabels: VerticalLabels = {
  // Lead-related labels
  lead_singular: "lead",
  lead_plural: "leads",
  lead_singular_cap: "Lead",
  lead_plural_cap: "Leads",

  // Page titles and subtitles
  lead_finder_title: "Find new leads for your beer",
  lead_finder_subtitle: "Search for leads and venues that could stock your range.",
  pipeline_title: "Lead Pipeline",
  pipeline_subtitle: "Track your lead prospects and sales progress.",

  // Navigation
  nav_leads: "Leads",

  // Table headers
  table_business_name: "Business Name",

  // Empty states - UI-19: More actionable copy
  empty_leads_title: "No leads saved yet",
  empty_leads_description: "Ask Wyshbone to find leads for you in the chat, and they'll appear here. Try: \"Find 30 freehouses in Sussex.\"",

  // Brewery-specific fields
  field_beer_range: "Beer Range",
  field_primary_style: "Primary Beer Style",

  // UI-14: Brewery-specific field labels for lead detail/cards
  brewery_info_title: "Venue & Beer Info",
  field_pub_type: "Venue Type",
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
  onboarding_welcome_subtitle: "Let's get you set up to find new leads for your beer.",
  onboarding_welcome_bullet_1: "Define your ideal venue profile",
  onboarding_welcome_bullet_2: "Set your target territory",
  onboarding_welcome_bullet_3: "Start finding leads that match",
  onboarding_step2_title: "Your Ideal Leads",
  onboarding_step2_subtitle: "Tell us about the venues you want to work with.",
  onboarding_step3_title: "Where You Want to Grow",
  onboarding_step3_subtitle: "Define your target territory for finding new leads.",
  onboarding_finish_button: "Start finding leads",
  onboarding_field_preferred_pub_type: "Preferred venue type",
  onboarding_field_beer_range_pref: "Beer range preference",
  onboarding_field_rotation_pref: "Rotation preference",
  onboarding_field_country: "Country",
  onboarding_field_regions: "Target regions or cities",
};
