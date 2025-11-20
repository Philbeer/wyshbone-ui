import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, addDevAuthParams } from "@/lib/queryClient";
import { useState } from "react";

export interface UserGoalData {
  goal: string | null;
  hasGoal: boolean;
}

export function useUserGoal() {
  const queryClient = useQueryClient();
  const [localGoal, setLocalGoal] = useState<string | null>(null);

  const {
    data,
    isLoading,
    error: queryError,
  } = useQuery<UserGoalData>({
    queryKey: ["/api/goal"],
    queryFn: async () => {
      const url = addDevAuthParams("/api/goal");
      console.log("🔍 Fetching user goal from", url);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch goal");
      }
      const data = await response.json();
      console.log("✅ GET /api/goal returned:", data);
      return data;
    },
  });

  const mutation = useMutation({
    mutationFn: async (goal: string) => {
      console.log("💾 Saving goal:", goal.substring(0, 50) + "...");
      const response = await apiRequest("PUT", "/api/goal", { goal });
      const data = await response.json();
      console.log("✅ PUT /api/goal returned:", data);
      return data;
    },
    onSuccess: (data) => {
      console.log("✅ Goal save successful, hasGoal:", data.hasGoal);
      // Immediately update the cache with the new goal data
      queryClient.setQueryData(["/api/goal"], data);
    },
    onError: (error: any) => {
      console.error("❌ Goal save failed:", error);
    },
  });

  // Create a promise-returning saveGoal function
  const saveGoal = (): Promise<void> => {
    if (!localGoal || localGoal.trim() === "") {
      return Promise.reject(new Error("Goal cannot be empty"));
    }
    
    return new Promise((resolve, reject) => {
      mutation.mutate(localGoal, {
        onSuccess: () => {
          console.log("✅ saveGoal resolved successfully");
          resolve();
        },
        onError: (error) => {
          console.error("❌ saveGoal rejected:", error);
          reject(error);
        },
      });
    });
  };

  return {
    goal: data?.goal || null,
    setGoal: setLocalGoal,
    hasGoal: data?.hasGoal || false,
    isLoading,
    error: queryError || mutation.error,
    saving: mutation.isPending,
    saveGoal,
    // For direct access in components
    updateGoal: mutation.mutate,
    isUpdating: mutation.isPending,
  };
}
