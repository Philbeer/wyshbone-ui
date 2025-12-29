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
import { z } from "zod";
import { Plus, Pencil, Trash2, Warehouse, AlertTriangle } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const formSchema = z.object({
  productId: z.string().min(1, "Product is required"),
  location: z.string().default("Main Warehouse"),
  quantityOnHand: z.number().default(0),
  quantityReserved: z.number().default(0),
  reorderLevel: z.number().default(0),
  reorderQuantity: z.number().default(0),
  costPricePerUnit: z.number().default(0),
  notes: z.string().optional().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

function formatCurrency(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export default function CrmStock() {
  const { user } = useUser();
  const workspaceId = user.id;
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStock, setEditingStock] = useState<any>(null);
  const [deletingStockId, setDeletingStockId] = useState<string | null>(null);

  const { data: stockItems = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/crm/stock', workspaceId],
    enabled: !!workspaceId,
  });

  const { data: products = [] } = useQuery<any[]>({
    queryKey: ['/api/crm/products', workspaceId],
    enabled: !!workspaceId,
  });

  // Filter to only products that have trackStock enabled
  const trackableProducts = products?.filter((p: any) => p.trackStock === 1) || [];

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      productId: "",
      location: "Main Warehouse",
      quantityOnHand: 0,
      quantityReserved: 0,
      reorderLevel: 0,
      reorderQuantity: 0,
      costPricePerUnit: 0,
      notes: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/crm/stock', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/stock'] });
      toast({ title: "Stock record created successfully" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create stock record", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest('PATCH', `/api/crm/stock/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/stock'] });
      toast({ title: "Stock record updated successfully" });
      setIsDialogOpen(false);
      setEditingStock(null);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update stock record", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/crm/stock/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/stock'] });
      toast({ title: "Stock record deleted successfully" });
      setDeletingStockId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete stock record", description: error.message, variant: "destructive" });
    },
  });

  const handleEdit = (stock: any) => {
    setEditingStock(stock);
    form.reset({
      productId: stock.productId || "",
      location: stock.location || "Main Warehouse",
      quantityOnHand: stock.quantityOnHand || 0,
      quantityReserved: stock.quantityReserved || 0,
      reorderLevel: stock.reorderLevel || 0,
      reorderQuantity: stock.reorderQuantity || 0,
      costPricePerUnit: (stock.costPricePerUnit || 0) / 100,
      notes: stock.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleAddNew = () => {
    setEditingStock(null);
    form.reset({
      productId: "",
      location: "Main Warehouse",
      quantityOnHand: 0,
      quantityReserved: 0,
      reorderLevel: 0,
      reorderQuantity: 0,
      costPricePerUnit: 0,
      notes: "",
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (formValues: FormValues) => {
    const payload = {
      ...formValues,
      costPricePerUnit: Math.round((formValues.costPricePerUnit || 0) * 100),
    };
    
    if (editingStock) {
      updateMutation.mutate({ id: editingStock.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const getProductName = (productId: string) => {
    const product = products?.find((p: any) => p.id === productId);
    return product?.name || "Unknown Product";
  };

  const getAvailableQuantity = (item: any) => {
    return (item.quantityOnHand || 0) - (item.quantityReserved || 0);
  };

  const isLowStock = (item: any) => {
    return item.reorderLevel > 0 && getAvailableQuantity(item) <= item.reorderLevel;
  };

  // Calculate summary stats
  const totalItems = stockItems?.length || 0;
  const lowStockItems = stockItems?.filter((item: any) => isLowStock(item)).length || 0;
  const totalValue = stockItems?.reduce((sum: number, item: any) => {
    return sum + (item.quantityOnHand || 0) * (item.costPricePerUnit || 0);
  }, 0) || 0;

  const hasNoProducts = trackableProducts.length === 0;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-semibold" data-testid="text-stock-title">Stock</h2>
          <p className="text-sm text-muted-foreground">Manage your inventory levels</p>
        </div>
        <Button onClick={handleAddNew} disabled={hasNoProducts} data-testid="button-add-stock">
          <Plus className="w-4 h-4 mr-2" />
          Add Stock Record
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total SKUs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalItems}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Low Stock Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              {lowStockItems}
              {lowStockItems > 0 && <AlertTriangle className="w-5 h-5 text-amber-500" />}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Stock Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalValue)}</div>
          </CardContent>
        </Card>
      </div>

      {hasNoProducts && (
        <div className="mb-4 p-4 border rounded-md bg-muted/30">
          <p className="text-sm text-muted-foreground">
            You need to create products with "Track Stock" enabled before you can add stock records.
            Go to <strong>Products</strong> and enable stock tracking for the items you want to manage.
          </p>
        </div>
      )}

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
                <TableHead>Product</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">On Hand</TableHead>
                <TableHead className="text-right">Reserved</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="text-right">Reorder Level</TableHead>
                <TableHead className="text-right">Cost/Unit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stockItems?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    <div className="py-8 flex flex-col items-center gap-2">
                      <Warehouse className="w-10 h-10 text-muted-foreground/50" />
                      <p>No stock records found. Add your first stock record to get started.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                stockItems?.map((item: any) => (
                  <TableRow key={item.id} data-testid={`row-stock-${item.id}`}>
                    <TableCell className="font-medium">{getProductName(item.productId)}</TableCell>
                    <TableCell>{item.location}</TableCell>
                    <TableCell className="text-right">{item.quantityOnHand}</TableCell>
                    <TableCell className="text-right">{item.quantityReserved || 0}</TableCell>
                    <TableCell className="text-right font-medium">{getAvailableQuantity(item)}</TableCell>
                    <TableCell className="text-right">{item.reorderLevel || "-"}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.costPricePerUnit || 0)}</TableCell>
                    <TableCell>
                      {isLowStock(item) ? (
                        <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                          <AlertTriangle className="w-3 h-3" />
                          Low Stock
                        </Badge>
                      ) : (
                        <Badge variant="default">In Stock</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(item)}
                          data-testid={`button-edit-stock-${item.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeletingStockId(item.id)}
                          data-testid={`button-delete-stock-${item.id}`}
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
              {editingStock ? "Edit Stock Record" : "Add Stock Record"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="productId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product *</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      value={field.value || ""}
                      disabled={trackableProducts.length === 0 || !!editingStock}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-product">
                          <SelectValue placeholder={trackableProducts.length === 0 ? "No trackable products" : "Select product"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {trackableProducts.map((product: any) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name} {product.sku ? `(${product.sku})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location *</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-location" placeholder="e.g., Main Warehouse" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="quantityOnHand"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity On Hand *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          min="0"
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          data-testid="input-quantity-on-hand"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="quantityReserved"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity Reserved</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          min="0"
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          data-testid="input-quantity-reserved"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="reorderLevel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reorder Level</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          value={field.value ?? 0}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                          data-testid="input-reorder-level"
                          placeholder="Alert when below this quantity"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="reorderQuantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reorder Quantity</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          value={field.value ?? 0}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                          data-testid="input-reorder-quantity"
                          placeholder="Suggested reorder amount"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="costPricePerUnit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cost Price Per Unit (£)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={field.value ?? 0}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                        data-testid="input-cost-price"
                        placeholder="0.00"
                      />
                    </FormControl>
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
                      <Textarea 
                        {...field} 
                        value={field.value || ""} 
                        rows={2} 
                        data-testid="input-notes"
                        placeholder="Additional notes..."
                      />
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
                  {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingStock ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingStockId} onOpenChange={() => setDeletingStockId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this stock record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingStockId && deleteMutation.mutate(deletingStockId)}
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

