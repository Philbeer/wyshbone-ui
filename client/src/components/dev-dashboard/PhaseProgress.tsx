/**
 * Phase Progress Component - Collapsible Tree UI
 * Clean autonomous progress tracker with Phase → Epic → Task → Microtask hierarchy
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ChevronDown, ChevronRight, Loader2, Play } from 'lucide-react';
import { Phase, PhaseTask } from '@/services/devProgressService';

interface Props {
  phases: Phase[];
}

// Microtask UI-only type
interface Microtask {
  id: string;
  description: string;
  status: 'idle' | 'running' | 'done';
}

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
      return <Badge className="bg-green-500 text-white text-xs">Done</Badge>;
  }
};

export function PhaseProgress({ phases }: Props) {
  // Track expanded/collapsed state for each level
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [expandedEpics, setExpandedEpics] = useState<Set<string>>(new Set());
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  // Track generated microtasks per task (keyed by taskId)
  const [microtasksByTask, setMicrotasksByTask] = useState<Record<string, Microtask[]>>({});

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

  const createMicrotasks = (taskId: string) => {
    // Generate 3-5 dummy microtasks
    const count = Math.floor(Math.random() * 3) + 3; // 3-5
    const newMicrotasks: Microtask[] = Array.from({ length: count }, (_, i) => ({
      id: `${taskId}-micro-${i}`,
      description: `Microtask ${i + 1}: Implementation step`,
      status: 'idle',
    }));

    setMicrotasksByTask((prev) => ({
      ...prev,
      [taskId]: newMicrotasks,
    }));

    // Auto-expand the task to show microtasks
    setExpandedTasks((prev) => new Set(prev).add(taskId));
  };

  const updateMicrotaskStatus = (taskId: string, microtaskId: string) => {
    setMicrotasksByTask((prev) => {
      const taskMicrotasks = prev[taskId] || [];
      const updated = taskMicrotasks.map((m) => {
        if (m.id === microtaskId) {
          // Cycle through: idle → running → done
          const nextStatus = m.status === 'idle' ? 'running' : m.status === 'running' ? 'done' : 'idle';
          return { ...m, status: nextStatus };
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
                  onUpdateMicrotaskStatus={updateMicrotaskStatus}
                />
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
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
  onCreateMicrotasks: (taskId: string) => void;
  onUpdateMicrotaskStatus: (taskId: string, microtaskId: string) => void;
}

function EpicRow({
  epic,
  isExpanded,
  onToggle,
  expandedTasks,
  onToggleTask,
  microtasksByTask,
  onCreateMicrotasks,
  onUpdateMicrotaskStatus,
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
              onCreateMicrotasks={() => onCreateMicrotasks(task.id)}
              onUpdateMicrotaskStatus={(microtaskId) => onUpdateMicrotaskStatus(task.id, microtaskId)}
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
  onUpdateMicrotaskStatus: (microtaskId: string) => void;
}

function TaskRow({
  task,
  isExpanded,
  onToggle,
  microtasks,
  onCreateMicrotasks,
  onUpdateMicrotaskStatus,
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
                  onUpdateStatus={() => onUpdateMicrotaskStatus(microtask.id)}
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
  onUpdateStatus: () => void;
}

function MicrotaskRow({ microtask, onUpdateStatus }: MicrotaskRowProps) {
  return (
    <div className="flex items-center justify-between p-2 bg-muted/30 rounded border border-border/50">
      <div className="flex items-center gap-2 flex-1">
        <span className="text-sm">{microtask.description}</span>
      </div>
      <div className="flex items-center gap-2">
        {getMicrotaskStatusBadge(microtask.status)}
        <Button
          size="sm"
          variant={microtask.status === 'idle' ? 'default' : 'outline'}
          className="h-7 px-2 text-xs"
          onClick={onUpdateStatus}
        >
          <Play className="h-3 w-3 mr-1" />
          Start microtask
        </Button>
      </div>
    </div>
  );
}
