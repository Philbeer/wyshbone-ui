/**
 * V1-1.4: Lead entity type helpers
 * 
 * Lead field visibility is based ONLY on lead_entity_type (what the lead IS),
 * NOT on industry_vertical (who the USER is).
 * 
 * - industry_vertical = agent behaviour, goals, integrations (user config)
 * - lead_entity_type = pub, brewery, coffee_shop, etc. (lead property)
 */

import type { Lead, LeadEntityType } from '@/features/leads/types';

/**
 * Industry vertical type (for user configuration, NOT for lead field visibility)
 */
export type IndustryVertical = 'generic' | 'brewery';

/**
 * Entity types that should show pub/venue-specific fields
 */
const PUB_ENTITY_TYPES: LeadEntityType[] = ['pub', 'bar'];

/**
 * Check if a lead should show pub/venue-specific fields.
 * 
 * This is based ONLY on lead_entity_type, NOT industry_vertical.
 * 
 * @param lead - The lead to check
 * @returns true if pub/venue fields should be shown
 */
export function shouldShowPubFields(lead: Lead | null | undefined): boolean {
  if (!lead) return false;
  
  // Show pub fields if entity type is 'pub' or 'bar'
  // If entity type is not set, default to showing fields (backwards compat for existing leads)
  if (!lead.lead_entity_type) return true;
  
  return PUB_ENTITY_TYPES.includes(lead.lead_entity_type);
}

/**
 * Check if a lead has any entity type set that warrants industry-specific fields.
 * 
 * @param lead - The lead to check
 * @returns true if lead has an entity type that shows special fields
 */
export function hasIndustrySpecificFields(lead: Lead | null | undefined): boolean {
  if (!lead) return false;
  return shouldShowPubFields(lead);
}

/**
 * Check if any lead in a list should show pub fields
 * 
 * @param leads - Array of leads to check
 * @returns true if at least one lead should show pub fields
 */
export function hasAnyPubLead(leads: Lead[]): boolean {
  return leads.some(shouldShowPubFields);
}

/**
 * @deprecated Use shouldShowPubFields instead. 
 * Kept for backwards compatibility during migration.
 */
export function shouldShowBreweryFields(lead: Lead | null | undefined): boolean {
  return shouldShowPubFields(lead);
}

/**
 * @deprecated Use hasAnyPubLead instead.
 * Kept for backwards compatibility during migration.
 */
export function isBreweryLead(lead: Lead | null | undefined): boolean {
  return shouldShowPubFields(lead);
}

/**
 * Get the entity type from a lead
 * 
 * @param lead - The lead to check
 * @returns The entity type or null if not set
 */
export function getLeadEntityType(lead: Lead | null | undefined): LeadEntityType | null {
  if (!lead || !lead.lead_entity_type) return null;
  return lead.lead_entity_type;
}

/**
 * Check if a lead is a pub (entity_type === 'pub')
 */
export function isPubLead(lead: Lead | null | undefined): boolean {
  if (!lead) return false;
  return lead.lead_entity_type === 'pub';
}

