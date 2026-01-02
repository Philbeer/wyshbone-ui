import { useState, useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { 
  useSuppliers, 
  useSupplierPurchases, 
  useCreateSupplier, 
  useUpdateSupplier, 
  useDeleteSupplier,
  useSyncXeroSuppliers 
} from "@/hooks/useSuppliers";
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
import { 
  Plus, Pencil, Trash2, ShoppingCart, ExternalLink, Mail, Phone, MapPin, 
  Globe, Building2, RefreshCw, Truck, Package, Calendar, PoundSterling
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import type { SelectSupplier, SelectSupplierPurchase } from "@shared/schema";

// Form schema
const supplierFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  supplierType: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  website: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  postcode: z.string().optional(),
  country: z.string().optional(),
  companyNumber: z.string().optional(),
  vatNumber: z.string().optional(),
  notes: z.string().optional(),
});

type SupplierFormValues = z.infer<typeof supplierFormSchema>;

// Supplier types
const SUPPLIER_TYPES = [
  { value: "hop_merchant", label: "Hop Merchant" },
  { value: "maltster", label: "Maltster" },
  { value: "yeast_supplier", label: "Yeast Supplier" },
  { value: "packaging", label: "Packaging" },
  { value: "equipment", label: "Equipment" },
  { value: "chemicals", label: "Chemicals" },
  { value: "services", label: "Services" },
  { value: "distributor", label: "Distributor" },
  { value: "other", label: "Other" },
];

function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "£0.00";
  return `£${amount.toFixed(2)}`;
}

