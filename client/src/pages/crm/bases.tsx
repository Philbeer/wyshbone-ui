// Delivery Bases Management - Starting locations for delivery routes
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, MapPin, Star, Building2 } from "lucide-react";
import { Card } from "@/components/ui/card";

interface DeliveryBase {
  id: number;
  workspaceId: string;
  name: string;
  address: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postcode?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  isDefault: boolean;
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export default function DeliveryBasesPage() {
  const { user } = useUser();
  const workspaceId = user?.id;
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBase, setEditingBase] = useState<DeliveryBase | null>(null);
  const [deletingBaseId, setDeletingBaseId] = useState<number | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    postcode: "",
    country: "United Kingdom",
    isDefault: false,
    notes: "",
  });

  // Fetch bases
  const { data: basesData, isLoading } = useQuery({
    queryKey: ['/api/delivery-bases', workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/delivery-bases');
      return response.json();
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest('POST', '/api/delivery-bases', {
        ...data,
        address: buildFullAddress(data),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/delivery-bases'] });
      toast({ title: "Base created successfully" });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create base", description: error.message, variant: "destructive" });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: typeof formData & { id: number }) => {
      const response = await apiRequest('PUT', `/api/delivery-bases/${id}`, {
        ...data,
        address: buildFullAddress(data),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/delivery-bases'] });
      toast({ title: "Base updated successfully" });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update base", description: error.message, variant: "destructive" });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest('DELETE', `/api/delivery-bases/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/delivery-bases'] });
      toast({ title: "Base deleted successfully" });
      setDeletingBaseId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete base", description: error.message, variant: "destructive" });
    },
  });

  // Early return if user not loaded
  if (!user) {
    return (
      <div className="p-6">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const bases: DeliveryBase[] = basesData?.bases || [];

  const buildFullAddress = (data: typeof formData) => {
    return [data.addressLine1, data.addressLine2, data.city, data.postcode, data.country]
      .filter(Boolean)
      .join(", ");
  };

  const handleOpenDialog = (base?: DeliveryBase) => {
    if (base) {
      setEditingBase(base);
      setFormData({
        name: base.name || "",
        address: base.address || "",
        addressLine1: base.addressLine1 || "",
        addressLine2: base.addressLine2 || "",
        city: base.city || "",
        postcode: base.postcode || "",
        country: base.country || "United Kingdom",
        isDefault: base.isDefault || false,
        notes: base.notes || "",
      });
    } else {
      setEditingBase(null);
      setFormData({
        name: "",
        address: "",
        addressLine1: "",
        addressLine2: "",
        city: "",
        postcode: "",
        country: "United Kingdom",
        isDefault: bases.length === 0, // First base is default
        notes: "",
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingBase(null);
    setFormData({
      name: "",
      address: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      postcode: "",
      country: "United Kingdom",
      isDefault: false,
      notes: "",
    });
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (!formData.addressLine1.trim() && !formData.postcode.trim()) {
      toast({ title: "Address or postcode is required", variant: "destructive" });
      return;
    }

    if (editingBase) {
      updateMutation.mutate({ ...formData, id: editingBase.id });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleSetDefault = async (base: DeliveryBase) => {
    updateMutation.mutate({ ...base, isDefault: true, id: base.id });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Delivery Bases</h1>
          <p className="text-gray-500">Starting locations for delivery routes (depots, warehouses, breweries)</p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="w-4 h-4 mr-2" />
          Add Base
        </Button>
      </div>

      <Card className="p-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : bases.length === 0 ? (
          <div className="text-center py-12">
            <Building2 className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No delivery bases yet</h3>
            <p className="text-gray-500 mb-4">Add your first base location (e.g., your brewery or warehouse)</p>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="w-4 h-4 mr-2" />
              Add Base
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Postcode</TableHead>
                <TableHead>Coordinates</TableHead>
                <TableHead>Default</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bases.map((base) => (
                <TableRow key={base.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-gray-400" />
                      {base.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-xs truncate">
                      {base.addressLine1 || base.address}
                      {base.city && `, ${base.city}`}
                    </div>
                  </TableCell>
                  <TableCell>{base.postcode || "-"}</TableCell>
                  <TableCell>
                    {base.latitude && base.longitude ? (
                      <span className="text-xs text-gray-500">
                        {base.latitude.toFixed(4)}, {base.longitude.toFixed(4)}
                      </span>
                    ) : (
                      <Badge variant="outline" className="text-orange-600">
                        Not geocoded
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {base.isDefault ? (
                      <Badge className="bg-green-500">
                        <Star className="w-3 h-3 mr-1" />
                        Default
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleSetDefault(base)}
                      >
                        Set Default
                      </Button>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenDialog(base)}
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => setDeletingBaseId(base.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingBase ? "Edit Delivery Base" : "Add Delivery Base"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Main Brewery, London Depot"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="addressLine1">Address Line 1 *</Label>
              <Input
                id="addressLine1"
                placeholder="Street address"
                value={formData.addressLine1}
                onChange={(e) => setFormData({ ...formData, addressLine1: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="addressLine2">Address Line 2</Label>
              <Input
                id="addressLine2"
                placeholder="Building, unit, etc."
                value={formData.addressLine2}
                onChange={(e) => setFormData({ ...formData, addressLine2: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  placeholder="City"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="postcode">Postcode *</Label>
                <Input
                  id="postcode"
                  placeholder="e.g., BN1 1AA"
                  value={formData.postcode}
                  onChange={(e) => setFormData({ ...formData, postcode: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="isDefault"
                checked={formData.isDefault}
                onCheckedChange={(checked) => setFormData({ ...formData, isDefault: !!checked })}
              />
              <Label htmlFor="isDefault" className="font-normal">
                Set as default starting location for new routes
              </Label>
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Any additional notes..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editingBase ? "Save Changes" : "Add Base"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingBaseId} onOpenChange={() => setDeletingBaseId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Delivery Base?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove this base from your available starting locations.
              Any routes using this base will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deletingBaseId && deleteMutation.mutate(deletingBaseId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}



