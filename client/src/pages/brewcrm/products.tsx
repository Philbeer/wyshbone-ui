import { useState, useMemo } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
// Note: Using custom form schema instead of insertBrewProductSchema for human-readable form values
import { z } from "zod";
import { Plus, Pencil, Trash2, Search, AlertTriangle, Package } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

// Custom form schema with human-readable decimal values (converted to integers on submit)
const formSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  style: z.string().optional().default(""),
  sku: z.string().optional().default(""),
  abv: z.number().min(0).max(100), // Human-readable: 4.5 for 4.5%
  defaultPackageType: z.string().min(1, "Package type is required"),
  defaultPackageSizeLitres: z.number().min(0), // Human-readable: 40.9 for 40.9L
  dutyBand: z.string().min(1, "Duty band is required"),
  defaultUnitPriceExVat: z.number().min(0).optional().default(0), // Human-readable: 20.00 for £20
  defaultVatRate: z.number().optional().default(2000), // Stored as basis points: 2000 = 20%
  minimumStockUnits: z.number().int().min(0).optional().default(0),
  isActive: z.number().int().min(0).max(1).optional().default(1),
});

export default function BrewCrmProducts() {
  const { user } = useUser();
  const workspaceId = user.id;
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['/api/brewcrm/products', workspaceId],
    enabled: !!workspaceId,
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ['/api/brewcrm/inventory', workspaceId],
    enabled: !!workspaceId,
  });

  // Calculate stock levels per product
  const stockByProduct = useMemo(() => {
    const stockMap: Record<string, number> = {};
    inventory.forEach((item: any) => {
      stockMap[item.productId] = (stockMap[item.productId] || 0) + (item.quantityUnits || 0);
    });
    return stockMap;
  }, [inventory]);

  // Find low stock products
  const lowStockProducts = useMemo(() => {
    return products.filter((p: any) => {
      const currentStock = stockByProduct[p.id] || 0;
      const minStock = p.minimumStockUnits || 0;
      return minStock > 0 && currentStock <= minStock;
    });
  }, [products, stockByProduct]);

  // Filter products by search
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const query = searchQuery.toLowerCase();
    return products.filter((p: any) =>
      p.name?.toLowerCase().includes(query) ||
      p.style?.toLowerCase().includes(query) ||
      p.sku?.toLowerCase().includes(query)
    );
  }, [products, searchQuery]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      style: "",
      sku: "",
      abv: 0,
      defaultPackageType: "cask",
      defaultPackageSizeLitres: 0,
      dutyBand: "beer_standard",
      defaultUnitPriceExVat: 0,
      defaultVatRate: 2000,
      minimumStockUnits: 0,
      isActive: 1,
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/brewcrm/products', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brewcrm/products'] });
      toast({ title: "Product created successfully" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create product", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest('PATCH', `/api/brewcrm/products/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brewcrm/products'] });
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
    mutationFn: (id: string) => apiRequest('DELETE', `/api/brewcrm/products/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brewcrm/products'] });
      toast({ title: "Product deleted successfully" });
      setDeletingProductId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete product", description: error.message, variant: "destructive" });
    },
  });

  const handleEdit = (product: any) => {
    setEditingProduct(product);
    form.reset({
      name: product.name || "",
      style: product.style || "",
      sku: product.sku || "",
      abv: product.abv / 100 || 0,
      defaultPackageType: product.defaultPackageType || "cask",
      defaultPackageSizeLitres: product.defaultPackageSizeLitres / 1000 || 0,
      dutyBand: product.dutyBand || "beer_standard",
      defaultUnitPriceExVat: (product.defaultUnitPriceExVat || 0) / 100,
      defaultVatRate: product.defaultVatRate || 2000,
      minimumStockUnits: product.minimumStockUnits || 0,
      isActive: product.isActive ?? 1,
    });
    setIsDialogOpen(true);
  };

  const handleAddNew = () => {
    setEditingProduct(null);
    form.reset({
      name: "",
      style: "",
      sku: "",
      abv: 0,
      defaultPackageType: "cask",
      defaultPackageSizeLitres: 0,
      dutyBand: "beer_standard",
      defaultUnitPriceExVat: 0,
      defaultVatRate: 2000,
      minimumStockUnits: 0,
      isActive: 1,
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (formValues: z.infer<typeof formSchema>) => {
    const payload = {
      ...formValues,
      abv: Math.round(formValues.abv * 100),
      defaultPackageSizeLitres: Math.round(formValues.defaultPackageSizeLitres * 1000),
      defaultUnitPriceExVat: Math.round((formValues.defaultUnitPriceExVat || 0) * 100),
    };
    
    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isLowStock = (productId: string, minStock: number) => {
    const currentStock = stockByProduct[productId] || 0;
    return minStock > 0 && currentStock <= minStock;
  };

  const formatCurrency = (pence: number) => `£${(pence / 100).toFixed(2)}`;
  const formatVatRate = (basisPoints: number) => `${(basisPoints / 100).toFixed(0)}%`;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold" data-testid="text-products-title">Products</h2>
          <p className="text-sm text-muted-foreground">Manage your brewery products with pricing and stock levels</p>
        </div>
        <Button onClick={handleAddNew} data-testid="button-add-product">
          <Plus className="w-4 h-4 mr-2" />
          Add Product
        </Button>
      </div>

      {/* Low Stock Alert */}
      {lowStockProducts.length > 0 && (
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5" />
              <div>
                <p className="font-medium text-orange-800 dark:text-orange-400">Low Stock Alert</p>
                <p className="text-sm text-orange-700 dark:text-orange-500">
                  {lowStockProducts.length} product{lowStockProducts.length > 1 ? 's are' : ' is'} at or below minimum stock level:{' '}
                  {lowStockProducts.map((p: any) => p.name).join(', ')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search"
          />
        </div>
      </div>

      {/* Table */}
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
                <TableHead>Style</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>ABV %</TableHead>
                <TableHead>Package</TableHead>
                <TableHead>Price (ex VAT)</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    {searchQuery ? "No products found matching your search." : "No products found. Create your first product to get started."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredProducts.map((product: any) => {
                  const currentStock = stockByProduct[product.id] || 0;
                  const productIsLowStock = isLowStock(product.id, product.minimumStockUnits || 0);
                  return (
                    <TableRow 
                      key={product.id} 
                      data-testid={`row-product-${product.id}`}
                      className={productIsLowStock ? "bg-orange-50 dark:bg-orange-950/20" : ""}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {product.name}
                          {productIsLowStock && (
                            <AlertTriangle className="h-4 w-4 text-orange-600" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{product.style || "-"}</TableCell>
                      <TableCell className="font-mono text-sm">{product.sku || "-"}</TableCell>
                      <TableCell>{(product.abv / 100).toFixed(1)}%</TableCell>
                      <TableCell className="capitalize">
                        {product.defaultPackageType} ({(product.defaultPackageSizeLitres / 1000).toFixed(1)}L)
                      </TableCell>
                      <TableCell>{formatCurrency(product.defaultUnitPriceExVat || 0)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className={productIsLowStock ? "text-orange-600 font-medium" : ""}>
                            {currentStock}
                          </span>
                          {product.minimumStockUnits > 0 && (
                            <span className="text-xs text-muted-foreground">
                              / min: {product.minimumStockUnits}
                            </span>
                          )}
                        </div>
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
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
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
                      <Input {...field} placeholder="e.g., Best Bitter" data-testid="input-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="style"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Style</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} placeholder="e.g., Bitter, IPA, Stout" data-testid="input-style" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="sku"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SKU</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} placeholder="e.g., BB-001" data-testid="input-sku" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="abv"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ABV (%) *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          step="0.1"
                          placeholder="e.g., 4.5"
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          data-testid="input-abv"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dutyBand"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Duty Band *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-duty-band">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="beer_standard">Beer Standard</SelectItem>
                          <SelectItem value="beer_small_producer">Small Producer Relief</SelectItem>
                          <SelectItem value="beer_low_strength">Low Strength (1.2-2.8%)</SelectItem>
                          <SelectItem value="beer_high_strength">High Strength (7.5%+)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="defaultPackageType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Package Type *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-package-type">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="cask">Cask</SelectItem>
                          <SelectItem value="keg">Keg</SelectItem>
                          <SelectItem value="can">Can</SelectItem>
                          <SelectItem value="bottle">Bottle</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="defaultPackageSizeLitres"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Package Size (litres) *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          step="0.01"
                          placeholder="e.g., 40.9 for a firkin"
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          data-testid="input-package-size"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">Pricing & Stock</h4>
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="defaultUnitPriceExVat"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Default Price (£, ex VAT)</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            step="0.01"
                            placeholder="e.g., 75.00"
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                            data-testid="input-unit-price"
                          />
                        </FormControl>
                        <FormDescription>Used when adding to orders</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="defaultVatRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>VAT Rate</FormLabel>
                        <Select 
                          onValueChange={(v) => field.onChange(parseInt(v))} 
                          value={field.value?.toString() ?? "2000"}
                        >
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

                  <FormField
                    control={form.control}
                    name="minimumStockUnits"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Minimum Stock (units)</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            placeholder="e.g., 10"
                            value={field.value || ""}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                            data-testid="input-min-stock"
                          />
                        </FormControl>
                        <FormDescription>Alert when stock falls below</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status *</FormLabel>
                    <Select onValueChange={(v) => field.onChange(parseInt(v))} value={field.value?.toString() ?? "1"}>
                      <FormControl>
                        <SelectTrigger data-testid="select-is-active">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="1">Active</SelectItem>
                        <SelectItem value="0">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

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

      {/* Delete Confirmation */}
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
