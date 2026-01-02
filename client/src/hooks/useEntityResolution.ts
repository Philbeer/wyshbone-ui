/**
 * React Query Hooks for Entity Resolution System
 * 
 * Provides hooks for:
 * - Xero customer import
 * - Upcoming events/things
 * - Manual entity review queue
 * - Pub search with debouncing
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authedFetch, apiRequest, handleApiError } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/useDebounce";
import { useUser } from "@/contexts/UserContext";

// ============================================
// TYPES
// ============================================

/**
 * Xero import job response
 */
export interface XeroImportJobResponse {
  success: boolean;
  jobId: string;
  message: string;
  pollUrl?: string;
}

/**
 * Xero import job status
 */
export interface XeroImportJobStatus {
  id: number;
  status: "pending" | "running" | "completed" | "failed";
  jobType: string;
  processedRecords?: number;
  totalRecords?: number;
  failedRecords?: number;
  errorMessage?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

/**
 * Thing (event) from the database
 */
export interface Thing {
  id: number;
  workspaceId: number;
  thingType: string;
  name: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isRecurring?: boolean;
  recurrencePattern?: string | null;
  outletId?: number | null;
  standaloneLocation?: string | null;
  standaloneAddress?: string | null;
  standalonePostcode?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  url?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  ticketPrice?: string | null;
  expectedAttendance?: number | null;
  organizer?: string | null;
  status?: string;
  userInterested?: boolean;
  userAttended?: boolean;
  userNotes?: string | null;
  userRating?: number | null;
  discoveredBy?: string | null;
  discoveredAt?: string | null;
  sourceUrl?: string | null;
  relevanceScore?: number | null;
  leadPotentialScore?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  // Joined outlet data
  outlet?: {
    id: number;
    name: string;
    postcode?: string | null;
    city?: string | null;
  } | null;
}

/**
 * Entity review queue item
 */
export interface ReviewQueueItem {
  id: number;
  workspaceId: number;
  newPubData: {
    name: string;
    postcode?: string | null;
    phone?: string | null;
    address?: string | null;
  };
  sourceType: string;
  sourceId?: string | null;
  possibleMatchPubId?: number | null;
  possibleMatch?: {
    id: number;
    name: string;
    postcode?: string | null;
    addressLine1?: string | null;
    city?: string | null;
  } | null;
  confidence: number;
  reasoning?: string | null;
  status: "pending" | "resolved";
  reviewedBy?: number | null;
  reviewedAt?: string | null;
  reviewDecision?: string | null;
  createdAt?: string | null;
}

/**
 * Pub from search results
 */
export interface PubSearchResult {
  id: number;
  name: string;
  postcode?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  phone?: string | null;
  isCustomer?: boolean;
  isFreehouse?: boolean | null;
  relevanceScore?: number;
  sources?: Array<{
    sourceType: string;
    sourceId?: string | null;
    confidence?: number;
  }>;
}

/**
 * Entity source for a pub
 */
export interface EntitySource {
  id: number;
  pubId: number;
  sourceType: string;
  sourceId?: string | null;
  sourceData?: Record<string, unknown>;
  confidence?: number;
  matchedAt?: string | null;
  matchedBy?: string | null;
  matchedReasoning?: string | null;
  createdAt?: string | null;
}

/**
 * Review queue filters
 */
export interface ReviewQueueFilters {
  sourceType?: string;
  status?: "pending" | "resolved";
  minConfidence?: number;
  maxConfidence?: number;
}

// ============================================
// XERO CUSTOMER IMPORT
// ============================================

/**
 * Hook to import Xero customers with AI matching.
 * 
 * Triggers an async import job and returns a job ID for polling.
 */
export function useImportXeroCustomers() {
  const queryClient = useQueryClient();
  const { user } = useUser();

  return useMutation({
    mutationFn: async (): Promise<XeroImportJobResponse> => {
      if (!user?.id) {
        throw new Error("User not authenticated");
      }

      const response = await apiRequest("POST", "/api/xero/import/customers-ai");
      return response.json() as Promise<XeroImportJobResponse>;
    },
    onSuccess: (data) => {
      toast({
        title: "Import Started",
        description: `Xero customer import started. Job ID: ${data.jobId}`,
      });
      
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["/api/pubs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/xero/import/jobs"] });
    },
    onError: (error) => {
      const message = handleApiError(error, "import Xero customers");
      toast({
        title: "Import Failed",
        description: message,
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook to poll Xero import job status.
 */
export function useXeroImportJobStatus(jobId: number | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["/api/xero/import/jobs", jobId],
    queryFn: async (): Promise<XeroImportJobStatus> => {
      if (!jobId) throw new Error("No job ID provided");
      
      const response = await authedFetch(`/api/xero/import/jobs/${jobId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch job status: ${response.statusText}`);
      }
      const data = await response.json();
      return data.job;
    },
    enabled: options?.enabled !== false && !!jobId,
    refetchInterval: (query) => {
      // Poll every 2 seconds while job is running
      const data = query.state.data;
      if (data?.status === "running" || data?.status === "pending") {
        return 2000;
      }
      return false;
    },
  });
}

// ============================================
// UPCOMING EVENTS (THINGS)
// ============================================

/**
 * Hook to fetch upcoming events/things.
 * 
 * @param workspaceId - Workspace ID (uses current user if not provided)
 * @param limit - Max number of events to return (default 20)
 */
export function useUpcomingEvents(workspaceId?: number, limit: number = 20) {
  const { user } = useUser();
  const effectiveWorkspaceId = workspaceId || (user?.id ? parseInt(user.id) : undefined);

  return useQuery({
    queryKey: ["/api/things/upcoming", effectiveWorkspaceId, limit],
    queryFn: async (): Promise<Thing[]> => {
      const params = new URLSearchParams();
      if (effectiveWorkspaceId) params.set("workspaceId", effectiveWorkspaceId.toString());
      params.set("limit", limit.toString());
      
      const response = await authedFetch(`/api/things/upcoming?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch upcoming events: ${response.statusText}`);
      }
      const data = await response.json();
      return data.things || data;
    },
    enabled: !!effectiveWorkspaceId,
    refetchInterval: 10 * 60 * 1000, // Refetch every 10 minutes
    staleTime: 5 * 60 * 1000, // Consider stale after 5 minutes
  });
}

/**
 * Hook to fetch events for a specific outlet.
 */
export function useOutletEvents(outletId: number | null) {
  const { user } = useUser();

  return useQuery({
    queryKey: ["/api/things/outlet", outletId],
    queryFn: async (): Promise<Thing[]> => {
      if (!outletId) throw new Error("No outlet ID provided");
      
      const response = await authedFetch(`/api/things/outlet/${outletId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch outlet events: ${response.statusText}`);
      }
      const data = await response.json();
      return data.things || data;
    },
    enabled: !!outletId && !!user?.id,
  });
}

