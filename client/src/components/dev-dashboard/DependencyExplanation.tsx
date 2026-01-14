/**
 * DependencyExplanation Component
 *
 * Shows detailed explanations of WHY tasks block each other,
 * not just WHAT they block.
 */

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Ban, CheckCircle, Pause } from 'lucide-react';
import { PhaseTask } from '@/services/devProgressService';
import { getTaskStatus } from '@/services/taskProgressService';

interface DependencyExplanationProps {
  task: PhaseTask;
  allTasks: PhaseTask[];
}

export function DependencyExplanation({ task, allTasks }: DependencyExplanationProps) {
  const hasBlockingInfo =
    (task.blocksOtherTasks && task.blocksOtherTasks.length > 0) ||
    (task.blockedBy && task.blockedBy.length > 0);

  if (!hasBlockingInfo || !task.dependencyExplanations) {
    return null;
  }

  const blockedTasks = task.blocksOtherTasks
    ? allTasks.filter(t => task.blocksOtherTasks?.includes(t.id))
    : [];

  const blockerTasks = task.blockedBy
    ? allTasks.filter(t => task.blockedBy?.includes(t.id))
    : [];

  return (
    <div className="space-y-3 mt-4">
      {/* What This Blocks */}
      {blockedTasks.length > 0 && (
        <div className="blocks-section">
          <h5 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Ban className="h-4 w-4 text-red-600" />
            This Task Blocks {blockedTasks.length} Other{blockedTasks.length > 1 ? 's' : ''}:
          </h5>
          <div className="space-y-2">
            {blockedTasks.map(blockedTask => {
              const reason = task.dependencyExplanations?.whyThisBlocksThat[blockedTask.id];
              const blockedStatus = getTaskStatus(blockedTask.id);

              return (
                <Card key={blockedTask.id} className="border-red-500/30 bg-red-500/5">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1">
                        <div className="font-semibold text-sm">{blockedTask.title}</div>
                        <Badge variant="outline" className="text-xs mt-1">
                          {blockedTask.id}
                        </Badge>
                      </div>
                      {blockedStatus === 'completed' && (
                        <Badge variant="default" className="bg-green-500 text-xs">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Done
                        </Badge>
                      )}
                      {blockedStatus === 'in-progress' && (
                        <Badge variant="default" className="text-xs">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Working
                        </Badge>
                      )}
                      {!blockedStatus && (
                        <Badge variant="outline" className="text-xs text-red-600">
                          <Pause className="h-3 w-3 mr-1" />
                          Blocked
                        </Badge>
                      )}
                    </div>
                    {reason && (
                      <div className="dependency-reason flex gap-2 items-start">
                        <span className="flex-shrink-0 bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded">
                          Why?
                        </span>
                        <p className="text-sm text-muted-foreground leading-relaxed">{reason}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* What Blocks This */}
      {blockerTasks.length > 0 && (
        <div className="blocked-by-section">
          <h5 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Pause className="h-4 w-4 text-orange-600" />
            This Task is Blocked By:
          </h5>
          <div className="space-y-2">
            {blockerTasks.map(blockerTask => {
              const reason = task.dependencyExplanations?.whyThatBlocksThis[blockerTask.id];
              const blockerStatus = getTaskStatus(blockerTask.id);

              return (
                <Card key={blockerTask.id} className="border-orange-500/30 bg-orange-500/5">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1">
                        <div className="font-semibold text-sm">{blockerTask.title}</div>
                        <Badge variant="outline" className="text-xs mt-1">
                          {blockerTask.id}
                        </Badge>
                      </div>
                      {blockerStatus === 'completed' && (
                        <Badge variant="default" className="bg-green-500 text-xs">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Unblocked ✅
                        </Badge>
                      )}
                      {blockerStatus === 'in-progress' && (
                        <Badge variant="default" className="text-xs">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          In Progress
                        </Badge>
                      )}
                      {!blockerStatus && (
                        <Badge variant="outline" className="text-xs text-orange-600">
                          <Pause className="h-3 w-3 mr-1" />
                          Must Complete First
                        </Badge>
                      )}
                    </div>
                    {reason && (
                      <div className="dependency-reason flex gap-2 items-start">
                        <span className="flex-shrink-0 bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded">
                          Why?
                        </span>
                        <p className="text-sm text-muted-foreground leading-relaxed">{reason}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Impact if Broken */}
      {task.impactIfBroken && (
        <details className="impact-section group">
          <summary className="cursor-pointer list-none">
            <div className="flex items-center gap-2 text-sm font-semibold bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 hover:bg-purple-500/20 transition-colors">
              <AlertCircle className="h-4 w-4 text-purple-600" />
              <span>📊 What Happens if This Task Fails?</span>
              <ChevronRight className="h-4 w-4 ml-auto group-open:rotate-90 transition-transform" />
            </div>
          </summary>
          <Card className="mt-2 border-red-500/50 bg-red-500/10">
            <CardContent className="p-4">
              <pre className="text-xs text-red-900 dark:text-red-100 whitespace-pre-wrap font-mono leading-relaxed">
                {task.impactIfBroken}
              </pre>
            </CardContent>
          </Card>
        </details>
      )}
    </div>
  );
}

// Missing import fix
import { ChevronRight } from 'lucide-react';
