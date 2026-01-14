/**
 * Tasks React Query Hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useUser } from '@/contexts/UserContext';
import { useToast } from '@/hooks/use-toast';

export interface Task {
  id: number;
  workspaceId: string;
  customerId: string | null;
  leadId: string | null;
  title: string;
  description: string | null;
  dueDate: number;
  priority: string;
  status: string;
  completedAt: number | null;
  assignedTo: string | null;
  createdBy: string | null;
  createdAt: number;
}

export interface TaskWithCustomer {
  task: Task;
  customerName: string | null;
}

export interface CreateTaskData {
  customerId?: string;
  leadId?: string;
  title: string;
  description?: string;
  dueDate: number;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

export function useTasks() {
  const { user } = useUser();
  const workspaceId = user.id;
  
  return useQuery<TaskWithCustomer[]>({
    queryKey: ['/api/crm/tasks', workspaceId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/crm/tasks/${workspaceId}`);
      return response.json();
    },
    enabled: !!workspaceId,
  });
}

export function useUpcomingTasks() {
  const { user } = useUser();
  const workspaceId = user.id;
  
  return useQuery<Task[]>({
    queryKey: ['/api/crm/tasks', workspaceId, 'upcoming'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/crm/tasks/${workspaceId}/upcoming`);
      return response.json();
    },
    enabled: !!workspaceId,
  });
}

export function useOverdueTasks() {
  const { user } = useUser();
  const workspaceId = user.id;
  
  return useQuery<Task[]>({
    queryKey: ['/api/crm/tasks', workspaceId, 'overdue'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/crm/tasks/${workspaceId}/overdue`);
      return response.json();
    },
    enabled: !!workspaceId,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useUser();
  const workspaceId = user.id;
  
  return useMutation({
    mutationFn: async (data: CreateTaskData) => {
      const response = await apiRequest('POST', '/api/crm/tasks', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/tasks', workspaceId] });
      toast({ title: 'Task created' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create task', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useUser();
  const workspaceId = user.id;
  
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Partial<Task>) => {
      const response = await apiRequest('PATCH', `/api/crm/tasks/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/tasks', workspaceId] });
      toast({ title: 'Task updated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update task', description: error.message, variant: 'destructive' });
    },
  });
}

export function useCompleteTask() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useUser();
  const workspaceId = user.id;
  
  return useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest('POST', `/api/crm/tasks/${id}/complete`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/tasks', workspaceId] });
      toast({ title: 'Task completed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to complete task', description: error.message, variant: 'destructive' });
    },
  });
}

