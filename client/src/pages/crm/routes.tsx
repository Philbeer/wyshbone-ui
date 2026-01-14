// Route Planner - List and manage delivery routes
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus, MapPin, Truck, Calendar, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DeliveryBase {
  id: number;
  name: string;
  address: string;
  latitude?: number;
  longitude?: number;
  isDefault: boolean;
}

export default function RoutePlanner() {
  const { user } = useUser();
  const workspaceId = user?.id;
  const { toast } = useToast();
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [routeName, setRouteName] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [startBaseId, setStartBaseId] = useState<string>("");
  const [endBaseId, setEndBaseId] = useState<string>("same"); // "same" = return to start

  // Fetch routes
  const { data: routesData, isLoading: isLoadingRoutes } = useQuery({
    queryKey: ['/api/routes', workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/routes/${workspaceId}`);
      return response.json();
    },
  });

  // Fetch delivery bases for route creation
  const { data: basesData } = useQuery({
    queryKey: ['/api/delivery-bases', workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/delivery-bases');
      return response.json();
    },
  });

  // Fetch orders for route creation
  const { data: ordersData } = useQuery({
    queryKey: ['/api/crm/orders', workspaceId],
    enabled: !!workspaceId && isCreateDialogOpen,
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/crm/orders/${workspaceId}`);
      return response.json();
    },
  });

  // Fetch selected route details
  const { data: routeDetail } = useQuery({
    queryKey: ['/api/routes/detail', selectedRouteId],
    enabled: !!selectedRouteId,
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/routes/detail/${selectedRouteId}`);
      return response.json();
    },
  });

  // Create route mutation
  const createRouteMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/routes/create', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/routes'] });
      toast({ title: "Route created successfully" });
      setIsCreateDialogOpen(false);
      setSelectedOrders([]);
      setRouteName("");
      setDeliveryDate("");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create route", description: error.message, variant: "destructive" });
    },
  });

  // Optimize route mutation
  const optimizeRouteMutation = useMutation({
    mutationFn: (routeId: string) => apiRequest('PUT', `/api/routes/${routeId}/optimize`, {}),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/routes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/routes/detail'] });
      const results = data.optimizationResults;
      toast({
        title: "Route optimized successfully",
        description: `Saved ${results.distanceSavedMiles?.toFixed(1)} miles (${results.distanceSavedPercent?.toFixed(0)}%)`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to optimize route", description: error.message, variant: "destructive" });
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

  const bases: DeliveryBase[] = basesData?.bases || [];
  const defaultBase = bases.find(b => b.isDefault) || bases[0];

  // Set default base when dialog opens
  const handleOpenCreateDialog = () => {
    setIsCreateDialogOpen(true);
    if (defaultBase && !startBaseId) {
      setStartBaseId(String(defaultBase.id));
    }
  };

  const handleCreateRoute = () => {
    if (!routeName || !deliveryDate || selectedOrders.length === 0) {
      toast({ title: "Please fill in all fields", variant: "destructive" });
      return;
    }

    if (bases.length > 0 && !startBaseId) {
      toast({ title: "Please select a starting location", variant: "destructive" });
      return;
    }

    // Find the selected bases
    const startBase = bases.find(b => b.id === parseInt(startBaseId));
    const endBase = endBaseId === "same" ? startBase : bases.find(b => b.id === parseInt(endBaseId));

    createRouteMutation.mutate({
      name: routeName,
      deliveryDate: new Date(deliveryDate).getTime(),
      orderIds: selectedOrders,
      optimizeImmediately: true,
      startBaseId: startBase?.id,
      endBaseId: endBaseId === "same" ? null : endBase?.id,
      startLocation: startBase ? {
        name: startBase.name,
        latitude: startBase.latitude,
        longitude: startBase.longitude,
      } : undefined,
    });
  };

  const handleOptimize = (routeId: string) => {
    optimizeRouteMutation.mutate(routeId);
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: "bg-gray-500",
      optimized: "bg-blue-500",
      assigned: "bg-purple-500",
      in_progress: "bg-yellow-500",
      completed: "bg-green-500",
      cancelled: "bg-red-500",
    };
    return colors[status] || "bg-gray-500";
  };

  const routes = routesData?.routes || [];
  const orders = Array.isArray(ordersData) ? ordersData : (ordersData?.orders || []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Route Planner</h1>
          <p className="text-gray-500">Manage delivery routes and optimize for efficiency</p>
        </div>
        <Button onClick={handleOpenCreateDialog}>
          <Plus className="w-4 h-4 mr-2" />
          Create Route
        </Button>
      </div>

      {/* No bases warning */}
      {bases.length === 0 && (
        <Card className="p-4 border-orange-200 bg-orange-50">
          <div className="flex items-center gap-3">
            <MapPin className="w-5 h-5 text-orange-600" />
            <div>
              <p className="font-medium text-orange-800">No delivery bases configured</p>
              <p className="text-sm text-orange-600">
                Add a starting location (depot/warehouse) in the <a href="/auth/crm/bases" className="underline">Bases</a> page for route optimization.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Routes List */}
      <Card className="p-4">
        {isLoadingRoutes ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : routes.length === 0 ? (
          <div className="text-center py-12">
            <Truck className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No routes yet</h3>
            <p className="text-gray-500 mb-4">Create your first delivery route to get started</p>
            <Button onClick={handleOpenCreateDialog}>
              <Plus className="w-4 h-4 mr-2" />
              Create Route
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Stops</TableHead>
                <TableHead>Distance</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {routes.map((route: any) => (
                <TableRow
                  key={route.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => setSelectedRouteId(route.id)}
                >
                  <TableCell className="font-medium">{route.name}</TableCell>
                  <TableCell>
                    {new Date(route.deliveryDate).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(route.status)}>
                      {route.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {route.completedStops}/{route.totalStops}
                  </TableCell>
                  <TableCell>
                    {route.totalDistanceMiles?.toFixed(1) || "-"} mi
                  </TableCell>
                  <TableCell>{route.driverName || "Unassigned"}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {!route.isOptimized && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOptimize(route.id)}
                        disabled={optimizeRouteMutation.isPending}
                      >
                        <Zap className="w-3 h-3 mr-1" />
                        Optimize
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Route Details Dialog */}
      {selectedRouteId && routeDetail && (
        <Dialog open={!!selectedRouteId} onOpenChange={() => setSelectedRouteId(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{routeDetail.route.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Status</Label>
                  <Badge className={getStatusColor(routeDetail.route.status)}>
                    {routeDetail.route.status}
                  </Badge>
                </div>
                <div>
                  <Label>Date</Label>
                  <p>{new Date(routeDetail.route.deliveryDate).toLocaleDateString()}</p>
                </div>
                <div>
                  <Label>Total Distance</Label>
                  <p>{routeDetail.route.totalDistanceMiles?.toFixed(1) || "-"} miles</p>
                </div>
                <div>
                  <Label>Estimated Duration</Label>
                  <p>{routeDetail.route.estimatedDurationMinutes || "-"} minutes</p>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Stops ({routeDetail.stops.length})</h3>
                <div className="space-y-2">
                  {routeDetail.stops.map((stop: any, index: number) => (
                    <div
                      key={stop.id}
                      className="flex items-center gap-3 p-3 border rounded"
                    >
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-semibold">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{stop.customerName}</p>
                        <p className="text-sm text-gray-500">
                          {stop.addressLine1}, {stop.city}
                        </p>
                      </div>
                      <Badge className={getStatusColor(stop.status)}>
                        {stop.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Create Route Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Delivery Route</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Route Name</Label>
                <Input
                  value={routeName}
                  onChange={(e) => setRouteName(e.target.value)}
                  placeholder="e.g., Morning Deliveries"
                />
              </div>
              <div>
                <Label>Delivery Date</Label>
                <Input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                />
              </div>
            </div>

            {/* Base selection */}
            {bases.length > 0 && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start Location</Label>
                  <Select value={startBaseId} onValueChange={setStartBaseId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select starting point" />
                    </SelectTrigger>
                    <SelectContent>
                      {bases.map((base) => (
                        <SelectItem key={base.id} value={String(base.id)}>
                          <div className="flex items-center gap-2">
                            <MapPin className="w-3 h-3" />
                            {base.name}
                            {base.isDefault && <Badge variant="outline" className="ml-1 text-xs">Default</Badge>}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Return Location</Label>
                  <Select value={endBaseId} onValueChange={setEndBaseId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select return point" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="same">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3 h-3" />
                          Same as start (round trip)
                        </div>
                      </SelectItem>
                      {bases.map((base) => (
                        <SelectItem key={base.id} value={String(base.id)}>
                          <div className="flex items-center gap-2">
                            <MapPin className="w-3 h-3" />
                            {base.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div>
              <Label>Select Orders ({selectedOrders.length} selected)</Label>
              <div className="border rounded p-3 max-h-64 overflow-y-auto space-y-2">
                {!orders || orders.length === 0 ? (
                  <p className="text-gray-500 text-sm">No orders available</p>
                ) : (
                  orders.map((order: any) => (
                    <label
                      key={order.id}
                      className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedOrders.includes(order.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedOrders([...selectedOrders, order.id]);
                          } else {
                            setSelectedOrders(selectedOrders.filter(id => id !== order.id));
                          }
                        }}
                      />
                      <div className="flex-1">
                        <p className="font-medium">{order.orderNumber}</p>
                        <p className="text-sm text-gray-500">
                          {order.customerName || `Customer ${order.customerId}`}
                        </p>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateRoute}
                disabled={createRouteMutation.isPending}
              >
                {createRouteMutation.isPending ? "Creating..." : "Create & Optimize Route"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
