import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, addDevAuthParams } from "@/lib/queryClient";

export interface UserGoalData {
  goal: string | null;
  hasGoal: boolean;
}

export function useUserGoal() {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
  } = useQuery<UserGoalData>({
    queryKey: ["/api/goal"],
    queryFn: async () => {
      const url = addDevAuthParams("/api/goal");
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch goal");
      }
      return response.json();
    },
  });

  const updateGoalMutation = useMutation({
    mutationFn: async (goal: string) => {
      return apiRequest("PUT", "/api/goal", { goal });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/goal"] });
    },
  });

  return {
    goal: data?.goal || null,
    hasGoal: data?.hasGoal || false,
    isLoading,
    error,
    updateGoal: updateGoalMutation.mutate,
    isUpdating: updateGoalMutation.isPending,
  };
}
