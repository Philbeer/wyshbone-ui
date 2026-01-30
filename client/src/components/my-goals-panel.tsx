import { useState, useEffect, useRef } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Save, Check, Play } from "lucide-react";
import { useUserGoal } from "@/hooks/use-user-goal";
import { usePlanForApproval } from "@/hooks/use-plan-for-approval";
import { useToast } from "@/hooks/use-toast";

export function MyGoalsPanel() {
  const { goal, setGoal, hasGoal, isLoading, saving, error, saveGoal } = useUserGoal();
  const { plan, startPlan, starting } = usePlanForApproval();
  const [localGoal, setLocalGoal] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const { toast } = useToast();
  
  // W-003 FIX: Idempotency guard to prevent duplicate plan creation from double-clicks
  const planCreationInProgress = useRef(false);

  // Initialize local goal when data loads
  useEffect(() => {
    if (goal !== null && !isDirty) {
      setLocalGoal(goal);
    }
  }, [goal, isDirty]);

  // Update the hook's goal state when local changes
  useEffect(() => {
    setGoal(localGoal);
  }, [localGoal, setGoal]);

  // Track if the local value differs from saved value
  useEffect(() => {
    setIsDirty(localGoal.trim() !== (goal || ""));
  }, [localGoal, goal]);

  const handleSave = async () => {
    const trimmedGoal = localGoal.trim();
    
    if (trimmedGoal === "") {
      console.log("❌ MyGoalsPanel: Goal is empty");
      toast({
        variant: "destructive",
        title: "Goal cannot be empty",
        description: "Please enter your sales or lead goal.",
      });
      return;
    }

    console.log("💾 MyGoalsPanel: Calling saveGoal...");
    
    try {
      // Use the hook's saveGoal function which handles mutation state
      await saveGoal();
      
      console.log("✅ MyGoalsPanel: Goal saved successfully via hook");
      
      setIsDirty(false);
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
      
      toast({
        title: "Goal saved",
        description: "Your goal has been updated successfully.",
      });
    } catch (error: any) {
      console.error("❌ MyGoalsPanel: Failed to save goal:", error);
      toast({
        variant: "destructive",
        title: "Failed to save goal",
        description: error.message || "An error occurred while saving your goal.",
      });
    }
  };

  const handleStartWorking = async () => {
    const trimmedGoal = localGoal.trim();
    
    if (trimmedGoal === "") {
      console.log("❌ MyGoalsPanel: Cannot start - no goal set");
      toast({
        variant: "destructive",
        title: "No goal set",
        description: "Please save your goal first.",
      });
      return;
    }

    // W-003 FIX: Idempotency guard - prevent double-clicks from creating duplicate plans
    if (planCreationInProgress.current) {
      console.log("⚠️ MyGoalsPanel: Plan creation already in progress, ignoring duplicate click");
      return;
    }
    
    planCreationInProgress.current = true;
    console.log("🚀 MyGoalsPanel: Starting plan for goal:", trimmedGoal.substring(0, 50) + "...");
    
    try {
      await startPlan(trimmedGoal);
      
      console.log("✅ MyGoalsPanel: Plan created successfully via hook");
      
      toast({
        title: "Plan Created",
        description: "Review and approve the plan to start execution.",
      });
    } catch (error: any) {
      console.error("❌ MyGoalsPanel: Failed to start plan:", error);
      toast({
        variant: "destructive",
        title: "Failed to create plan",
        description: error.message || "An error occurred while creating the plan.",
      });
    } finally {
      // W-003 FIX: Reset guard after promise resolves, not on a timer
      planCreationInProgress.current = false;
    }
  };

  // Show Start button when:
  // 1. Goal text exists
  // 2. AND either no plan OR plan is not pending approval (so user can start fresh)
  // This ensures button shows for demo users, signed-in users, every time
  const showStartButton = localGoal.trim().length > 0 && (!plan || plan.status !== 'pending_approval');

  return (
    <Card className="h-full flex flex-col" data-testid="card-my-goals">
      <CardHeader>
        <CardTitle data-testid="text-goals-title">My Goals</CardTitle>
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
              disabled={!isDirty || saving}
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
                  {saving ? "Saving..." : hasGoal ? "Update goal" : "Save goal"}
                </>
              )}
            </Button>
            {isDirty && (
              <p className="text-xs text-muted-foreground text-center" data-testid="text-unsaved-changes">
                You have unsaved changes
              </p>
            )}
            {error && (
              <p className="text-xs text-destructive text-center" data-testid="text-error-message">
                {error.message || "An error occurred"}
              </p>
            )}
          </>
        )}
      </CardContent>
      {showStartButton && (
        <CardFooter className="pt-0">
          <Button
            onClick={handleStartWorking}
            disabled={starting}
            className="w-full"
            variant="default"
            data-testid="button-start-working"
          >
            <Play className="h-4 w-4 mr-2" />
            {starting ? "Creating plan..." : "Start Working On This Goal"}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
