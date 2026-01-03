import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertCrmDeliveryRunSchema } from "@shared/schema";
import { z } from "zod";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

const formSchema = insertCrmDeliveryRunSchema.omit({ id: true, workspaceId: true, createdAt: true, updatedAt: true });

export default function CrmDeliveryRuns() {
  const { user } = useUser();
  const workspaceId = user?.id;
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRun, setEditingRun] = useState<any>(null);
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);

  const { data: deliveryRuns, isLoading } = useQuery({
    queryKey: ['/api/crm/delivery-runs', workspaceId],
    enabled: !!workspaceId,
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      driverName: "",
      vehicle: "",
      scheduledDate: Date.now(),
      status: "planned",
      notes: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/crm/delivery-runs', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/delivery-runs'] });
      toast({ title: "Delivery run created successfully" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create delivery run", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest('PATCH', `/api/crm/delivery-runs/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/delivery-runs'] });
      toast({ title: "Delivery run updated successfully" });
      setIsDialogOpen(false);
      setEditingRun(null);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update delivery run", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/crm/delivery-runs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/delivery-runs'] });
      toast({ title: "Delivery run deleted successfully" });
      setDeletingRunId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete delivery run", description: error.message, variant: "destructive" });
    },
  });

  // Early return if user not loaded yet (after all hooks)
  if (!user) {
    return (
      <div className="p-6">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const handleEdit = (run: any) => {
    setEditingRun(run);
    form.reset({
      name: run.name || "",
      driverName: run.driverName || "",
      vehicle: run.vehicle || "",
      scheduledDate: run.scheduledDate,
      status: run.status || "planned",
      notes: run.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleAddNew = () => {
    setEditingRun(null);
    form.reset();
    setIsDialogOpen(true);
  };

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    if (editingRun) {
      updateMutation.mutate({ id: editingRun.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "planned": return "secondary";
      case "in_progress": return "default";
      case "completed": return "default";
      case "cancelled": return "destructive";
      default: return "secondary";
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-semibold" data-testid="text-delivery-runs-title">Delivery Runs</h2>
          <p className="text-sm text-muted-foreground">Schedule and manage delivery runs</p>
        </div>
        <Button onClick={handleAddNew} data-testid="button-add-delivery-run">
          <Plus className="w-4 h-4 mr-2" />
          Add Delivery Run
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Scheduled Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveryRuns?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No delivery runs found. Create your first delivery run to get started.
                  </TableCell>
                </TableRow>
              ) : (
                deliveryRuns?.map((run: any) => (
                  <TableRow key={run.id} data-testid={`row-delivery-run-${run.id}`}>
                    <TableCell className="font-medium">{run.name}</TableCell>
                    <TableCell>{run.driverName || "-"}</TableCell>
                    <TableCell>{run.vehicle || "-"}</TableCell>
                    <TableCell>{new Date(run.scheduledDate).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(run.status)}>
                        {run.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(run)}
                          data-testid={`button-edit-delivery-run-${run.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeletingRunId(run.id)}
                          data-testid={`button-delete-delivery-run-${run.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">
              {editingRun ? "Edit Delivery Run" : "Add Delivery Run"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Delivery Run Name *</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="driverName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Driver Name</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} data-testid="input-driver-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="vehicle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vehicle</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} data-testid="input-vehicle" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-status">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="planned">Planned</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea {...field} value={field.value || ""} rows={3} data-testid="input-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} data-testid="button-cancel">
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit">
                  {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingRun ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingRunId} onOpenChange={() => setDeletingRunId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the delivery run.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingRunId && deleteMutation.mutate(deletingRunId)}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
