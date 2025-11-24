import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertCrmOrderSchema } from "@shared/schema";
import { z } from "zod";
import { Plus, Pencil, Trash2, Save } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const formSchema = insertCrmOrderSchema.omit({ 
  id: true, 
  workspaceId: true, 
  createdAt: true, 
  updatedAt: true,
  subtotalExVat: true,
  vatTotal: true,
  totalIncVat: true,
  totalAmount: true,
});

export default function CrmOrders() {
  const { user } = useUser();
  const workspaceId = user.id;
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);

  const { data: orders, isLoading } = useQuery({
    queryKey: ['/api/crm/orders', workspaceId],
    enabled: !!workspaceId,
  });

  const { data: customers } = useQuery({
    queryKey: ['/api/crm/customers', workspaceId],
    enabled: !!workspaceId,
  });

  const { data: deliveryRuns } = useQuery({
    queryKey: ['/api/crm/delivery-runs', workspaceId],
    enabled: !!workspaceId,
  });

  const { data: products } = useQuery({
    queryKey: ['/api/brewcrm/products', workspaceId],
    enabled: !!workspaceId,
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerId: undefined,
      orderNumber: "",
      orderDate: Date.now(),
      status: "draft",
      deliveryDate: undefined,
      deliveryRunId: undefined,
      currency: "GBP",
      notes: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/crm/orders', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/orders'] });
      toast({ title: "Order created successfully" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create order", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest('PATCH', `/api/crm/orders/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/orders'] });
      toast({ title: "Order updated successfully" });
      setIsDialogOpen(false);
      setEditingOrder(null);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update order", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/crm/orders/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/orders'] });
      toast({ title: "Order deleted successfully" });
      setDeletingOrderId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete order", description: error.message, variant: "destructive" });
    },
  });

  const handleEdit = (order: any) => {
    setEditingOrder(order);
    form.reset({
      customerId: order.customerId || undefined,
      orderNumber: order.orderNumber || "",
      orderDate: order.orderDate,
      status: order.status || "draft",
      deliveryDate: order.deliveryDate || undefined,
      deliveryRunId: order.deliveryRunId || undefined,
      currency: order.currency || "GBP",
      notes: order.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleAddNew = () => {
    setEditingOrder(null);
    form.reset();
    setIsDialogOpen(true);
  };

  const onSubmit = (formValues: z.infer<typeof formSchema>) => {
    if (editingOrder) {
      updateMutation.mutate({ id: editingOrder.id, ...formValues });
    } else {
      createMutation.mutate(formValues);
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "draft": return "secondary";
      case "confirmed": return "default";
      case "dispatched": return "outline";
      case "delivered": return "default";
      case "cancelled": return "destructive";
      default: return "secondary";
    }
  };

  const getCustomerName = (customerId: string) => {
    const customer = customers?.find((c: any) => c.id === customerId);
    return customer?.name || "Unknown";
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-semibold" data-testid="text-orders-title">Orders</h2>
          <p className="text-sm text-muted-foreground">Manage customer orders with VAT calculations</p>
        </div>
        <Button onClick={handleAddNew} data-testid="button-add-order">
          <Plus className="w-4 h-4 mr-2" />
          Add Order
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
                <TableHead>Order #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Subtotal (ex VAT)</TableHead>
                <TableHead className="text-right">VAT</TableHead>
                <TableHead className="text-right">Total (inc VAT)</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No orders found. Create your first order to get started.
                  </TableCell>
                </TableRow>
              ) : (
                orders?.map((order: any) => (
                  <TableRow key={order.id} data-testid={`row-order-${order.id}`}>
                    <TableCell className="font-medium">{order.orderNumber}</TableCell>
                    <TableCell>{getCustomerName(order.customerId)}</TableCell>
                    <TableCell>{new Date(order.orderDate).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(order.status)}>
                        {order.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      £{((order.subtotalExVat || 0) / 100).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      £{((order.vatTotal || 0) / 100).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      £{((order.totalIncVat || 0) / 100).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(order)}
                          data-testid={`button-edit-order-${order.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeletingOrderId(order.id)}
                          data-testid={`button-delete-order-${order.id}`}
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
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">
              {editingOrder ? `Edit Order: ${editingOrder.orderNumber}` : "Create New Order"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Order Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="orderNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Order Number *</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-order-number" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="customerId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Customer *</FormLabel>
                          <Select 
                            onValueChange={field.onChange} 
                            value={field.value || undefined}
                            disabled={!customers || customers.length === 0}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-customer">
                                <SelectValue placeholder={customers?.length === 0 ? "No customers available" : "Select customer"} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {customers?.map((customer: any) => (
                                <SelectItem key={customer.id} value={customer.id}>
                                  {customer.name}
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
                              <SelectItem value="draft">Draft</SelectItem>
                              <SelectItem value="confirmed">Confirmed</SelectItem>
                              <SelectItem value="dispatched">Dispatched</SelectItem>
                              <SelectItem value="delivered">Delivered</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <FormField
                      control={form.control}
                      name="deliveryRunId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Delivery Run (Optional)</FormLabel>
                          <Select 
                            onValueChange={(value) => field.onChange(value === "none" ? undefined : value)}
                            value={field.value || "none"}
                            disabled={!deliveryRuns || deliveryRuns.length === 0}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-delivery-run">
                                <SelectValue placeholder={deliveryRuns?.length === 0 ? "No delivery runs available" : "Select delivery run"} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">No delivery run</SelectItem>
                              {deliveryRuns?.map((run: any) => (
                                <SelectItem key={run.id} value={run.id}>
                                  {run.runName} - {new Date(run.plannedDate).toLocaleDateString()}
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
                      name="currency"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Currency *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-currency">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="GBP">GBP (£)</SelectItem>
                              <SelectItem value="USD">USD ($)</SelectItem>
                              <SelectItem value="EUR">EUR (€)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem className="mt-4">
                        <FormLabel>Notes (Optional)</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            value={field.value || ""}
                            placeholder="Add any notes about this order..."
                            data-testid="input-notes" 
                            className="resize-none"
                            rows={3}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {editingOrder && <OrderLineItemsEditor orderId={editingOrder.id} products={products} />}

              <div className="flex justify-end gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsDialogOpen(false)}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-order"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {editingOrder ? "Update Order" : "Create Order"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingOrderId} onOpenChange={(open) => !open && setDeletingOrderId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this order? This action cannot be undone and will also delete all associated line items.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deletingOrderId && deleteMutation.mutate(deletingOrderId)}
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

function OrderLineItemsEditor({ orderId, products }: { orderId: string; products: any[] }) {
  const { toast } = useToast();
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [newLineData, setNewLineData] = useState({
    productId: "",
    quantity: 1,
    unitPriceExVat: 0,
    vatRate: 2000,
  });

  const { data: lineItems, isLoading } = useQuery({
    queryKey: ['/api/crm/order-lines', orderId],
    enabled: !!orderId,
  });

  const { data: order } = useQuery({
    queryKey: ['/api/crm/orders/detail', orderId],
    queryFn: () => fetch(`/api/crm/orders/detail/${orderId}`, {
      headers: { 'x-session-id': localStorage.getItem('sessionId') || '' },
    }).then(res => res.json()),
    enabled: !!orderId,
  });

  const createLineMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/crm/order-lines', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/order-lines', orderId] });
      queryClient.invalidateQueries({ queryKey: ['/api/crm/orders/detail', orderId] });
      queryClient.invalidateQueries({ queryKey: ['/api/crm/orders'] });
      toast({ title: "Line item added successfully" });
      setNewLineData({ productId: "", quantity: 1, unitPriceExVat: 0, vatRate: 2000 });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add line item", description: error.message, variant: "destructive" });
    },
  });

  const updateLineMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest('PATCH', `/api/crm/order-lines/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/order-lines', orderId] });
      queryClient.invalidateQueries({ queryKey: ['/api/crm/orders/detail', orderId] });
      queryClient.invalidateQueries({ queryKey: ['/api/crm/orders'] });
      toast({ title: "Line item updated successfully" });
      setEditingLineId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update line item", description: error.message, variant: "destructive" });
    },
  });

  const deleteLineMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/crm/order-lines/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/order-lines', orderId] });
      queryClient.invalidateQueries({ queryKey: ['/api/crm/orders/detail', orderId] });
      queryClient.invalidateQueries({ queryKey: ['/api/crm/orders'] });
      toast({ title: "Line item deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete line item", description: error.message, variant: "destructive" });
    },
  });

  const handleAddLine = () => {
    if (!newLineData.productId) {
      toast({ title: "Please select a product", variant: "destructive" });
      return;
    }
    
    createLineMutation.mutate({
      orderId,
      productId: newLineData.productId,
      quantity: newLineData.quantity,
      unitPriceExVat: Math.round(newLineData.unitPriceExVat * 100),
      vatRate: newLineData.vatRate,
    });
  };

  const handleProductChange = (productId: string) => {
    const product = products?.find((p: any) => p.id === productId);
    if (product) {
      setNewLineData({
        productId,
        quantity: 1,
        unitPriceExVat: (product.defaultUnitPriceExVat || 0) / 100,
        vatRate: product.defaultVatRate || 2000,
      });
    }
  };

  const getProductName = (productId: string) => {
    const product = products?.find((p: any) => p.id === productId);
    return product?.productName || "Unknown Product";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Line Items</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <>
            <div className="border rounded-md mb-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit Price (ex VAT)</TableHead>
                    <TableHead className="text-right">VAT Rate</TableHead>
                    <TableHead className="text-right">Subtotal (ex VAT)</TableHead>
                    <TableHead className="text-right">VAT</TableHead>
                    <TableHead className="text-right">Total (inc VAT)</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItems?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        No line items yet. Add products below.
                      </TableCell>
                    </TableRow>
                  ) : (
                    lineItems?.map((line: any) => (
                      <TableRow key={line.id} data-testid={`row-line-${line.id}`}>
                        <TableCell>{getProductName(line.productId)}</TableCell>
                        <TableCell className="text-right">{line.quantity}</TableCell>
                        <TableCell className="text-right">£{((line.unitPriceExVat || 0) / 100).toFixed(2)}</TableCell>
                        <TableCell className="text-right">{((line.vatRate || 0) / 100).toFixed(1)}%</TableCell>
                        <TableCell className="text-right">£{((line.lineSubtotalExVat || 0) / 100).toFixed(2)}</TableCell>
                        <TableCell className="text-right">£{((line.lineVatAmount || 0) / 100).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-medium">£{((line.lineTotalIncVat || 0) / 100).toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteLineMutation.mutate(line.id)}
                            data-testid={`button-delete-line-${line.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="border rounded-md p-4 space-y-4 bg-muted/30">
              <h4 className="font-medium">Add Line Item</h4>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="text-sm font-medium">Product *</label>
                  <Select 
                    value={newLineData.productId} 
                    onValueChange={handleProductChange}
                    disabled={!products || products.length === 0}
                  >
                    <SelectTrigger data-testid="select-new-product">
                      <SelectValue placeholder={products?.length === 0 ? "No products available" : "Select product"} />
                    </SelectTrigger>
                    <SelectContent>
                      {products?.map((product: any) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.productName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium">Quantity *</label>
                  <Input
                    type="number"
                    min="1"
                    value={newLineData.quantity}
                    onChange={(e) => setNewLineData({ ...newLineData, quantity: parseInt(e.target.value) || 1 })}
                    data-testid="input-new-quantity"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Unit Price (ex VAT)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newLineData.unitPriceExVat}
                    onChange={(e) => setNewLineData({ ...newLineData, unitPriceExVat: parseFloat(e.target.value) || 0 })}
                    data-testid="input-new-price"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">VAT Rate (%)</label>
                  <Select 
                    value={newLineData.vatRate.toString()} 
                    onValueChange={(value) => setNewLineData({ ...newLineData, vatRate: parseInt(value) })}
                  >
                    <SelectTrigger data-testid="select-new-vat">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0% (Zero rated)</SelectItem>
                      <SelectItem value="500">5% (Reduced)</SelectItem>
                      <SelectItem value="2000">20% (Standard)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end">
                <Button 
                  type="button" 
                  onClick={handleAddLine}
                  disabled={!newLineData.productId || createLineMutation.isPending}
                  data-testid="button-add-line"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Line Item
                </Button>
              </div>
            </div>

            {order && (
              <div className="mt-6 border-t pt-4">
                <div className="flex justify-end">
                  <div className="space-y-2 min-w-72">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal (ex VAT):</span>
                      <span className="font-medium">£{((order.subtotalExVat || 0) / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">VAT:</span>
                      <span className="font-medium">£{((order.vatTotal || 0) / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-lg font-semibold border-t pt-2">
                      <span>Total (inc VAT):</span>
                      <span>£{((order.totalIncVat || 0) / 100).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
