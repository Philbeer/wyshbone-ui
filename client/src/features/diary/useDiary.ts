/**
 * Sales Diary React Query Hooks
 * 
 * Data fetching and mutation hooks for the Call Diary feature.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import type { 
  CallDiaryEntry, 
  DiaryFilters, 
  NewCallDiaryEntry, 
  CompleteCallData, 
  RescheduleCallData 
} from "./types";

// Build query string from filters
function buildQueryString(filters?: DiaryFilters): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.entityType) params.append('entityType', filters.entityType);
  if (filters.startDate) params.append('startDate', filters.startDate.toString());
  if (filters.endDate) params.append('endDate', filters.endDate.toString());
  if (filters.completed !== undefined) params.append('completed', filters.completed.toString());
  if (filters.limit) params.append('limit', filters.limit.toString());
  if (filters.offset) params.append('offset', filters.offset.toString());
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Fetch all call diary entries with filters
 */
export function useCallDiaryEntries(filters?: DiaryFilters) {
  const { user } = useUser();
  const workspaceId = user.id;
  
  return useQuery<CallDiaryEntry[]>({
    queryKey: ['/api/crm/call-diary', workspaceId, filters],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/crm/call-diary/${workspaceId}${buildQueryString(filters)}`);
      return response.json();
    },
    enabled: !!workspaceId,
  });
}

/**
 * Fetch upcoming calls (today + future, not completed)
 */
export function useUpcomingCalls(filters?: DiaryFilters) {
  const { user } = useUser();
  const workspaceId = user.id;
  
  return useQuery<CallDiaryEntry[]>({
    queryKey: ['/api/crm/call-diary/upcoming', workspaceId, filters],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/crm/call-diary/${workspaceId}/upcoming${buildQueryString(filters)}`);
      return response.json();
    },
    enabled: !!workspaceId,
  });
}

/**
 * Fetch overdue calls (past, not completed)
 */
export function useOverdueCalls(filters?: DiaryFilters) {
  const { user } = useUser();
  const workspaceId = user.id;
  
  return useQuery<CallDiaryEntry[]>({
    queryKey: ['/api/crm/call-diary/overdue', workspaceId, filters],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/crm/call-diary/${workspaceId}/overdue${buildQueryString(filters)}`);
      return response.json();
    },
    enabled: !!workspaceId,
  });
}

/**
 * Fetch call history (completed calls)
 */
export function useCallHistory(filters?: DiaryFilters) {
  const { user } = useUser();
  const workspaceId = user.id;
  
  return useQuery<CallDiaryEntry[]>({
    queryKey: ['/api/crm/call-diary/history', workspaceId, filters],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/crm/call-diary/${workspaceId}/history${buildQueryString(filters)}`);
      return response.json();
    },
    enabled: !!workspaceId,
  });
}

/**
 * Fetch calls for a specific entity (customer or lead)
 */
export function useCallsForEntity(entityType: 'customer' | 'lead', entityId: string) {
  return useQuery<CallDiaryEntry[]>({
    queryKey: ['/api/crm/call-diary/entity', entityType, entityId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/crm/call-diary/entity/${entityType}/${entityId}`);
      return response.json();
    },
    enabled: !!entityType && !!entityId,
  });
}

/**
 * Schedule a new call
 */
export function useScheduleCall() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (entry: NewCallDiaryEntry) => {
      const response = await apiRequest('POST', '/api/crm/call-diary', entry);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/call-diary'] });
      toast({ title: "Call scheduled successfully" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to schedule call", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });
}

/**
 * Mark a call as complete
 */
export function useCompleteCall() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async ({ id, outcome, notes }: CompleteCallData) => {
      const response = await apiRequest('PATCH', `/api/crm/call-diary/${id}/complete`, {
        outcome,
        notes,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/call-diary'] });
      toast({ title: "Call marked as complete" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to complete call", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });
}

/**
 * Reschedule a call
 */
export function useRescheduleCall() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async ({ id, scheduledDate }: RescheduleCallData) => {
      const response = await apiRequest('PATCH', `/api/crm/call-diary/${id}/reschedule`, {
        scheduledDate,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/call-diary'] });
      toast({ title: "Call rescheduled" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to reschedule call", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });
}

/**
 * Update a call diary entry
 */
export function useUpdateCallDiary() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<CallDiaryEntry>) => {
      const response = await apiRequest('PATCH', `/api/crm/call-diary/${id}`, updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/call-diary'] });
      toast({ title: "Call updated" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to update call", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });
}

/**
 * Delete a call diary entry
 */
export function useDeleteCallDiary() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest('DELETE', `/api/crm/call-diary/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/call-diary'] });
      toast({ title: "Call deleted" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to delete call", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });
}

