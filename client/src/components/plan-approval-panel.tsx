import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlanForApproval } from "@/hooks/use-plan-for-approval";
import { CheckCircle2, Clock, Zap, Users, Mail, AlertCircle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { usePlanExecution } from "@/contexts/PlanExecutionController";

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
  const { loading, plan, approvePlan, regeneratePlan, approving, regenerating, error } = usePlanForApproval();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { startExecution } = usePlanExecution();

  console.log("📋 PlanApprovalPanel mounted, plan:", plan, "error:", error);

  // Don't show if plan is not pending approval
  if (!loading && !error && (!plan || plan.status !== 'pending_approval')) {
    return null;
  }

  // Loading state
  if (loading) {
    return (
      <Card data-testid="card-plan-approval-loading">
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
      <Card data-testid="card-plan-approval-error" className="border-destructive">
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

  const handleApprove = async () => {
    console.log(`[PLAN_DEBUG] PlanApprovalPanel: handleApprove called for plan ${plan.id}`);
    try {
      await approvePlan(plan.id);
      console.log(`[PLAN_DEBUG] PlanApprovalPanel: plan ${plan.id} approved successfully, starting execution`);
      
      // Notify ExecutionController to start tracking this plan
      startExecution(plan.id);
      
      toast({
        title: "Plan Approved",
        description: "Wyshbone will now execute your plan.",
      });
    } catch (error) {
      console.error(`[PLAN_DEBUG] PlanApprovalPanel: failed to approve plan ${plan.id}:`, error);
      toast({
        title: "Approval Failed",
        description: "Failed to approve plan. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleRegenerate = async () => {
    console.log(`🔄 PlanApprovalPanel: regenerating plan ${plan.id}`);
    try {
      await regeneratePlan(plan.id);
      toast({
        title: "Plan Regenerated",
        description: "A new plan has been created for your goal.",
      });
      console.log(`🔄 PlanApprovalPanel: plan ${plan.id} regenerated successfully`);
    } catch (error) {
      console.error(`❌ PlanApprovalPanel: failed to regenerate plan ${plan.id}:`, error);
      toast({
        title: "Regeneration Failed",
        description: "Failed to regenerate plan. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card data-testid="card-plan-approval" className="hover-elevate">
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Plan for Your Goal
        </CardTitle>
        <CardDescription>
          Review and approve the plan Wyshbone generated
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
          variant="default" 
          onClick={handleApprove} 
          disabled={approving || regenerating}
          data-testid="button-approve-plan"
        >
          {approving ? "Approving..." : "Approve Plan"}
        </Button>
        <Button 
          variant="outline" 
          onClick={handleRegenerate} 
          disabled={approving || regenerating}
          data-testid="button-regenerate-plan"
        >
          {regenerating ? "Regenerating..." : "Regenerate"}
        </Button>
      </CardFooter>
    </Card>
  );
}
