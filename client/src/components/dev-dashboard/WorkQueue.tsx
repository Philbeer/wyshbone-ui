/**
 * WorkQueue Component
 *
 * Auto-ordered work queue that makes it brain-dead simple
 * to work top-to-bottom. List reorders after each task.
 */

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, Circle, Loader2, Pause, Rocket, AlertCircle } from 'lucide-react';
import { Phase, PhaseTask } from '@/services/devProgressService';
import { TaskQueueCard } from './TaskQueueCard';
import { TaskWorkflowModal } from './TaskWorkflowModal';
import { VerificationModal } from './VerificationModal';
import {
  orderTasksForWorkQueue,
  getTaskReadiness,
  getBlockerDetails,
  calculateQueueStats,
  findNewlyReadyTasks,
  type TaskReadiness
} from '@/services/workQueueService';
import {
  getTaskStatus,
  markTaskInProgress,
  markTaskComplete,
  cleanupInvalidTaskStates,
  type TaskStatus
} from '@/services/taskProgressService';

interface WorkQueueProps {
  phases: Phase[];
}

export function WorkQueue({ phases }: WorkQueueProps) {
  // Combine all tasks from all phases
  const allTasks = phases.flatMap(p => p.tasks);

  const [orderedTasks, setOrderedTasks] = useState<PhaseTask[]>([]);
  const [taskStatuses, setTaskStatuses] = useState<Record<string, TaskStatus>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<PhaseTask | null>(null);
  const [taskToVerify, setTaskToVerify] = useState<PhaseTask | null>(null);
  const [showUnlockNotification, setShowUnlockNotification] = useState(false);
  const [unlockedCount, setUnlockedCount] = useState(0);

  const taskRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Load task statuses and order tasks
  useEffect(() => {
    // CRITICAL: Clean up any invalid in-progress states on mount
    // This fixes bugs where tasks get auto-marked in-progress
    cleanupInvalidTaskStates();

    const statuses: Record<string, TaskStatus> = {};
    allTasks.forEach(task => {
      const status = getTaskStatus(task.id);
      if (status) {
        statuses[task.id] = status;
      }
    });
    setTaskStatuses(statuses);

    // Order tasks for queue
    const ordered = orderTasksForWorkQueue(allTasks);
    setOrderedTasks(ordered);
  }, [phases]);

  // Auto-reorder whenever task status changes
  const reorderQueue = () => {
    const ordered = orderTasksForWorkQueue(allTasks);
    setOrderedTasks(ordered);
  };

  const handleGeneratePrompt = (task: PhaseTask) => {
    // Mark task as in-progress
    markTaskInProgress(task.id);
    setTaskStatuses(prev => ({ ...prev, [task.id]: 'in-progress' }));

    // Open modal
    setSelectedTask(task);
    setModalOpen(true);

    // Reorder queue
    setTimeout(reorderQueue, 100);
  };

  const handleMarkComplete = (task: PhaseTask) => {
    // Check for newly unblocked tasks BEFORE marking complete
    const newlyReady = findNewlyReadyTasks(task.id, allTasks);

    // If task has safety level and requires verification, show modal
    if (task.safetyLevel && task.safetyLevel !== 'CAN_TEST_LATER') {
      setTaskToVerify(task);
      setVerificationModalOpen(true);
    } else {
      // No verification needed, mark complete immediately
      completeTask(task, newlyReady);
    }
  };

  const completeTask = (task: PhaseTask, newlyReady: PhaseTask[] = []) => {
    markTaskComplete(task.id);
    setTaskStatuses(prev => ({ ...prev, [task.id]: 'completed' }));

    // Show unlock notification if tasks were unblocked
    if (newlyReady.length > 0) {
      setUnlockedCount(newlyReady.length);
      setShowUnlockNotification(true);
      setTimeout(() => setShowUnlockNotification(false), 5000);

      // Scroll to top to show newly ready tasks
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      // Scroll to next ready task
      setTimeout(() => {
        const nextReady = orderedTasks.find(t => {
          const status = getTaskStatus(t.id);
          return status !== 'completed' && getTaskReadiness(t, allTasks) === 'ready';
        });

        if (nextReady && taskRefs.current[nextReady.id]) {
          taskRefs.current[nextReady.id]?.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
        }
      }, 500);
    }

    // Reorder queue
    setTimeout(reorderQueue, 100);
  };

  const handleVerified = (task: PhaseTask) => {
    const newlyReady = findNewlyReadyTasks(task.id, allTasks);
    completeTask(task, newlyReady);
    console.log(`✅ Task ${task.id} verified and completed`);
  };

  const handleNeedsWork = (task: PhaseTask) => {
    console.log(`❌ Task ${task.id} needs more work - staying in-progress`);
    // Task stays in-progress
  };

  const handleSkipRisk = (task: PhaseTask) => {
    const newlyReady = findNewlyReadyTasks(task.id, allTasks);
    completeTask(task, newlyReady);
    console.log(`⚠️ Task ${task.id} marked complete WITHOUT verification`);
  };

  // Calculate queue stats
  const stats = calculateQueueStats(allTasks);

  // Find first ready task
  const firstReadyTask = orderedTasks.find(t => {
    const status = getTaskStatus(t.id);
    return status !== 'completed' && getTaskReadiness(t, allTasks) === 'ready';
  });

  // Find in-progress tasks
  const inProgressTasks = orderedTasks.filter(t => {
    const status = getTaskStatus(t.id);
    return status === 'in-progress';
  });

  return (
    <div className="work-queue-container">
      {/* Unlock Notification */}
      {showUnlockNotification && (
        <div className="fixed top-4 right-4 bg-green-600 text-white px-6 py-4 rounded-lg shadow-2xl animate-in slide-in-from-right z-50">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎉</span>
            <div>
              <div className="font-bold">Tasks Unlocked!</div>
              <div className="text-sm">
                {unlockedCount} task{unlockedCount > 1 ? 's' : ''} now ready to work on!
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Action Bar */}
      <Card className="mb-6 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-blue-500/30">
        <CardContent className="p-6">
          <div className="flex items-center justify-between gap-6">
            {/* Next Task Preview */}
            <div className="flex-1">
              {firstReadyTask ? (
                <div className="flex items-center gap-4">
                  <Rocket className="h-8 w-8 text-green-500 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-sm text-muted-foreground mb-1">👉 Next Task:</div>
                    <div className="font-semibold text-lg">{firstReadyTask.title}</div>
                  </div>
                  <Button
                    onClick={() => handleGeneratePrompt(firstReadyTask)}
                    className="bg-green-600 hover:bg-green-700 px-6"
                    size="lg"
                  >
                    🚀 Start Now
                  </Button>
                </div>
              ) : inProgressTasks.length > 0 ? (
                <div className="flex items-center gap-4">
                  <Loader2 className="h-8 w-8 text-blue-500 flex-shrink-0 animate-spin" />
                  <div className="flex-1">
                    <div className="text-sm text-muted-foreground mb-1">🔄 Finish In-Progress:</div>
                    <div className="font-semibold text-lg">{inProgressTasks[0].title}</div>
                  </div>
                  <Button
                    onClick={() => {
                      taskRefs.current[inProgressTasks[0].id]?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center'
                      });
                    }}
                    variant="outline"
                    size="lg"
                  >
                    ✅ Mark Complete
                  </Button>
                </div>
              ) : stats.blocked > 0 ? (
                <div className="flex items-center gap-4">
                  <Pause className="h-8 w-8 text-gray-500 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-sm text-muted-foreground mb-1">⏸️ All Tasks Blocked</div>
                    <div className="font-semibold text-lg">Complete blockers to continue</div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <CheckCircle className="h-8 w-8 text-green-500 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-sm text-muted-foreground mb-1">🎉 Phase Complete!</div>
                    <div className="font-semibold text-lg">All tasks done!</div>
                  </div>
                </div>
              )}
            </div>

            {/* Progress */}
            <div className="w-64">
              <div className="mb-2">
                <Progress value={stats.percentage} className="h-3" />
              </div>
              <div className="text-xs text-muted-foreground text-center">
                {stats.complete} / {stats.total} tasks complete ({stats.percentage}%)
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Queue Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card className="bg-green-500/10 border-green-500/30">
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Rocket className="h-4 w-4 text-green-600" />
              <div className="text-2xl font-bold text-green-600">{stats.ready}</div>
            </div>
            <div className="text-xs text-muted-foreground">Ready to Work</div>
          </CardContent>
        </Card>

        <Card className="bg-blue-500/10 border-blue-500/30">
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Loader2 className="h-4 w-4 text-blue-600" />
              <div className="text-2xl font-bold text-blue-600">{stats.inProgress}</div>
            </div>
            <div className="text-xs text-muted-foreground">In Progress</div>
          </CardContent>
        </Card>

        <Card className="bg-gray-500/10 border-gray-500/30">
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Pause className="h-4 w-4 text-gray-600" />
              <div className="text-2xl font-bold text-gray-600">{stats.blocked}</div>
            </div>
            <div className="text-xs text-muted-foreground">Blocked</div>
          </CardContent>
        </Card>

        <Card className="bg-green-600/10 border-green-600/30">
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <CheckCircle className="h-4 w-4 text-green-700" />
              <div className="text-2xl font-bold text-green-700">{stats.complete}</div>
            </div>
            <div className="text-xs text-muted-foreground">Complete</div>
          </CardContent>
        </Card>
      </div>

      {/* The Queue */}
      <div className="task-queue space-y-4 ml-16">
        {orderedTasks.map((task, index) => {
          const readiness = getTaskReadiness(task, allTasks);
          const isReady = readiness === 'ready';
          const isInProgress = readiness === 'in-progress';
          const isBlocked = readiness === 'blocked';
          const isComplete = readiness === 'complete';
          const isFirstReady = isReady && index === 0;

          return (
            <div key={task.id} ref={el => (taskRefs.current[task.id] = el)}>
              <TaskQueueCard
                task={task}
                position={index + 1}
                isFirstReady={isFirstReady}
                isReady={isReady}
                isInProgress={isInProgress}
                isBlocked={isBlocked}
                isComplete={isComplete}
                blockers={isBlocked ? getBlockerDetails(task, allTasks) : []}
                onGeneratePrompt={handleGeneratePrompt}
                onMarkComplete={handleMarkComplete}
              />
            </div>
          );
        })}
      </div>

      {/* Task Workflow Modal */}
      {selectedTask && (
        <TaskWorkflowModal
          task={selectedTask}
          isOpen={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setSelectedTask(null);
          }}
        />
      )}

      {/* Verification Modal */}
      {taskToVerify && (
        <VerificationModal
          task={taskToVerify}
          isOpen={verificationModalOpen}
          onVerified={() => handleVerified(taskToVerify)}
          onNeedsWork={() => handleNeedsWork(taskToVerify)}
          onSkipRisk={() => handleSkipRisk(taskToVerify)}
          onClose={() => {
            setVerificationModalOpen(false);
            setTaskToVerify(null);
          }}
        />
      )}
    </div>
  );
}
