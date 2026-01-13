/**
 * Phase Progress Component - Collapsible Tree UI
 * Clean autonomous progress tracker with Phase → Epic → Task → Microtask hierarchy
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ChevronDown, ChevronRight, Loader2, Play, CheckCircle2 } from 'lucide-react';
import { Phase, PhaseTask } from '@/services/devProgressService';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface Props {
  phases: Phase[];
}

// Microtask UI-only type with success criteria and evidence
interface Microtask {
  id: string;
  description: string;
  status: 'idle' | 'running' | 'done';
  successCriteria?: string;
  evidence?: string;
}

// Task name to microtasks mapping
const TASK_MICROTASK_TEMPLATES: Record<string, string[]> = {
  'Strategy performance tracking': [
    'Add performance metrics table to strategy detail page',
    'Implement real-time P&L calculation display',
    'Create win/loss ratio visualization component',
    'Add trade execution timeline chart',
    'Build performance comparison vs benchmark',
  ],
  'A/B testing framework': [
    'Design experiment configuration UI',
    'Create variant assignment logic',
    'Build metrics tracking dashboard',
    'Implement statistical significance calculator',
    'Add experiment results export',
    'Create rollout controls (start/stop/rollback)',
  ],
  'ROI calculator': [
    'Build input form for investment parameters',
    'Implement ROI calculation engine',
    'Create visualization for projected returns',
    'Add scenario comparison feature',
    'Build export to PDF functionality',
  ],
  'Multi-tenant performance analytics': [
    'Design tenant-scoped data filtering',
    'Create aggregated metrics dashboard',
    'Build tenant comparison view',
    'Implement drill-down by tenant',
    'Add tenant performance alerts',
    'Create tenant usage report generator',
  ],
};

// Repo color mapping
const repoColors = {
  'wyshbone-ui': 'bg-purple-500/10 text-purple-700 border-purple-500/20',
  'wyshbone-supervisor': 'bg-pink-500/10 text-pink-700 border-pink-500/20',
  'wyshbone-tower': 'bg-blue-500/10 text-blue-700 border-blue-500/20',
  'WABS': 'bg-green-500/10 text-green-700 border-green-500/20',
};

// Status badge styling
const getStatusBadge = (status: string) => {
  switch (status) {
    case 'queued':
      return (
        <Badge variant="outline" className="bg-gray-100 text-gray-700 border-gray-300">
          QUEUED
        </Badge>
      );
    case 'in-progress':
      return (
        <Badge className="bg-blue-500 text-white flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          IN PROGRESS
        </Badge>
      );
    case 'testing':
      return (
        <Badge className="bg-yellow-500 text-white flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          TESTING
        </Badge>
      );
    case 'fixing':
      return (
        <Badge className="bg-red-500 text-white">
          FIXING
        </Badge>
      );
    case 'completed':
      return (
        <Badge className="bg-green-500 text-white">
          COMPLETE
        </Badge>
      );
    default:
      return <Badge variant="outline">{status.toUpperCase()}</Badge>;
  }
};

// Microtask status badge
const getMicrotaskStatusBadge = (status: 'idle' | 'running' | 'done') => {
  switch (status) {
    case 'idle':
      return <Badge variant="outline" className="text-xs">Idle</Badge>;
    case 'running':
      return (
        <Badge className="bg-blue-500 text-white text-xs flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Running
        </Badge>
      );
    case 'done':
      return (
        <Badge className="bg-green-500 text-white text-xs flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Done
        </Badge>
      );
  }
};

export function PhaseProgress({ phases }: Props) {
  // Track expanded/collapsed state for each level
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [expandedEpics, setExpandedEpics] = useState<Set<string>>(new Set());
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  // Track generated microtasks per task (keyed by taskId)
  const [microtasksByTask, setMicrotasksByTask] = useState<Record<string, Microtask[]>>({});

  // Modal state
  const [showSuccessCriteriaModal, setShowSuccessCriteriaModal] = useState(false);
  const [showEvidenceModal, setShowEvidenceModal] = useState(false);
  const [currentMicrotaskContext, setCurrentMicrotaskContext] = useState<{
    taskId: string;
    microtaskId: string;
  } | null>(null);
  const [successCriteriaInput, setSuccessCriteriaInput] = useState('');
  const [evidenceInput, setEvidenceInput] = useState('');

  const togglePhase = (phaseId: string) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) {
        next.delete(phaseId);
      } else {
        next.add(phaseId);
      }
      return next;
    });
  };

  const toggleEpic = (epicId: string) => {
    setExpandedEpics((prev) => {
      const next = new Set(prev);
      if (next.has(epicId)) {
        next.delete(epicId);
      } else {
        next.add(epicId);
      }
      return next;
    });
  };

  const toggleTask = (taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const createMicrotasks = (taskId: string, taskTitle: string) => {
    // Try to find matching template
    const template = TASK_MICROTASK_TEMPLATES[taskTitle];

    let microtaskDescriptions: string[];

    if (template) {
      // Use template if available
      microtaskDescriptions = template;
    } else {
      // Generate generic microtasks based on task title
      microtaskDescriptions = [
        `Design ${taskTitle.toLowerCase()} interface`,
        `Implement core ${taskTitle.toLowerCase()} logic`,
        `Add data validation and error handling`,
        `Create unit tests for ${taskTitle.toLowerCase()}`,
        `Integrate with existing components`,
        `Test end-to-end user flow`,
      ];
    }

    const newMicrotasks: Microtask[] = microtaskDescriptions.map((desc, i) => ({
      id: `${taskId}-micro-${i}`,
      description: desc,
      status: 'idle',
      successCriteria: undefined,
      evidence: undefined,
    }));

    setMicrotasksByTask((prev) => ({
      ...prev,
      [taskId]: newMicrotasks,
    }));

    // Auto-expand the task to show microtasks
    setExpandedTasks((prev) => new Set(prev).add(taskId));
  };

  const handleStartMicrotask = (taskId: string, microtaskId: string) => {
    const microtask = microtasksByTask[taskId]?.find((m) => m.id === microtaskId);

    if (!microtask) return;

    // If no success criteria, prompt for it
    if (!microtask.successCriteria) {
      setCurrentMicrotaskContext({ taskId, microtaskId });
      setSuccessCriteriaInput('');
      setShowSuccessCriteriaModal(true);
      return;
    }

    // Otherwise, start the microtask
    updateMicrotaskStatus(taskId, microtaskId, 'running');
  };

  const handleSaveSuccessCriteria = () => {
    if (!currentMicrotaskContext || !successCriteriaInput.trim()) return;

    const { taskId, microtaskId } = currentMicrotaskContext;

    // Save success criteria and set status to running
    setMicrotasksByTask((prev) => {
      const taskMicrotasks = prev[taskId] || [];
      const updated = taskMicrotasks.map((m) => {
        if (m.id === microtaskId) {
          return { ...m, successCriteria: successCriteriaInput.trim(), status: 'running' as const };
        }
        return m;
      });
      return {
        ...prev,
        [taskId]: updated,
      };
    });

    setShowSuccessCriteriaModal(false);
    setCurrentMicrotaskContext(null);
    setSuccessCriteriaInput('');
  };

  const handleMarkDone = (taskId: string, microtaskId: string) => {
    const microtask = microtasksByTask[taskId]?.find((m) => m.id === microtaskId);

    if (!microtask) return;

    // Prompt for evidence
    setCurrentMicrotaskContext({ taskId, microtaskId });
    setEvidenceInput('');
    setShowEvidenceModal(true);
  };

  const handleSaveEvidence = () => {
    if (!currentMicrotaskContext || !evidenceInput.trim()) return;

    const { taskId, microtaskId } = currentMicrotaskContext;

    // Save evidence and mark as done
    setMicrotasksByTask((prev) => {
      const taskMicrotasks = prev[taskId] || [];
      const updated = taskMicrotasks.map((m) => {
        if (m.id === microtaskId) {
          return { ...m, evidence: evidenceInput.trim(), status: 'done' as const };
        }
        return m;
      });
      return {
        ...prev,
        [taskId]: updated,
      };
    });

    setShowEvidenceModal(false);
    setCurrentMicrotaskContext(null);
    setEvidenceInput('');
  };

  const updateMicrotaskStatus = (taskId: string, microtaskId: string, status: 'idle' | 'running' | 'done') => {
    setMicrotasksByTask((prev) => {
      const taskMicrotasks = prev[taskId] || [];
      const updated = taskMicrotasks.map((m) => {
        if (m.id === microtaskId) {
          return { ...m, status };
        }
        return m;
      });
      return {
        ...prev,
        [taskId]: updated,
      };
    });
  };

  return (
    <>
      <div className="space-y-6">
        {phases.map((phase) => {
          const completed = phase.tasks.filter((t) => t.status === 'completed').length;
          const total = phase.tasks.length;
          const percentage = phase.completion;
          const isExpanded = expandedPhases.has(phase.id);

          // For now, create a single default "epic" per phase containing all tasks
          // In the future, the data source should include real epics
          const defaultEpicId = `${phase.id}-epic-1`;
          const defaultEpic = {
            id: defaultEpicId,
            name: 'Default Epic',
            tasks: phase.tasks,
          };

          return (
            <Card key={phase.id}>
              <CardHeader>
                {/* Phase Header - Clickable to expand/collapse */}
                <div
                  className="flex items-center justify-between cursor-pointer hover:bg-accent/50 -mx-6 -my-4 px-6 py-4 rounded-lg transition-colors"
                  onClick={() => togglePhase(phase.id)}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <CardTitle className="text-xl">{phase.name}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {total - completed} {total - completed === 1 ? 'task' : 'tasks'} remaining
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">{percentage}%</div>
                    <p className="text-xs text-muted-foreground">
                      {completed} of {total} complete
                    </p>
                  </div>
                </div>

                {/* Progress Bar */}
                <Progress value={percentage} className="h-2 mt-4" />
              </CardHeader>

              {/* Expanded Content - Epics */}
              {isExpanded && (
                <CardContent className="space-y-4">
                  {/* Epic Row */}
                  <EpicRow
                    epic={defaultEpic}
                    isExpanded={expandedEpics.has(defaultEpicId)}
                    onToggle={() => toggleEpic(defaultEpicId)}
                    expandedTasks={expandedTasks}
                    onToggleTask={toggleTask}
                    microtasksByTask={microtasksByTask}
                    onCreateMicrotasks={createMicrotasks}
                    onStartMicrotask={handleStartMicrotask}
                    onMarkDone={handleMarkDone}
                  />
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Success Criteria Modal */}
      <Dialog open={showSuccessCriteriaModal} onOpenChange={setShowSuccessCriteriaModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Define Success Criteria</DialogTitle>
            <DialogDescription>
              Must be human-observable (something you can see in UI / numbers / table row).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="successCriteria">Success Criteria</Label>
              <Textarea
                id="successCriteria"
                placeholder="e.g., 'Performance table visible with 5 columns showing metrics', 'ROI chart renders with projected values'"
                value={successCriteriaInput}
                onChange={(e) => setSuccessCriteriaInput(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowSuccessCriteriaModal(false);
                setCurrentMicrotaskContext(null);
                setSuccessCriteriaInput('');
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveSuccessCriteria} disabled={!successCriteriaInput.trim()}>
              Start Microtask
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Evidence Modal */}
      <Dialog open={showEvidenceModal} onOpenChange={setShowEvidenceModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Provide Evidence</DialogTitle>
            <DialogDescription>
              Short note confirming what you observed (e.g., "Table renders with 3 rows", "Chart shows correct data").
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="evidence">Evidence</Label>
              <Textarea
                id="evidence"
                placeholder="e.g., 'Confirmed performance metrics table displays with all 5 columns and live data'"
                value={evidenceInput}
                onChange={(e) => setEvidenceInput(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowEvidenceModal(false);
                setCurrentMicrotaskContext(null);
                setEvidenceInput('');
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveEvidence} disabled={!evidenceInput.trim()}>
              Mark Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Epic Row Component
interface EpicRowProps {
  epic: {
    id: string;
    name: string;
    tasks: PhaseTask[];
  };
  isExpanded: boolean;
  onToggle: () => void;
  expandedTasks: Set<string>;
  onToggleTask: (taskId: string) => void;
  microtasksByTask: Record<string, Microtask[]>;
  onCreateMicrotasks: (taskId: string, taskTitle: string) => void;
  onStartMicrotask: (taskId: string, microtaskId: string) => void;
  onMarkDone: (taskId: string, microtaskId: string) => void;
}

function EpicRow({
  epic,
  isExpanded,
  onToggle,
  expandedTasks,
  onToggleTask,
  microtasksByTask,
  onCreateMicrotasks,
  onStartMicrotask,
  onMarkDone,
}: EpicRowProps) {
  const completed = epic.tasks.filter((t) => t.status === 'completed').length;
  const total = epic.tasks.length;

  return (
    <div className="border rounded-lg">
      {/* Epic Header */}
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-accent/30 rounded-lg transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="font-semibold">{epic.name}</span>
          <span className="text-sm text-muted-foreground">
            ({completed}/{total} tasks complete)
          </span>
        </div>
      </div>

      {/* Expanded Content - Tasks */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          {epic.tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              isExpanded={expandedTasks.has(task.id)}
              onToggle={() => onToggleTask(task.id)}
              microtasks={microtasksByTask[task.id] || []}
              onCreateMicrotasks={() => onCreateMicrotasks(task.id, task.title)}
              onStartMicrotask={(microtaskId) => onStartMicrotask(task.id, microtaskId)}
              onMarkDone={(microtaskId) => onMarkDone(task.id, microtaskId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Task Row Component
interface TaskRowProps {
  task: PhaseTask;
  isExpanded: boolean;
  onToggle: () => void;
  microtasks: Microtask[];
  onCreateMicrotasks: () => void;
  onStartMicrotask: (microtaskId: string) => void;
  onMarkDone: (microtaskId: string) => void;
}

function TaskRow({
  task,
  isExpanded,
  onToggle,
  microtasks,
  onCreateMicrotasks,
  onStartMicrotask,
  onMarkDone,
}: TaskRowProps) {
  const hasMicrotasks = microtasks.length > 0;

  return (
    <div
      className={`border rounded-lg ${
        task.status === 'in-progress' || task.status === 'testing'
          ? 'border-blue-500/50 bg-blue-500/5 shadow-md'
          : task.status === 'fixing'
          ? 'border-red-500/50 bg-red-500/5'
          : 'border-border bg-card'
      }`}
    >
      {/* Task Header */}
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-accent/20 rounded-lg transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2 flex-1">
          {hasMicrotasks && (
            <>
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </>
          )}
          <span className="font-medium">{task.title}</span>
          <Badge className={`${repoColors[task.repo]} border text-xs`} variant="outline">
            {task.repo}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge(task.status)}
        </div>
      </div>

      {/* Expanded Content - Microtasks or Create Button */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          {!hasMicrotasks ? (
            <div className="flex justify-center">
              <Button size="sm" variant="outline" onClick={onCreateMicrotasks}>
                Create microtasks
              </Button>
            </div>
          ) : (
            <div className="space-y-1">
              {microtasks.map((microtask) => (
                <MicrotaskRow
                  key={microtask.id}
                  microtask={microtask}
                  onStartMicrotask={() => onStartMicrotask(microtask.id)}
                  onMarkDone={() => onMarkDone(microtask.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Microtask Row Component
interface MicrotaskRowProps {
  microtask: Microtask;
  onStartMicrotask: () => void;
  onMarkDone: () => void;
}

function MicrotaskRow({ microtask, onStartMicrotask, onMarkDone }: MicrotaskRowProps) {
  return (
    <div className="flex flex-col gap-2 p-3 bg-muted/30 rounded border border-border/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1">
          <span className="text-sm font-medium">{microtask.description}</span>
        </div>
        <div className="flex items-center gap-2">
          {getMicrotaskStatusBadge(microtask.status)}
          {microtask.status === 'idle' && (
            <Button
              size="sm"
              variant="default"
              className="h-7 px-2 text-xs"
              onClick={onStartMicrotask}
            >
              <Play className="h-3 w-3 mr-1" />
              Start
            </Button>
          )}
          {microtask.status === 'running' && (
            <Button
              size="sm"
              variant="default"
              className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700"
              onClick={onMarkDone}
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Mark Done
            </Button>
          )}
        </div>
      </div>

      {/* Show success criteria if set */}
      {microtask.successCriteria && (
        <div className="text-xs text-muted-foreground bg-background/50 p-2 rounded border border-border/30">
          <span className="font-semibold">Success:</span> {microtask.successCriteria}
        </div>
      )}

      {/* Show evidence if set */}
      {microtask.evidence && (
        <div className="text-xs text-green-700 bg-green-50 p-2 rounded border border-green-200">
          <span className="font-semibold">Evidence:</span> {microtask.evidence}
        </div>
      )}
    </div>
  );
}
