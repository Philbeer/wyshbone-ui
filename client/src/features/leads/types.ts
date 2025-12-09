/**
 * Lead type definition for V1-1.1: Real Supabase lead data
 * Extended in UI-14 to support brewery-specific fields for pubs/venues.
 */

export type LeadSource = "google" | "database" | "manual" | "supervisor";

export type LeadStatus = "new" | "contacted" | "qualified" | "do_not_contact";

/**
 * Pub ownership/affiliation type
 */
export type PubType = "freehouse" | "tied" | "pubco" | "group" | "independent";

/**
 * Beer range preference (cask vs keg bias)
 */
export type CaskBias = "cask-led" | "keg-led" | "balanced";

/**
 * UI-14: Brewery-specific metadata for leads (pubs/venues).
 * These fields are optional and only shown when vertical = "brewery".
 * Stored as JSONB in Supabase `brewery_metadata` column.
 */
export interface BreweryLeadMetadata {
  /** Pub type - freehouse, tied house, pubco, group, independent */
  pubType?: PubType;
  /** Short description of beer offering, e.g. "4 cask lines, 6 keg lines" */
  beerRangeSummary?: string;
  /** Rotation behaviour, e.g. "rotating guests", "core range only", "seasonal" */
  rotationStyle?: string;
  /** Cask / keg bias - "cask-led", "keg-led", "balanced" */
  caskBias?: CaskBias;
  /** Number of cask lines/handpulls */
  caskLines?: number;
  /** Number of keg lines */
  kegLines?: number;
  /** Does the venue serve food? */
  servesFood?: boolean;
  /** Does the venue have a beer garden / outdoor space? */
  hasBeerGarden?: boolean;
  /** Any additional notes about the venue */
  venueNotes?: string;
}

export interface Lead {
  id: string;
  businessName: string;
  location: string;
  source: LeadSource;
  status: LeadStatus;
  
  /** Contact email (optional) */
  email?: string;
  /** Contact phone (optional) */
  phone?: string;
  /** Business website (optional) */
  website?: string;
  /** Additional notes */
  notes?: string;
  
  /**
   * UI-14: Optional brewery-specific metadata for leads.
   * Only populated/rendered when vertical = "brewery".
   */
  breweryMetadata?: BreweryLeadMetadata;
}
