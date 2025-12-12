import { useState, useEffect, useCallback, useRef } from "react";
import type { Lead, LeadStatus } from "./types";
import { getSupabaseClient } from "@/lib/supabase";
import { handleApiError } from "@/lib/queryClient";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * V1-1.1: useLeads hook with real Supabase data and realtime subscriptions.
 * 
 * Architecture:
 * - READS: Direct Supabase queries to the `leads` table
 * - WRITES: Direct Supabase updates (V1 approach - may migrate to API in V2)
 * - REALTIME: Supabase realtime subscriptions reflect writes from all clients
 */

/**
 * V1-1.5: Allowlist of columns that can be updated via updateLead
 * Prevents "column not found" crashes if UI tries to send invalid fields.
 */
export const UPDATABLE_LEAD_COLUMNS = [
  // Standard CRM fields
  'business_name',
  'status',
  'email',
  'phone',
  'website',
  'notes',
  // Classification fields
  'lead_entity_type',
  'relationship_role',
  'priority_tag',
  // Pub/venue fields
  'is_freehouse',
  'cask_lines',
  'keg_lines',
  'has_taproom',
  'annual_production_hl',
  'distribution_type',
  'beer_focus',
  'owns_pubs',
] as const;

/**
 * V1-1.5: Partial lead update payload
 * Contains only the fields that can be updated.
 * Values use string for flexibility (actual options in leadOptions.ts).
 */
export interface LeadUpdatePayload {
  // Standard CRM fields
  business_name?: string | null;
  status?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  notes?: string | null;
  // Classification fields
  lead_entity_type?: string | null;
  relationship_role?: string | null;
  priority_tag?: string | null;
  // Pub/venue fields
  is_freehouse?: boolean | null;
  cask_lines?: number | null;
  keg_lines?: number | null;
  has_taproom?: boolean | null;
  annual_production_hl?: number | null;
  distribution_type?: string | null;
  beer_focus?: string | null;
  owns_pubs?: boolean | null;
}

