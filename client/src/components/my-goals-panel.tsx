import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Save, Check } from "lucide-react";
import { useUserGoal } from "@/hooks/use-user-goal";
import { useToast } from "@/hooks/use-toast";

export function MyGoalsPanel() {
  const { goal, hasGoal, isLoading, updateGoal, isUpdating } = useUserGoal();
  const [localGoal, setLocalGoal] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
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
    </Card>
  );
}
