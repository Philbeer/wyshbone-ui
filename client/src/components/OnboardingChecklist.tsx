/**
 * Onboarding Checklist Component
 * Gamified checklist to guide new users through key actions
 */

import { useState, useEffect } from "react";
import { CheckCircle2, Circle, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Confetti from "react-confetti";

export interface ChecklistTask {
  id: string;
  label: string;
  completed: boolean;
}

interface OnboardingChecklistProps {
  tasks: ChecklistTask[];
  className?: string;
}

export function OnboardingChecklist({ tasks, className }: OnboardingChecklistProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showConfetti, setShowConfetti] = useState(false);
  const [previousProgress, setPreviousProgress] = useState(0);

  const completedCount = tasks.filter((t) => t.completed).length;
  const totalCount = tasks.length;
  const progress = Math.round((completedCount / totalCount) * 100);
  const isComplete = completedCount === totalCount;

  // Celebrate when all tasks are completed
  useEffect(() => {
    if (isComplete && previousProgress < 100 && previousProgress > 0) {
      setShowConfetti(true);
      // Hide confetti after 5 seconds
      const timer = setTimeout(() => setShowConfetti(false), 5000);
      return () => clearTimeout(timer);
    }
    setPreviousProgress(progress);
  }, [isComplete, progress, previousProgress]);

  // Hide checklist if all tasks are completed (after confetti)
  if (isComplete && !showConfetti) {
    return null;
  }

  return (
    <>
      {showConfetti && (
        <Confetti
          recycle={false}
          numberOfPieces={500}
          gravity={0.3}
          width={window.innerWidth}
          height={window.innerHeight}
        />
      )}
      <Card className={className}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">
                Getting Started ({completedCount}/{totalCount})
              </CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-8 w-8 p-0"
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardHeader>
        {isExpanded && (
          <CardContent className="space-y-3">
            {isComplete && (
              <div className="rounded-lg bg-primary/10 p-3 mb-2">
                <p className="text-sm font-medium text-primary flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Congratulations! You've completed onboarding!
                </p>
              </div>
            )}
            <ul className="space-y-2">
              {tasks.map((task) => (
                <li key={task.id} className="flex items-center gap-2 text-sm">
                  {task.completed ? (
                    <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  )}
                  <span className={task.completed ? "text-muted-foreground line-through" : ""}>
                    {task.label}
                  </span>
                </li>
              ))}
            </ul>
            {!isComplete && (
              <p className="text-xs text-muted-foreground pt-2 border-t">
                Complete these tasks to get the most out of Wyshbone
              </p>
            )}
          </CardContent>
        )}
      </Card>
    </>
  );
}
