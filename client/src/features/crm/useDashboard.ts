/**
 * Dashboard & Reporting React Query Hooks
 */

import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useUser } from '@/contexts/UserContext';

export interface DashboardKPIs {
  totalCustomers: number;
  activeCustomers: number;
  ordersThisMonth: number;
  revenueThisMonth: number;
  pendingOrders: number;
  overdueTasks: number;
}

export interface RevenueByMonth {
  month: string;
  revenue: number;
  orderCount: number;
}

export interface TopCustomer {
  customerId: string;
  customerName: string;
  totalRevenue: number;
  orderCount: number;
}

export interface TopProduct {
  productId: string;
  productName: string | null;
  totalQuantity: number;
  totalRevenue: number;
}

export function useDashboardKPIs() {
  const { user } = useUser();
  const workspaceId = user.id;
  
  return useQuery<DashboardKPIs>({
    queryKey: ['/api/crm/dashboard/kpis', workspaceId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/crm/dashboard/kpis/${workspaceId}`);
      return response.json();
    },
    enabled: !!workspaceId,
  });
}

export function useRevenueByMonth(months: number = 12) {
  const { user } = useUser();
  const workspaceId = user.id;
  
  return useQuery<RevenueByMonth[]>({
    queryKey: ['/api/crm/dashboard/revenue-by-month', workspaceId, months],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/crm/dashboard/revenue-by-month/${workspaceId}?months=${months}`);
      return response.json();
    },
    enabled: !!workspaceId,
  });
}

export function useTopCustomers(limit: number = 10) {
  const { user } = useUser();
  const workspaceId = user.id;
  
  return useQuery<TopCustomer[]>({
    queryKey: ['/api/crm/dashboard/top-customers', workspaceId, limit],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/crm/dashboard/top-customers/${workspaceId}?limit=${limit}`);
      return response.json();
    },
    enabled: !!workspaceId,
  });
}

export function useTopProducts(limit: number = 10) {
  const { user } = useUser();
  const workspaceId = user.id;
  
  return useQuery<TopProduct[]>({
    queryKey: ['/api/crm/dashboard/top-products', workspaceId, limit],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/crm/dashboard/top-products/${workspaceId}?limit=${limit}`);
      return response.json();
    },
    enabled: !!workspaceId,
  });
}