export interface UseLeadsResult {
  leads: Lead[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  deleteLead: (leadId: string) => Promise<void>;
  updateLeadStatus: (leadId: string, newStatus: LeadStatus) => Promise<void>;
  /** V1-1.4: Update any lead fields including brewery fields */
  updateLead: (leadId: string, updates: LeadUpdatePayload) => Promise<void>;
  /** Whether realtime is connected */
  isRealtimeConnected: boolean;
}

/**
 * Map Supabase row to Lead type
 * 
 * V1-1.4: Now maps brewery-specific fields directly from leads table.
 */
function mapSupabaseLeadToLead(row: any): Lead {
  return {
    id: row.id,
    businessName: row.business_name,
    location: row.location,
    source: row.source,
    status: row.status ?? 'new', // Default to 'new' if missing
    email: row.email || undefined,
    phone: row.phone || undefined,
    website: row.website || undefined,
    notes: row.notes || undefined,
    
    // V1-1.5: Classification fields
    industry_vertical: row.industry_vertical ?? null,
    lead_entity_type: row.lead_entity_type ?? null,
    relationship_role: row.relationship_role ?? null,
    priority_tag: row.priority_tag ?? null,
    
    // Pub/venue fields (V1-1.4)
    is_freehouse: row.is_freehouse ?? null,
    cask_lines: row.cask_lines ?? null,
    keg_lines: row.keg_lines ?? null,
    has_taproom: row.has_taproom ?? null,
    annual_production_hl: row.annual_production_hl ?? null,
    distribution_type: row.distribution_type ?? null,
    beer_focus: row.beer_focus ?? null,
    owns_pubs: row.owns_pubs ?? null,
    
    // Legacy JSONB metadata (backwards compat)
    breweryMetadata: row.brewery_metadata || undefined,
  };
}

/**
 * Custom hook for managing leads data with Supabase reads and Supervisor writes.
 * 
 * Usage:
 * ```tsx
 * const { leads, isLoading, error, refetch, deleteLead, updateLeadStatus } = useLeads();
 * ```
 */
export function useLeads(): UseLeadsResult {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  /**
   * Fetch leads from Supabase (READ operation - direct Supabase access)
   */
  const fetchLeads = useCallback(async () => {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      setError("Supabase not configured. Please check your environment variables.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      const mappedLeads = (data || []).map(mapSupabaseLeadToLead);
      setLeads(mappedLeads);
    } catch (err) {
      const message = handleApiError(err, "fetch leads");
      setError(message);
      setLeads([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Set up realtime subscription for lead changes.
   * This reflects Supervisor writes in real-time.
   */
  const setupRealtimeSubscription = useCallback(() => {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      console.warn("[useLeads] Supabase not configured, skipping realtime");
      return;
    }

    // Clean up existing subscription
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    console.log("[useLeads] Setting up realtime subscription for leads table");

    const channel = supabase
      .channel("leads-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "leads",
        },
        (payload) => {
          console.log("[useLeads] Realtime INSERT:", payload.new);
          const newLead = mapSupabaseLeadToLead(payload.new);
          setLeads((prev) => [newLead, ...prev]);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "leads",
        },
        (payload) => {
          console.log("[useLeads] Realtime UPDATE:", payload.new);
          const updatedLead = mapSupabaseLeadToLead(payload.new);
          setLeads((prev) =>
            prev.map((lead) => (lead.id === updatedLead.id ? updatedLead : lead))
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "leads",
        },
        (payload) => {
          console.log("[useLeads] Realtime DELETE:", payload.old);
          const deletedId = (payload.old as any).id;
          setLeads((prev) => prev.filter((lead) => lead.id !== deletedId));
        }
      )
      .subscribe((status) => {
        console.log("[useLeads] Realtime subscription status:", status);
        setIsRealtimeConnected(status === "SUBSCRIBED");
      });

    channelRef.current = channel;
  }, []);

  /**
   * Clean up realtime subscription
   */
  const cleanupRealtimeSubscription = useCallback(() => {
    const supabase = getSupabaseClient();
    if (channelRef.current && supabase) {
      console.log("[useLeads] Cleaning up realtime subscription");
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
      setIsRealtimeConnected(false);
    }
  }, []);

  /**
   * Refetch leads data
   */
  const refetch = useCallback(() => {
    fetchLeads();
  }, [fetchLeads]);

  /**
   * Delete a lead.
   * 
   * TODO: Route deletes through Supervisor once endpoint exists.
   * Currently using direct Supabase delete as Supervisor does not yet expose
   * a DELETE /api/lead/:id endpoint.
   */
  const deleteLead = useCallback(async (leadId: string): Promise<void> => {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      throw new Error("Supabase not configured");
    }

    // Optimistic update
    setLeads((prev) => prev.filter((lead) => lead.id !== leadId));

    try {
      // TODO: Route deletes through Supervisor once endpoint exists.
      // For now, delete directly via Supabase.
      const { error: deleteError } = await supabase
        .from("leads")
        .delete()
        .eq("id", leadId);

      if (deleteError) {
        throw new Error(deleteError.message);
      }

      console.log("[useLeads] Lead deleted:", leadId);
    } catch (err) {
      // Revert optimistic update on error
      handleApiError(err, "delete lead");
      await fetchLeads(); // Refetch to restore correct state
      throw err;
    }
  }, [fetchLeads]);

  /**
   * Update a lead's status via direct Supabase update.
   * 
   * V1: Uses direct Supabase update. Realtime subscriptions will also
   * reflect the change for other connected clients.
   */
  const updateLeadStatus = useCallback(async (leadId: string, newStatus: LeadStatus): Promise<void> => {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      throw new Error("Supabase not configured");
    }

    // Optimistic update for responsive UI
    setLeads((prev) =>
      prev.map((lead) =>
        lead.id === leadId ? { ...lead, status: newStatus } : lead
      )
    );

    try {
      // Direct Supabase update for status
      const { data, error: updateError } = await supabase
        .from("leads")
        .update({ status: newStatus })
        .eq("id", leadId)
        .select()
        .single();

      if (updateError) {
        throw new Error(updateError.message);
      }

      // Update local state with the returned row
      if (data) {
        const updatedLead = mapSupabaseLeadToLead(data);
        setLeads((prev) =>
          prev.map((lead) => (lead.id === updatedLead.id ? updatedLead : lead))
        );
      }

      console.log("[useLeads] Lead status updated:", leadId, newStatus);
    } catch (err) {
      // Revert optimistic update on error
      handleApiError(err, "update lead status");
      await fetchLeads(); // Refetch to restore correct state
      throw err;
    }
  }, [fetchLeads]);

  /**
   * V1-1.5: Update any lead fields.
   * 
   * Uses direct Supabase update (V1 approach).
   * Only sends fields from UPDATABLE_LEAD_COLUMNS allowlist to prevent crashes.
   */
  const updateLead = useCallback(async (leadId: string, updates: LeadUpdatePayload): Promise<void> => {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      throw new Error("Supabase not configured");
    }

    // Convert DB payload keys to Lead property keys for optimistic update
    // (business_name → businessName, rest are the same)
    const optimisticUpdates: Partial<Lead> = {};
    if (updates.business_name !== undefined) {
      optimisticUpdates.businessName = updates.business_name;
    }
    if (updates.status !== undefined) optimisticUpdates.status = updates.status;
    if (updates.email !== undefined) optimisticUpdates.email = updates.email ?? undefined;
    if (updates.phone !== undefined) optimisticUpdates.phone = updates.phone ?? undefined;
    if (updates.website !== undefined) optimisticUpdates.website = updates.website ?? undefined;
    if (updates.notes !== undefined) optimisticUpdates.notes = updates.notes ?? undefined;
    if (updates.lead_entity_type !== undefined) optimisticUpdates.lead_entity_type = updates.lead_entity_type;
    if (updates.relationship_role !== undefined) optimisticUpdates.relationship_role = updates.relationship_role;
    if (updates.priority_tag !== undefined) optimisticUpdates.priority_tag = updates.priority_tag;
    if (updates.is_freehouse !== undefined) optimisticUpdates.is_freehouse = updates.is_freehouse;
    if (updates.cask_lines !== undefined) optimisticUpdates.cask_lines = updates.cask_lines;
    if (updates.keg_lines !== undefined) optimisticUpdates.keg_lines = updates.keg_lines;
    if (updates.has_taproom !== undefined) optimisticUpdates.has_taproom = updates.has_taproom;
    if (updates.annual_production_hl !== undefined) optimisticUpdates.annual_production_hl = updates.annual_production_hl;
    if (updates.distribution_type !== undefined) optimisticUpdates.distribution_type = updates.distribution_type;
    if (updates.beer_focus !== undefined) optimisticUpdates.beer_focus = updates.beer_focus;
    if (updates.owns_pubs !== undefined) optimisticUpdates.owns_pubs = updates.owns_pubs;

    // Optimistic update for responsive UI
    setLeads((prev) =>
      prev.map((lead) =>
        lead.id === leadId ? { ...lead, ...optimisticUpdates } : lead
      )
    );

    try {
      // Build Supabase-compatible payload using allowlist
      // Only include fields that are defined AND in the allowlist
      const dbPayload: Record<string, any> = {};
      
      for (const column of UPDATABLE_LEAD_COLUMNS) {
        const value = (updates as Record<string, any>)[column];
        if (value !== undefined) {
          dbPayload[column] = value;
        }
      }

      // Safety: if payload is empty, nothing to update
      if (Object.keys(dbPayload).length === 0) {
        console.log("[useLeads] No valid fields to update, skipping");
        return;
      }

      console.log("[useLeads] Updating lead via Supabase:", leadId, dbPayload);

      // Direct Supabase update
      const { data, error: updateError } = await supabase
        .from("leads")
        .update(dbPayload)
        .eq("id", leadId)
        .select()
        .single();

      if (updateError) {
        throw new Error(updateError.message);
      }

      // Update local state with the returned row
      if (data) {
        const updatedLead = mapSupabaseLeadToLead(data);
        setLeads((prev) =>
          prev.map((lead) => (lead.id === updatedLead.id ? updatedLead : lead))
        );
      }

      console.log("[useLeads] Lead updated successfully:", leadId);
    } catch (err) {
      // Revert optimistic update on error
      handleApiError(err, "update lead");
      await fetchLeads(); // Refetch to restore correct state
      throw err;
    }
  }, [fetchLeads]);

  // Initial fetch and realtime setup
  useEffect(() => {
    fetchLeads();
    setupRealtimeSubscription();

    return () => {
      cleanupRealtimeSubscription();
    };
  }, [fetchLeads, setupRealtimeSubscription, cleanupRealtimeSubscription]);

  return {
    leads,
    isLoading,
    error,
    refetch,
    deleteLead,
    updateLeadStatus,
    updateLead,
    isRealtimeConnected,
  };
}
