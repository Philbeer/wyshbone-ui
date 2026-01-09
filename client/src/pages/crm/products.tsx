import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
// Schema imported inline due to type compatibility
import { z } from "zod";
import { Plus, Pencil, Trash2, Package } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sku: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  unitType: z.string().default("each"),
  defaultUnitPriceExVat: z.number().default(0),
  defaultVatRate: z.number().default(2000),
  isActive: z.number().default(1),
  trackStock: z.number().default(0),
});

type FormValues = z.infer<typeof formSchema>;

function formatCurrency(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function formatVatRate(basisPoints: number): string {
  return `${(basisPoints / 100).toFixed(0)}%`;
}

export default function CrmProducts() {
  const { user } = useUser();
  const workspaceId = user?.id;
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);

  const { data: products = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/crm/products', workspaceId],
    enabled: !!workspaceId,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      sku: "",
      description: "",
      category: "",
      unitType: "each",
      defaultUnitPriceExVat: 0,
      defaultVatRate: 2000,
      isActive: 1,
      trackStock: 0,
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/crm/products', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/products', workspaceId] });
      toast({ title: "Product created successfully" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create product", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest('PATCH', `/api/crm/products/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/products', workspaceId] });
      toast({ title: "Product updated successfully" });
      setIsDialogOpen(false);
      setEditingProduct(null);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update product", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/crm/products/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/products', workspaceId] });
      toast({ title: "Product deleted successfully" });
      setDeletingProductId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete product", description: error.message, variant: "destructive" });
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

  const handleEdit = (product: any) => {
    console.log('[Products] handleEdit called with product:', product);
    setEditingProduct(product);
    form.reset({
      name: product.name || "",
      sku: product.sku || "",
      description: product.description || "",
      category: product.category || "",
      unitType: product.unitType || "each",
      defaultUnitPriceExVat: (product.defaultUnitPriceExVat || 0) / 100,
      defaultVatRate: product.defaultVatRate || 2000,
      isActive: product.isActive ?? 1,
      trackStock: product.trackStock ?? 0,
    });
    console.log('[Products] Opening dialog, isDialogOpen will be set to true');
    setIsDialogOpen(true);
  };

  const handleAddNew = () => {
    console.log('[Products] handleAddNew called');
    setEditingProduct(null);
    form.reset({
      name: "",
      sku: "",
      description: "",
      category: "",
      unitType: "each",
      defaultUnitPriceExVat: 0,
      defaultVatRate: 2000,
      isActive: 1,
      trackStock: 0,
    });
    console.log('[Products] Opening dialog for new product');
    setIsDialogOpen(true);
  };

  const onSubmit = (formValues: FormValues) => {
    console.log('[Products] onSubmit called with formValues:', formValues);
    const payload = {
      ...formValues,
      defaultUnitPriceExVat: Math.round((formValues.defaultUnitPriceExVat || 0) * 100),
    };
    console.log('[Products] Prepared payload:', payload);

    if (editingProduct) {
      console.log('[Products] Calling updateMutation with id:', editingProduct.id);
      updateMutation.mutate({ id: editingProduct.id, ...payload });
    } else {
      console.log('[Products] Calling createMutation');
      createMutation.mutate(payload);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-semibold" data-testid="text-products-title">Products</h2>
          <p className="text-sm text-muted-foreground">Manage your product catalog</p>
        </div>
        <Button onClick={handleAddNew} data-testid="button-add-product">
          <Plus className="w-4 h-4 mr-2" />
          Add Product
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
                <TableHead>SKU</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Unit Type</TableHead>
                <TableHead className="text-right">Price (ex VAT)</TableHead>
                <TableHead className="text-right">VAT Rate</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    <div className="py-8 flex flex-col items-center gap-2">
                      <Package className="w-10 h-10 text-muted-foreground/50" />
                      <p>No products found. Create your first product to get started.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                products?.map((product: any) => (
                  <TableRow key={product.id} data-testid={`row-product-${product.id}`}>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>{product.sku || "-"}</TableCell>
                    <TableCell>{product.category || "-"}</TableCell>
                    <TableCell className="capitalize">{product.unitType}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(product.defaultUnitPriceExVat || 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatVatRate(product.defaultVatRate || 0)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={product.isActive ? "default" : "secondary"}>
                        {product.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(product)}
                          data-testid={`button-edit-product-${product.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeletingProductId(product.id)}
                          data-testid={`button-delete-product-${product.id}`}
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

      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        console.log('[Products] Dialog onOpenChange called with open:', open);
        setIsDialogOpen(open);
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">
              {editingProduct ? "Edit Product" : "Add Product"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product Name *</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-name" placeholder="e.g., Consulting Service" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="sku"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SKU</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} data-testid="input-sku" placeholder="e.g., CONS-001" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} data-testid="input-category" placeholder="e.g., Services" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        value={field.value || ""} 
                        data-testid="input-description" 
                        rows={2}
                        placeholder="Product description..."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="unitType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit Type *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-unit-type">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="each">Each</SelectItem>
                          <SelectItem value="hour">Hour</SelectItem>
                          <SelectItem value="day">Day</SelectItem>
                          <SelectItem value="kg">Kilogram</SelectItem>
                          <SelectItem value="litre">Litre</SelectItem>
                          <SelectItem value="pack">Pack</SelectItem>
                          <SelectItem value="box">Box</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="defaultUnitPriceExVat"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Unit Price (ex VAT) *</FormLabel>
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
                          data-testid="input-price"
                          placeholder="0.00"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="defaultVatRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default VAT Rate *</FormLabel>
                    <Select onValueChange={(v) => field.onChange(parseInt(v))} value={field.value?.toString() ?? "2000"}>
                      <FormControl>
                        <SelectTrigger data-testid="select-vat-rate">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="0">0% (Zero rated)</SelectItem>
                        <SelectItem value="500">5% (Reduced)</SelectItem>
                        <SelectItem value="2000">20% (Standard)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Active</FormLabel>
                        <FormDescription>
                          Inactive products won't appear in order forms
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value === 1}
                          onCheckedChange={(checked) => field.onChange(checked ? 1 : 0)}
                          data-testid="switch-is-active"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="trackStock"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Track Stock</FormLabel>
                        <FormDescription>
                          Enable inventory tracking for this product
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value === 1}
                          onCheckedChange={(checked) => field.onChange(checked ? 1 : 0)}
                          data-testid="switch-track-stock"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} data-testid="button-cancel">
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit">
                  {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingProduct ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingProductId} onOpenChange={() => setDeletingProductId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the product.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingProductId && deleteMutation.mutate(deletingProductId)}
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

