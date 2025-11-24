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
import { insertBrewBatchSchema } from "@shared/schema";
import { z } from "zod";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

const formSchema = insertBrewBatchSchema.omit({ id: true, workspaceId: true, createdAt: true, updatedAt: true });

export default function BrewCrmBatches() {
  const { user } = useUser();
  const workspaceId = user.id;
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<any>(null);
  const [deletingBatchId, setDeletingBatchId] = useState<string | null>(null);

  const { data: batches, isLoading } = useQuery({
    queryKey: ['/api/brewcrm/batches', workspaceId],
    enabled: !!workspaceId,
  });

  const { data: products } = useQuery({
    queryKey: ['/api/brewcrm/products', workspaceId],
    enabled: !!workspaceId,
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      productId: undefined,
      batchCode: "",
      brewDate: Date.now(),
      status: "planned",
      plannedVolumeLitres: 0,
      actualVolumeLitres: undefined,
      notes: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/brewcrm/batches', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brewcrm/batches'] });
      toast({ title: "Batch created successfully" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create batch", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest('PATCH', `/api/brewcrm/batches/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brewcrm/batches'] });
      toast({ title: "Batch updated successfully" });
      setIsDialogOpen(false);
      setEditingBatch(null);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update batch", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/brewcrm/batches/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brewcrm/batches'] });
      toast({ title: "Batch deleted successfully" });
      setDeletingBatchId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete batch", description: error.message, variant: "destructive" });
    },
  });

  const handleEdit = (batch: any) => {
    setEditingBatch(batch);
    form.reset({
      productId: batch.productId || undefined,
      batchCode: batch.batchCode || "",
      brewDate: batch.brewDate,
      status: batch.status || "planned",
      plannedVolumeLitres: batch.plannedVolumeLitres / 1000 || 0,
      actualVolumeLitres: batch.actualVolumeLitres ? batch.actualVolumeLitres / 1000 : undefined,
      notes: batch.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleAddNew = () => {
    setEditingBatch(null);
    form.reset();
    setIsDialogOpen(true);
  };

  const onSubmit = (formValues: z.infer<typeof formSchema>) => {
    const payload = {
      ...formValues,
      plannedVolumeLitres: Math.round(formValues.plannedVolumeLitres * 1000),
      actualVolumeLitres: formValues.actualVolumeLitres ? Math.round(formValues.actualVolumeLitres * 1000) : undefined,
    };
    
    if (editingBatch) {
      updateMutation.mutate({ id: editingBatch.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "planned": return "secondary";
      case "in_progress": return "default";
      case "fermenting": return "outline";
      case "packaging": return "outline";
      case "packaged": return "default";
      case "cancelled": return "destructive";
      default: return "secondary";
    }
  };

  const getProductName = (productId: string) => {
    const product = products?.find((p: any) => p.id === productId);
    return product?.name || "Unknown";
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-semibold" data-testid="text-batches-title">Batches</h2>
          <p className="text-sm text-muted-foreground">Manage your brewing batches</p>
        </div>
        <Button onClick={handleAddNew} data-testid="button-add-batch">
          <Plus className="w-4 h-4 mr-2" />
          Add Batch
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
                <TableHead>Batch Code</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Brew Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Planned Vol (ml)</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No batches found. Create your first batch to get started.
                  </TableCell>
                </TableRow>
              ) : (
                batches?.map((batch: any) => (
                  <TableRow key={batch.id} data-testid={`row-batch-${batch.id}`}>
                    <TableCell className="font-medium">{batch.batchCode}</TableCell>
                    <TableCell>{getProductName(batch.productId)}</TableCell>
                    <TableCell>{new Date(batch.brewDate).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(batch.status)}>
                        {batch.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{(batch.plannedVolumeLitres / 1000).toFixed(1)}L</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(batch)}
                          data-testid={`button-edit-batch-${batch.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeletingBatchId(batch.id)}
                          data-testid={`button-delete-batch-${batch.id}`}
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
              {editingBatch ? "Edit Batch" : "Add Batch"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="productId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Product *</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        value={field.value || undefined}
                        disabled={!products || products.length === 0}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-product">
                            <SelectValue placeholder={products?.length === 0 ? "No products available - create one first" : "Select product"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {products?.length === 0 ? (
                            <SelectItem value="no-products" disabled>
                              No products found - create a product first
                            </SelectItem>
                          ) : (
                            products?.map((product: any) => (
                              <SelectItem key={product.id} value={product.id}>
                                {product.name}
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
                  name="batchCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Batch Code *</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-batch-code" />
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
                        <SelectItem value="fermenting">Fermenting</SelectItem>
                        <SelectItem value="packaging">Packaging</SelectItem>
                        <SelectItem value="packaged">Packaged</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="plannedVolumeLitres"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Planned Volume (litres) *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          step="0.01"
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          data-testid="input-planned-volume"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="actualVolumeLitres"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Actual Volume (litres)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          step="0.01"
                          value={field.value || ""}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                          data-testid="input-actual-volume"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

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
                  {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingBatch ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingBatchId} onOpenChange={() => setDeletingBatchId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the batch.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingBatchId && deleteMutation.mutate(deletingBatchId)}
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