/**
 * Hook to mark user interested in an event.
 */
export function useMarkEventInterested() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ thingId, interested }: { thingId: number; interested: boolean }) => {
      return apiRequest("PATCH", `/api/things/${thingId}/interested`, { interested });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/things"] });
    },
    onError: (error) => {
      const message = handleApiError(error, "update event interest");
      toast({
        title: "Update Failed",
        description: message,
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook to mark user attended an event.
 */
export function useMarkEventAttended() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ thingId, attended }: { thingId: number; attended: boolean }) => {
      return apiRequest("PATCH", `/api/things/${thingId}/attended`, { attended });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/things"] });
      toast({
        title: "Updated",
        description: "Event attendance recorded",
      });
    },
    onError: (error) => {
      const message = handleApiError(error, "update event attendance");
      toast({
        title: "Update Failed",
        description: message,
        variant: "destructive",
      });
    },
  });
}

// ============================================
// MANUAL REVIEW QUEUE
// ============================================

/**
 * Hook to fetch the entity review queue.
 * 
 * @param workspaceId - Workspace ID (uses current user if not provided)
 * @param filters - Optional filters (sourceType, status, confidence range)
 */
export function useManualReviewQueue(workspaceId?: number, filters?: ReviewQueueFilters) {
  const { user } = useUser();
  const effectiveWorkspaceId = workspaceId || (user?.id ? parseInt(user.id) : undefined);

  return useQuery({
    queryKey: ["/api/entity-review/queue", effectiveWorkspaceId, filters],
    queryFn: async (): Promise<ReviewQueueItem[]> => {
      const params = new URLSearchParams();
      if (effectiveWorkspaceId) params.set("workspaceId", effectiveWorkspaceId.toString());
      if (filters?.sourceType) params.set("sourceType", filters.sourceType);
      if (filters?.status) params.set("status", filters.status);
      if (filters?.minConfidence !== undefined) params.set("minConfidence", filters.minConfidence.toString());
      if (filters?.maxConfidence !== undefined) params.set("maxConfidence", filters.maxConfidence.toString());
      
      const response = await authedFetch(`/api/entity-review/queue?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch review queue: ${response.statusText}`);
      }
      const data = await response.json();
      return data.reviews || data;
    },
    enabled: !!effectiveWorkspaceId,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to approve a review (merge with existing pub or create new).
 */
export function useApproveReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      reviewId, 
      decision 
    }: { 
      reviewId: number; 
      decision: "match" | "new"; 
    }) => {
      return apiRequest("POST", `/api/entity-review/${reviewId}/approve`, { decision });
    },
    onSuccess: async (_, variables) => {
      // Force immediate refetch of review queue and stats
      await queryClient.invalidateQueries({ 
        queryKey: ["/api/entity-review/queue"],
        refetchType: 'all',
      });
      await queryClient.invalidateQueries({ 
        queryKey: ["/api/entity-review/stats"],
        refetchType: 'all',
      });
      queryClient.invalidateQueries({ queryKey: ["/api/pubs"] });
      
      toast({
        title: "Review Approved",
        description: variables.decision === "match" 
          ? "Entity merged with existing pub" 
          : "New pub created",
      });
    },
    onError: (error) => {
      const message = handleApiError(error, "approve review");
      toast({
        title: "Approval Failed",
        description: message,
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook to reject/skip a review.
 */
export function useRejectReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ reviewId }: { reviewId: number }) => {
      return apiRequest("POST", `/api/entity-review/${reviewId}/reject`);
    },
    onSuccess: async () => {
      // Force immediate refetch of review queue and stats
      await queryClient.invalidateQueries({ 
        queryKey: ["/api/entity-review/queue"],
        refetchType: 'all',
      });
      await queryClient.invalidateQueries({ 
        queryKey: ["/api/entity-review/stats"],
        refetchType: 'all',
      });
      
      toast({
        title: "Review Rejected",
        description: "Item removed from queue",
      });
    },
    onError: (error) => {
      const message = handleApiError(error, "reject review");
      toast({
        title: "Rejection Failed",
        description: message,
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook to get review queue statistics.
 */
export function useReviewQueueStats(workspaceId?: number) {
  const { user } = useUser();
  const effectiveWorkspaceId = workspaceId || (user?.id ? parseInt(user.id) : undefined);

  return useQuery({
    queryKey: ["/api/entity-review/stats", effectiveWorkspaceId],
    queryFn: async () => {
      const response = await authedFetch(`/api/entity-review/stats?workspaceId=${effectiveWorkspaceId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch review stats: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: !!effectiveWorkspaceId,
  });
}

// ============================================
// PUB SEARCH
// ============================================

/**
 * Hook to search pubs with debouncing.
 * 
 * @param query - Search query string
 * @param workspaceId - Workspace ID (uses current user if not provided)
 * @param limit - Max results (default 50)
 */
export function useSearchPubs(query: string, workspaceId?: number, limit: number = 50) {
  const { user } = useUser();
  const effectiveWorkspaceId = workspaceId || (user?.id ? parseInt(user.id) : undefined);
  
  // Debounce the search query by 300ms
  const debouncedQuery = useDebounce(query, 300);

  return useQuery({
    queryKey: ["/api/pubs/search", debouncedQuery, effectiveWorkspaceId, limit],
    queryFn: async (): Promise<PubSearchResult[]> => {
      if (!debouncedQuery || debouncedQuery.length < 2) {
        return [];
      }
      
      const params = new URLSearchParams();
      params.set("q", debouncedQuery);
      if (effectiveWorkspaceId) params.set("workspaceId", effectiveWorkspaceId.toString());
      params.set("limit", limit.toString());
      
      const response = await authedFetch(`/api/pubs/search?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Failed to search pubs: ${response.statusText}`);
      }
      const data = await response.json();
      return data.pubs || data;
    },
    enabled: !!effectiveWorkspaceId && debouncedQuery.length >= 2,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to get pub details with entity sources.
 */
export function usePubDetails(pubId: number | null) {
  return useQuery({
    queryKey: ["/api/pubs", pubId],
    queryFn: async () => {
      if (!pubId) throw new Error("No pub ID provided");
      
      const response = await authedFetch(`/api/pubs/${pubId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch pub: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: !!pubId,
  });
}

/**
 * Hook to get entity sources for a pub.
 */
export function usePubSources(pubId: number | null) {
  return useQuery({
    queryKey: ["/api/pubs", pubId, "sources"],
    queryFn: async (): Promise<EntitySource[]> => {
      if (!pubId) throw new Error("No pub ID provided");
      
      const response = await authedFetch(`/api/pubs/${pubId}/sources`);
      if (!response.ok) {
        throw new Error(`Failed to fetch pub sources: ${response.statusText}`);
      }
      const data = await response.json();
      return data.sources || data;
    },
    enabled: !!pubId,
  });
}

// ============================================
// SLEEPER AGENT
// ============================================

/**
 * Sleeper agent job type
 */
export interface SleeperAgentJob {
  id: string;
  type: "pub_search" | "event_discovery";
  status: "pending" | "running" | "completed" | "failed";
  query: string;
  location: string;
  radius?: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  progress?: {
    processed: number;
    total: number;
  };
  result?: {
    searchedCount?: number;
    newPubs?: number;
    existingCustomers?: number;
    existingProspects?: number;
    eventsFound?: number;
    newEvents?: number;
    updatedEvents?: number;
    errors?: number;
  };
  error?: string;
}

/**
 * Hook to start a pub search.
 */
export function useStartPubSearch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      query: string;
      location: string;
      radius?: number;
      notifyByEmail?: boolean;
    }) => {
      return apiRequest("POST", "/api/sleeper-agent/search", params);
    },
    onSuccess: (data: any) => {
      toast({
        title: "Search Started",
        description: `Pub search started. Job ID: ${data.jobId}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/sleeper-agent/runs"] });
    },
    onError: (error) => {
      const message = handleApiError(error, "start pub search");
      toast({
        title: "Search Failed",
        description: message,
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook to start an event discovery.
 */
export function useStartEventDiscovery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      query: string;
      location: string;
      notifyByEmail?: boolean;
    }) => {
      return apiRequest("POST", "/api/sleeper-agent/events", params);
    },
    onSuccess: (data: any) => {
      toast({
        title: "Discovery Started",
        description: `Event discovery started. Job ID: ${data.jobId}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/sleeper-agent/runs"] });
    },
    onError: (error) => {
      const message = handleApiError(error, "start event discovery");
      toast({
        title: "Discovery Failed",
        description: message,
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook to get sleeper agent job status.
 */
export function useSleeperAgentJobStatus(jobId: string | null) {
  return useQuery({
    queryKey: ["/api/sleeper-agent/jobs", jobId],
    queryFn: async (): Promise<SleeperAgentJob> => {
      if (!jobId) throw new Error("No job ID provided");
      
      const response = await authedFetch(`/api/sleeper-agent/jobs/${jobId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch job status: ${response.statusText}`);
      }
      const data = await response.json();
      return data.job;
    },
    enabled: !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.status === "running" || data?.status === "pending") {
        return 2000;
      }
      return false;
    },
  });
}

/**
 * Hook to list recent sleeper agent runs.
 */
export function useSleeperAgentRuns(type?: "pub_search" | "event_discovery", limit: number = 20) {
  return useQuery({
    queryKey: ["/api/sleeper-agent/runs", type, limit],
    queryFn: async (): Promise<SleeperAgentJob[]> => {
      const params = new URLSearchParams();
      if (type) params.set("type", type);
      params.set("limit", limit.toString());
      
      const response = await authedFetch(`/api/sleeper-agent/runs?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch runs: ${response.statusText}`);
      }
      const data = await response.json();
      return data.runs || [];
    },
  });
}

/**
 * Hook to get sleeper agent statistics.
 */
export function useSleeperAgentStats() {
  return useQuery({
    queryKey: ["/api/sleeper-agent/stats"],
    queryFn: async () => {
      const response = await authedFetch("/api/sleeper-agent/stats");
      if (!response.ok) {
        throw new Error(`Failed to fetch stats: ${response.statusText}`);
      }
      const data = await response.json();
      return data.stats;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to trigger nightly update manually.
 */
export function useTriggerNightlyUpdate() {
  return useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/sleeper-agent/nightly-update");
    },
    onSuccess: () => {
      toast({
        title: "Nightly Update Started",
        description: "Database maintenance is running in the background",
      });
    },
    onError: (error) => {
      const message = handleApiError(error, "trigger nightly update");
      toast({
        title: "Update Failed",
        description: message,
        variant: "destructive",
      });
    },
  });
}

// All exports are inline with their function definitions above

