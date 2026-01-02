/**
 * Database Update Job Hook
 * 
 * Manages the state and API calls for manual database update jobs.
 * Polls for status every 2 seconds while a job is running.
 */

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authedFetch, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

// ============================================
// TYPES
// ============================================

export interface JobSettings {
  pubsPerNight: number;
  enableGoogle: boolean;
  enableWhatpub: boolean;
  enableDeepResearch: boolean;
}

export interface JobProgress {
  currentPub: number;
  totalPubs: number;
  currentPubName: string;
  lastPubId: number | null;
}

export interface JobResults {
  updated: number;
  newUrls: number;
  managersFound: number;
  freehousesDetected: number;
  errors: number;
  closedPubs: number;
}

export interface JobCosts {
  incurred: number;
  estimated: number;
}

export interface JobTiming {
  startedAt: string;
  completedAt: string | null;
  estimatedCompletion: string | null;
}

export interface JobState {
  id: string;
  workspaceId: number;
  status: 'pending' | 'running' | 'cancelled' | 'completed' | 'failed';
  settings: JobSettings;
  progress: JobProgress;
  results: JobResults;
  costs: JobCosts;
  timing: JobTiming;
  shouldCancel: boolean;
  lastPubProcessed: string | null;
  nextPubToProcess: string | null;
  errorMessage: string | null;
}

export interface CostEstimate {
  perPub: number;
  total: number;
  breakdown: { source: string; cost: number }[];
}

export interface DurationEstimate {
  ms: number;
  minutes: number;
  formatted: string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

export function formatTime(date: Date | string): string {
  return new Date(date).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

export function calculateRemaining(jobState: JobState): number {
  const pubsRemaining = jobState.progress.totalPubs - jobState.progress.currentPub;
  const avgTimePerPub = 2000; // 2 seconds
  return pubsRemaining * avgTimePerPub;
}

export function calculateCostRemaining(jobState: JobState): number {
  const pubsRemaining = jobState.progress.totalPubs - jobState.progress.currentPub;
  const costPerPub = jobState.costs.estimated / jobState.progress.totalPubs;
  return pubsRemaining * costPerPub;
}

export function calculateProgressPercentage(jobState: JobState): number {
  if (jobState.progress.totalPubs === 0) return 0;
  return Math.round((jobState.progress.currentPub / jobState.progress.totalPubs) * 100);
}

// ============================================
// MAIN HOOK
// ============================================

export function useDatabaseUpdateJob() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(null);
  const [showConfirmStart, setShowConfirmStart] = useState(false);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [pendingSettings, setPendingSettings] = useState<JobSettings | null>(null);

  // Get cost and duration estimate
  const getEstimate = useMutation({
    mutationFn: async (settings: JobSettings) => {
      const response = await apiRequest('POST', '/api/admin/maintenance/estimate', settings);
      return response as { success: boolean; costs: CostEstimate; duration: DurationEstimate };
    }
  });

  // Poll for job status every 2 seconds while running
  const { data: jobStatusData, refetch: refetchStatus } = useQuery({
    queryKey: ['/api/admin/maintenance/job', jobId],
    queryFn: async () => {
      if (!jobId) return null;
      const response = await authedFetch(`/api/admin/maintenance/job/${jobId}/status`);
      if (!response.ok) {
        throw new Error('Failed to fetch job status');
      }
      const data = await response.json();
      return data.job as JobState;
    },
    enabled: !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data;
      // Stop polling if job is completed/cancelled/failed
      if (!data || ['completed', 'cancelled', 'failed'].includes(data.status)) {
        return false;
      }
      return 2000; // Poll every 2 seconds while running
    }
  });

  // Check for active jobs on mount
  const { data: activeJobsData } = useQuery({
    queryKey: ['/api/admin/maintenance/jobs/active'],
    queryFn: async () => {
      const response = await authedFetch('/api/admin/maintenance/jobs/active');
      if (!response.ok) {
        return { jobs: [] };
      }
      const data = await response.json();
      return data as { success: boolean; jobs: JobState[] };
    },
    staleTime: 5000
  });

  // Set jobId if there's an active job
  useEffect(() => {
    if (activeJobsData?.jobs?.length && !jobId) {
      setJobId(activeJobsData.jobs[0].id);
    }
  }, [activeJobsData, jobId]);

  // Start job mutation
  const startJobMutation = useMutation({
    mutationFn: async (settings: JobSettings) => {
      const response = await apiRequest('POST', '/api/admin/maintenance/run-manual', settings);
      return response as { success: boolean; jobId: string; message: string };
    },
    onSuccess: (data) => {
      setJobId(data.jobId);
      setShowConfirmStart(false);
      setPendingSettings(null);
      toast({
        title: 'Job Started',
        description: 'Database update job has started. You can monitor progress here.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to Start Job',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    }
  });

  // Cancel job mutation
  const cancelJobMutation = useMutation({
    mutationFn: async () => {
      if (!jobId) throw new Error('No job to cancel');
      const response = await apiRequest('POST', `/api/admin/maintenance/job/${jobId}/cancel`, {});
      return response as { success: boolean; message: string };
    },
    onSuccess: () => {
      setShowConfirmCancel(false);
      refetchStatus();
      toast({
        title: 'Cancellation Requested',
        description: 'Job will stop after the current pub finishes processing.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to Cancel',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    }
  });

  // Public API
  const requestStart = useCallback((settings: JobSettings) => {
    setPendingSettings(settings);
    getEstimate.mutate(settings);
    setShowConfirmStart(true);
  }, [getEstimate]);

  const confirmStart = useCallback(() => {
    if (pendingSettings) {
      startJobMutation.mutate(pendingSettings);
    }
  }, [pendingSettings, startJobMutation]);

  const cancelStart = useCallback(() => {
    setShowConfirmStart(false);
    setPendingSettings(null);
  }, []);

  const requestCancel = useCallback(() => {
    setShowConfirmCancel(true);
  }, []);

  const confirmCancel = useCallback(() => {
    cancelJobMutation.mutate();
  }, [cancelJobMutation]);

  const continueRunning = useCallback(() => {
    setShowConfirmCancel(false);
  }, []);

  const closeJobSummary = useCallback(() => {
    setJobId(null);
    queryClient.invalidateQueries({ queryKey: ['/api/admin/maintenance'] });
  }, [queryClient]);

  // Computed state
  const jobState = jobStatusData || null;
  const isRunning = jobState?.status === 'running';
  const isCompleted = jobState?.status === 'completed';
  const isCancelled = jobState?.status === 'cancelled';
  const isFailed = jobState?.status === 'failed';
  const isFinished = isCompleted || isCancelled || isFailed;

  return {
    // State
    jobState,
    jobId,
    isRunning,
    isCompleted,
    isCancelled,
    isFailed,
    isFinished,

    // Dialog visibility
    showConfirmStart,
    showConfirmCancel,
    pendingSettings,

    // Estimates
    costEstimate: getEstimate.data?.costs || null,
    durationEstimate: getEstimate.data?.duration || null,
    isEstimating: getEstimate.isPending,

    // Actions
    requestStart,
    confirmStart,
    cancelStart,
    requestCancel,
    confirmCancel,
    continueRunning,
    closeJobSummary,

    // Loading states
    isStarting: startJobMutation.isPending,
    isCancelling: cancelJobMutation.isPending,
  };
}

export default useDatabaseUpdateJob;

