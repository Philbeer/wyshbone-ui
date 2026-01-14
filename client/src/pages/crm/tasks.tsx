/**
 * Tasks Page
 * 
 * Manage CRM tasks and follow-ups.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  useTasks, 
  useUpcomingTasks, 
  useOverdueTasks,
  useCreateTask, 
  useCompleteTask 
} from '@/features/crm/useTasks';
import { 
  Plus, 
  CheckCircle, 
  Clock, 
  AlertTriangle,
  Calendar,
  User
} from 'lucide-react';

export default function TasksPage() {
  const { data: allTasks, isLoading } = useTasks();
  const { data: upcomingTasks } = useUpcomingTasks();
  const { data: overdueTasks } = useOverdueTasks();
  const createTask = useCreateTask();
  const completeTask = useCompleteTask();
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');

  const handleCreateTask = () => {
    if (!title || !dueDate) return;
    
    createTask.mutate({
      title,
      description: description || undefined,
      dueDate: new Date(dueDate).getTime(),
      priority,
    }, {
      onSuccess: () => {
        setCreateDialogOpen(false);
        setTitle('');
        setDescription('');
        setDueDate('');
        setPriority('normal');
      },
    });
  };

  const handleCompleteTask = (taskId: number) => {
    completeTask.mutate(taskId);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'destructive';
      case 'high': return 'destructive';
      case 'normal': return 'secondary';
      case 'low': return 'outline';
      default: return 'secondary';
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const TaskList = ({ tasks, showComplete = true }: { tasks: any[]; showComplete?: boolean }) => (
    <div className="space-y-3">
      {tasks.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-500" />
          <p>No tasks here!</p>
        </div>
      ) : (
        tasks.map((item) => {
          const task = item.task || item;
          const customerName = item.customerName;
          
          return (
            <Card key={task.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{task.title}</h3>
                      <Badge variant={getPriorityColor(task.priority)}>
                        {task.priority}
                      </Badge>
                      {task.status === 'completed' && (
                        <Badge variant="outline" className="text-green-600">
                          Completed
                        </Badge>
                      )}
                    </div>
                    {task.description && (
                      <p className="text-sm text-muted-foreground">{task.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Due: {formatDate(task.dueDate)}
                      </span>
                      {customerName && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {customerName}
                        </span>
                      )}
                    </div>
                  </div>
                  {showComplete && task.status !== 'completed' && (
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleCompleteTask(task.id)}
                      disabled={completeTask.isPending}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Complete
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Tasks</h1>
          <p className="text-muted-foreground">Manage your follow-ups and to-dos</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Task
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Upcoming
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{upcomingTasks?.length || 0}</div>
          </CardContent>
        </Card>
        <Card className={overdueTasks && overdueTasks.length > 0 ? 'border-red-200' : ''}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className={`h-4 w-4 ${overdueTasks && overdueTasks.length > 0 ? 'text-red-500' : ''}`} />
              Overdue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${overdueTasks && overdueTasks.length > 0 ? 'text-red-500' : ''}`}>
              {overdueTasks?.length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {allTasks?.filter(t => t.task?.status === 'completed').length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Task Tabs */}
      <Tabs defaultValue="upcoming" className="space-y-4">
        <TabsList>
          <TabsTrigger value="upcoming">
            Upcoming ({upcomingTasks?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="overdue" className={overdueTasks && overdueTasks.length > 0 ? 'text-red-500' : ''}>
            Overdue ({overdueTasks?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="all">
            All Tasks
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming">
          <TaskList tasks={upcomingTasks || []} />
        </TabsContent>

        <TabsContent value="overdue">
          <TaskList tasks={overdueTasks || []} />
        </TabsContent>

        <TabsContent value="all">
          <TaskList tasks={allTasks || []} />
        </TabsContent>
      </Tabs>

      {/* Create Task Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Task</DialogTitle>
            <DialogDescription>
              Add a new task or follow-up to your list.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Title *</label>
              <Input
                placeholder="Task title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                placeholder="Optional description..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Due Date *</label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Priority</label>
                <Select value={priority} onValueChange={(v: any) => setPriority(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateTask}
              disabled={!title || !dueDate || createTask.isPending}
            >
              {createTask.isPending ? 'Creating...' : 'Create Task'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

