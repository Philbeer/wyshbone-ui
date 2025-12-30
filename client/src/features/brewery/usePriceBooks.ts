/**
 * Price Books React Query Hooks
 * 
 * Data fetching and mutation hooks for the Price Books feature.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import type { 
  PriceBook, 
  PriceBookWithPrices,
  CreatePriceBookData,
  UpdatePriceBookData,
  ProductPriceUpdate,
  ProductPrice,
  EffectivePrice,
} from "./types";

/**
 * Fetch all price books for the workspace
 */
export function usePriceBooks() {
  const { user } = useUser();
  const workspaceId = user.id;
  
  return useQuery<PriceBook[]>({
    queryKey: ['/api/brewcrm/price-books', workspaceId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/brewcrm/price-books/${workspaceId}`);
      return response.json();
    },
    enabled: !!workspaceId,
  });
}

/**
 * Fetch active price books only
 */
export function useActivePriceBooks() {
  const { user } = useUser();
  const workspaceId = user.id;
  
  return useQuery<PriceBook[]>({
    queryKey: ['/api/brewcrm/price-books/active', workspaceId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/brewcrm/price-books/${workspaceId}/active`);
      return response.json();
    },
    enabled: !!workspaceId,
  });
}

/**
 * Fetch single price book with product prices and bands
 */
export function usePriceBook(id: number) {
  const { user } = useUser();
  
  return useQuery<PriceBookWithPrices>({
    queryKey: ['/api/brewcrm/price-books/detail', id],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/brewcrm/price-books/detail/${id}`);
      return response.json();
    },
    enabled: !!user?.id && id > 0,
  });
}

/**
 * Fetch product prices for a price book
 */
export function useProductPrices(priceBookId: number) {
  const { user } = useUser();
  
  return useQuery<ProductPrice[]>({
    queryKey: ['/api/brewcrm/price-books', priceBookId, 'prices'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/brewcrm/price-books/${priceBookId}/prices`);
      return response.json();
    },
    enabled: !!user?.id && priceBookId > 0,
  });
}

/**
 * Create a new price book
 */
export function useCreatePriceBook() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useUser();
  const workspaceId = user.id;
  
  return useMutation({
    mutationFn: async (data: CreatePriceBookData) => {
      const response = await apiRequest('POST', '/api/brewcrm/price-books', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brewcrm/price-books', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['/api/brewcrm/price-books/active', workspaceId] });
      toast({ 
        title: "Price book created",
        description: "The new price book has been created successfully."
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to create price book",
        description: error.message,
        variant: "destructive"
      });
    },
  });
}

/**
 * Update a price book
 */
export function useUpdatePriceBook() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useUser();
  const workspaceId = user.id;
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdatePriceBookData }) => {
      const response = await apiRequest('PATCH', `/api/brewcrm/price-books/${id}`, data);
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/brewcrm/price-books', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['/api/brewcrm/price-books/active', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['/api/brewcrm/price-books/detail', variables.id] });
      toast({ 
        title: "Price book updated",
        description: "The price book has been updated successfully."
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to update price book",
        description: error.message,
        variant: "destructive"
      });
    },
  });
}

/**
 * Delete a price book
 */
export function useDeletePriceBook() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useUser();
  const workspaceId = user.id;
  
  return useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest('DELETE', `/api/brewcrm/price-books/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brewcrm/price-books', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['/api/brewcrm/price-books/active', workspaceId] });
      toast({ 
        title: "Price book deleted",
        description: "The price book has been deleted successfully."
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to delete price book",
        description: error.message,
        variant: "destructive"
      });
    },
  });
}

/**
 * Update product prices for a price book (bulk upsert)
 */
export function useUpdatePriceBookPrices() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async ({ priceBookId, productPrices }: { priceBookId: number; productPrices: ProductPriceUpdate[] }) => {
      const response = await apiRequest('POST', `/api/brewcrm/price-books/${priceBookId}/prices`, { productPrices });
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/brewcrm/price-books/detail', variables.priceBookId] });
      queryClient.invalidateQueries({ queryKey: ['/api/brewcrm/price-books', variables.priceBookId, 'prices'] });
      toast({ 
        title: "Prices updated",
        description: "Product prices have been updated successfully."
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to update prices",
        description: error.message,
        variant: "destructive"
      });
    },
  });
}

/**
 * Copy prices from one price book to another
 */
export function useCopyPriceBookPrices() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async ({ targetPriceBookId, sourcePriceBookId }: { targetPriceBookId: number; sourcePriceBookId: number }) => {
      const response = await apiRequest('POST', `/api/brewcrm/price-books/${targetPriceBookId}/copy-prices`, { sourcePriceBookId });
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/brewcrm/price-books/detail', variables.targetPriceBookId] });
      queryClient.invalidateQueries({ queryKey: ['/api/brewcrm/price-books', variables.targetPriceBookId, 'prices'] });
      toast({ 
        title: "Prices copied",
        description: "Product prices have been copied to the target price book."
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to copy prices",
        description: error.message,
        variant: "destructive"
      });
    },
  });
}

/**
 * Get effective price for a product (considering customer's price book)
 */
export function useEffectiveProductPrice(productId: string, customerId?: string, quantity?: number) {
  const { user } = useUser();
  
  return useQuery<EffectivePrice>({
    queryKey: ['/api/brewcrm/products', productId, 'effective-price', customerId, quantity],
    queryFn: async () => {
      let url = `/api/brewcrm/products/${productId}/effective-price`;
      const params = new URLSearchParams();
      if (customerId) params.append('customerId', customerId);
      if (quantity) params.append('quantity', quantity.toString());
      const qs = params.toString();
      if (qs) url += `?${qs}`;
      
      const response = await apiRequest('GET', url);
      return response.json();
    },
    enabled: !!user?.id && !!productId,
  });
}

/**
 * Update customer's price book assignment
 */
export function useUpdateCustomerPriceBook() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useUser();
  const workspaceId = user.id;
  
  return useMutation({
    mutationFn: async ({ customerId, priceBookId }: { customerId: string; priceBookId: number | null }) => {
      const response = await apiRequest('PATCH', `/api/crm/customers/${customerId}/price-book`, { priceBookId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/customers', workspaceId] });
      toast({ 
        title: "Customer updated",
        description: "The customer's price book has been updated."
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to update customer",
        description: error.message,
        variant: "destructive"
      });
    },
  });
}

