/**
 * Real-time Task Tracking Hook
 *
 * Polls the backend for Claude Code task status updates.
 * Automatically updates UI when Claude Code starts/finishes tasks.
 */

import { useEffect, useCallback, useRef } from 'react';

export interface TaskUpdate {
  taskId: string;
  status: 'claude-code-working' | 'needs-verification' | 'needs-fix';
  claudeCodePid?: string;
  startedAt?: string;
  finishedAt?: string;
  lastUpdate: string;
}

interface TaskTrackingHookOptions {
  enabled?: boolean;
  pollInterval?: number; // in milliseconds
  onTaskStarted?: (taskId: string, update: TaskUpdate) => void;
  onTaskFinished?: (taskId: string, update: TaskUpdate) => void;
}

/**
 * Hook to track Claude Code task updates in real-time
 *
 * Usage:
 * ```tsx
 * useTaskTracking({
 *   enabled: true,
 *   pollInterval: 5000,
 *   onTaskStarted: (taskId, update) => {
 *     console.log('Claude Code started working on:', taskId);
 *     updateTaskUI(taskId, 'claude-code-working');
 *   },
 *   onTaskFinished: (taskId, update) => {
 *     console.log('Claude Code finished:', taskId);
 *     updateTaskUI(taskId, update.status);
 *   }
 * });
 * ```
 */
export function useTaskTracking(options: TaskTrackingHookOptions = {}) {
  const {
    enabled = true,
    pollInterval = 5000, // Poll every 5 seconds by default
    onTaskStarted,
    onTaskFinished
  } = options;

  const previousUpdatesRef = useRef<Record<string, TaskUpdate>>({});

  const pollTaskStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/task/status', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.warn('Failed to fetch task status:', response.status);
        return;
      }

      const updates: TaskUpdate[] = await response.json();

      // Check for new updates
      updates.forEach(update => {
        const previous = previousUpdatesRef.current[update.taskId];

        // New task started (Claude Code started working)
        if (!previous && update.status === 'claude-code-working') {
          console.log('🤖 Claude Code started working on:', update.taskId);
          onTaskStarted?.(update.taskId, update);
        }

        // Task finished
        if (
          previous?.status === 'claude-code-working' &&
          (update.status === 'needs-verification' || update.status === 'needs-fix')
        ) {
          console.log('✅ Claude Code finished:', update.taskId, '→', update.status);
          onTaskFinished?.(update.taskId, update);
        }

        // Update ref with latest state
        previousUpdatesRef.current[update.taskId] = update;
      });
    } catch (error) {
      // Silently fail - don't spam console with network errors
      // The polling will retry on next interval
    }
  }, [onTaskStarted, onTaskFinished]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Poll immediately on mount
    pollTaskStatus();

    // Set up polling interval
    const intervalId = setInterval(pollTaskStatus, pollInterval);

    // Cleanup on unmount
    return () => {
      clearInterval(intervalId);
    };
  }, [enabled, pollInterval, pollTaskStatus]);
}
