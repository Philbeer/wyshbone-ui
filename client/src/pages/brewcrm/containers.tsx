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
import { insertBrewContainerSchema } from "@shared/schema";
import { z } from "zod";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

const formSchema = insertBrewContainerSchema.omit({ id: true, workspaceId: true, createdAt: true, updatedAt: true });

export default function BrewCrmContainers() {
  const { user } = useUser();
  const workspaceId = user.id;
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingContainer, setEditingContainer] = useState<any>(null);
  const [deletingContainerId, setDeletingContainerId] = useState<string | null>(null);

  const { data: containers, isLoading } = useQuery({
    queryKey: ['/api/brewcrm/containers', workspaceId],
    enabled: !!workspaceId,
  });

  const { data: customers } = useQuery({
    queryKey: ['/api/crm/customers', workspaceId],
    enabled: !!workspaceId,
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      containerCode: "",
      containerType: "cask",
      volumeLitres: 0,
      status: "at_brewery",
      lastCustomerId: undefined,
      lastOutboundDate: undefined,
      lastReturnDate: undefined,
      notes: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/brewcrm/containers', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brewcrm/containers'] });
      toast({ title: "Container created successfully" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create container", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest('PATCH', `/api/brewcrm/containers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brewcrm/containers'] });
      toast({ title: "Container updated successfully" });
      setIsDialogOpen(false);
      setEditingContainer(null);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update container", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/brewcrm/containers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brewcrm/containers'] });
      toast({ title: "Container deleted successfully" });
      setDeletingContainerId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete container", description: error.message, variant: "destructive" });
    },
  });

  const handleEdit = (container: any) => {
    setEditingContainer(container);
    form.reset({
      containerCode: container.containerCode || "",
      containerType: container.containerType || "cask",
      volumeLitres: container.volumeLitres / 1000 || 0,
      status: container.status || "at_brewery",
      lastCustomerId: container.lastCustomerId || undefined,
      lastOutboundDate: container.lastOutboundDate || undefined,
      lastReturnDate: container.lastReturnDate || undefined,
      notes: container.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleAddNew = () => {
    setEditingContainer(null);
    form.reset();
    setIsDialogOpen(true);
  };

  const onSubmit = (formValues: z.infer<typeof formSchema>) => {
    const payload = {
      ...formValues,
      volumeLitres: Math.round(formValues.volumeLitres * 1000),
    };
    
    if (editingContainer) {
      updateMutation.mutate({ id: editingContainer.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "at_brewery": return "default";
      case "with_customer": return "outline";
      case "lost": return "destructive";
      case "retired": return "secondary";
      default: return "secondary";
    }
  };

  const getCustomerName = (customerId: string | null) => {
    if (!customerId) return "-";
    const customer = customers?.find((c: any) => c.id === customerId);
    return customer?.name || "-";
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-semibold" data-testid="text-containers-title">Containers</h2>
          <p className="text-sm text-muted-foreground">Track reusable containers (casks, kegs)</p>
        </div>
        <Button onClick={handleAddNew} data-testid="button-add-container">
          <Plus className="w-4 h-4 mr-2" />
          Add Container
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
                <TableHead>Code</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Volume</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Customer</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {containers?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No containers found. Create your first container to get started.
                  </TableCell>
                </TableRow>
              ) : (
                containers?.map((container: any) => (
                  <TableRow key={container.id} data-testid={`row-container-${container.id}`}>
                    <TableCell className="font-medium">{container.containerCode}</TableCell>
                    <TableCell>{container.containerType}</TableCell>
                    <TableCell>{(container.volumeLitres / 1000).toFixed(1)}L</TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(container.status)}>
                        {container.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>{getCustomerName(container.lastCustomerId)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(container)}
                          data-testid={`button-edit-container-${container.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeletingContainerId(container.id)}
                          data-testid={`button-delete-container-${container.id}`}
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">
              {editingContainer ? "Edit Container" : "Add Container"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="containerCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Container Code *</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-container-code" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="containerType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-container-type">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="cask">Cask</SelectItem>
                          <SelectItem value="keg">Keg</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="volumeLitres"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Volume (litres) *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          step="0.01"
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          data-testid="input-volume"
                        />
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
                        <SelectItem value="at_brewery">At Brewery</SelectItem>
                        <SelectItem value="with_customer">With Customer</SelectItem>
                        <SelectItem value="lost">Lost</SelectItem>
                        <SelectItem value="retired">Retired</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lastCustomerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Customer (Optional)</FormLabel>
                    <Select 
                      onValueChange={(value) => field.onChange(value === "none" ? undefined : value)} 
                      value={field.value || "none"}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-last-customer">
                          <SelectValue placeholder="Select customer" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {!customers || customers.length === 0 ? (
                          <SelectItem value="no-customers" disabled>
                            No customers available
                          </SelectItem>
                        ) : (
                          customers.map((customer: any) => (
                            <SelectItem key={customer.id} value={customer.id}>
                              {customer.name}
                            </SelectItem>
                          ))
                        )}
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
                  {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingContainer ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingContainerId} onOpenChange={() => setDeletingContainerId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the container.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingContainerId && deleteMutation.mutate(deletingContainerId)}
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
