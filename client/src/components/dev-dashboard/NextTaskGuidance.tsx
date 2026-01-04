/**
 * NextTaskGuidance Component
 *
 * Shows intelligent guidance about what to do next based on:
 * - Current task status and dependencies
 * - What tasks are blocked by this one
 * - Whether verification is needed before continuing
 */

import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, ArrowRight, CheckCircle, Info, Lightbulb } from 'lucide-react';
import { PhaseTask } from '@/services/devProgressService';
import { getTaskStatus } from '@/services/taskProgressService';

interface NextTaskGuidanceProps {
  currentTask: PhaseTask;
  allTasks: PhaseTask[];
}

export function NextTaskGuidance({ currentTask, allTasks }: NextTaskGuidanceProps) {
  const currentStatus = getTaskStatus(currentTask.id);
  const isInProgress = currentStatus === 'in-progress';
  const isCompleted = currentStatus === 'completed';

  // Don't show guidance for pending tasks
  if (!isInProgress && !isCompleted) {
    return null;
  }

  // Find tasks that are blocked by this task
  const blockedTasks = currentTask.blocksOtherTasks
    ? allTasks.filter(t => currentTask.blocksOtherTasks?.includes(t.id))
    : [];

  // Find next available tasks (not blocked, not completed, not in-progress)
  const nextAvailableTasks = allTasks.filter(t => {
    const status = getTaskStatus(t.id);
    if (status === 'completed' || status === 'in-progress') return false;

    // Check if blocked by any incomplete tasks
    if (t.blockedBy && t.blockedBy.length > 0) {
      const blockingTasks = allTasks.filter(bt => t.blockedBy?.includes(bt.id));
      const hasBlockingTasks = blockingTasks.some(bt => {
        const btStatus = getTaskStatus(bt.id);
        return btStatus !== 'completed';
      });
      return !hasBlockingTasks;
    }

    return true;
  });

  // Determine if user needs to verify this task first
  const needsVerification =
    isInProgress &&
    currentTask.safetyLevel === 'MUST_TEST_NOW' &&
    !currentTask.canContinueWithout;

  const canContinueNow = isCompleted || !needsVerification;

  return (
    <Card className="border-blue-500/50 bg-blue-500/5 mt-4">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Lightbulb className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 space-y-3">
            <h4 className="font-semibold text-blue-900">What to Do Next</h4>

            {/* If task is in-progress and needs verification */}
            {isInProgress && needsVerification && (
              <div className="space-y-2">
                <div className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-orange-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-orange-700">Must verify before continuing</p>
                    <p className="text-muted-foreground mt-1">
                      This task blocks other work. Please complete it and verify it works before moving on.
                    </p>
                  </div>
                </div>

                {blockedTasks.length > 0 && (
                  <div className="text-xs text-muted-foreground ml-6">
                    <span className="font-medium">Blocks:</span>{' '}
                    {blockedTasks.map(t => t.title).join(', ')}
                  </div>
                )}
              </div>
            )}

            {/* If task is in-progress but can continue */}
            {isInProgress && !needsVerification && (
              <div className="space-y-2">
                <div className="flex items-start gap-2 text-sm">
                  <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-blue-700">You can continue working</p>
                    <p className="text-muted-foreground mt-1">
                      {currentTask.safetyLevel === 'QUICK_CHECK_RECOMMENDED'
                        ? 'Quick verification recommended, but you can test later if needed.'
                        : 'This task can be tested later. Safe to continue to other work.'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* If task is completed, show next steps */}
            {isCompleted && (
              <div className="space-y-3">
                <div className="flex items-start gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-green-700">Task completed!</p>
                    {blockedTasks.length > 0 && (
                      <p className="text-muted-foreground mt-1">
                        You've unblocked {blockedTasks.length} task{blockedTasks.length > 1 ? 's' : ''}.
                      </p>
                    )}
                  </div>
                </div>

                {/* Show newly unblocked tasks */}
                {blockedTasks.length > 0 && (
                  <div className="ml-6 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase">
                      Now available:
                    </p>
                    {blockedTasks.map(task => {
                      const taskStatus = getTaskStatus(task.id);
                      if (taskStatus === 'completed' || taskStatus === 'in-progress') return null;

                      return (
                        <div key={task.id} className="flex items-center gap-2 text-sm">
                          <ArrowRight className="h-3 w-3 text-primary" />
                          <span className="font-medium">{task.title}</span>
                          {task.priority === 'critical' && (
                            <span className="text-xs text-red-600">(Critical)</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Show next available tasks if any */}
            {canContinueNow && nextAvailableTasks.length > 0 && (
              <div className="space-y-2 pt-2 border-t">
                <p className="text-xs font-medium text-muted-foreground uppercase">
                  Other available tasks ({nextAvailableTasks.length}):
                </p>
                <div className="space-y-1">
                  {nextAvailableTasks.slice(0, 3).map(task => (
                    <div key={task.id} className="flex items-center gap-2 text-sm">
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span>{task.title}</span>
                      {task.priority === 'critical' && (
                        <span className="text-xs text-red-600">(Critical)</span>
                      )}
                    </div>
                  ))}
                  {nextAvailableTasks.length > 3 && (
                    <p className="text-xs text-muted-foreground ml-5">
                      + {nextAvailableTasks.length - 3} more...
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* If no tasks available */}
            {canContinueNow && nextAvailableTasks.length === 0 && isCompleted && (
              <div className="flex items-start gap-2 text-sm pt-2 border-t">
                <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-green-700 font-medium">
                  All tasks in this phase are complete or in-progress! 🎉
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
