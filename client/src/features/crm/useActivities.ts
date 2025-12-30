/**
 * Activities React Query Hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useUser } from '@/contexts/UserContext';
import { useToast } from '@/hooks/use-toast';

export interface Activity {
  id: number;
  workspaceId: string;
  customerId: string | null;
  leadId: string | null;
  activityType: string;
  subject: string | null;
  notes: string | null;
  outcome: string | null;
  durationMinutes: number | null;
  completedAt: number | null;
  createdBy: string | null;
  createdAt: number;
}

export interface ActivityWithCustomer {
  activity: Activity;
  customerName: string | null;
}

export interface CreateActivityData {
  customerId?: string;
  leadId?: string;
  activityType: string;
  subject?: string;
  notes?: string;
  outcome?: string;
  durationMinutes?: number;
}

export function useActivities() {
  const { user } = useUser();
  const workspaceId = user.id;
  
  return useQuery<ActivityWithCustomer[]>({
    queryKey: ['/api/crm/activities', workspaceId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/crm/activities/${workspaceId}`);
      return response.json();
    },
    enabled: !!workspaceId,
  });
}

export function useCustomerActivities(customerId: string) {
  const { user } = useUser();
  
  return useQuery<Activity[]>({
    queryKey: ['/api/crm/customers', customerId, 'activities'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/crm/customers/${customerId}/activities`);
      return response.json();
    },
    enabled: !!user?.id && !!customerId,
  });
}

export function useCreateActivity() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useUser();
  const workspaceId = user.id;
  
  return useMutation({
    mutationFn: async (data: CreateActivityData) => {
      const response = await apiRequest('POST', '/api/crm/activities', data);
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/activities', workspaceId] });
      if (variables.customerId) {
        queryClient.invalidateQueries({ queryKey: ['/api/crm/customers', variables.customerId, 'activities'] });
      }
      toast({ title: 'Activity logged' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to log activity', description: error.message, variant: 'destructive' });
    },
  });
}

