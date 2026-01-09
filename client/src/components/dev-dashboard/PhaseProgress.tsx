/**
 * Phase Progress Component - SIMPLIFIED
 * Clean autonomous progress tracker
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Loader2 } from 'lucide-react';
import { Phase, PhaseTask } from '@/services/devProgressService';

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

export function PhaseProgress({ phases }: Props) {
  return (
    <div className="space-y-6">
      {phases.map((phase) => {
        // Filter out completed tasks
        const activeTasks = phase.tasks.filter(t => t.status !== 'completed');
        const completed = phase.tasks.filter(t => t.status === 'completed').length;
        const total = phase.tasks.length;
        const percentage = phase.completion;
        const tasksLeft = activeTasks.length;

        // Skip phases with no active tasks
        if (activeTasks.length === 0) {
          return (
            <Card key={phase.id} className="border-green-500/30 bg-green-500/5">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl text-green-700">
                    ✅ {phase.name} - Complete
                  </CardTitle>
                  <div className="text-2xl font-bold text-green-700">100%</div>
                </div>
              </CardHeader>
            </Card>
          );
        }

        return (
          <Card key={phase.id}>
            <CardHeader>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <CardTitle className="text-xl">{phase.name}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {tasksLeft} {tasksLeft === 1 ? 'task' : 'tasks'} remaining
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold">{percentage}%</div>
                  <p className="text-xs text-muted-foreground">
                    {completed} of {total} complete
                  </p>
                </div>
              </div>
              <Progress value={percentage} className="h-2" />
            </CardHeader>

            <CardContent>
              <div className="space-y-2">
                {activeTasks.map((task) => (
                  <div
                    key={task.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      task.status === 'in-progress' || task.status === 'testing'
                        ? 'border-blue-500/50 bg-blue-500/5 shadow-md'
                        : task.status === 'fixing'
                        ? 'border-red-500/50 bg-red-500/5'
                        : 'border-border bg-card'
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <span className="font-medium">{task.title}</span>
                      <Badge
                        className={`${repoColors[task.repo]} border text-xs`}
                        variant="outline"
                      >
                        {task.repo}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(task.status)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
