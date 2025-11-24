import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlanProgress } from "@/hooks/use-plan-progress";
import { usePlan } from "@/contexts/PlanContext";
import { usePlanExecution } from "@/contexts/PlanExecutionController";
import { AlertCircle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

export function ProgressWidget() {
  // Get plan data from context
  const { planId, status, plan } = usePlan();
  
  // Get polling state from execution controller
  const { shouldPoll } = usePlanExecution();
  
  // Poll progress based on execution controller state
  const progress = usePlanProgress(planId, shouldPoll);

  console.log(`[PLAN_PROGRESS_DEBUG] render - planId=${planId}, status=${status}, shouldPoll=${shouldPoll}, progress={completedSteps:${progress.completedSteps}, totalSteps:${progress.totalSteps}, currentStep:${progress.currentStep?.label || 'none'}}`);

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

  // Show progress when actively polling OR when showing terminal status
  const isTerminalStatus = status === 'completed' || status === 'failed';
  const hasActivePlan = progress.totalSteps > 0 && (shouldPoll || isTerminalStatus);
  const goalText = progress.goal || plan?.goal;

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
            {status === 'pending_approval' 
              ? "Plan ready for approval. Approve the plan to start execution."
              : "No active plan running. When you approve a plan, progress will appear here."}
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

            {/* Current Step */}
            {progress.currentStep && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Currently:</div>
                <div className="flex items-center gap-2">
                  {progress.currentStep.status === "running" && (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" data-testid="icon-running" />
                  )}
                  {progress.currentStep.status === "completed" && (
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-500" data-testid="icon-completed" />
                  )}
                  {progress.currentStep.status === "pending" && (
                    <Clock className="h-4 w-4 text-muted-foreground" data-testid="icon-pending" />
                  )}
                  {progress.currentStep.status === "failed" && (
                    <AlertCircle className="h-4 w-4 text-destructive" data-testid="icon-failed" />
                  )}
                  <span className="text-sm" data-testid={`text-current-step-${progress.currentStep.status}`}>
                    {progress.currentStep.label}
                  </span>
                  <Badge
                    variant={
                      progress.currentStep.status === "running" ? "default" :
                      progress.currentStep.status === "completed" ? "default" :
                      progress.currentStep.status === "failed" ? "destructive" :
                      "secondary"
                    }
                    className="text-xs"
                    data-testid={`badge-status-${progress.currentStep.status}`}
                  >
                    {progress.currentStep.status}
                  </Badge>
                </div>
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
