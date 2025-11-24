import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlanProgress } from "@/hooks/use-plan-progress";
import { usePlanExecution } from "@/contexts/PlanExecutionController";
import { AlertCircle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

export function ProgressWidget() {
  // Get plan execution state (activePlanId, status, shouldPoll)
  const { activePlanId, status, shouldPoll } = usePlanExecution();
  
  // Poll progress based on execution controller state
  const progress = usePlanProgress(activePlanId, shouldPoll);

  console.log(`[PLAN_PROGRESS_DEBUG] render - activePlanId=${activePlanId}, status=${status}, shouldPoll=${shouldPoll}, progress={completedSteps:${progress.completedSteps}, totalSteps:${progress.totalSteps}, currentStep:${progress.currentStep?.label || 'none'}}`);

  // Loading state
  if (progress.loading) {
    return (
      <Card className="w-full" data-testid="card-progress-widget">
        <CardHeader className="space-y-0 pb-4">
          <CardTitle className="text-base font-medium">Progress</CardTitle>
          <CardDescription>Loading progress...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-2 w-full" data-testid="skeleton-progress" />
          <Skeleton className="h-4 w-3/4" data-testid="skeleton-text" />
          <Skeleton className="h-4 w-1/2" data-testid="skeleton-text-2" />
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (progress.error && shouldPoll) {
    return (
      <Card className="w-full border-destructive" data-testid="card-progress-error">
        <CardHeader className="space-y-0 pb-4">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            Progress
          </CardTitle>
          <CardDescription className="text-destructive">Unable to load progress</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive mb-3">{progress.error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
            data-testid="button-retry"
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Show progress when we have steps data (even if not actively polling)
  // This ensures terminal/completed plans still show their step summaries
  const hasActivePlan = progress.steps.length > 0 || progress.totalSteps > 0;
  const goalText = progress.goal;

  return (
    <Card className="w-full" data-testid="card-progress-widget">
      <CardHeader className="space-y-0 pb-4">
        <CardTitle className="text-base font-medium">Progress</CardTitle>
        {goalText && (
          <CardDescription className="text-xs line-clamp-2" data-testid="text-goal">
            Goal: {goalText}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasActivePlan ? (
          <div className="text-sm text-muted-foreground" data-testid="text-no-plan">
            No active plan running. When you approve a plan, progress will appear here.
          </div>
        ) : (
          <>
            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground" data-testid="text-progress-label">
                  Step {progress.completedSteps} of {progress.totalSteps} completed
                </span>
                <span className="font-medium" data-testid="text-progress-percent">
                  {progress.percentComplete}%
                </span>
              </div>
              <Progress value={progress.percentComplete} data-testid="progress-bar" />
            </div>

            {/* Step List */}
            {progress.steps.length > 0 ? (
              <div className="space-y-3">
                <div className="text-xs font-medium text-muted-foreground">Steps:</div>
                <div className="space-y-3">
                  {progress.steps.map((step, index) => (
                    <div
                      key={step.id}
                      className="space-y-1 pb-3 border-b border-border last:border-0 last:pb-0"
                      data-testid={`step-${index}`}
                    >
                      <div className="flex items-center gap-2">
                        {step.status === "executing" && (
                          <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" data-testid={`icon-executing-${index}`} />
                        )}
                        {step.status === "completed" && (
                          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-500 flex-shrink-0" data-testid={`icon-completed-${index}`} />
                        )}
                        {step.status === "pending" && (
                          <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" data-testid={`icon-pending-${index}`} />
                        )}
                        {step.status === "failed" && (
                          <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" data-testid={`icon-failed-${index}`} />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium" data-testid={`text-step-label-${index}`}>
                              Step {index + 1} — {step.type}
                            </span>
                            <Badge
                              variant={
                                step.status === "executing" ? "default" :
                                step.status === "completed" ? "default" :
                                step.status === "failed" ? "destructive" :
                                "secondary"
                              }
                              className="text-xs"
                              data-testid={`badge-status-${index}`}
                            >
                              {step.status}
                            </Badge>
                          </div>
                          {step.label && (
                            <div className="text-xs text-muted-foreground mt-1" data-testid={`text-step-type-${index}`}>
                              {step.label}
                            </div>
                          )}
                        </div>
                      </div>
                      {step.resultSummary && (
                        <div className="text-sm text-foreground ml-6 mt-1" data-testid={`text-result-summary-${index}`}>
                          {step.resultSummary}
                        </div>
                      )}
                      {!step.resultSummary && step.status === "executing" && (
                        <div className="text-sm text-muted-foreground ml-6 mt-1 italic" data-testid={`text-running-${index}`}>
                          Running...
                        </div>
                      )}
                      {!step.resultSummary && step.status === "pending" && (
                        <div className="text-sm text-muted-foreground ml-6 mt-1 italic" data-testid={`text-pending-${index}`}>
                          Waiting to start...
                        </div>
                      )}
                      {!step.resultSummary && step.status === "completed" && (
                        <div className="text-sm text-muted-foreground ml-6 mt-1 italic" data-testid={`text-no-details-${index}`}>
                          Completed with no additional details
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground" data-testid="text-no-steps">
                No steps available yet
              </div>
            )}

            {/* Last Updated */}
            {progress.lastUpdatedAt && (
              <div className="text-xs text-muted-foreground" data-testid="text-last-updated">
                Last updated: {formatDistanceToNow(new Date(progress.lastUpdatedAt), { addSuffix: true })}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
