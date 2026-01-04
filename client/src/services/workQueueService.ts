/**
 * Work Queue Service
 *
 * Provides ordering logic for the auto-ordered work queue
 * that makes it brain-dead simple to work top-to-bottom.
 */

import { PhaseTask } from './devProgressService';
import { getTaskStatus, getTaskProgress } from './taskProgressService';

export type TaskReadiness = 'ready' | 'blocked' | 'in-progress' | 'complete';

/**
 * Check if a task is ready to work on (all dependencies met)
 */
export function getTaskReadiness(task: PhaseTask, allTasks: PhaseTask[]): TaskReadiness {
  const status = getTaskStatus(task.id) || task.status;

  // Already complete
  if (status === 'completed') {
    return 'complete';
  }

  // Currently working on it
  if (status === 'in-progress') {
    return 'in-progress';
  }

  // Check if blocked by any incomplete tasks
  if (task.blockedBy && task.blockedBy.length > 0) {
    const hasIncompleteBlockers = task.blockedBy.some(blockerId => {
      const blocker = allTasks.find(t => t.id === blockerId);
      if (!blocker) return false;
      const blockerStatus = getTaskStatus(blocker.id) || blocker.status;
      return blockerStatus !== 'completed';
    });

    if (hasIncompleteBlockers) {
      return 'blocked';
    }
  }

  // Ready to work on
  return 'ready';
}

/**
 * Get details about what's blocking a task
 */
export function getBlockerDetails(task: PhaseTask, allTasks: PhaseTask[]) {
  if (!task.blockedBy || task.blockedBy.length === 0) {
    return [];
  }

  return task.blockedBy
    .map(blockerId => {
      const blocker = allTasks.find(t => t.id === blockerId);
      if (!blocker) return null;

      const status = getTaskStatus(blocker.id) || blocker.status;
      const isComplete = status === 'completed';

      return {
        taskId: blocker.id,
        taskName: blocker.title,
        status: status || 'pending',
        isComplete
      };
    })
    .filter(Boolean) as Array<{
    taskId: string;
    taskName: string;
    status: string;
    isComplete: boolean;
  }>;
}

/**
 * Parse time string to minutes for sorting
 */
function parseTimeToMinutes(timeStr?: string): number {
  if (!timeStr) return 999; // Unknown time goes last

  const match = timeStr.match(/(\d+)(-(\d+))?\s*(min|minute|hour|hr)/i);
  if (!match) return 999;

  const min = parseInt(match[1]);
  const max = match[3] ? parseInt(match[3]) : min;
  const avg = (min + max) / 2;

  const unit = match[4].toLowerCase();
  if (unit.startsWith('hour') || unit === 'hr') {
    return avg * 60;
  }

  return avg;
}

/**
 * Order tasks for the work queue (brain-dead simple top-to-bottom)
 */
export function orderTasksForWorkQueue(allTasks: PhaseTask[]): PhaseTask[] {
  // 1. Separate by readiness
  const ready: PhaseTask[] = [];
  const inProgress: PhaseTask[] = [];
  const blocked: PhaseTask[] = [];
  const complete: PhaseTask[] = [];

  allTasks.forEach(task => {
    const readiness = getTaskReadiness(task, allTasks);

    switch (readiness) {
      case 'ready':
        ready.push(task);
        break;
      case 'in-progress':
        inProgress.push(task);
        break;
      case 'blocked':
        blocked.push(task);
        break;
      case 'complete':
        complete.push(task);
        break;
    }
  });

  // 2. Sort in-progress tasks by most recent first
  const sortedInProgress = inProgress.sort((a, b) => {
    // Get started timestamps from localStorage
    const aProgress = getTaskProgress(a.id);
    const bProgress = getTaskProgress(b.id);
    const aTime = aProgress?.startedAt ? new Date(aProgress.startedAt).getTime() : 0;
    const bTime = bProgress?.startedAt ? new Date(bProgress.startedAt).getTime() : 0;
    return bTime - aTime; // Most recent first
  });

  // 3. Sort ready tasks by priority
  const priorityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3
  };

  const sortedReady = ready.sort((a, b) => {
    // CRITICAL first
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;

    // Then by how many tasks this blocks (most impact first)
    const aBlocks = a.blocksOtherTasks?.length || 0;
    const bBlocks = b.blocksOtherTasks?.length || 0;
    if (aBlocks !== bBlocks) return bBlocks - aBlocks;

    // Then by time (quick wins first)
    const aTime = parseTimeToMinutes(a.humanVerification?.timeNeeded);
    const bTime = parseTimeToMinutes(b.humanVerification?.timeNeeded);
    return aTime - bTime;
  });

  // 4. Sort blocked tasks by priority (so when unblocked, they're in right order)
  const sortedBlocked = blocked.sort((a, b) => {
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  // 5. CRITICAL: Combine in order: in-progress FIRST → ready → blocked → complete
  // In-progress tasks appear at top so users finish what they started
  return [...sortedInProgress, ...sortedReady, ...sortedBlocked, ...complete];
}

/**
 * Find tasks that just became ready (newly unblocked)
 */
export function findNewlyReadyTasks(
  completedTaskId: string,
  allTasks: PhaseTask[]
): PhaseTask[] {
  const completedTask = allTasks.find(t => t.id === completedTaskId);
  if (!completedTask || !completedTask.blocksOtherTasks) {
    return [];
  }

  // Find tasks that were blocked by this task and are now ready
  return completedTask.blocksOtherTasks
    .map(blockedId => allTasks.find(t => t.id === blockedId))
    .filter(Boolean)
    .filter(task => {
      return getTaskReadiness(task!, allTasks) === 'ready';
    }) as PhaseTask[];
}

/**
 * Calculate work queue statistics
 */
export function calculateQueueStats(allTasks: PhaseTask[]) {
  let ready = 0;
  let inProgress = 0;
  let blocked = 0;
  let complete = 0;

  allTasks.forEach(task => {
    const readiness = getTaskReadiness(task, allTasks);
    switch (readiness) {
      case 'ready':
        ready++;
        break;
      case 'in-progress':
        inProgress++;
        break;
      case 'blocked':
        blocked++;
        break;
      case 'complete':
        complete++;
        break;
    }
  });

  const total = allTasks.length;
  const percentage = total > 0 ? Math.round((complete / total) * 100) : 0;

  return {
    ready,
    inProgress,
    blocked,
    complete,
    total,
    percentage
  };
}