function formatDate(timestamp: number | null | undefined): string {
  if (!timestamp) return "-";
  return new Date(timestamp).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getSupplierTypeBadge(type: string | null | undefined): { label: string; variant: "default" | "secondary" | "outline" } {
  const typeInfo = SUPPLIER_TYPES.find(t => t.value === type);
  return {
    label: typeInfo?.label || type || "Unknown",
    variant: type ? "default" : "secondary",
  };
}

export default function CrmSuppliers() {
  const { user } = useUser();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  
  // Tab state
  const [activeTab, setActiveTab] = useState<"our" | "all">("our");
  
  // Dialog states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SelectSupplier | null>(null);
  const [deletingSupplier, setDeletingSupplier] = useState<SelectSupplier | null>(null);
  const [viewingSupplier, setViewingSupplier] = useState<SelectSupplier | null>(null);

  // Data fetching
  const { data: ourSuppliers = [], isLoading: loadingOur } = useSuppliers({ isOurSupplier: true });
  const { data: allSuppliers = [], isLoading: loadingAll } = useSuppliers();
  const { data: supplierPurchases = [], isLoading: loadingPurchases } = useSupplierPurchases(viewingSupplier?.id || null);

  // Mutations
  const createMutation = useCreateSupplier();
  const updateMutation = useUpdateSupplier();
  const deleteMutation = useDeleteSupplier();
  const syncMutation = useSyncXeroSuppliers();

  // Form
  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues: {
      name: "",
      supplierType: "",
      email: "",
      phone: "",
      website: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      postcode: "",
      country: "UK",
      companyNumber: "",
      vatNumber: "",
      notes: "",
    },
  });

  // Handle URL parameter for editing a specific supplier
  const [hasHandledEditId, setHasHandledEditId] = useState(false);
  useEffect(() => {
    if (hasHandledEditId) return;
    
    const params = new URLSearchParams(searchString);
    const editId = params.get('editId');
    if (editId && allSuppliers.length > 0) {
      const supplierToEdit = allSuppliers.find((s) => s.id === editId);
      if (supplierToEdit) {
        setHasHandledEditId(true);
        setTimeout(() => {
          handleEdit(supplierToEdit);
          setLocation('/suppliers', { replace: true });
        }, 0);
      }
    }
  }, [searchString, allSuppliers, hasHandledEditId]);

  // Current display data based on active tab
  const suppliers = activeTab === "our" ? ourSuppliers : allSuppliers;
  const isLoading = activeTab === "our" ? loadingOur : loadingAll;

  const handleEdit = (supplier: SelectSupplier) => {
    setEditingSupplier(supplier);
    form.reset({
      name: supplier.name || "",
      supplierType: supplier.supplierType || "",
      email: supplier.email || "",
      phone: supplier.phone || "",
      website: supplier.website || "",
      addressLine1: supplier.addressLine1 || "",
      addressLine2: supplier.addressLine2 || "",
      city: supplier.city || "",
      postcode: supplier.postcode || "",
      country: supplier.country || "UK",
      companyNumber: supplier.companyNumber || "",
      vatNumber: supplier.vatNumber || "",
      notes: supplier.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleAddNew = () => {
    setEditingSupplier(null);
    form.reset({
      name: "",
      supplierType: "",
      email: "",
      phone: "",
      website: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      postcode: "",
      country: "UK",
      companyNumber: "",
      vatNumber: "",
      notes: "",
    });
    setIsDialogOpen(true);
  };

  const handleViewPurchases = (supplierId: string) => {
    setLocation(`/purchases?supplierId=${supplierId}`);
  };

  const handleSync = async () => {
    try {
      await syncMutation.mutateAsync();
      toast({ title: "Suppliers synced from Xero successfully" });
    } catch (error: any) {
      toast({ 
        title: "Failed to sync suppliers", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  };

  const onSubmit = async (data: SupplierFormValues) => {
    try {
      if (editingSupplier) {
        await updateMutation.mutateAsync({ id: editingSupplier.id, ...data });
        toast({ title: "Supplier updated successfully" });
      } else {
        await createMutation.mutateAsync(data);
        toast({ title: "Supplier created successfully" });
      }
      setIsDialogOpen(false);
      setEditingSupplier(null);
      form.reset();
    } catch (error: any) {
      toast({ 
        title: editingSupplier ? "Failed to update supplier" : "Failed to create supplier", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  };

  const handleDelete = async () => {
    if (!deletingSupplier) return;
    try {
      await deleteMutation.mutateAsync(deletingSupplier.id);
      toast({ title: "Supplier deleted successfully" });
      setDeletingSupplier(null);
    } catch (error: any) {
      toast({ 
        title: "Failed to delete supplier", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  };

  // Calculate stats
  const totalSpend = ourSuppliers.reduce((sum, s) => sum + (s.totalPurchasesAmount || 0), 0);
  const totalPurchases = ourSuppliers.reduce((sum, s) => sum + (s.purchaseCount || 0), 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-semibold" data-testid="text-suppliers-title">Suppliers</h2>
          <p className="text-sm text-muted-foreground">Manage your supplier relationships and track spend</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleSync}
            disabled={syncMutation.isPending}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            Sync from Xero
          </Button>
          <Button onClick={handleAddNew} data-testid="button-add-supplier">
            <Plus className="w-4 h-4 mr-2" />
            Add Supplier
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Suppliers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ourSuppliers.length}</div>
            <p className="text-xs text-muted-foreground">active suppliers</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Spend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalSpend)}</div>
            <p className="text-xs text-muted-foreground">all time</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Purchases</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPurchases}</div>
            <p className="text-xs text-muted-foreground">bills recorded</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">From Xero</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {ourSuppliers.filter(s => s.xeroContactId).length}
            </div>
            <p className="text-xs text-muted-foreground">synced suppliers</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs and Table */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "our" | "all")}>
        <TabsList>
          <TabsTrigger value="our">
            Our Suppliers ({ourSuppliers.length})
          </TabsTrigger>
          <TabsTrigger value="all">
            All Suppliers ({allSuppliers.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
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
                    <TableHead>Type</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Total Spend</TableHead>
                    <TableHead>Last Purchase</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        <Truck className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>No suppliers found.</p>
                        <p className="text-sm">Add a supplier manually or sync from Xero.</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    suppliers.map((supplier) => {
                      const typeBadge = getSupplierTypeBadge(supplier.supplierType);
                      return (
                        <TableRow 
                          key={supplier.id} 
                          data-testid={`row-supplier-${supplier.id}`}
                          className="cursor-pointer hover:bg-muted/50 select-none"
                          onClick={(e) => {
                            const target = e.target as HTMLElement;
                            if (target.closest('button')) return;
                            setViewingSupplier(supplier);
                          }}
                        >
                          <TableCell>
                            <div className="font-medium">{supplier.name}</div>
                            {supplier.xeroContactId && (
                              <Badge variant="outline" className="text-xs text-green-600 mt-1">
                                Xero
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={typeBadge.variant}>
                              {typeBadge.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {[supplier.city, supplier.postcode].filter(Boolean).join(", ") || "-"}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(supplier.totalPurchasesAmount)}
                          </TableCell>
                          <TableCell>
                            {formatDate(supplier.lastPurchaseDate)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setViewingSupplier(supplier);
                                }}
                                title="View details"
                              >
                                <Package className="w-4 h-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEdit(supplier);
                                }}
                                title="Edit"
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeletingSupplier(supplier);
                                }}
                                title="Delete"
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
        </TabsContent>
      </Tabs>

      {/* Add/Edit Supplier Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingSupplier ? "Edit Supplier" : "Add Supplier"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier Name *</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="supplierType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SUPPLIER_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                        <Input {...field} type="email" value={field.value || ""} />
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
                        <Input {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="website"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Website</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} placeholder="https://" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              <FormField
                control={form.control}
                name="addressLine1"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address Line 1</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} />
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
                      <Input {...field} value={field.value || ""} />
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
                        <Input {...field} value={field.value || ""} />
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
                        <Input {...field} value={field.value || ""} />
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
                        <Input {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="companyNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Number</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="vatNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>VAT Number</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} />
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
                      <Textarea {...field} value={field.value || ""} rows={3} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {createMutation.isPending || updateMutation.isPending 
                    ? "Saving..." 
                    : editingSupplier ? "Update" : "Create"
                  }
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingSupplier} onOpenChange={() => setDeletingSupplier(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Supplier?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingSupplier?.name}"? 
              This will also delete all associated purchase records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Supplier Detail Dialog */}
      <Dialog open={!!viewingSupplier} onOpenChange={(open) => !open && setViewingSupplier(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5" />
              {viewingSupplier?.name}
              {viewingSupplier?.xeroContactId && (
                <Badge variant="outline" className="text-green-600 ml-2">
                  <ExternalLink className="w-3 h-3 mr-1" />
                  Synced from Xero
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {viewingSupplier && (
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="purchases">
                  Purchases ({viewingSupplier.purchaseCount || 0})
                </TabsTrigger>
                <TabsTrigger value="stats">Stats</TabsTrigger>
              </TabsList>

              {/* Details Tab */}
              <TabsContent value="details" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Contact Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {viewingSupplier.supplierType && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground w-20">Type:</span>
                          <Badge variant="secondary">
                            {getSupplierTypeBadge(viewingSupplier.supplierType).label}
                          </Badge>
                        </div>
                      )}
                      {viewingSupplier.email && (
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="w-4 h-4 text-muted-foreground" />
                          <a href={`mailto:${viewingSupplier.email}`} className="text-primary hover:underline">
                            {viewingSupplier.email}
                          </a>
                        </div>
                      )}
                      {viewingSupplier.phone && (
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="w-4 h-4 text-muted-foreground" />
                          <a href={`tel:${viewingSupplier.phone}`} className="hover:underline">
                            {viewingSupplier.phone}
                          </a>
                        </div>
                      )}
                      {viewingSupplier.website && (
                        <div className="flex items-center gap-2 text-sm">
                          <Globe className="w-4 h-4 text-muted-foreground" />
                          <a 
                            href={viewingSupplier.website} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-primary hover:underline"
                          >
                            {viewingSupplier.website}
                          </a>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        Address
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-sm space-y-1">
                        {viewingSupplier.addressLine1 && <div>{viewingSupplier.addressLine1}</div>}
                        {viewingSupplier.addressLine2 && <div>{viewingSupplier.addressLine2}</div>}
                        <div>
                          {[viewingSupplier.city, viewingSupplier.postcode].filter(Boolean).join(", ")}
                        </div>
                        {viewingSupplier.country && <div>{viewingSupplier.country}</div>}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {(viewingSupplier.companyNumber || viewingSupplier.vatNumber) && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Building2 className="w-4 h-4" />
                        Business Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4 text-sm">
                      {viewingSupplier.companyNumber && (
                        <div>
                          <span className="text-muted-foreground">Company No:</span>
                          <span className="ml-2 font-mono">{viewingSupplier.companyNumber}</span>
                        </div>
                      )}
                      {viewingSupplier.vatNumber && (
                        <div>
                          <span className="text-muted-foreground">VAT No:</span>
                          <span className="ml-2 font-mono">{viewingSupplier.vatNumber}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {viewingSupplier.notes && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Notes</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {viewingSupplier.notes}
                      </p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Purchases Tab */}
              <TabsContent value="purchases">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Purchase History</CardTitle>
                    <CardDescription>
                      Bills and invoices from this supplier
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {loadingPurchases ? (
                      <div className="space-y-2">
                        {[...Array(3)].map((_, i) => (
                          <Skeleton key={i} className="h-12 w-full" />
                        ))}
                      </div>
                    ) : supplierPurchases.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>No purchases found</p>
                        <p className="text-sm">Sync from Xero to import purchase history</p>
                      </div>
                    ) : (
                      <div className="border rounded-md">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Bill #</TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Amount</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {supplierPurchases.map((purchase) => (
                              <TableRow key={purchase.id}>
                                <TableCell className="font-medium">
                                  {purchase.xeroBillNumber || purchase.id.slice(0, 8)}
                                </TableCell>
                                <TableCell>
                                  {formatDate(purchase.purchaseDate)}
                                </TableCell>
                                <TableCell>
                                  <Badge variant={
                                    purchase.status === 'paid' ? 'default' :
                                    purchase.status === 'authorised' ? 'secondary' :
                                    'outline'
                                  }>
                                    {purchase.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  {formatCurrency(purchase.totalAmount)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Stats Tab */}
              <TabsContent value="stats">
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <PoundSterling className="w-4 h-4" />
                        Total Spend
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">
                        {formatCurrency(viewingSupplier.totalPurchasesAmount)}
                      </div>
                      <p className="text-xs text-muted-foreground">all time</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <ShoppingCart className="w-4 h-4" />
                        Purchase Count
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">
                        {viewingSupplier.purchaseCount || 0}
                      </div>
                      <p className="text-xs text-muted-foreground">total bills</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        First Purchase
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-xl font-bold">
                        {formatDate(viewingSupplier.firstPurchaseDate)}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        Last Purchase
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-xl font-bold">
                        {formatDate(viewingSupplier.lastPurchaseDate)}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {viewingSupplier.discoveredBy && (
                  <Card className="mt-4">
                    <CardHeader>
                      <CardTitle className="text-lg">Discovery</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Source:</span>
                        <Badge variant="outline">{viewingSupplier.discoveredBy}</Badge>
                      </div>
                      {viewingSupplier.discoveredAt && (
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-muted-foreground">Discovered:</span>
                          <span>{formatDate(viewingSupplier.discoveredAt)}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingSupplier(null)}>
              Close
            </Button>
            <Button onClick={() => {
              if (viewingSupplier) {
                handleEdit(viewingSupplier);
                setViewingSupplier(null);
              }
            }}>
              <Pencil className="w-4 h-4 mr-2" />
              Edit Supplier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

