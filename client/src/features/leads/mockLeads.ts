import type { Lead } from "./types";

/**
 * Mock leads data for UI-6
 * This will be replaced with real API data in a future task.
 */
export const mockLeads: Lead[] = [
  {
    id: "lead-001",
    businessName: "The Rusty Anchor Pub",
    location: "Leeds, UK",
    source: "google",
    status: "new",
  },
  {
    id: "lead-002",
    businessName: "Brightside Dental Clinic",
    location: "Manchester, UK",
    source: "database",
    status: "contacted",
  },
  {
    id: "lead-003",
    businessName: "Bean & Brew Coffee House",
    location: "Bristol, UK",
    source: "google",
    status: "qualified",
  },
  {
    id: "lead-004",
    businessName: "Green Valley Veterinary",
    location: "Birmingham, UK",
    source: "manual",
    status: "new",
  },
  {
    id: "lead-005",
    businessName: "Urban Fitness Studio",
    location: "London, UK",
    source: "google",
    status: "do_not_contact",
  },
  {
    id: "lead-006",
    businessName: "Cornerstone Bakery",
    location: "Edinburgh, UK",
    source: "database",
    status: "qualified",
  },
];

