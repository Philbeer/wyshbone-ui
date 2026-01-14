/**
 * Customer Tags React Query Hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useUser } from '@/contexts/UserContext';
import { useToast } from '@/hooks/use-toast';

export interface CustomerTag {
  id: number;
  workspaceId: string;
  name: string;
  color: string | null;
  createdAt: number;
}

export interface CreateTagData {
  name: string;
  color?: string;
}

export function useCustomerTags() {
  const { user } = useUser();
  const workspaceId = user.id;
  
  return useQuery<CustomerTag[]>({
    queryKey: ['/api/crm/tags', workspaceId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/crm/tags/${workspaceId}`);
      return response.json();
    },
    enabled: !!workspaceId,
  });
}

export function useCustomerTagsForCustomer(customerId: string) {
  const { user } = useUser();
  
  return useQuery<CustomerTag[]>({
    queryKey: ['/api/crm/customers', customerId, 'tags'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/crm/customers/${customerId}/tags`);
      return response.json();
    },
    enabled: !!user?.id && !!customerId,
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useUser();
  const workspaceId = user.id;
  
  return useMutation({
    mutationFn: async (data: CreateTagData) => {
      const response = await apiRequest('POST', '/api/crm/tags', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/tags', workspaceId] });
      toast({ title: 'Tag created' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create tag', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteTag() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useUser();
  const workspaceId = user.id;
  
  return useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest('DELETE', `/api/crm/tags/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/tags', workspaceId] });
      toast({ title: 'Tag deleted' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete tag', description: error.message, variant: 'destructive' });
    },
  });
}

export function useAssignTag() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async ({ customerId, tagId }: { customerId: string; tagId: number }) => {
      const response = await apiRequest('POST', `/api/crm/customers/${customerId}/tags`, { tagId });
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/customers', variables.customerId, 'tags'] });
      toast({ title: 'Tag assigned' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to assign tag', description: error.message, variant: 'destructive' });
    },
  });
}

export function useRemoveTag() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async ({ customerId, tagId }: { customerId: string; tagId: number }) => {
      const response = await apiRequest('DELETE', `/api/crm/customers/${customerId}/tags/${tagId}`);
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/customers', variables.customerId, 'tags'] });
      toast({ title: 'Tag removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to remove tag', description: error.message, variant: 'destructive' });
    },
  });
}

