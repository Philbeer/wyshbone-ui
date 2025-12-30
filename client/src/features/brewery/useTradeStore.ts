/**
 * Trade Store React Query Hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useUser } from '@/contexts/UserContext';
import { useToast } from '@/hooks/use-toast';

export interface TradeStoreSettings {
  id: number;
  workspaceId: string;
  isEnabled: number;
  storeName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  welcomeMessage: string | null;
  requireApproval: number;
  showStockLevels: number;
  allowBackorders: number;
  minOrderValue: number | null;
}

export interface TradeStoreAccess {
  id: number;
  customerId: string;
  customerName: string;
  accessCode: string;
  isActive: number;
  lastLoginAt: number | null;
  createdAt: number;
}

export function useTradeStoreSettings() {
  const { user } = useUser();
  
  return useQuery<TradeStoreSettings | null>({
    queryKey: ['/api/brewcrm/trade-store/settings'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/brewcrm/trade-store/settings');
      return response.json();
    },
    enabled: !!user?.id,
  });
}

export function useUpdateTradeStoreSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (data: Partial<TradeStoreSettings>) => {
      const response = await apiRequest('POST', '/api/brewcrm/trade-store/settings', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brewcrm/trade-store/settings'] });
      toast({ title: 'Trade store settings updated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update settings', description: error.message, variant: 'destructive' });
    },
  });
}

export function useTradeStoreAccessList() {
  const { user } = useUser();
  
  return useQuery<TradeStoreAccess[]>({
    queryKey: ['/api/brewcrm/trade-store/access'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/brewcrm/trade-store/access');
      return response.json();
    },
    enabled: !!user?.id,
  });
}

export function useGrantTradeStoreAccess() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (customerId: string) => {
      const response = await apiRequest('POST', '/api/brewcrm/trade-store/access', { customerId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brewcrm/trade-store/access'] });
      toast({ title: 'Customer access granted' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to grant access', description: error.message, variant: 'destructive' });
    },
  });
}

