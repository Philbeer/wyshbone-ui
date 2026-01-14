/**
 * Container QR Tracking React Query Hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useUser } from '@/contexts/UserContext';
import { useToast } from '@/hooks/use-toast';

export interface ContainerMovement {
  id: number;
  workspaceId: string;
  containerId: string;
  movementType: string;
  fromLocation: string | null;
  toLocation: string | null;
  customerId: string | null;
  orderId: string | null;
  batchId: string | null;
  notes: string | null;
  scannedBy: string | null;
  scannedAt: number;
}

export interface ContainerMovementWithCustomer {
  movement: ContainerMovement;
  customerName: string | null;
}

export interface LogMovementData {
  movementType: 'filled' | 'dispatched' | 'returned' | 'cleaned' | 'inspected';
  fromLocation?: string;
  toLocation?: string;
  customerId?: string;
  orderId?: string;
  batchId?: string;
  notes?: string;
}

export function useContainerMovements(containerId: string) {
  const { user } = useUser();
  
  return useQuery<ContainerMovementWithCustomer[]>({
    queryKey: ['/api/brewcrm/containers', containerId, 'movements'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/brewcrm/containers/${containerId}/movements`);
      return response.json();
    },
    enabled: !!user?.id && !!containerId,
  });
}

export function useCustomerContainers(customerId: string) {
  const { user } = useUser();
  
  return useQuery<any[]>({
    queryKey: ['/api/crm/customers', customerId, 'containers'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/crm/customers/${customerId}/containers`);
      return response.json();
    },
    enabled: !!user?.id && !!customerId,
  });
}

export function useGenerateContainerQR() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useUser();
  const workspaceId = user.id;
  
  return useMutation({
    mutationFn: async (containerId: string) => {
      const response = await apiRequest('POST', `/api/brewcrm/containers/${containerId}/generate-qr`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brewcrm/containers', workspaceId] });
      toast({ title: 'QR code generated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to generate QR code', description: error.message, variant: 'destructive' });
    },
  });
}

export function useScanContainer() {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (qrCode: string) => {
      const response = await apiRequest('GET', `/api/brewcrm/containers/scan/${encodeURIComponent(qrCode)}`);
      return response.json();
    },
    onError: (error: Error) => {
      toast({ title: 'Container not found', description: error.message, variant: 'destructive' });
    },
  });
}

export function useLogContainerMovement() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async ({ containerId, ...data }: { containerId: string } & LogMovementData) => {
      const response = await apiRequest('POST', `/api/brewcrm/containers/${containerId}/movements`, data);
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/brewcrm/containers', variables.containerId, 'movements'] });
      toast({ title: 'Movement logged' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to log movement', description: error.message, variant: 'destructive' });
    },
  });
}

