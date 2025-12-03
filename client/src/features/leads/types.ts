/**
 * Lead type definition for UI-6: Mock leads data
 */

export type LeadSource = "google" | "database" | "manual";

export type LeadStatus = "new" | "contacted" | "qualified" | "do_not_contact";

export interface Lead {
  id: string;
  businessName: string;
  location: string;
  source: LeadSource;
  status: LeadStatus;
}

