import { useState, useEffect, useCallback } from "react";
import type { Lead, LeadStatus } from "./types";
import { mockLeads } from "./mockLeads";
import { isDemoMode } from "@/hooks/useDemoMode";
import { demoSavedLeads } from "@/demo/demoData";

/**
 * Simulated delay for mock API calls (ms)
 * Set to 0 to disable loading simulation
 */
const SIMULATED_DELAY = 800;

/**
 * Toggle to simulate fetch error for testing
 * Set to true to test error UI
 */
const SIMULATE_FETCH_ERROR = false;

/**
 * Toggle to simulate action errors for testing
 * Set to true to test action error handling
 */
const SIMULATE_ACTION_ERROR = false;

export interface UseLeadsResult {
  leads: Lead[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  deleteLead: (leadId: string) => Promise<void>;
  updateLeadStatus: (leadId: string, newStatus: LeadStatus) => Promise<void>;
  /** UI-20: Whether we're showing demo data */
  isDemoData: boolean;
}

/**
 * Custom hook for managing leads data with loading and error states.
 * Simulates API behavior with mock data for UI development.
 * 
 * UI-20: In demo mode, returns demo leads instead of mock/real data.
 * 
 * Usage:
 * - Toggle SIMULATE_FETCH_ERROR to test error UI
 * - Toggle SIMULATE_ACTION_ERROR to test action error handling
 * - Adjust SIMULATED_DELAY to control loading time
 */
export function useLeads(): UseLeadsResult {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemoData, setIsDemoData] = useState(false);

  /**
   * Simulates fetching leads from API
   * UI-20: In demo mode, use demo data instead
   */
  const fetchLeads = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    // UI-20: Check demo mode
    const inDemoMode = isDemoMode();
    setIsDemoData(inDemoMode);

    try {
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, SIMULATED_DELAY));

      // UI-20: In demo mode, use demo leads
      if (inDemoMode) {
        setLeads(demoSavedLeads);
        return;
      }

      // Simulate error if flag is set
      if (SIMULATE_FETCH_ERROR) {
        throw new Error("Failed to fetch leads. Please try again.");
      }

      // Set mock data
      setLeads(mockLeads);
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred";
      setError(message);
      setLeads([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Refetch leads data
   */
  const refetch = useCallback(() => {
    fetchLeads();
  }, [fetchLeads]);

  /**
   * Delete a lead by ID
   * @throws Error if deletion fails
   */
  const deleteLead = useCallback(async (leadId: string): Promise<void> => {
    // Simulate network delay for the action
    await new Promise((resolve) => setTimeout(resolve, 300));

    if (SIMULATE_ACTION_ERROR) {
      throw new Error("Failed to delete lead. Please try again.");
    }

    setLeads((prevLeads) => prevLeads.filter((lead) => lead.id !== leadId));
  }, []);

  /**
   * Update a lead's status
   * @throws Error if update fails
   */
  const updateLeadStatus = useCallback(async (leadId: string, newStatus: LeadStatus): Promise<void> => {
    // Simulate network delay for the action
    await new Promise((resolve) => setTimeout(resolve, 300));

    if (SIMULATE_ACTION_ERROR) {
      throw new Error("Failed to update lead status. Please try again.");
    }

    setLeads((prevLeads) =>
      prevLeads.map((lead) =>
        lead.id === leadId ? { ...lead, status: newStatus } : lead
      )
    );
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  return {
    leads,
    isLoading,
    error,
    refetch,
    deleteLead,
    updateLeadStatus,
    isDemoData,
  };
}

