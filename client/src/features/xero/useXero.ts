/**
 * Xero Integration React Query Hooks
 * 
 * Provides hooks for Xero connection status, OAuth flow,
 * and customer import functionality.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
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
      const response = await apiRequest('GET', '/api/integrations/xero/authorize');
      const data = await response.json();
      // Redirect to Xero OAuth
      window.location.href = data.authorizationUrl;
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
  });
}

