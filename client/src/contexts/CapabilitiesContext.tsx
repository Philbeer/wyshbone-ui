/**
 * CapabilitiesContext - Loads and provides access to backend capabilities
 * 
 * Fetches available step types, quick actions, and feature flags from
 * GET /api/capabilities on app initialization.
 */

import { createContext, useContext, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { authedFetch } from "@/lib/queryClient";

export interface StepTypeConfig {
  enabled: boolean;
  label: string;
  description: string;
}

export interface QuickAction {
  id: string;
  label: string;
  enabled: boolean;
}

export interface CapabilityFlags {
  outreach_send_enabled: boolean;
  realtime_leads_enabled: boolean;
  monitor_enabled: boolean;
  plan_approval_required: boolean;
}

export interface Capabilities {
  stepTypes: {
    places_search: StepTypeConfig;
    deep_research: StepTypeConfig;
    email_enrich: StepTypeConfig;
    draft_outreach: StepTypeConfig;
  };
  quickActions: QuickAction[];
  flags: CapabilityFlags;
}

interface CapabilitiesContextValue {
  capabilities: Capabilities | null;
  loading: boolean;
  error?: string;
  /** Get label for a step type */
  getStepLabel: (stepType: string) => string;
  /** Check if a step type is enabled */
  isStepEnabled: (stepType: string) => boolean;
  /** Check if outreach sending is enabled */
  canSendOutreach: boolean;
}

const defaultCapabilities: Capabilities = {
  stepTypes: {
    places_search: { enabled: false, label: "Search Businesses", description: "" },
    deep_research: { enabled: true, label: "Deep Research", description: "" },
    email_enrich: { enabled: false, label: "Enrich Emails", description: "" },
    draft_outreach: { enabled: true, label: "Draft Outreach", description: "" }
  },
  quickActions: [],
  flags: {
    outreach_send_enabled: false,
    realtime_leads_enabled: false,
    monitor_enabled: false,
    plan_approval_required: true
  }
};

const CapabilitiesContext = createContext<CapabilitiesContextValue | undefined>(undefined);

export function CapabilitiesProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, error } = useQuery<Capabilities>({
    queryKey: ["/api/capabilities"],
    queryFn: async () => {
      const response = await authedFetch("/api/capabilities");
      if (!response.ok) {
        throw new Error(`Failed to fetch capabilities: ${response.statusText}`);
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 2,
  });

  const capabilities = data || null;

  const getStepLabel = (stepType: string): string => {
    if (!capabilities?.stepTypes) {
      // Fallback labels
      const fallbacks: Record<string, string> = {
        places_search: "Search Businesses",
        deep_research: "Deep Research",
        email_enrich: "Enrich Emails",
        draft_outreach: "Draft Outreach",
        search: "Search",
        enrich: "Enrich",
        outreach: "Outreach"
      };
      return fallbacks[stepType] || stepType;
    }
    
    const config = capabilities.stepTypes[stepType as keyof typeof capabilities.stepTypes];
    return config?.label || stepType;
  };

  const isStepEnabled = (stepType: string): boolean => {
    if (!capabilities?.stepTypes) return false;
    const config = capabilities.stepTypes[stepType as keyof typeof capabilities.stepTypes];
    return config?.enabled || false;
  };

  const value: CapabilitiesContextValue = {
    capabilities,
    loading: isLoading,
    error: error ? String(error) : undefined,
    getStepLabel,
    isStepEnabled,
    canSendOutreach: capabilities?.flags?.outreach_send_enabled || false
  };

  return (
    <CapabilitiesContext.Provider value={value}>
      {children}
    </CapabilitiesContext.Provider>
  );
}

export function useCapabilities() {
  const context = useContext(CapabilitiesContext);
  if (context === undefined) {
    throw new Error('useCapabilities must be used within a CapabilitiesProvider');
  }
  return context;
}

