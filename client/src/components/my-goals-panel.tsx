import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Save, Check, Play } from "lucide-react";
import { useUserGoal } from "@/hooks/use-user-goal";
import { usePlanForApproval } from "@/hooks/use-plan-for-approval";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export function MyGoalsPanel() {
  const { goal, hasGoal, isLoading, updateGoal, isUpdating } = useUserGoal();
  const { plan } = usePlanForApproval();
  const [localGoal, setLocalGoal] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [isStartingPlan, setIsStartingPlan] = useState(false);
  const { toast } = useToast();

  // Initialize local goal when data loads
  useEffect(() => {
    if (goal !== null && !isDirty) {
      setLocalGoal(goal);
    }
  }, [goal, isDirty]);

  // Track if the local value differs from saved value
  useEffect(() => {
    setIsDirty(localGoal.trim() !== (goal || ""));
  }, [localGoal, goal]);

  const handleSave = () => {
    const trimmedGoal = localGoal.trim();
    
    if (trimmedGoal === "") {
      toast({
        variant: "destructive",
        title: "Goal cannot be empty",
        description: "Please enter your sales or lead goal.",
      });
      return;
    }

    updateGoal(trimmedGoal, {
      onSuccess: () => {
        setIsDirty(false);
        setShowSaved(true);
        setTimeout(() => setShowSaved(false), 2000);
        toast({
          title: "Goal saved",
          description: "Your goal has been updated successfully.",
        });
      },
      onError: (error: any) => {
        toast({
          variant: "destructive",
          title: "Failed to save goal",
          description: error.message || "An error occurred while saving your goal.",
        });
      },
    });
  };

  const handleStartWorking = async () => {
    if (!hasGoal || !goal) {
      toast({
        variant: "destructive",
        title: "No goal set",
        description: "Please save your goal first.",
      });
      return;
    }

    setIsStartingPlan(true);
    try {
      const conversationId = localStorage.getItem('currentConversationId') || undefined;
      const response = await apiRequest("POST", "/api/plan/start", {
        goal,
        conversationId,
      });
      
      // apiRequest already throws on non-2xx, so if we reach here it's successful
      const data = await response.json();
      
      // Invalidate the plan query to trigger refetch
      queryClient.invalidateQueries({ queryKey: ["/api/plan"] });
      
      toast({
        title: "Plan Created",
        description: "Review and approve the plan to start execution.",
      });
      
      console.log("✅ Plan created:", data.plan);
    } catch (error: any) {
      console.error("❌ Failed to start plan:", error);
      toast({
        variant: "destructive",
        title: "Failed to create plan",
        description: error.message || "An error occurred while creating the plan.",
      });
    } finally {
      setIsStartingPlan(false);
    }
  };

  // Show "Start working" button only if goal exists and no plan is pending/approved/executing
  const showStartButton = hasGoal && !isDirty && !plan;

  return (
    <Card className="h-full flex flex-col" data-testid="card-my-goals">
      <CardHeader>
        <CardTitle data-testid="text-goals-title">My Goal</CardTitle>
        <CardDescription>
          Wyshbone uses this goal to plan and run lead generation on your behalf.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            Loading...
          </div>
        ) : (
          <>
            <Textarea
              value={localGoal}
              onChange={(e) => setLocalGoal(e.target.value)}
              placeholder="Describe your main sales/lead goal here... 

For example:
• Find 50 new pubs in Yorkshire that might stock craft IPA
• Identify dental practices in Manchester for our equipment
• Discover coffee shops in London that opened in 2024"
              className="flex-1 min-h-[200px] resize-none"
              data-testid="input-goal-text"
            />
            <Button
              onClick={handleSave}
              disabled={!isDirty || isUpdating}
              className="w-full"
              data-testid="button-save-goal"
            >
              {showSaved ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Saved
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {hasGoal ? "Update goal" : "Save goal"}
                </>
              )}
            </Button>
            {isDirty && (
              <p className="text-xs text-muted-foreground text-center" data-testid="text-unsaved-changes">
                You have unsaved changes
              </p>
            )}
          </>
        )}
      </CardContent>
      {showStartButton && (
        <CardFooter className="pt-0">
          <Button
            onClick={handleStartWorking}
            disabled={isStartingPlan}
            className="w-full"
            variant="default"
            data-testid="button-start-working"
          >
            <Play className="h-4 w-4 mr-2" />
            {isStartingPlan ? "Creating plan..." : "Start Working On This Goal"}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
