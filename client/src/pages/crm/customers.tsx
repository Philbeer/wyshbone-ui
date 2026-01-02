import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch } from "wouter";
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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertCrmCustomerSchema } from "@shared/schema";
import { z } from "zod";
import { Plus, Pencil, Trash2, ShoppingCart, FileText, ExternalLink, Mail, Phone, MapPin } from "lucide-react";
import { useLocation } from "wouter";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Link } from "wouter";
import type { SelectCrmOrder } from "@shared/schema";

const formSchema = insertCrmCustomerSchema.omit({ id: true, workspaceId: true, createdAt: true, updatedAt: true });

function formatCurrency(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function getStatusBadgeVariant(status: string): "secondary" | "default" | "outline" | "destructive" {
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
}

export default function CrmCustomers() {
  const { user } = useUser();
  const workspaceId = user.id;
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [deletingCustomerId, setDeletingCustomerId] = useState<string | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<any>(null);

  const { data: customers, isLoading } = useQuery({
    queryKey: ['/api/crm/customers', workspaceId],
    enabled: !!workspaceId,
  });

  // Handle URL parameter for editing a specific customer
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const editId = params.get('editId');
    if (editId && customers && !isDialogOpen) {
      const customerToEdit = customers.find((c: any) => c.id === editId);
      if (customerToEdit) {
        handleEdit(customerToEdit);
        // Clear the URL parameter
        setLocation('/auth/crm/customers', { replace: true });
      }
    }
  }, [searchString, customers, isDialogOpen]);

  // Fetch orders for the customer being viewed
  const { data: customerOrders = [], isLoading: ordersLoading } = useQuery<SelectCrmOrder[]>({
    queryKey: ['/api/crm/orders/customer', viewingCustomer?.id],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/crm/orders/customer/${viewingCustomer.id}`);
      return response.json();
    },
    enabled: !!viewingCustomer?.id,
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      primaryContactName: "",
      email: "",
      phone: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      postcode: "",
      country: "United Kingdom",
      notes: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/crm/customers', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/customers'] });
      toast({ title: "Customer created successfully" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create customer", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest('PATCH', `/api/crm/customers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/customers'] });
      toast({ title: "Customer updated successfully" });
      setIsDialogOpen(false);
      setEditingCustomer(null);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update customer", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/crm/customers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/customers'] });
      toast({ title: "Customer deleted successfully" });
      setDeletingCustomerId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete customer", description: error.message, variant: "destructive" });
    },
  });

  const handleEdit = (customer: any) => {
    setEditingCustomer(customer);
    form.reset({
      name: customer.name || "",
      primaryContactName: customer.primaryContactName || "",
      email: customer.email || "",
      phone: customer.phone || "",
      addressLine1: customer.addressLine1 || "",
      addressLine2: customer.addressLine2 || "",
      city: customer.city || "",
      postcode: customer.postcode || "",
      country: customer.country || "United Kingdom",
      notes: customer.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleAddNew = () => {
    setEditingCustomer(null);
    form.reset({
      name: "",
      primaryContactName: "",
      email: "",
      phone: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      postcode: "",
      country: "United Kingdom",
      notes: "",
    });
    setIsDialogOpen(true);
  };

  const handleViewOrders = (customerId: string) => {
    setLocation(`/auth/crm/orders?customerId=${customerId}`);
  };

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    if (editingCustomer) {
      updateMutation.mutate({ id: editingCustomer.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-semibold" data-testid="text-customers-title">Customers</h2>
          <p className="text-sm text-muted-foreground">Manage your customer database</p>
        </div>
        <Button onClick={handleAddNew} data-testid="button-add-customer">
          <Plus className="w-4 h-4 mr-2" />
          Add Customer
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
                <TableHead>Contact</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>City</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No customers found. Create your first customer to get started.
                  </TableCell>
                </TableRow>
              ) : (
                customers?.map((customer: any) => (
                  <TableRow 
                    key={customer.id} 
                    data-testid={`row-customer-${customer.id}`}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleEdit(customer)}
                  >
                    <TableCell className="font-medium">{customer.name}</TableCell>
                    <TableCell>{customer.primaryContactName || "-"}</TableCell>
                    <TableCell>{customer.email || "-"}</TableCell>
                    <TableCell>{customer.phone || "-"}</TableCell>
                    <TableCell>{customer.city || "-"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleViewOrders(customer.id)}
                          data-testid={`button-orders-customer-${customer.id}`}
                          title="View orders"
                        >
                          <ShoppingCart className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(customer)}
                          data-testid={`button-edit-customer-${customer.id}`}
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeletingCustomerId(customer.id)}
                          data-testid={`button-delete-customer-${customer.id}`}
                          title="Delete"
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
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle data-testid="text-dialog-title">
              {editingCustomer ? "Edit Customer" : "Add Customer"}
            </DialogTitle>
            {editingCustomer && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsDialogOpen(false);
                  handleViewOrders(editingCustomer.id);
                }}
                className="ml-auto"
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                View Orders
              </Button>
            )}
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer Name *</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-customer-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="primaryContactName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Primary Contact Name</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} data-testid="input-contact-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" value={field.value || ""} data-testid="input-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} data-testid="input-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="addressLine1"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address Line 1</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} data-testid="input-address1" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="addressLine2"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address Line 2</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} data-testid="input-address2" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} data-testid="input-city" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="postcode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Postcode</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} data-testid="input-postcode" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-country" />
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
                  {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingCustomer ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingCustomerId} onOpenChange={() => setDeletingCustomerId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the customer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingCustomerId && deleteMutation.mutate(deletingCustomerId)}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Customer Detail Dialog */}
      <Dialog open={!!viewingCustomer} onOpenChange={(open) => !open && setViewingCustomer(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {viewingCustomer?.name}
            </DialogTitle>
          </DialogHeader>

          {viewingCustomer && (
            <Tabs defaultValue="orders" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="details">Customer Details</TabsTrigger>
                <TabsTrigger value="orders">
                  Orders ({customerOrders.length})
                </TabsTrigger>
              </TabsList>

              {/* Customer Details Tab */}
              <TabsContent value="details" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Contact Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {viewingCustomer.primaryContactName && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground w-24">Contact:</span>
                        <span>{viewingCustomer.primaryContactName}</span>
                      </div>
                    )}
                    {viewingCustomer.email && (
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                        <a href={`mailto:${viewingCustomer.email}`} className="text-primary hover:underline">
                          {viewingCustomer.email}
                        </a>
                      </div>
                    )}
                    {viewingCustomer.phone && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        <a href={`tel:${viewingCustomer.phone}`} className="hover:underline">
                          {viewingCustomer.phone}
                        </a>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {(viewingCustomer.addressLine1 || viewingCustomer.city) && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        Address
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-sm space-y-1">
                        {viewingCustomer.addressLine1 && <div>{viewingCustomer.addressLine1}</div>}
                        {viewingCustomer.addressLine2 && <div>{viewingCustomer.addressLine2}</div>}
                        <div>
                          {[viewingCustomer.city, viewingCustomer.postcode].filter(Boolean).join(", ")}
                        </div>
                        {viewingCustomer.country && <div>{viewingCustomer.country}</div>}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {viewingCustomer.notes && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Notes</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {viewingCustomer.notes}
                      </p>
                    </CardContent>
                  </Card>
                )}

                {viewingCustomer.xeroContactId && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Xero Integration</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Badge variant="outline" className="text-green-600">
                        <ExternalLink className="w-3 h-3 mr-1" />
                        Synced from Xero
                      </Badge>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Orders Tab */}
              <TabsContent value="orders">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-lg">Order History</CardTitle>
                    <Link href="/auth/crm/orders">
                      <Button variant="outline" size="sm">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        View All Orders
                      </Button>
                    </Link>
                  </CardHeader>
                  <CardContent>
                    {ordersLoading ? (
                      <div className="space-y-2">
                        {[...Array(3)].map((_, i) => (
                          <Skeleton key={i} className="h-12 w-full" />
                        ))}
                      </div>
                    ) : customerOrders.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>No orders found for this customer</p>
                      </div>
                    ) : (
                      <div className="border rounded-md">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Order #</TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Total</TableHead>
                              <TableHead>Xero</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {customerOrders.map((order) => (
                              <TableRow key={order.id}>
                                <TableCell className="font-medium">
                                  {order.orderNumber || (order as any).xeroInvoiceNumber || '-'}
                                </TableCell>
                                <TableCell>
                                  {new Date(order.orderDate).toLocaleDateString()}
                                </TableCell>
                                <TableCell>
                                  <Badge variant={getStatusBadgeVariant(order.status)}>
                                    {order.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  {formatCurrency(order.totalIncVat || 0)}
                                </TableCell>
                                <TableCell>
                                  {(order as any).xeroInvoiceId ? (
                                    <Badge variant="outline" className="text-green-600 text-xs">
                                      Xero
                                    </Badge>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">-</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    {/* Order Summary */}
                    {customerOrders.length > 0 && (
                      <div className="mt-4 pt-4 border-t">
                        <div className="flex justify-between items-center">
                          <div className="text-sm text-muted-foreground">
                            {customerOrders.length} order{customerOrders.length !== 1 ? 's' : ''} total
                          </div>
                          <div className="text-right">
                            <div className="text-sm text-muted-foreground">Total Lifetime Value</div>
                            <div className="text-xl font-semibold">
                              {formatCurrency(
                                customerOrders.reduce((sum, o) => sum + (o.totalIncVat || 0), 0)
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingCustomer(null)}>
              Close
            </Button>
            <Button onClick={() => {
              handleEdit(viewingCustomer);
              setViewingCustomer(null);
            }}>
              <Pencil className="w-4 h-4 mr-2" />
              Edit Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
