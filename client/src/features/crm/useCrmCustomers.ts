/**
 * CRM Customers React Query Hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useUser } from '@/contexts/UserContext';
import { useToast } from '@/hooks/use-toast';

export interface CrmCustomer {
  id: string;
  workspaceId: string;
  name: string;
  primaryContactName?: string | null;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  postcode?: string | null;
  country?: string | null;
  notes?: string | null;
  priceBookId?: string | null;
  groupId?: number | null;
  createdAt: number;
  updatedAt: number;
}

export function useCrmCustomers() {
  const { user } = useUser();
  const workspaceId = user.id;
  
  return useQuery<CrmCustomer[]>({
    queryKey: ['/api/crm/customers', workspaceId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/crm/customers/${workspaceId}`);
      return response.json();
    },
    enabled: !!workspaceId,
  });
}

export function useCrmCustomer(customerId: string) {
  const { user } = useUser();
  
  return useQuery<CrmCustomer>({
    queryKey: ['/api/crm/customers', customerId, 'detail'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/crm/customers/${user.id}/${customerId}`);
      return response.json();
    },
    enabled: !!user?.id && !!customerId,
  });
}

export function useCreateCrmCustomer() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useUser();
  const workspaceId = user.id;
  
  return useMutation({
    mutationFn: async (data: Partial<CrmCustomer>) => {
      const response = await apiRequest('POST', '/api/crm/customers', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/customers', workspaceId] });
      toast({ title: 'Customer created' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create customer', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateCrmCustomer() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useUser();
  const workspaceId = user.id;
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CrmCustomer> }) => {
      const response = await apiRequest('PATCH', `/api/crm/customers/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/customers', workspaceId] });
      toast({ title: 'Customer updated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update customer', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteCrmCustomer() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useUser();
  const workspaceId = user.id;
  
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/crm/customers/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/customers', workspaceId] });
      toast({ title: 'Customer deleted' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete customer', description: error.message, variant: 'destructive' });
    },
  });
}












