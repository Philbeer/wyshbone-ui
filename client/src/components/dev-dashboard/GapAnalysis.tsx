/**
 * Gap Analysis Component
 * Visualizes what we have vs what we need for each phase
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Phase, ComponentStatus } from '@/services/devProgressService';

interface Props {
  phases: Phase[];
  components: ComponentStatus[];
}

export function GapAnalysis({ phases, components }: Props) {
  // Calculate completion stats
  const completeComponents = components.filter((c) => c.status === 'complete');
  const partialComponents = components.filter((c) => c.status === 'partial');
  const missingComponents = components.filter((c) => c.status === 'missing');
  const inProgressComponents = components.filter((c) => c.status === 'in-progress');

  const totalComponents = components.length;
  const completionPercentage = Math.round(
    ((completeComponents.length + partialComponents.length * 0.5) / totalComponents) * 100
  );

  return (
    <div className="space-y-6">
      {/* Overall Gap */}
      <Card>
        <CardHeader>
          <CardTitle>Overall System Completion</CardTitle>
          <CardDescription>Status across all components and features</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <div className="flex justify-between mb-2">
              <span className="text-sm font-medium">Overall Progress</span>
              <span className="text-sm font-medium">{completionPercentage}%</span>
            </div>
            <Progress value={completionPercentage} className="h-3" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-500">{completeComponents.length}</div>
              <p className="text-sm text-muted-foreground">Complete</p>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-yellow-500">{partialComponents.length}</div>
              <p className="text-sm text-muted-foreground">Partial</p>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">{inProgressComponents.length}</div>
              <p className="text-sm text-muted-foreground">In Progress</p>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-destructive">{missingComponents.length}</div>
              <p className="text-sm text-muted-foreground">Missing</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Phase-by-Phase Gap */}
      <Card>
        <CardHeader>
          <CardTitle>Phase-by-Phase Progress</CardTitle>
          <CardDescription>Completion status for each development phase</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {phases.map((phase) => {
              const completedTasks = phase.tasks.filter((t) => t.status === 'completed').length;
              const totalTasks = phase.tasks.length;
              const phaseCompletion = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

              return (
                <div key={phase.id} className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold">{phase.name}</h4>
                      <span className="text-sm font-medium">{phase.completion}%</span>
                    </div>
                    <Progress value={phase.completion} className="h-2" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="text-center p-2 bg-muted rounded">
                      <div className="font-bold">{completedTasks}/{totalTasks}</div>
                      <div className="text-muted-foreground">Tasks</div>
                    </div>
                    <div className="text-center p-2 bg-muted rounded">
                      <div className="font-bold">{phase.successCriteria.length}</div>
                      <div className="text-muted-foreground">Criteria</div>
                    </div>
                    <div className="text-center p-2 bg-muted rounded">
                      <div className="font-bold capitalize">{phase.status}</div>
                      <div className="text-muted-foreground">Status</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Critical Gaps */}
      <Card className="bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900">
        <CardHeader>
          <CardTitle className="text-red-900 dark:text-red-200">Critical Gaps</CardTitle>
          <CardDescription>Missing components that block progress</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {missingComponents.map((component) => (
              <li key={component.id} className="flex items-start gap-2 text-sm">
                <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-medium text-red-900 dark:text-red-200">{component.name}</div>
                  <div className="text-xs text-red-800 dark:text-red-300 mt-1">
                    {component.description}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Strengths */}
      <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
        <CardHeader>
          <CardTitle className="text-green-900 dark:text-green-200">System Strengths</CardTitle>
          <CardDescription>Completed components and features</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {completeComponents.slice(0, 6).map((component) => (
              <li key={component.id} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-medium text-green-900 dark:text-green-200">{component.name}</div>
                  <div className="text-xs text-green-800 dark:text-green-300 mt-1">
                    {component.description}
                  </div>
                </div>
              </li>
            ))}
            {completeComponents.length > 6 && (
              <li className="text-xs text-muted-foreground ml-6">
                + {completeComponents.length - 6} more completed components
              </li>
            )}
          </ul>
        </CardContent>
      </Card>

      {/* Summary Insight */}
      <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
        <CardHeader>
          <CardTitle className="text-base text-blue-900 dark:text-blue-200">Analysis Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-blue-900 dark:text-blue-200">
          <p>
            <strong>Current State:</strong> {completionPercentage}% complete with strong infrastructure
            (UI, Supervisor, Tower) but missing intelligence layer (learning, WABS integration).
          </p>
          <p>
            <strong>Phase 1 Focus:</strong> Fix authentication, tool execution, and results display to
            stabilize user-led mode.
          </p>
          <p>
            <strong>Path Forward:</strong> Quick win with WABS integration (library ready), then build
            learning system for Phase 2 autonomous operation.
          </p>
          <p>
            <strong>Timeframe:</strong> ~12-15 weeks to full VALA vision with focused effort across all
            4 repos.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
