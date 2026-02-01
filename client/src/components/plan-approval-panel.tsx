import { useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlanForApproval } from "@/hooks/use-plan-for-approval";
import { CheckCircle2, Clock, Zap, Users, Mail, AlertCircle, RefreshCw, StopCircle, Loader2, Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

const stepIcons: Record<string, typeof CheckCircle2> = {
  search: Zap,
  enrich: Users,
  outreach: Mail,
  fallback: AlertCircle
};

const stepVariants: Record<string, "default" | "secondary" | "outline"> = {
  search: "default",
  enrich: "secondary",
  outreach: "outline",
  fallback: "secondary"
};

export function PlanApprovalPanel() {
  const { loading, plan, regeneratePlan, regenerating, error } = usePlanForApproval();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [stopping, setStopping] = useState(false);

  console.log("📋 PlanPanel mounted, plan:", plan, "error:", error);

  // Show panel for active plans (approved, executing) - auto-execute is always on
  const activeStatuses = ['approved', 'executing'];
  if (!loading && !error && (!plan || !activeStatuses.includes(plan.status))) {
    return null;
  }

  // Loading state
  if (loading) {
    return (
      <Card data-testid="card-plan-loading">
        <CardHeader>
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-full" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card data-testid="card-plan-error" className="border-destructive">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            Error Loading Plan
          </CardTitle>
          <CardDescription>
            Failed to load your plan. Please try again.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-destructive">{error}</div>
        </CardContent>
        <CardFooter>
          <Button 
            variant="outline" 
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/plan"] })}
            data-testid="button-retry-plan"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (!plan) {
    return null;
  }

  const handleStop = async () => {
    console.log(`\n========================================`);
    console.log(`🛑 [STOP] Stop Plan clicked for plan ${plan.id}`);
    console.log(`========================================\n`);
    
    setStopping(true);
    try {
      await apiRequest("POST", "/api/plan/stop", { planId: plan.id });
      toast({
        title: "Plan Stopped",
        description: "The plan execution has been cancelled.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/plan"] });
    } catch (error: any) {
      console.error(`❌ [STOP] Failed to stop plan ${plan.id}:`, error);
      toast({
        title: "Stop Failed",
        description: "Could not stop the plan. Please try again.",
        variant: "destructive",
      });
    } finally {
      setStopping(false);
    }
  };

  const handleRegenerate = async () => {
    console.log(`🔄 PlanPanel: regenerating plan ${plan.id}`);
    try {
      await regeneratePlan(plan.id);
      toast({
        title: "Plan Regenerated",
        description: "A new plan has been created for your goal.",
      });
      console.log(`🔄 PlanPanel: plan ${plan.id} regenerated successfully`);
    } catch (error) {
      console.error(`❌ PlanPanel: failed to regenerate plan ${plan.id}:`, error);
      toast({
        title: "Regeneration Failed",
        description: "Failed to regenerate plan. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Determine status display
  const isExecuting = plan.status === 'executing';
  const isApproved = plan.status === 'approved';
  const isMultiStep = plan.steps.length >= 2;
  
  // Status label and styling
  let statusLabel = 'Processing';
  let statusColor = 'text-blue-500';
  if (isExecuting) {
    statusLabel = 'Running';
    statusColor = 'text-green-500';
  } else if (isApproved) {
    statusLabel = 'Starting';
    statusColor = 'text-yellow-500';
  }

  return (
    <Card data-testid="card-plan-executing" className="hover-elevate">
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg flex items-center gap-2">
          {isExecuting ? (
            <Loader2 className="h-5 w-5 animate-spin text-green-500" />
          ) : (
            <Play className="h-5 w-5 text-yellow-500" />
          )}
          Supervisor Created a Plan
          <Badge variant="outline" className={`ml-auto ${statusColor}`}>
            {statusLabel}
          </Badge>
        </CardTitle>
        <CardDescription>
          {isMultiStep 
            ? `Multi-step plan with ${plan.steps.length} steps. Running automatically.`
            : 'Single action plan. Running automatically.'
          }
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Goal Display */}
        <div className="space-y-1">
          <div className="text-sm font-medium text-muted-foreground">Goal</div>
          <div className="text-sm">{plan.goal}</div>
        </div>

        {/* Steps Display */}
        <div className="space-y-2">
          <div className="text-sm font-medium text-muted-foreground">Plan Steps</div>
          <div className="space-y-2">
            {plan.steps.map((step, index) => {
              const Icon = stepIcons[step.type] || CheckCircle2;
              const variant = stepVariants[step.type] || "default";
              
              return (
                <div
                  key={step.id}
                  className="flex items-start gap-3 rounded-md border p-3"
                  data-testid={`step-${step.id}`}
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium">
                    {index + 1}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium">{step.label}</div>
                      <Badge variant={variant} className="h-5 text-xs">
                        <Icon className="h-3 w-3 mr-1" />
                        {step.type}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">{step.description}</div>
                    {step.estimatedTime && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {step.estimatedTime}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex gap-2">
        <Button 
          variant="destructive" 
          onClick={handleStop} 
          disabled={stopping || regenerating}
          data-testid="button-stop-plan"
        >
          {stopping ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Stopping...
            </>
          ) : (
            <>
              <StopCircle className="h-4 w-4 mr-2" />
              Stop
            </>
          )}
        </Button>
        <Button 
          variant="outline" 
          onClick={handleRegenerate} 
          disabled={stopping || regenerating}
          data-testid="button-regenerate-plan"
        >
          {regenerating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Regenerating...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Regenerate
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
