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
};

