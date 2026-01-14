/**
 * Task Progress Service
 *
 * Tracks task status (not-started, in-progress, complete) using localStorage
 * for persistence across page refreshes.
 */

export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'blocked';

export interface TaskProgress {
  status: TaskStatus;
  startedAt?: string;
  completedAt?: string;
  timestamp: string;
}

const STORAGE_KEY = 'wyshbone-task-progress';

/**
 * Get all task progress from localStorage
 */
export function getAllTaskProgress(): Record<string, TaskProgress> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error('Failed to load task progress from localStorage:', error);
    return {};
  }
}

/**
 * Get progress for a specific task
 */
export function getTaskProgress(taskId: string): TaskProgress | null {
  const allProgress = getAllTaskProgress();
  return allProgress[taskId] || null;
}

/**
 * Get status for a specific task
 */
export function getTaskStatus(taskId: string): TaskStatus | null {
  const progress = getTaskProgress(taskId);
  return progress?.status || null;
}

/**
 * Update task status
 */
export function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  additionalData?: Partial<TaskProgress>
): void {
  // DEBUG: Log every status change with stack trace
  console.log('========== TASK STATUS CHANGE ==========');
  console.log('Task ID:', taskId);
  console.log('New Status:', status);
  console.log('Additional Data:', additionalData);
  console.log('Called from:', new Error().stack?.split('\n').slice(2, 5).join('\n'));
  console.log('=========================================');

  const allProgress = getAllTaskProgress();

  const existingProgress = allProgress[taskId] || {};

  const updatedProgress: TaskProgress = {
    ...existingProgress,
    status,
    timestamp: new Date().toISOString(),
    ...additionalData
  };

  // Add timestamps based on status
  if (status === 'in-progress' && !updatedProgress.startedAt) {
    updatedProgress.startedAt = new Date().toISOString();
  }

  if (status === 'completed' && !updatedProgress.completedAt) {
    updatedProgress.completedAt = new Date().toISOString();
  }

  allProgress[taskId] = updatedProgress;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allProgress));
    console.log(`✓ Task ${taskId} status updated to: ${status}`);
  } catch (error) {
    console.error('Failed to save task progress to localStorage:', error);
  }
}

/**
 * Mark task as in-progress
 */
export function markTaskInProgress(taskId: string): void {
  updateTaskStatus(taskId, 'in-progress');
}

/**
 * Mark task as complete
 */
export function markTaskComplete(taskId: string): void {
  updateTaskStatus(taskId, 'completed');
}

/**
 * Mark task as blocked
 */
export function markTaskBlocked(taskId: string): void {
  updateTaskStatus(taskId, 'blocked');
}

/**
 * Reset task to not-started
 */
export function resetTask(taskId: string): void {
  const allProgress = getAllTaskProgress();
  delete allProgress[taskId];

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allProgress));
    console.log(`✓ Task ${taskId} reset to not-started`);
  } catch (error) {
    console.error('Failed to reset task:', error);
  }
}

/**
 * Clear all task progress
 */
export function clearAllTaskProgress(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log('✓ All task progress cleared');
  } catch (error) {
    console.error('Failed to clear task progress:', error);
  }
}

/**
 * Calculate progress statistics
 */
export function calculateProgressStats(taskIds: string[]) {
  const allProgress = getAllTaskProgress();

  let completed = 0;
  let inProgress = 0;
  let blocked = 0;
  let notStarted = 0;

  taskIds.forEach(taskId => {
    const progress = allProgress[taskId];
    if (!progress) {
      notStarted++;
    } else {
      switch (progress.status) {
        case 'completed':
          completed++;
          break;
        case 'in-progress':
          inProgress++;
          break;
        case 'blocked':
          blocked++;
          break;
        default:
          notStarted++;
      }
    }
  });

  const total = taskIds.length;

  // Count in-progress as 50% done for percentage calculation
  const effectiveProgress = completed + (inProgress * 0.5);
  const percentage = total > 0 ? Math.round((effectiveProgress / total) * 100) : 0;

  return {
    total,
    completed,
    inProgress,
    blocked,
    notStarted,
    percentage
  };
}

/**
 * Format time ago
 */
export function formatTimeAgo(timestamp: string): string {
  const now = new Date();
  const past = new Date(timestamp);
  const diffMs = now.getTime() - past.getTime();

  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins === 1) return '1 minute ago';
  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours === 1) return '1 hour ago';
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays === 1) return '1 day ago';
  return `${diffDays} days ago`;
}

/**
 * Cleanup invalid task states in localStorage
 *
 * Removes any tasks marked 'in-progress' without a startedAt timestamp.
 * This fixes bugs where tasks get auto-marked in-progress incorrectly.
 *
 * Call this on app/component mount to ensure clean state.
 */
export function cleanupInvalidTaskStates(): number {
  const allProgress = getAllTaskProgress();
  let cleanedCount = 0;

  Object.keys(allProgress).forEach(taskId => {
    const taskProgress = allProgress[taskId];

    // If marked in-progress but no startedAt timestamp, it's invalid
    if (taskProgress.status === 'in-progress' && !taskProgress.startedAt) {
      console.warn(`🧹 Cleaning invalid in-progress state for task ${taskId}`);
      delete allProgress[taskId];
      cleanedCount++;
    }
  });

  if (cleanedCount > 0) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(allProgress));
      console.log(`✓ Cleaned up ${cleanedCount} invalid task state(s)`);
    } catch (error) {
      console.error('Failed to save cleaned task progress:', error);
    }
  }

  return cleanedCount;
}
