import { useState, useEffect, useCallback, useRef } from "react";
import type { Lead, LeadStatus } from "./types";
import { getSupabaseClient } from "@/lib/supabase";
import { apiRequest, handleApiError } from "@/lib/queryClient";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * V1-1.1: useLeads hook with real Supabase data and realtime subscriptions.
 * 
 * Architecture:
 * - READS: Direct Supabase queries to the `leads` table (owned by Supervisor)
 * - WRITES: Stage changes go through Supervisor's POST /api/lead/update endpoint
 * - REALTIME: Supabase realtime subscriptions reflect Supervisor writes
 * 
 * This ensures Supervisor owns business logic for lead mutations.
 */

export interface UseLeadsResult {
  leads: Lead[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  deleteLead: (leadId: string) => Promise<void>;
  updateLeadStatus: (leadId: string, newStatus: LeadStatus) => Promise<void>;
  /** Whether realtime is connected */
  isRealtimeConnected: boolean;
}

/**
 * Map Supabase row to Lead type
 */
function mapSupabaseLeadToLead(row: any): Lead {
  return {
    id: row.id,
    businessName: row.business_name,
    location: row.location,
    source: row.source,
    status: row.status,
    email: row.email || undefined,
    phone: row.phone || undefined,
    website: row.website || undefined,
    notes: row.notes || undefined,
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
   * Update a lead's status via Supervisor's POST /api/lead/update endpoint.
   * 
   * The UI does NOT write directly to Supabase for stage changes.
   * Instead, we call the Supervisor endpoint and rely on realtime
   * subscriptions to reflect the change in the UI.
   */
  const updateLeadStatus = useCallback(async (leadId: string, newStatus: LeadStatus): Promise<void> => {
    // Optimistic update for responsive UI
    setLeads((prev) =>
      prev.map((lead) =>
        lead.id === leadId ? { ...lead, status: newStatus } : lead
      )
    );

    try {
      // Call Supervisor endpoint for stage updates via shared API helper
      await apiRequest("POST", "/api/lead/update", {
        lead_id: leadId,
        updates: { status: newStatus },
      });

      console.log("[useLeads] Lead status updated via Supervisor:", leadId, newStatus);
      // Note: Realtime subscription will confirm the update from Supabase
    } catch (err) {
      // Revert optimistic update on error
      handleApiError(err, "update lead status");
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
    isRealtimeConnected,
  };
}
