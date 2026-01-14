import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useUser } from "@/contexts/UserContext";
import type { SelectSupplier, SelectSupplierPurchase } from "@shared/schema";

export interface SupplierFilters {
  isOurSupplier?: boolean;
  supplierType?: string;
}

/**
 * Fetch suppliers with optional filters
 */
export function useSuppliers(filters?: SupplierFilters) {
  const { user } = useUser();
  const workspaceId = user?.id;

  return useQuery<SelectSupplier[]>({
    queryKey: ['/api/suppliers', workspaceId, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.isOurSupplier !== undefined) {
        params.append('isOurSupplier', String(filters.isOurSupplier));
      }
      if (filters?.supplierType) {
        params.append('supplierType', filters.supplierType);
      }
      
      const response = await apiRequest('GET', `/api/suppliers?${params}`);
      return response.json();
    },
    enabled: !!workspaceId,
  });
}

/**
 * Fetch a single supplier by ID
 */
export function useSupplier(supplierId: string | null) {
  const { user } = useUser();
  const workspaceId = user?.id;

  return useQuery<SelectSupplier>({
    queryKey: ['/api/suppliers', supplierId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/suppliers/${supplierId}`);
      return response.json();
    },
    enabled: !!workspaceId && !!supplierId,
  });
}

/**
 * Fetch purchases for a specific supplier
 */
export function useSupplierPurchases(supplierId: string | null) {
  const { user } = useUser();
  const workspaceId = user?.id;

  return useQuery<SelectSupplierPurchase[]>({
    queryKey: ['/api/suppliers', supplierId, 'purchases'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/suppliers/${supplierId}/purchases`);
      return response.json();
    },
    enabled: !!workspaceId && !!supplierId,
  });
}

/**
 * Create a new supplier
 */
export function useCreateSupplier() {
  return useMutation({
    mutationFn: (data: Partial<SelectSupplier>) => 
      apiRequest('POST', '/api/suppliers', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/suppliers'] });
    },
  });
}

/**
 * Update an existing supplier
 */
export function useUpdateSupplier() {
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<SelectSupplier>) => 
      apiRequest('PATCH', `/api/suppliers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/suppliers'] });
    },
  });
}

/**
 * Delete a supplier
 */
export function useDeleteSupplier() {
  return useMutation({
    mutationFn: (id: string) => 
      apiRequest('DELETE', `/api/suppliers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/suppliers'] });
    },
  });
}

/**
 * Trigger Xero supplier sync
 */
export function useSyncXeroSuppliers() {
  return useMutation({
    mutationFn: () => 
      apiRequest('POST', '/api/xero-sync/sync/suppliers-full', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/suppliers'] });
    },
  });
}

