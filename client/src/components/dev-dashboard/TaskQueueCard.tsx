/**
 * TaskQueueCard Component
 *
 * Card for displaying a task in the auto-ordered work queue.
 * Shows position, status, and appropriate actions.
 */

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, GitBranch, Ban, Sparkles, Check } from 'lucide-react';
import { PhaseTask } from '@/services/devProgressService';
import { formatTimeAgo, getTaskProgress } from '@/services/taskProgressService';

interface BlockerDetail {
  taskId: string;
  taskName: string;
  status: string;
  isComplete: boolean;
}

interface TaskQueueCardProps {
  task: PhaseTask;
  position: number;
  isFirstReady: boolean;
  isReady: boolean;
  isInProgress: boolean;
  isBlocked: boolean;
  isComplete: boolean;
  claudeCodeWorking?: boolean;
  blockers: BlockerDetail[];
  onGeneratePrompt: (task: PhaseTask) => void;
  onMarkComplete: (task: PhaseTask) => void;
}

// Repo color mapping
const repoColors: Record<string, string> = {
  'wyshbone-ui': 'bg-purple-500/10 text-purple-700 border-purple-500/20',
  'wyshbone-supervisor': 'bg-pink-500/10 text-pink-700 border-pink-500/20',
  'wyshbone-tower': 'bg-blue-500/10 text-blue-700 border-blue-500/20',
  'WABS': 'bg-green-500/10 text-green-700 border-green-500/20',
};

