/**
 * Xero Integration React Query Hooks
 * 
 * Provides hooks for Xero connection status, OAuth flow,
 * and customer import functionality.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, addDevAuthParams } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/contexts/UserContext';

// Types
export interface XeroStatus {
  connected: boolean;
  tenantName?: string;
  lastImportAt?: string | null;
}

export interface XeroImportJob {
  id: number;
  workspaceId: string;
  jobType: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  totalRecords: number;
  processedRecords: number;
  failedRecords: number;
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
}

// ============================================
// CONNECTION STATUS
// ============================================

export function useXeroStatus() {
  const { user } = useUser();
  
  return useQuery<XeroStatus>({
    queryKey: ['xero-status', user.id],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/integrations/xero/status');
      return response.json();
    },
    enabled: !!user?.id,
  });
}

// ============================================
// OAUTH CONNECT/DISCONNECT
// ============================================

export function useXeroConnect() {
  return useMutation({
    mutationFn: async () => {
      // Direct navigation to the authorize endpoint - server returns 302 redirect to Xero
      const authUrl = addDevAuthParams('/api/integrations/xero/authorize');
      
      // Detect if we're in an iframe (Replit preview pane)
      // Xero blocks being loaded in iframes via X-Frame-Options, so we must open a new tab
      const inIframe = window.self !== window.top;
      
      if (inIframe) {
        // In iframe: must open new tab because Xero blocks iframes
        window.open(authUrl, '_blank');
      } else {
        // Direct browser tab: same-tab navigation works
        window.location.href = authUrl;
      }
    },
  });
}

export function useXeroDisconnect() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useUser();
  
  return useMutation({
    mutationFn: async () => {
      // Get connections first to find the ID
      const connectionsResponse = await apiRequest('GET', '/api/integrations/xero/connections');
      const connections = await connectionsResponse.json();
      
      if (connections.connections && connections.connections.length > 0) {
        const integrationId = connections.connections[0].id;
        await apiRequest('DELETE', `/api/integrations/xero/disconnect/${integrationId}`);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['xero-status', user.id] });
      toast({ title: 'Xero disconnected successfully' });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Failed to disconnect Xero', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });
}

// ============================================
// CUSTOMER IMPORT
// ============================================

export function useImportCustomersFromXero() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useUser();
  
  return useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/integrations/xero/import/customers');
      return response.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['xero-import-jobs', user.id] });
      toast({ 
        title: 'Customer import started', 
        description: `Job ID: ${data.jobId}` 
      });
      return data;
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Failed to start import', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });
}

// ============================================
// IMPORT JOB STATUS (with polling)
// ============================================

export function useXeroImportJob(jobId: number | null) {
  const { user } = useUser();
  
  return useQuery<XeroImportJob>({
    queryKey: ['xero-import-job', user.id, jobId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/integrations/xero/import/jobs/${jobId}`);
      return response.json();
    },
    enabled: jobId !== null && !!user?.id,
    refetchInterval: (query) => {
      const data = query.state.data;
      // Poll every 2 seconds while running
      if (data?.status === 'running' || data?.status === 'pending') {
        return 2000;
      }
      return false;
    },
  });
}

// ============================================
// IMPORT JOB HISTORY
// ============================================

export function useXeroImportJobs() {
  const { user } = useUser();

  return useQuery<XeroImportJob[]>({
    queryKey: ['xero-import-jobs', user.id],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/integrations/xero/import/jobs');
      return response.json();
    },
    enabled: !!user?.id,
    refetchInterval: (query) => {
      const data = query.state.data;
      // Poll every 2 seconds if any jobs are pending or running
      if (data?.some(job => job.status === 'running' || job.status === 'pending')) {
        return 2000;
      }
      return false;
    },
  });
}

// ============================================
// PRODUCT IMPORT
// ============================================

export function useImportProductsFromXero() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useUser();
  
  return useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/integrations/xero/import/products');
      return response.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['xero-import-jobs', user.id] });
      qc.invalidateQueries({ queryKey: ['brew-products'] });
      toast({ 
        title: 'Product import started', 
        description: `Job ID: ${data.jobId}` 
      });
      return data;
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Failed to start product import', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });
}

// ============================================
// ORDER IMPORT
// ============================================

export function useImportOrdersFromXero() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useUser();
  
  return useMutation({
    mutationFn: async (yearsBack?: number) => {
      const response = await apiRequest('POST', '/api/integrations/xero/import/orders', {
        body: JSON.stringify({ yearsBack: yearsBack || 2 }),
        headers: { 'Content-Type': 'application/json' },
      });
      return response.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['xero-import-jobs', user.id] });
      qc.invalidateQueries({ queryKey: ['crm-orders'] });
      toast({ 
        title: 'Order import started', 
        description: `Job ID: ${data.jobId}` 
      });
      return data;
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Failed to start order import', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });
}

// ============================================
// COMBINED IMPORT (ALL)
// ============================================

export function useImportAllFromXero() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useUser();
  
  return useMutation({
    mutationFn: async (yearsBack?: number) => {
      const response = await apiRequest('POST', '/api/integrations/xero/import/all', {
        body: JSON.stringify({ yearsBack: yearsBack || 2 }),
        headers: { 'Content-Type': 'application/json' },
      });
      return response.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['xero-import-jobs', user.id] });
      qc.invalidateQueries({ queryKey: ['brew-products'] });
      qc.invalidateQueries({ queryKey: ['crm-orders'] });
      toast({ 
        title: 'Full import started', 
        description: 'Products and orders are being imported' 
      });
      return data;
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Failed to start import', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });
}

// ============================================
// SYNC QUEUE (TWO-WAY SYNC)
// ============================================

export interface XeroSyncQueueItem {
  id: number;
  workspaceId: string;
  entityType: string;
  entityId: string;
  action: string;
  retryCount: number;
  maxRetries: number;
  lastError?: string | null;
  nextRetryAt?: string | null;
  createdAt: string;
  processedAt?: string | null;
}

export function useXeroSyncQueue() {
  const { user } = useUser();
  
  return useQuery<XeroSyncQueueItem[]>({
    queryKey: ['xero-sync-queue', user.id],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/xero/sync/queue?workspaceId=${user.id}`);
      return response.json();
    },
    enabled: !!user?.id,
    refetchInterval: 10000, // Poll every 10 seconds
  });
}

export function useForceXeroSync() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useUser();
  
  return useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/xero/sync/force', {
        body: JSON.stringify({ workspaceId: user.id }),
        headers: { 'Content-Type': 'application/json' },
      });
      return response.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['xero-sync-queue', user.id] });
      toast({ 
        title: 'Sync triggered', 
        description: 'Processing sync queue...' 
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Sync failed', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });
}
