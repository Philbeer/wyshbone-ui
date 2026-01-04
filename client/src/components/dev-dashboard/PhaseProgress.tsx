/**
 * Phase Progress Component
 * Shows progress through Phase 1/2/3 with task breakdowns
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Circle, AlertCircle, Loader2, Sparkles, GitBranch, Check } from 'lucide-react';
import { Phase, PhaseTask } from '@/services/devProgressService';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { TaskWorkflowModal } from './TaskWorkflowModal';
import { SafetyBadge } from './SafetyBadge';
import { VerificationModal } from './VerificationModal';
import { NextTaskGuidance } from './NextTaskGuidance';
import { VerificationDetails } from './VerificationDetails';
import { DependencyExplanation } from './DependencyExplanation';
import {
  getTaskStatus,
  markTaskInProgress,
  markTaskComplete,
  getTaskProgress,
  formatTimeAgo,
  calculateProgressStats,
  type TaskStatus
} from '@/services/taskProgressService';

interface Props {
  phases: Phase[];
}

// Repo color mapping
const repoColors = {
  'wyshbone-ui': 'bg-purple-500/10 text-purple-700 border-purple-500/20',
  'wyshbone-supervisor': 'bg-pink-500/10 text-pink-700 border-pink-500/20',
  'wyshbone-tower': 'bg-blue-500/10 text-blue-700 border-blue-500/20',
  'WABS': 'bg-green-500/10 text-green-700 border-green-500/20',
};

export function PhaseProgress({ phases }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<PhaseTask | null>(null);
  const [taskStatuses, setTaskStatuses] = useState<Record<string, TaskStatus>>({});
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const [taskToVerify, setTaskToVerify] = useState<PhaseTask | null>(null);

  // Load task statuses from localStorage on mount
  useEffect(() => {
    const statuses: Record<string, TaskStatus> = {};
    phases.forEach(phase => {
      phase.tasks.forEach(task => {
        const status = getTaskStatus(task.id);
        if (status) {
          statuses[task.id] = status;
        }
      });
    });
    setTaskStatuses(statuses);
  }, [phases, refreshTrigger]);

  const handleGeneratePrompt = (task: PhaseTask) => {
    // Mark task as in-progress when opening the modal
    markTaskInProgress(task.id);
    setTaskStatuses(prev => ({ ...prev, [task.id]: 'in-progress' }));

    setSelectedTask(task);
    setModalOpen(true);
  };

  const handleMarkComplete = (task: PhaseTask) => {
    // If task has safety level and requires verification, show modal
    if (task.safetyLevel && task.safetyLevel !== 'CAN_TEST_LATER') {
      setTaskToVerify(task);
      setVerificationModalOpen(true);
    } else {
      // No verification needed, mark complete immediately
      markTaskComplete(task.id);
      setTaskStatuses(prev => ({ ...prev, [task.id]: 'completed' }));
      setRefreshTrigger(prev => prev + 1);
    }
  };

  const handleVerified = (task: PhaseTask) => {
    // User confirmed it works - mark complete
    markTaskComplete(task.id);
    setTaskStatuses(prev => ({ ...prev, [task.id]: 'completed' }));
    setRefreshTrigger(prev => prev + 1);
    console.log(`✅ Task ${task.id} verified and completed`);
  };

  const handleNeedsWork = (task: PhaseTask) => {
    // User says it doesn't work - keep as in-progress
    console.log(`❌ Task ${task.id} needs more work - staying in-progress`);
    // Task stays in-progress, user can continue fixing
  };

  const handleSkipRisk = (task: PhaseTask) => {
    // User skipped verification - mark complete but track as unverified
    markTaskComplete(task.id);
    setTaskStatuses(prev => ({ ...prev, [task.id]: 'completed' }));
    setRefreshTrigger(prev => prev + 1);
    console.log(`⚠️ Task ${task.id} marked complete WITHOUT verification`);
    // TODO: Track unverified tasks in localStorage for warning banner
  };

  const getCurrentStatus = (task: PhaseTask): TaskStatus => {
    return taskStatuses[task.id] || task.status || 'pending';
  };

  const getPhaseStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'in-progress':
        return <Loader2 className="h-5 w-5 text-primary animate-spin" />;
      case 'not-started':
        return <Circle className="h-5 w-5 text-muted-foreground" />;
      default:
        return <Circle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getTaskStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'in-progress':
        return <Loader2 className="h-4 w-4 text-primary" />;
      case 'blocked':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case 'pending':
        return <Circle className="h-4 w-4 text-muted-foreground" />;
      default:
        return <Circle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'critical':
        return <Badge variant="destructive" className="text-xs">Critical</Badge>;
      case 'high':
        return <Badge variant="default" className="text-xs">High</Badge>;
      case 'medium':
        return <Badge variant="secondary" className="text-xs">Medium</Badge>;
      case 'low':
        return <Badge variant="outline" className="text-xs">Low</Badge>;
      default:
        return null;
    }
  };

  const getTaskStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="text-xs bg-green-500">Completed</Badge>;
      case 'in-progress':
        return <Badge variant="default" className="text-xs">In Progress</Badge>;
      case 'blocked':
        return <Badge variant="destructive" className="text-xs">Blocked</Badge>;
      case 'pending':
        return <Badge variant="outline" className="text-xs">Pending</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {phases.map((phase) => {
        // Calculate real-time progress based on task statuses
        const taskIds = phase.tasks.map(t => t.id);
        const stats = calculateProgressStats(taskIds);

        return (
          <Card key={phase.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  {getPhaseStatusIcon(phase.status)}
                  <div>
                    <CardTitle className="text-xl">{phase.name}</CardTitle>
                    <CardDescription className="mt-1">
                      {phase.description} • {phase.duration}
                    </CardDescription>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold">{stats.percentage}%</div>
                  <p className="text-xs text-muted-foreground">
                    {stats.completed} of {stats.total} complete
                  </p>
                </div>
              </div>
              <Progress value={stats.percentage} className="h-2 mt-4" />

              {/* Progress Stats */}
              <div className="flex gap-3 mt-3 text-xs flex-wrap">
                {stats.completed > 0 && (
                  <span className="flex items-center gap-1 px-2 py-1 rounded bg-green-500/10 text-green-700">
                    <CheckCircle2 className="h-3 w-3" />
                    {stats.completed} Complete
                  </span>
                )}
                {stats.inProgress > 0 && (
                  <span className="flex items-center gap-1 px-2 py-1 rounded bg-blue-500/10 text-blue-700 animate-pulse">
                    <Loader2 className="h-3 w-3" />
                    {stats.inProgress} In Progress
                  </span>
                )}
                {stats.notStarted > 0 && (
                  <span className="flex items-center gap-1 px-2 py-1 rounded bg-gray-500/10 text-gray-700">
                    <Circle className="h-3 w-3" />
                    {stats.notStarted} Not Started
                  </span>
                )}
                {stats.blocked > 0 && (
                  <span className="flex items-center gap-1 px-2 py-1 rounded bg-red-500/10 text-red-700">
                    <AlertCircle className="h-3 w-3" />
                    {stats.blocked} Blocked
                  </span>
                )}
              </div>
            </CardHeader>
          <CardContent className="space-y-6">
            {/* Tasks */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Tasks:</h4>
              <Accordion type="multiple" className="space-y-2">
                {/* Sort tasks: in-progress first, then pending, then completed, then blocked */}
                {[...phase.tasks]
                  .sort((a, b) => {
                    const statusA = getCurrentStatus(a);
                    const statusB = getCurrentStatus(b);
                    const order = { 'in-progress': 0, 'pending': 1, 'completed': 2, 'blocked': 3 };
                    return (order[statusA] || 1) - (order[statusB] || 1);
                  })
                  .map((task) => {
                    const currentStatus = getCurrentStatus(task);
                    const progress = getTaskProgress(task.id);
                    const isInProgress = currentStatus === 'in-progress';
                    const isCompleted = currentStatus === 'completed';

                    return (
                      <AccordionItem
                        key={task.id}
                        value={task.id}
                        className={`border rounded-lg px-4 ${
                          isInProgress
                            ? 'border-blue-500/50 bg-blue-500/5 shadow-lg'
                            : isCompleted
                            ? 'border-green-500/30 bg-green-500/5 opacity-70'
                            : ''
                        }`}
                      >
                        <AccordionTrigger className="hover:no-underline py-3">
                          <div className="flex items-center gap-3 flex-1 text-left">
                            {getTaskStatusIcon(currentStatus)}
                            <div className="flex flex-col gap-2 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{task.title}</span>
                                {isInProgress && (
                                  <span className="text-xs text-blue-600 font-medium animate-pulse">
                                    🚀 You're working on this!
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge className={`${repoColors[task.repo]} border text-xs font-medium`}>
                                  {task.repo}
                                </Badge>
                                <Badge variant="outline" className="text-xs flex items-center gap-1">
                                  <GitBranch className="h-3 w-3" />
                                  {task.branchName}
                                </Badge>
                                {progress?.startedAt && isInProgress && (
                                  <span className="text-xs text-muted-foreground">
                                    Started {formatTimeAgo(progress.startedAt)}
                                  </span>
                                )}
                                {progress?.completedAt && isCompleted && (
                                  <span className="text-xs text-green-600">
                                    Completed {formatTimeAgo(progress.completedAt)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              {getPriorityBadge(task.priority)}
                              {getTaskStatusBadge(currentStatus)}
                              {task.safetyLevel && <SafetyBadge level={task.safetyLevel} />}
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pt-2 pb-4">
                          <div className="space-y-3 pl-7">
                            <p className="text-sm text-muted-foreground">
                              {task.description}
                            </p>
                            {task.blockers && task.blockers.length > 0 && (
                              <div>
                                <h5 className="text-sm font-medium text-destructive mb-2">Blockers:</h5>
                                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                                  {task.blockers.map((blocker, i) => (
                                    <li key={i}>{blocker}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {task.location && (
                              <div>
                                <h5 className="text-sm font-medium mb-1">Location:</h5>
                                <p className="text-sm text-muted-foreground font-mono">{task.location}</p>
                              </div>
                            )}

                            {/* Action Buttons */}
                            <div className="flex gap-2 flex-wrap">
                              {!isCompleted && (
                                <Button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleGeneratePrompt(task);
                                  }}
                                  className="flex-1 sm:flex-none"
                                  variant={isInProgress ? 'outline' : 'default'}
                                >
                                  <Sparkles className="h-4 w-4 mr-2" />
                                  {isInProgress ? 'Re-open Instructions' : 'Generate Prompt & Instructions'}
                                </Button>
                              )}

                              {isInProgress && (
                                <Button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMarkComplete(task);
                                  }}
                                  className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700"
                                  variant="default"
                                >
                                  <Check className="h-4 w-4 mr-2" />
                                  Mark Complete
                                </Button>
                              )}
                            </div>

                            {/* Verification Details */}
                            {task.humanVerification && (
                              <VerificationDetails task={task} />
                            )}

                            {/* Dependency Explanations */}
                            {task.dependencyExplanations && (
                              <DependencyExplanation task={task} allTasks={phase.tasks} />
                            )}

                            {/* Next Task Guidance */}
                            {(isInProgress || isCompleted) && (
                              <NextTaskGuidance currentTask={task} allTasks={phase.tasks} />
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
              </Accordion>
            </div>

            {/* Success Criteria */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Success Criteria:</h4>
              <ul className="space-y-2">
                {phase.successCriteria.map((criteria, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <span className="text-muted-foreground">{criteria}</span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      );
      })}

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