export function TaskQueueCard({
  task,
  position,
  isFirstReady,
  isReady,
  isInProgress,
  isBlocked,
  isComplete,
  claudeCodeWorking = false,
  blockers,
  onGeneratePrompt,
  onMarkComplete,
}: TaskQueueCardProps) {
  const progress = getTaskProgress(task.id);

  // Determine card class
  let cardClass = 'task-queue-card relative pl-4';
  if (isFirstReady) {
    cardClass += ' first-ready border-3 border-orange-500 shadow-xl';
  } else if (isReady) {
    cardClass += ' ready border-l-4 border-green-500 bg-green-500/5';
  } else if (isInProgress) {
    cardClass += ' in-progress border-l-4 border-blue-500 bg-blue-500/5 shadow-lg';
  } else if (isBlocked) {
    cardClass += ' blocked border-l-4 border-gray-500 opacity-50';
  } else if (isComplete) {
    cardClass += ' complete border-l-4 border-green-600 opacity-40 bg-green-500/5';
  }

  return (
    <div className={`relative mb-4 ${isComplete ? 'max-h-24 overflow-hidden' : ''}`}>
      {/* Position Number */}
      <div
        className={`absolute -left-12 top-6 w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm
        ${
          isFirstReady
            ? 'bg-orange-500 text-white w-12 h-12 text-lg shadow-lg'
            : isReady
            ? 'bg-green-500 text-white'
            : isInProgress
            ? 'bg-blue-500 text-white'
            : isBlocked
            ? 'bg-gray-500 text-white'
            : 'bg-green-600 text-white'
        }`}
      >
        {position}
      </div>

      <Card className={cardClass}>
        <CardContent className="p-4">
          {/* START HERE Banner */}
          {isFirstReady && (
            <div className="start-here-banner bg-gradient-to-r from-orange-500 to-orange-600 text-white font-bold text-center py-3 px-4 -mx-4 -mt-4 mb-4 rounded-t-lg animate-pulse">
              👉 START HERE - Do this task next!
            </div>
          )}

          {/* Claude Code Working Banner */}
          {claudeCodeWorking && (
            <div className="claude-code-banner bg-gradient-to-r from-purple-600 to-purple-700 text-white font-bold text-center py-3 px-4 -mx-4 -mt-4 mb-4 rounded-t-lg shadow-lg">
              <div className="flex items-center justify-center gap-2 animate-pulse">
                <span className="text-2xl">🤖</span>
                <span>Claude Code is Working on This!</span>
              </div>
              <div className="text-xs font-normal mt-1 opacity-90">
                Dashboard auto-detected Claude Code activity
              </div>
            </div>
          )}

          {/* Status Badge */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {isReady && (
                <Badge className="bg-green-500 hover:bg-green-600 text-white">🚀 READY</Badge>
              )}
              {isInProgress && !claudeCodeWorking && (
                <Badge className="bg-blue-500 hover:bg-blue-600 text-white">🔄 IN PROGRESS</Badge>
              )}
              {isInProgress && claudeCodeWorking && (
                <Badge className="bg-purple-500 hover:bg-purple-600 text-white animate-pulse">🤖 CLAUDE CODE WORKING</Badge>
              )}
              {isBlocked && (
                <Badge className="bg-gray-500 hover:bg-gray-600 text-white">⏸️ BLOCKED</Badge>
              )}
              {isComplete && (
                <Badge className="bg-green-600 hover:bg-green-700 text-white text-xs">
                  ✅ COMPLETE
                </Badge>
              )}
            </div>

            {/* Priority Badge */}
            {task.priority && (
              <Badge
                variant={task.priority === 'critical' ? 'destructive' : 'secondary'}
                className="text-xs"
              >
                {task.priority.toUpperCase()}
              </Badge>
            )}
          </div>

          {/* Task Info */}
          <div className="mb-3">
            <h4 className="font-semibold text-lg mb-2">{task.title}</h4>

            <div className="flex items-center gap-2 flex-wrap text-xs">
              {/* Repo Badge */}
              <Badge className={`${repoColors[task.repo]} border font-medium`}>{task.repo}</Badge>

              {/* Branch Badge */}
              <Badge variant="outline" className="flex items-center gap-1">
                <GitBranch className="h-3 w-3" />
                {task.branchName}
              </Badge>

              {/* Time Estimate */}
              {task.humanVerification?.timeNeeded && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {task.humanVerification.timeNeeded}
                </Badge>
              )}

              {/* Blocks Count */}
              {task.blocksOtherTasks && task.blocksOtherTasks.length > 0 && (
                <Badge variant="outline" className="flex items-center gap-1 text-red-600 border-red-500/50">
                  <Ban className="h-3 w-3" />
                  Blocks {task.blocksOtherTasks.length}
                </Badge>
              )}

              {/* Time Since Started/Completed */}
              {isInProgress && progress?.startedAt && (
                <span className="text-muted-foreground">Started {formatTimeAgo(progress.startedAt)}</span>
              )}
              {isComplete && progress?.completedAt && (
                <span className="text-green-600">Completed {formatTimeAgo(progress.completedAt)}</span>
              )}
            </div>
          </div>

          {/* Blocker Info */}
          {isBlocked && blockers.length > 0 && (
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 mb-3">
              <div className="text-sm font-semibold text-gray-400 mb-2">Waiting for:</div>
              <ul className="space-y-1">
                {blockers.filter(b => !b.isComplete).map(blocker => (
                  <li key={blocker.taskId} className="text-sm text-gray-300 flex items-center gap-2">
                    {blocker.status === 'in-progress' && <span className="text-blue-400">🔄</span>}
                    {blocker.status !== 'in-progress' && blocker.status !== 'completed' && (
                      <span className="text-gray-500">❌</span>
                    )}
                    {blocker.taskName}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {isReady && (
              <Button
                onClick={() => onGeneratePrompt(task)}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                📋 Generate Prompt
              </Button>
            )}

            {isInProgress && (
              <>
                <Button onClick={() => onGeneratePrompt(task)} variant="outline" className="flex-1">
                  <Sparkles className="h-4 w-4 mr-2" />
                  📋 Re-open Instructions
                </Button>
                <Button
                  onClick={() => onMarkComplete(task)}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  <Check className="h-4 w-4 mr-2" />
                  ✅ Mark Complete
                </Button>
              </>
            )}

            {isBlocked && (
              <div className="text-center text-gray-400 italic py-2 flex-1">
                Complete the tasks above to unlock this
              </div>
            )}

            {isComplete && (
              <div className="text-center text-green-600 py-2 flex-1 text-sm">
                ✅ Done and verified
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
