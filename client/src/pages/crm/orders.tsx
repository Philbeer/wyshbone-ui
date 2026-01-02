import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { queryClient, apiRequest, buildApiUrl } from "@/lib/queryClient";
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
import { z } from "zod";
import { Plus, Pencil, Trash2, Save, Check, X, FileOutput, ExternalLink, Clock, AlertCircle, RefreshCw, User } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { SelectCrmOrder, SelectCrmOrderLine, SelectCrmCustomer, SelectCrmDeliveryRun, SelectCrmProduct } from "@shared/schema";
import { useLocation } from "wouter";

const orderFormSchema = z.object({
  orderNumber: z.string().min(1, "Order number is required"),
  customerId: z.string().min(1, "Customer is required"),
  status: z.string().default("draft"),
  deliveryRunId: z.string().optional().nullable(),
  currency: z.string().default("GBP"),
  discountType: z.string().default("none"),
  discountValue: z.number().default(0),
  shippingExVat: z.number().default(0),
  shippingVatRate: z.number().default(2000),
  notes: z.string().optional().nullable(),
  orderDate: z.number().default(() => Date.now()),
  deliveryDate: z.number().optional().nullable(),
});

type OrderFormValues = z.infer<typeof orderFormSchema>;

interface LocalLineItem {
  tempId: string;
  productId: string;
  description: string;
  quantity: number;
  unitPriceExVat: number;
  vatRate: number;
  lineSubtotalExVat: number;
  lineVatAmount: number;
  lineTotalIncVat: number;
}

