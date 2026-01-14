/**
 * useOnboardingProgress Hook
 * Tracks onboarding task completion and syncs with backend
 */

import { useState, useEffect, useCallback } from "react";
import type { ChecklistTask } from "@/components/OnboardingChecklist";
import { apiRequest } from "@/lib/api";

export interface OnboardingChecklistState {
  signedUp?: boolean;
  completedProfile?: boolean;
  setGoal?: boolean;
  addedCustomer?: boolean;
  createdOrder?: boolean;
  usedChat?: boolean;
}

export interface UseOnboardingProgressReturn {
  tasks: ChecklistTask[];
  markTaskCompleted: (taskId: string) => Promise<void>;
  isLoading: boolean;
}

/**
 * Hook to manage onboarding checklist progress
 * @param initialChecklist - Initial checklist state from user preferences
 * @returns Tasks array and function to mark tasks as completed
 */
export function useOnboardingProgress(
  initialChecklist?: OnboardingChecklistState | null
): UseOnboardingProgressReturn {
  const [checklist, setChecklist] = useState<OnboardingChecklistState>(
    initialChecklist || {}
  );
  const [isLoading, setIsLoading] = useState(false);

  // Define all tasks
  const tasks: ChecklistTask[] = [
    {
      id: "signedUp",
      label: "Create your account",
      completed: checklist.signedUp || false,
    },
    {
      id: "completedProfile",
      label: "Complete your company profile",
      completed: checklist.completedProfile || false,
    },
    {
      id: "setGoal",
      label: "Set your primary goal",
      completed: checklist.setGoal || false,
    },
    {
      id: "addedCustomer",
      label: "Add your first customer",
      completed: checklist.addedCustomer || false,
    },
    {
      id: "createdOrder",
      label: "Create your first order",
      completed: checklist.createdOrder || false,
    },
    {
      id: "usedChat",
      label: "Try the AI chat assistant",
      completed: checklist.usedChat || false,
    },
  ];

  /**
   * Mark a task as completed and sync with backend
   */
  const markTaskCompleted = useCallback(
    async (taskId: string) => {
      // Don't update if already completed
      if (checklist[taskId as keyof OnboardingChecklistState]) {
        return;
      }

      const updatedChecklist = {
        ...checklist,
        [taskId]: true,
      };

      setChecklist(updatedChecklist);

      // Sync with backend
      try {
        setIsLoading(true);
        await apiRequest("/api/auth/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            preferences: {
              onboardingChecklist: updatedChecklist,
            },
          }),
        });
      } catch (error) {
        console.error("Failed to update onboarding progress:", error);
        // Revert on error
        setChecklist(checklist);
      } finally {
        setIsLoading(false);
      }
    },
    [checklist]
  );

  return {
    tasks,
    markTaskCompleted,
    isLoading,
  };
}

/**
 * Auto-detect task completion based on app state
 * This can be called from various parts of the app to automatically mark tasks as complete
 */
export function useAutoDetectProgress(
  markTaskCompleted: (taskId: string) => Promise<void>,
  dependencies: {
    hasCompletedProfile?: boolean;
    hasSetGoal?: boolean;
    customerCount?: number;
    orderCount?: number;
    hasSentChatMessage?: boolean;
  }
) {
  const {
    hasCompletedProfile,
    hasSetGoal,
    customerCount = 0,
    orderCount = 0,
    hasSentChatMessage,
  } = dependencies;

  useEffect(() => {
    // Mark "signedUp" as completed immediately (if user is logged in, they've signed up)
    markTaskCompleted("signedUp");
  }, [markTaskCompleted]);

  useEffect(() => {
    if (hasCompletedProfile) {
      markTaskCompleted("completedProfile");
    }
  }, [hasCompletedProfile, markTaskCompleted]);

  useEffect(() => {
    if (hasSetGoal) {
      markTaskCompleted("setGoal");
    }
  }, [hasSetGoal, markTaskCompleted]);

  useEffect(() => {
    if (customerCount > 0) {
      markTaskCompleted("addedCustomer");
    }
  }, [customerCount, markTaskCompleted]);

  useEffect(() => {
    if (orderCount > 0) {
      markTaskCompleted("createdOrder");
    }
  }, [orderCount, markTaskCompleted]);

  useEffect(() => {
    if (hasSentChatMessage) {
      markTaskCompleted("usedChat");
    }
  }, [hasSentChatMessage, markTaskCompleted]);
}
