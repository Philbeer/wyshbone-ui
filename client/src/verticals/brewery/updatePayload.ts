/**
 * V1-1.4: Lead update payload builder for brewery vertical
 * 
 * This module centralizes the mapping of UI form data to API payloads.
 * Keeps all field key mappings in one place for easy migration to Option B later.
 */

import type { Lead } from '@/features/leads/types';
import type { LeadUpdatePayload } from '@/features/leads/useLeads';
import type { BreweryFieldKey } from './schema';

/**
 * Draft lead data from edit form
 * Uses same keys as Lead type for simplicity
 */
export type LeadDraft = Partial<Pick<Lead, 
  // Standard CRM fields
  | 'businessName'
  | 'status'
  | 'email'
  | 'phone'
  | 'website'
  | 'notes'
  // Classification fields
  | 'lead_entity_type'
  | 'relationship_role'
  | 'priority_tag'
  // Pub/venue fields
  | 'is_freehouse'
  | 'cask_lines'
  | 'keg_lines'
  | 'has_taproom'
  | 'annual_production_hl'
  | 'distribution_type'
  | 'beer_focus'
  | 'owns_pubs'
>>;

/**
 * Build API update payload from lead draft
 * 
 * This function handles the mapping from UI form data to API format.
 * When migrating to Option B (JSONB), only this function needs to change.
 * 
 * @param draft - Partial lead data from edit form
 * @returns API-ready update payload
 */
export function buildLeadUpdatePayload(draft: LeadDraft): LeadUpdatePayload {
  const payload: LeadUpdatePayload = {};

  // Map standard CRM fields
  // Note: businessName in UI maps to business_name in DB
  if (draft.businessName !== undefined) payload.business_name = draft.businessName;
  if (draft.status !== undefined) payload.status = draft.status;
  if (draft.email !== undefined) payload.email = draft.email;
  if (draft.phone !== undefined) payload.phone = draft.phone;
  if (draft.website !== undefined) payload.website = draft.website;
  if (draft.notes !== undefined) payload.notes = draft.notes;
  
  // Map classification fields
  if (draft.lead_entity_type !== undefined) payload.lead_entity_type = draft.lead_entity_type;
  if (draft.relationship_role !== undefined) payload.relationship_role = draft.relationship_role;
  if (draft.priority_tag !== undefined) payload.priority_tag = draft.priority_tag;
  
  // Map pub/venue fields (Option A: direct columns)
  if (draft.is_freehouse !== undefined) payload.is_freehouse = draft.is_freehouse;
  if (draft.cask_lines !== undefined) payload.cask_lines = draft.cask_lines;
  if (draft.keg_lines !== undefined) payload.keg_lines = draft.keg_lines;
  if (draft.has_taproom !== undefined) payload.has_taproom = draft.has_taproom;
  if (draft.annual_production_hl !== undefined) payload.annual_production_hl = draft.annual_production_hl;
  if (draft.distribution_type !== undefined) payload.distribution_type = draft.distribution_type;
  if (draft.beer_focus !== undefined) payload.beer_focus = draft.beer_focus;
  if (draft.owns_pubs !== undefined) payload.owns_pubs = draft.owns_pubs;

  return payload;
}

/**
 * Extract only brewery fields from a lead draft
 * 
 * @param draft - Full or partial lead draft
 * @returns Object with only brewery field keys
 */
export function extractBreweryFieldsFromDraft(draft: LeadDraft): Partial<LeadDraft> {
  return {
    is_freehouse: draft.is_freehouse,
    cask_lines: draft.cask_lines,
    keg_lines: draft.keg_lines,
    has_taproom: draft.has_taproom,
    annual_production_hl: draft.annual_production_hl,
    distribution_type: draft.distribution_type,
    beer_focus: draft.beer_focus,
    owns_pubs: draft.owns_pubs,
  };
}

/**
 * Check if a draft has any brewery field changes
 * 
 * @param draft - Lead draft to check
 * @returns true if any brewery field is defined
 */
export function hasBreweryChanges(draft: LeadDraft): boolean {
  return (
    draft.is_freehouse !== undefined ||
    draft.cask_lines !== undefined ||
    draft.keg_lines !== undefined ||
    draft.has_taproom !== undefined ||
    draft.annual_production_hl !== undefined ||
    draft.distribution_type !== undefined ||
    draft.beer_focus !== undefined ||
    draft.owns_pubs !== undefined
  );
}

/**
 * Map brewery field key to Lead property name
 * Used for dynamic field access
 */
export function breweryKeyToLeadProp(key: BreweryFieldKey): keyof Lead {
  // Direct mapping since we're using Option A (same keys)
  return key as keyof Lead;
}