function formatCurrency(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function formatVatRate(basisPoints: number): string {
  return `${(basisPoints / 100).toFixed(1)}%`;
}

function calculateLineTotals(quantity: number, unitPriceExVat: number, vatRate: number) {
  const lineSubtotalExVat = quantity * unitPriceExVat;
  const lineVatAmount = Math.round(lineSubtotalExVat * (vatRate / 10000));
  const lineTotalIncVat = lineSubtotalExVat + lineVatAmount;
  return { lineSubtotalExVat, lineVatAmount, lineTotalIncVat };
}

function calculateOrderTotals(
  lineItems: { lineSubtotalExVat: number; lineVatAmount: number }[],
  discountType: string,
  discountValue: number,
  shippingExVat: number,
  shippingVatRate: number
) {
  const subtotalExVat = lineItems.reduce((acc, line) => acc + line.lineSubtotalExVat, 0);
  const itemsVatTotal = lineItems.reduce((acc, line) => acc + line.lineVatAmount, 0);
  
  // Calculate discount
  let discountAmount = 0;
  if (discountType === "percentage" && discountValue > 0) {
    discountAmount = Math.round(subtotalExVat * (discountValue / 10000));
  } else if (discountType === "fixed" && discountValue > 0) {
    discountAmount = discountValue;
  }
  
  // Shipping VAT
  const shippingVatAmount = Math.round(shippingExVat * (shippingVatRate / 10000));
  
  // Final totals
  const subtotalAfterDiscount = subtotalExVat - discountAmount;
  const vatTotal = itemsVatTotal + shippingVatAmount;
  const totalIncVat = subtotalAfterDiscount + vatTotal + shippingExVat;
  
  return {
    subtotalExVat,
    discountAmount,
    subtotalAfterDiscount,
    shippingExVat,
    shippingVatAmount,
    vatTotal,
    totalIncVat,
  };
}

export default function CrmOrders() {
  const { user } = useUser();
  const workspaceId = user.id;
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<SelectCrmOrder | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [localLineItems, setLocalLineItems] = useState<LocalLineItem[]>([]);
  const [exportingOrderId, setExportingOrderId] = useState<string | null>(null);
  // Initialize filterCustomerId from URL on mount
  const getCustomerIdFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('customerId');
  };
  
  const [filterCustomerId, setFilterCustomerId] = useState<string | null>(getCustomerIdFromUrl);

  // Handle URL parameter changes for filtering by customer
  useEffect(() => {
    // Try both wouter's searchString and window.location.search for reliability
    const searchToUse = searchString || window.location.search;
    const params = new URLSearchParams(searchToUse);
    const customerId = params.get('customerId');
    
    console.log('[Orders] URL customerId:', customerId, 'current filter:', filterCustomerId);
    
    // Set or clear the filter based on URL
    if (customerId && customerId !== filterCustomerId) {
      console.log('[Orders] Setting filter to:', customerId);
      setFilterCustomerId(customerId);
    } else if (!customerId && filterCustomerId) {
      // Clear filter if customerId was removed from URL
      console.log('[Orders] Clearing filter');
      setFilterCustomerId(null);
    }
  }, [searchString, filterCustomerId]);

  const { data: allOrders = [], isLoading } = useQuery<SelectCrmOrder[]>({
    queryKey: ['/api/crm/orders', workspaceId],
    enabled: !!workspaceId,
  });

  // Filter orders by customer if filter is active
  const orders = useMemo(() => {
    if (!filterCustomerId) {
      console.log('[Orders] No filter, showing all', allOrders.length, 'orders');
      return allOrders;
    }
    const filtered = allOrders.filter(order => order.customerId === filterCustomerId);
    console.log('[Orders] Filtering by customerId:', filterCustomerId);
    console.log('[Orders] Found', filtered.length, 'of', allOrders.length, 'orders');
    
    // Debug: show what customerIds we have in orders vs what we're filtering for
    if (allOrders.length > 0) {
      const uniqueCustomerIds = [...new Set(allOrders.map(o => o.customerId))];
      console.log('[Orders] Available customerIds in orders:', uniqueCustomerIds);
      console.log('[Orders] Looking for customer:', customers.find(c => c.id === filterCustomerId)?.name || 'NOT FOUND');
      
      // Check if the customer exists and what their orders look like
      const matchingCustomer = customers.find(c => c.id === filterCustomerId);
      if (matchingCustomer) {
        console.log('[Orders] Customer found:', matchingCustomer.name, 'ID:', matchingCustomer.id);
        // Check if any order's customerId matches
        const customerOrders = allOrders.filter(o => o.customerId === matchingCustomer.id);
        console.log('[Orders] Orders with matching customerId:', customerOrders.length);
      }
    }
    return filtered;
  }, [allOrders, filterCustomerId, customers]);

  const { data: customers = [] } = useQuery<SelectCrmCustomer[]>({
    queryKey: ['/api/crm/customers', workspaceId],
    enabled: !!workspaceId,
  });

  const { data: deliveryRuns = [] } = useQuery<SelectCrmDeliveryRun[]>({
    queryKey: ['/api/crm/delivery-runs', workspaceId],
    enabled: !!workspaceId,
  });

  // Use Generic CRM products
  const { data: products = [] } = useQuery<SelectCrmProduct[]>({
    queryKey: ['/api/crm/products', workspaceId],
    enabled: !!workspaceId,
  });

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: {
      customerId: "",
      orderNumber: "",
      orderDate: Date.now(),
      status: "draft",
      deliveryDate: undefined,
      deliveryRunId: undefined,
      currency: "GBP",
      discountType: "none",
      discountValue: 0,
      shippingExVat: 0,
      shippingVatRate: 2000,
      notes: "",
    },
  });

  const watchDiscountType = form.watch("discountType");
  const watchDiscountValue = form.watch("discountValue");
  const watchShippingExVat = form.watch("shippingExVat");
  const watchShippingVatRate = form.watch("shippingVatRate");

  const createMutation = useMutation({
    mutationFn: async (data: OrderFormValues) => {
      const response = await apiRequest('POST', '/api/crm/orders', {
        ...data,
        discountValue: Math.round((data.discountValue || 0) * (data.discountType === "percentage" ? 100 : 1)),
        shippingExVat: Math.round((data.shippingExVat || 0) * 100),
      });
      const orderData = await response.json() as SelectCrmOrder;
      
      for (const line of localLineItems) {
        await apiRequest('POST', '/api/crm/order-lines', {
          orderId: orderData.id,
          productId: line.productId,
          description: line.description || null,
          quantity: line.quantity,
          unitPriceExVat: line.unitPriceExVat,
          vatRate: line.vatRate,
        });
      }
      
      return orderData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/orders'] });
      toast({ title: "Order created successfully" });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create order", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: OrderFormValues & { id: string }) => 
      apiRequest('PATCH', `/api/crm/orders/${id}`, {
        ...data,
        discountValue: Math.round((data.discountValue || 0) * (data.discountType === "percentage" ? 100 : 1)),
        shippingExVat: Math.round((data.shippingExVat || 0) * 100),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/orders'] });
      toast({ title: "Order updated successfully" });
      handleCloseDialog();
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

  const exportToXeroMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const response = await apiRequest('POST', `/api/crm/orders/${orderId}/export-xero`);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/orders'] });
      toast({ 
        title: "Exported to Xero", 
        description: data.invoiceNumber ? `Invoice ${data.invoiceNumber} created` : "Invoice created successfully" 
      });
      setExportingOrderId(null);
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to export to Xero", 
        description: error.message || "Please check your Xero connection", 
        variant: "destructive" 
      });
      setExportingOrderId(null);
    },
  });

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingOrder(null);
    setLocalLineItems([]);
    form.reset();
  };

  const handleEdit = (order: SelectCrmOrder) => {
    setEditingOrder(order);
    setLocalLineItems([]);
    form.reset({
      customerId: order.customerId || "",
      orderNumber: order.orderNumber || "",
      orderDate: order.orderDate,
      status: order.status || "draft",
      deliveryDate: order.deliveryDate || undefined,
      deliveryRunId: order.deliveryRunId || undefined,
      currency: order.currency || "GBP",
      discountType: (order as any).discountType || "none",
      discountValue: ((order as any).discountValue || 0) / ((order as any).discountType === "percentage" ? 100 : 1),
      shippingExVat: ((order as any).shippingExVat || 0) / 100,
      shippingVatRate: (order as any).shippingVatRate || 2000,
      notes: order.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleAddNew = () => {
    setEditingOrder(null);
    setLocalLineItems([]);
    form.reset({
      customerId: "",
      orderNumber: "",
      orderDate: Date.now(),
      status: "draft",
      deliveryDate: undefined,
      deliveryRunId: undefined,
      currency: "GBP",
      discountType: "none",
      discountValue: 0,
      shippingExVat: 0,
      shippingVatRate: 2000,
      notes: "",
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (formValues: OrderFormValues) => {
    if (editingOrder) {
      updateMutation.mutate({ id: editingOrder.id, ...formValues });
    } else {
      createMutation.mutate(formValues);
    }
  };

  const handleAddLocalLine = useCallback((productId: string, description: string, quantity: number, unitPriceExVat: number, vatRate: number) => {
    const totals = calculateLineTotals(quantity, unitPriceExVat, vatRate);
    const newLine: LocalLineItem = {
      tempId: `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      productId,
      description,
      quantity,
      unitPriceExVat,
      vatRate,
      ...totals,
    };
    setLocalLineItems(prev => [...prev, newLine]);
  }, []);

  const handleRemoveLocalLine = useCallback((tempId: string) => {
    setLocalLineItems(prev => prev.filter(line => line.tempId !== tempId));
  }, []);

  const handleUpdateLocalLine = useCallback((tempId: string, updates: Partial<LocalLineItem>) => {
    setLocalLineItems(prev => prev.map(line => {
      if (line.tempId !== tempId) return line;
      const newLine = { ...line, ...updates };
      if (updates.quantity !== undefined || updates.unitPriceExVat !== undefined || updates.vatRate !== undefined) {
        const totals = calculateLineTotals(
          updates.quantity ?? line.quantity,
          updates.unitPriceExVat ?? line.unitPriceExVat,
          updates.vatRate ?? line.vatRate
        );
        return { ...newLine, ...totals };
      }
      return newLine;
    }));
  }, []);

  const localTotals = useMemo(() => {
    return calculateOrderTotals(
      localLineItems,
      watchDiscountType,
      watchDiscountType === "percentage" ? watchDiscountValue * 100 : watchDiscountValue * 100,
      watchShippingExVat * 100,
      watchShippingVatRate
    );
  }, [localLineItems, watchDiscountType, watchDiscountValue, watchShippingExVat, watchShippingVatRate]);

  const getStatusBadgeVariant = (status: string): "secondary" | "default" | "outline" | "destructive" => {
    switch (status) {
      case "draft": return "secondary";
      case "confirmed": return "default";
      case "invoiced": return "outline";
      case "paid": return "default";
      case "dispatched": return "outline";
      case "delivered": return "default";
      case "cancelled": return "destructive";
      default: return "secondary";
    }
  };

  const getCustomerName = (customerId: string) => {
    const customer = customers.find((c) => c.id === customerId);
    return customer?.name || "Unknown";
  };

  const handleViewCustomer = (customerId: string) => {
    handleCloseDialog();
    setLocation(`/auth/crm/customers?editId=${customerId}`);
  };

  const hasNoCustomers = customers.length === 0;
  const hasNoProducts = products.length === 0;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6 gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold" data-testid="text-orders-title">Orders</h2>
          <p className="text-sm text-muted-foreground">Manage customer orders with VAT calculations</p>
        </div>
        <Button 
          onClick={handleAddNew} 
          disabled={hasNoCustomers}
          data-testid="button-add-order"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Order
        </Button>
      </div>

      {hasNoCustomers && (
        <div className="mb-4 p-4 border rounded-md bg-muted/30">
          <p className="text-sm text-muted-foreground">
            You need to create at least one customer before you can create orders.
          </p>
        </div>
      )}

      {filterCustomerId && (
        <div className="mb-4 p-3 border rounded-md bg-blue-50 dark:bg-blue-950/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-blue-600" />
            <span className="text-sm">
              Showing orders for: <strong>{getCustomerName(filterCustomerId)}</strong>
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilterCustomerId(null);
              setLocation('/auth/crm/orders', { replace: true });
            }}
          >
            <X className="w-4 h-4 mr-1" />
            Clear Filter
          </Button>
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
                <TableHead>Order #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Subtotal (ex VAT)</TableHead>
                <TableHead className="text-right">VAT</TableHead>
                <TableHead className="text-right">Total (inc VAT)</TableHead>
                <TableHead>Xero</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    {filterCustomerId ? (
                      <>
                        No orders found for this customer.{" "}
                        <Button 
                          variant="link" 
                          className="p-0 h-auto" 
                          onClick={() => {
                            setFilterCustomerId(null);
                            setLocation('/auth/crm/orders', { replace: true });
                          }}
                        >
                          View all orders
                        </Button>
                      </>
                    ) : (
                      "No orders found. Create your first order to get started."
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((order) => (
                  <TableRow 
                    key={order.id} 
                    data-testid={`row-order-${order.id}`}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleEdit(order)}
                  >
                    <TableCell className="font-medium">{order.orderNumber}</TableCell>
                    <TableCell>{getCustomerName(order.customerId)}</TableCell>
                    <TableCell>{new Date(order.orderDate).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(order.status)}>
                        {order.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(order.subtotalExVat || 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(order.vatTotal || 0)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(order.totalIncVat || 0)}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {(order as any).xeroInvoiceId ? (
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="text-green-600">
                            <Check className="w-3 h-3 mr-1" />
                            Synced
                          </Badge>
                          {/* Show sync status indicator */}
                          {(order as any).syncStatus === 'pending' && (
                            <Clock className="w-3 h-3 text-amber-500 animate-pulse" title="Syncing..." />
                          )}
                          {(order as any).syncStatus === 'failed' && (
                            <AlertCircle className="w-3 h-3 text-red-500" title={(order as any).lastSyncError || "Sync failed"} />
                          )}
                        </div>
                      ) : (order as any).syncStatus === 'pending' ? (
                        <Badge variant="secondary" className="gap-1">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          Syncing...
                        </Badge>
                      ) : (order as any).syncStatus === 'failed' ? (
                        <Badge variant="destructive" className="gap-1">
                          <AlertCircle className="w-3 h-3" />
                          Failed
                        </Badge>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setExportingOrderId(order.id);
                            exportToXeroMutation.mutate(order.id);
                          }}
                          disabled={exportToXeroMutation.isPending && exportingOrderId === order.id}
                          data-testid={`button-export-xero-${order.id}`}
                        >
                          <FileOutput className="w-4 h-4 mr-1" />
                          {exportToXeroMutation.isPending && exportingOrderId === order.id ? "..." : "Xero"}
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
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

      <Dialog open={isDialogOpen} onOpenChange={(open) => !open && handleCloseDialog()}>
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
                          <div className="flex gap-2">
                            <Select 
                              onValueChange={field.onChange} 
                              value={field.value || ""}
                              disabled={hasNoCustomers}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-customer" className="flex-1">
                                  <SelectValue placeholder={hasNoCustomers ? "No customers available" : "Select customer"} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {customers.map((customer) => (
                                  <SelectItem key={customer.id} value={customer.id}>
                                    {customer.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {field.value && (
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => handleViewCustomer(field.value)}
                                title="View customer"
                              >
                                <User className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
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
                          <Select onValueChange={field.onChange} value={field.value || "draft"}>
                            <FormControl>
                              <SelectTrigger data-testid="select-status">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="draft">Draft</SelectItem>
                              <SelectItem value="confirmed">Confirmed</SelectItem>
                              <SelectItem value="invoiced">Invoiced</SelectItem>
                              <SelectItem value="paid">Paid</SelectItem>
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
                            onValueChange={(value) => field.onChange(value === "__none__" ? null : value)}
                            value={field.value || "__none__"}
                            disabled={deliveryRuns.length === 0}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-delivery-run">
                                <SelectValue placeholder={deliveryRuns.length === 0 ? "No delivery runs available" : "Select delivery run"} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="__none__">No delivery run</SelectItem>
                              {deliveryRuns.map((run) => (
                                <SelectItem key={run.id} value={run.id}>
                                  {run.name} - {new Date(run.scheduledDate).toLocaleDateString()}
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
                          <Select onValueChange={field.onChange} value={field.value || "GBP"}>
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

              {editingOrder ? (
                <OrderLineItemsEditor 
                  orderId={editingOrder.id} 
                  products={products} 
                />
              ) : (
                <LocalLineItemsEditor
                  products={products}
                  lineItems={localLineItems}
                  onAddLine={handleAddLocalLine}
                  onRemoveLine={handleRemoveLocalLine}
                  onUpdateLine={handleUpdateLocalLine}
                  totals={localTotals}
                />
              )}

              {/* Discount and Shipping */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Discount & Shipping</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-medium mb-3">Discount</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="discountType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Discount Type</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value || "none"}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-discount-type">
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="none">No Discount</SelectItem>
                                  <SelectItem value="percentage">Percentage</SelectItem>
                                  <SelectItem value="fixed">Fixed Amount</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="discountValue"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                {watchDiscountType === "percentage" ? "Percentage (%)" : "Amount (£)"}
                              </FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  type="number"
                                  step={watchDiscountType === "percentage" ? "0.1" : "0.01"}
                                  min="0"
                                  disabled={watchDiscountType === "none"}
                                  onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                  data-testid="input-discount-value"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    <div>
                      <h4 className="font-medium mb-3">Shipping</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="shippingExVat"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Shipping (ex VAT)</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                  data-testid="input-shipping"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="shippingVatRate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Shipping VAT Rate</FormLabel>
                              <Select 
                                onValueChange={(v) => field.onChange(parseInt(v))} 
                                value={field.value?.toString() || "2000"}
                              >
                                <FormControl>
                                  <SelectTrigger data-testid="select-shipping-vat">
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="0">0%</SelectItem>
                                  <SelectItem value="500">5%</SelectItem>
                                  <SelectItem value="2000">20%</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleCloseDialog}
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

interface LocalLineItemsEditorProps {
  products: SelectCrmProduct[];
  lineItems: LocalLineItem[];
  onAddLine: (productId: string, description: string, quantity: number, unitPriceExVat: number, vatRate: number) => void;
  onRemoveLine: (tempId: string) => void;
  onUpdateLine: (tempId: string, updates: Partial<LocalLineItem>) => void;
  totals: ReturnType<typeof calculateOrderTotals>;
}

function LocalLineItemsEditor({ products, lineItems, onAddLine, onRemoveLine, onUpdateLine, totals }: LocalLineItemsEditorProps) {
  const { toast } = useToast();
  const [newLineData, setNewLineData] = useState({
    productId: "",
    description: "",
    quantity: 1,
    unitPriceExVat: 0,
    vatRate: 2000,
  });
  const [editingTempId, setEditingTempId] = useState<string | null>(null);
  const [editData, setEditData] = useState<{ description: string; quantity: number; unitPriceExVat: number; vatRate: number }>({
    description: "",
    quantity: 1,
    unitPriceExVat: 0,
    vatRate: 2000,
  });

  const handleAddLine = () => {
    if (!newLineData.productId) {
      toast({ title: "Please select a product", variant: "destructive" });
      return;
    }
    onAddLine(
      newLineData.productId,
      newLineData.description,
      newLineData.quantity,
      Math.round(newLineData.unitPriceExVat * 100),
      newLineData.vatRate
    );
    setNewLineData({ productId: "", description: "", quantity: 1, unitPriceExVat: 0, vatRate: 2000 });
  };

  const handleProductChange = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (product) {
      setNewLineData({
        productId,
        description: product.name, // Default description to product name
        quantity: 1,
        unitPriceExVat: (product.defaultUnitPriceExVat || 0) / 100,
        vatRate: product.defaultVatRate || 2000,
      });
    }
  };

  const getProductName = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    return product?.name || "Unknown Product";
  };

  const startEditing = (line: LocalLineItem) => {
    setEditingTempId(line.tempId);
    setEditData({
      description: line.description,
      quantity: line.quantity,
      unitPriceExVat: line.unitPriceExVat / 100,
      vatRate: line.vatRate,
    });
  };

  const saveEditing = () => {
    if (editingTempId) {
      onUpdateLine(editingTempId, {
        description: editData.description,
        quantity: editData.quantity,
        unitPriceExVat: Math.round(editData.unitPriceExVat * 100),
        vatRate: editData.vatRate,
      });
      setEditingTempId(null);
    }
  };

  const cancelEditing = () => {
    setEditingTempId(null);
  };

  // Filter to only active products
  const activeProducts = products.filter((p: any) => p.isActive === 1);
  const hasNoProducts = activeProducts.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Line Items</CardTitle>
      </CardHeader>
      <CardContent>
        {hasNoProducts && (
          <div className="mb-4 p-4 border rounded-md bg-muted/30">
            <p className="text-sm text-muted-foreground">
              You need to create at least one active product before you can add line items.
            </p>
          </div>
        )}

        <div className="border rounded-md mb-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Description</TableHead>
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
              {lineItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    No line items yet. Add products below.
                  </TableCell>
                </TableRow>
              ) : (
                lineItems.map((line) => (
                  <TableRow key={line.tempId} data-testid={`row-local-line-${line.tempId}`}>
                    <TableCell>{getProductName(line.productId)}</TableCell>
                    {editingTempId === line.tempId ? (
                      <>
                        <TableCell>
                          <Input
                            value={editData.description}
                            onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                            className="w-40"
                            data-testid="input-edit-description"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min="1"
                            value={editData.quantity}
                            onChange={(e) => setEditData({ ...editData, quantity: parseInt(e.target.value) || 1 })}
                            className="w-20 text-right"
                            data-testid="input-edit-quantity"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editData.unitPriceExVat}
                            onChange={(e) => setEditData({ ...editData, unitPriceExVat: parseFloat(e.target.value) || 0 })}
                            className="w-24 text-right"
                            data-testid="input-edit-price"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Select 
                            value={editData.vatRate.toString()} 
                            onValueChange={(value) => setEditData({ ...editData, vatRate: parseInt(value) })}
                          >
                            <SelectTrigger className="w-28" data-testid="select-edit-vat">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0">0%</SelectItem>
                              <SelectItem value="500">5%</SelectItem>
                              <SelectItem value="2000">20%</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right" colSpan={3}></TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={saveEditing} data-testid="button-save-edit">
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={cancelEditing} data-testid="button-cancel-edit">
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="text-sm text-muted-foreground">{line.description || "-"}</TableCell>
                        <TableCell className="text-right">{line.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(line.unitPriceExVat)}</TableCell>
                        <TableCell className="text-right">{formatVatRate(line.vatRate)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(line.lineSubtotalExVat)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(line.lineVatAmount)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(line.lineTotalIncVat)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => startEditing(line)}
                              data-testid={`button-edit-local-line-${line.tempId}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onRemoveLine(line.tempId)}
                              data-testid={`button-delete-local-line-${line.tempId}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="border rounded-md p-4 space-y-4 bg-muted/30">
          <h4 className="font-medium">Add Line Item</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Product *</label>
              <Select 
                value={newLineData.productId || "__none__"} 
                onValueChange={(value) => value !== "__none__" && handleProductChange(value)}
                disabled={hasNoProducts}
              >
                <SelectTrigger data-testid="select-new-product">
                  <SelectValue placeholder={hasNoProducts ? "No products available" : "Select product"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" disabled>Select product</SelectItem>
                  {activeProducts.map((product: any) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Description (Override)</label>
              <Input
                value={newLineData.description}
                onChange={(e) => setNewLineData({ ...newLineData, description: e.target.value })}
                placeholder="Line item description"
                data-testid="input-new-description"
              />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
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
              <label className="text-sm font-medium">VAT Rate</label>
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

            <div className="flex items-end">
              <Button 
                type="button" 
                onClick={handleAddLine}
                disabled={!newLineData.productId || hasNoProducts}
                data-testid="button-add-line"
                className="w-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Line Item
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-6 border-t pt-4">
          <div className="flex justify-end">
            <div className="space-y-2 min-w-72">
              <div className="flex justify-between text-sm gap-4">
                <span className="text-muted-foreground">Subtotal (ex VAT):</span>
                <span className="font-medium" data-testid="text-local-subtotal">{formatCurrency(totals.subtotalExVat)}</span>
              </div>
              {totals.discountAmount > 0 && (
                <div className="flex justify-between text-sm gap-4 text-green-600">
                  <span>Discount:</span>
                  <span className="font-medium">-{formatCurrency(totals.discountAmount)}</span>
                </div>
              )}
              {totals.shippingExVat > 0 && (
                <div className="flex justify-between text-sm gap-4">
                  <span className="text-muted-foreground">Shipping:</span>
                  <span className="font-medium">{formatCurrency(totals.shippingExVat)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm gap-4">
                <span className="text-muted-foreground">VAT:</span>
                <span className="font-medium" data-testid="text-local-vat">{formatCurrency(totals.vatTotal)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-lg font-semibold gap-4">
                <span>Total (inc VAT):</span>
                <span data-testid="text-local-total">{formatCurrency(totals.totalIncVat)}</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface OrderLineItemsEditorProps {
  orderId: string;
  products: SelectCrmProduct[];
}

function OrderLineItemsEditor({ orderId, products }: OrderLineItemsEditorProps) {
  const { toast } = useToast();
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editData, setEditData] = useState<{ description: string; quantity: number; unitPriceExVat: number; vatRate: number }>({
    description: "",
    quantity: 1,
    unitPriceExVat: 0,
    vatRate: 2000,
  });
  const [newLineData, setNewLineData] = useState({
    productId: "",
    description: "",
    quantity: 1,
    unitPriceExVat: 0,
    vatRate: 2000,
  });
  const [deletingLineId, setDeletingLineId] = useState<string | null>(null);

  const { data: lineItems = [], isLoading } = useQuery<SelectCrmOrderLine[]>({
    queryKey: ['/api/crm/order-lines', orderId],
    enabled: !!orderId,
  });

  const { data: order } = useQuery<SelectCrmOrder>({
    queryKey: ['/api/crm/orders/detail', orderId],
    queryFn: () => fetch(buildApiUrl(`/api/crm/orders/detail/${orderId}`), {
      headers: { 'x-session-id': localStorage.getItem('sessionId') || '' },
    }).then(res => res.json()),
    enabled: !!orderId,
  });

  const createLineMutation = useMutation({
    mutationFn: (data: { orderId: string; productId: string; description?: string; quantity: number; unitPriceExVat: number; vatRate: number }) => 
      apiRequest('POST', '/api/crm/order-lines', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/order-lines', orderId] });
      queryClient.invalidateQueries({ queryKey: ['/api/crm/orders/detail', orderId] });
      queryClient.invalidateQueries({ queryKey: ['/api/crm/orders'] });
      toast({ title: "Line item added successfully" });
      setNewLineData({ productId: "", description: "", quantity: 1, unitPriceExVat: 0, vatRate: 2000 });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add line item", description: error.message, variant: "destructive" });
    },
  });

  const updateLineMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; description?: string; quantity: number; unitPriceExVat: number; vatRate: number }) => 
      apiRequest('PATCH', `/api/crm/order-lines/${id}`, data),
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
      setDeletingLineId(null);
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
      description: newLineData.description || null,
      quantity: newLineData.quantity,
      unitPriceExVat: Math.round(newLineData.unitPriceExVat * 100),
      vatRate: newLineData.vatRate,
    });
  };

  const handleProductChange = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (product) {
      setNewLineData({
        productId,
        description: product.name, // Default description to product name
        quantity: 1,
        unitPriceExVat: (product.defaultUnitPriceExVat || 0) / 100,
        vatRate: product.defaultVatRate || 2000,
      });
    }
  };

  const getProductName = (productId: string | null) => {
    if (!productId) return "Unknown Product";
    const product = products.find((p) => p.id === productId);
    return product?.name || "Unknown Product";
  };

  const startEditing = (line: SelectCrmOrderLine) => {
    setEditingLineId(line.id);
    setEditData({
      description: (line as any).description || "",
      quantity: line.quantity,
      unitPriceExVat: (line.unitPriceExVat || 0) / 100,
      vatRate: line.vatRate,
    });
  };

  const saveEditing = () => {
    if (editingLineId) {
      updateLineMutation.mutate({
        id: editingLineId,
        description: editData.description || null,
        quantity: editData.quantity,
        unitPriceExVat: Math.round(editData.unitPriceExVat * 100),
        vatRate: editData.vatRate,
      });
    }
  };

  const cancelEditing = () => {
    setEditingLineId(null);
  };

  const activeProducts = products.filter((p: any) => p.isActive === 1);
  const hasNoProducts = activeProducts.length === 0;

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
            {hasNoProducts && (
              <div className="mb-4 p-4 border rounded-md bg-muted/30">
                <p className="text-sm text-muted-foreground">
                  You need to create at least one active product before you can add line items.
                </p>
              </div>
            )}

            <div className="border rounded-md mb-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Description</TableHead>
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
                  {lineItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground">
                        No line items yet. Add products below.
                      </TableCell>
                    </TableRow>
                  ) : (
                    lineItems.map((line) => (
                      <TableRow key={line.id} data-testid={`row-line-${line.id}`}>
                        <TableCell>{getProductName(line.productId)}</TableCell>
                        {editingLineId === line.id ? (
                          <>
                            <TableCell>
                              <Input
                                value={editData.description}
                                onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                                className="w-40"
                                data-testid="input-edit-line-description"
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                min="1"
                                value={editData.quantity}
                                onChange={(e) => setEditData({ ...editData, quantity: parseInt(e.target.value) || 1 })}
                                className="w-20 text-right"
                                data-testid="input-edit-line-quantity"
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={editData.unitPriceExVat}
                                onChange={(e) => setEditData({ ...editData, unitPriceExVat: parseFloat(e.target.value) || 0 })}
                                className="w-24 text-right"
                                data-testid="input-edit-line-price"
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Select 
                                value={editData.vatRate.toString()} 
                                onValueChange={(value) => setEditData({ ...editData, vatRate: parseInt(value) })}
                              >
                                <SelectTrigger className="w-28" data-testid="select-edit-line-vat">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="0">0%</SelectItem>
                                  <SelectItem value="500">5%</SelectItem>
                                  <SelectItem value="2000">20%</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-right" colSpan={3}></TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={saveEditing} 
                                  disabled={updateLineMutation.isPending}
                                  data-testid="button-save-line-edit"
                                >
                                  <Check className="w-4 h-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={cancelEditing} 
                                  data-testid="button-cancel-line-edit"
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="text-sm text-muted-foreground">{(line as any).description || "-"}</TableCell>
                            <TableCell className="text-right">{line.quantity}</TableCell>
                            <TableCell className="text-right">{formatCurrency(line.unitPriceExVat || 0)}</TableCell>
                            <TableCell className="text-right">{formatVatRate(line.vatRate)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(line.lineSubtotalExVat || 0)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(line.lineVatAmount || 0)}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(line.lineTotalIncVat || 0)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => startEditing(line)}
                                  data-testid={`button-edit-line-${line.id}`}
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDeletingLineId(line.id)}
                                  data-testid={`button-delete-line-${line.id}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="border rounded-md p-4 space-y-4 bg-muted/30">
              <h4 className="font-medium">Add Line Item</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Product *</label>
                  <Select 
                    value={newLineData.productId || "__none__"} 
                    onValueChange={(value) => value !== "__none__" && handleProductChange(value)}
                    disabled={hasNoProducts}
                  >
                    <SelectTrigger data-testid="select-new-product">
                      <SelectValue placeholder={hasNoProducts ? "No products available" : "Select product"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" disabled>Select product</SelectItem>
                      {activeProducts.map((product: any) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium">Description (Override)</label>
                  <Input
                    value={newLineData.description}
                    onChange={(e) => setNewLineData({ ...newLineData, description: e.target.value })}
                    placeholder="Line item description"
                    data-testid="input-new-description"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
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
                  <label className="text-sm font-medium">VAT Rate</label>
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

                <div className="flex items-end">
                  <Button 
                    type="button" 
                    onClick={handleAddLine}
                    disabled={!newLineData.productId || createLineMutation.isPending || hasNoProducts}
                    data-testid="button-add-line"
                    className="w-full"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Line Item
                  </Button>
                </div>
              </div>
            </div>

            {order && (
              <div className="mt-6 border-t pt-4">
                <div className="flex justify-end">
                  <div className="space-y-2 min-w-72">
                    <div className="flex justify-between text-sm gap-4">
                      <span className="text-muted-foreground">Subtotal (ex VAT):</span>
                      <span className="font-medium" data-testid="text-order-subtotal">{formatCurrency(order.subtotalExVat || 0)}</span>
                    </div>
                    {(order as any).discountAmount > 0 && (
                      <div className="flex justify-between text-sm gap-4 text-green-600">
                        <span>Discount:</span>
                        <span className="font-medium">-{formatCurrency((order as any).discountAmount)}</span>
                      </div>
                    )}
                    {(order as any).shippingExVat > 0 && (
                      <div className="flex justify-between text-sm gap-4">
                        <span className="text-muted-foreground">Shipping:</span>
                        <span className="font-medium">{formatCurrency((order as any).shippingExVat)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm gap-4">
                      <span className="text-muted-foreground">VAT:</span>
                      <span className="font-medium" data-testid="text-order-vat">{formatCurrency(order.vatTotal || 0)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between text-lg font-semibold gap-4">
                      <span>Total (inc VAT):</span>
                      <span data-testid="text-order-total">{formatCurrency(order.totalIncVat || 0)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>

      {/* Delete Line Item Confirmation */}
      <AlertDialog open={!!deletingLineId} onOpenChange={() => setDeletingLineId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Line Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this line item? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deletingLineId && deleteLineMutation.mutate(deletingLineId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
