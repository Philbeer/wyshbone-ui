import { useState, useMemo } from "react";
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
import { Plus, Pencil, Trash2, QrCode, Search, Package, Truck, Warehouse, AlertTriangle, Calendar } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const formSchema = insertBrewContainerSchema.omit({ id: true, workspaceId: true, createdAt: true, updatedAt: true });

export default function BrewCrmContainers() {
  const { user } = useUser();
  const workspaceId = user.id;
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingContainer, setEditingContainer] = useState<any>(null);
  const [deletingContainerId, setDeletingContainerId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [trackingCode, setTrackingCode] = useState("");

  const { data: containers = [], isLoading } = useQuery({
    queryKey: ['/api/brewcrm/containers', workspaceId],
    enabled: !!workspaceId,
  });

  const { data: customers = [] } = useQuery({
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
      qrCode: "",
      lastCustomerId: undefined,
      lastOutboundDate: undefined,
      expectedReturnDate: undefined,
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

  // Calculate metrics
  const metrics = useMemo(() => {
    const now = Date.now();
    return {
      total: containers.length,
      atBrewery: containers.filter((c: any) => c.status === "at_brewery").length,
      withCustomer: containers.filter((c: any) => c.status === "with_customer").length,
      overdue: containers.filter((c: any) => {
        if (c.status === "with_customer" && c.expectedReturnDate) {
          return c.expectedReturnDate < now;
        }
        return false;
      }).length,
      lost: containers.filter((c: any) => c.status === "lost").length,
    };
  }, [containers]);

  // Filter containers based on search
  const filteredContainers = useMemo(() => {
    if (!searchQuery.trim()) return containers;
    const query = searchQuery.toLowerCase();
    return containers.filter((c: any) =>
      c.containerCode?.toLowerCase().includes(query) ||
      c.qrCode?.toLowerCase().includes(query) ||
      c.containerType?.toLowerCase().includes(query) ||
      c.status?.toLowerCase().includes(query)
    );
  }, [containers, searchQuery]);

  const handleTrack = () => {
    if (!trackingCode.trim()) return;
    const found = containers.find((c: any) =>
      c.containerCode?.toLowerCase() === trackingCode.toLowerCase() ||
      c.qrCode?.toLowerCase() === trackingCode.toLowerCase()
    );
    if (found) {
      handleEdit(found);
      setTrackingCode("");
    } else {
      toast({ title: "Container not found", description: `No container found with code "${trackingCode}"`, variant: "destructive" });
    }
  };

  const handleEdit = (container: any) => {
    setEditingContainer(container);
    form.reset({
      containerCode: container.containerCode || "",
      containerType: container.containerType || "cask",
      volumeLitres: container.volumeLitres / 1000 || 0,
      status: container.status || "at_brewery",
      qrCode: container.qrCode || "",
      lastCustomerId: container.lastCustomerId || undefined,
      lastOutboundDate: container.lastOutboundDate || undefined,
      expectedReturnDate: container.expectedReturnDate || undefined,
      lastReturnDate: container.lastReturnDate || undefined,
      notes: container.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleAddNew = () => {
    setEditingContainer(null);
    form.reset({
      containerCode: "",
      containerType: "cask",
      volumeLitres: 0,
      status: "at_brewery",
      qrCode: "",
      lastCustomerId: undefined,
      lastOutboundDate: undefined,
      expectedReturnDate: undefined,
      lastReturnDate: undefined,
      notes: "",
    });
    setIsDialogOpen(true);
  };

  const generateQrCode = () => {
    const code = `CTN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    form.setValue("qrCode", code);
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

  const getStatusBadgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "at_brewery": return "default";
      case "with_customer": return "outline";
      case "lost": return "destructive";
      case "retired": return "secondary";
      default: return "secondary";
    }
  };

  const isOverdue = (container: any) => {
    if (container.status === "with_customer" && container.expectedReturnDate) {
      return container.expectedReturnDate < Date.now();
    }
    return false;
  };

  const getCustomerName = (customerId: string | null) => {
    if (!customerId) return "-";
    const customer = customers?.find((c: any) => c.id === customerId);
    return customer?.name || "-";
  };

  const formatDate = (timestamp: number | null | undefined) => {
    if (!timestamp) return "-";
    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold" data-testid="text-containers-title">Container Tracking</h2>
          <p className="text-sm text-muted-foreground">Track and manage reusable containers (casks, kegs)</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Enter container/QR code..."
              value={trackingCode}
              onChange={(e) => setTrackingCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleTrack()}
              className="w-48"
              data-testid="input-track-code"
            />
            <Button onClick={handleTrack} variant="secondary" data-testid="button-track">
              <QrCode className="w-4 h-4 mr-2" />
              Track
            </Button>
          </div>
          <Button onClick={handleAddNew} data-testid="button-add-container">
            <Plus className="w-4 h-4 mr-2" />
            Add Container
          </Button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{metrics.total}</p>
              </div>
              <Package className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">At Brewery</p>
                <p className="text-2xl font-bold text-green-600">{metrics.atBrewery}</p>
              </div>
              <Warehouse className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">With Customer</p>
                <p className="text-2xl font-bold text-blue-600">{metrics.withCustomer}</p>
              </div>
              <Truck className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Overdue</p>
                <p className="text-2xl font-bold text-orange-600">{metrics.overdue}</p>
              </div>
              <Calendar className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Lost</p>
                <p className="text-2xl font-bold text-red-600">{metrics.lost}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Table */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search containers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search"
            />
          </div>
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
                  <TableHead>QR Code</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Volume</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Expected Return</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContainers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      {searchQuery ? "No containers found matching your search." : "No containers found. Create your first container to get started."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredContainers.map((container: any) => {
                    const containerIsOverdue = isOverdue(container);
                    return (
                      <TableRow 
                        key={container.id} 
                        data-testid={`row-container-${container.id}`}
                        className={containerIsOverdue ? "bg-orange-50 dark:bg-orange-950/20" : ""}
                      >
                        <TableCell className="font-medium">{container.containerCode}</TableCell>
                        <TableCell>
                          {container.qrCode ? (
                            <div className="flex items-center gap-1">
                              <QrCode className="h-4 w-4 text-muted-foreground" />
                              <span className="font-mono text-xs">{container.qrCode}</span>
                            </div>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="capitalize">{container.containerType}</TableCell>
                        <TableCell>{(container.volumeLitres / 1000).toFixed(1)}L</TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(container.status)}>
                            {container.status.replace('_', ' ')}
                          </Badge>
                          {containerIsOverdue && (
                            <Badge variant="destructive" className="ml-2">
                              Overdue
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{getCustomerName(container.lastCustomerId)}</TableCell>
                        <TableCell className={containerIsOverdue ? "text-orange-600 font-medium" : ""}>
                          {formatDate(container.expectedReturnDate)}
                        </TableCell>
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
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">
              {editingContainer ? "Edit Container" : "Add Container"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="containerCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Container Code *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., CASK-001" data-testid="input-container-code" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="qrCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>QR Code</FormLabel>
                      <div className="flex gap-2">
                        <FormControl>
                          <Input {...field} value={field.value || ""} placeholder="Scan or generate" data-testid="input-qr-code" />
                        </FormControl>
                        <Button type="button" variant="outline" onClick={generateQrCode} data-testid="button-generate-qr">
                          <QrCode className="w-4 h-4" />
                        </Button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

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
                    <FormLabel>Current/Last Customer</FormLabel>
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
                        {customers.length === 0 ? (
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

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="lastOutboundDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Outbound Date</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          value={field.value ? new Date(field.value).toISOString().split('T')[0] : ""}
                          onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value).getTime() : undefined)}
                          data-testid="input-outbound-date"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="expectedReturnDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expected Return Date</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          value={field.value ? new Date(field.value).toISOString().split('T')[0] : ""}
                          onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value).getTime() : undefined)}
                          data-testid="input-expected-return"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="lastReturnDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Return Date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        value={field.value ? new Date(field.value).toISOString().split('T')[0] : ""}
                        onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value).getTime() : undefined)}
                        data-testid="input-return-date"
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

      {/* Delete Confirmation */}
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
