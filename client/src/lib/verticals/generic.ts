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
};

