import { useState, useMemo } from "react";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, MapPin, ClipboardList, ArrowUp, ArrowDown, CheckCircle, Truck, Eye } from "lucide-react";
import { 
  getRoutes, upsertRoute, reorderRouteOrders, getOrders, markOrderDelivered,
  formatDate,
  type BrewRoute, type BrewOrder,
  DATA_SOURCE
} from "@/lib/brewcrmService";

const ROUTE_STATUSES: { value: BrewRoute['status']; label: string }[] = [
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
];

export default function BrewCrmRoutesPage() {
  const { user } = useUser();
  const workspaceId = user.id;
  const { toast } = useToast();
  
  const [routes, setRoutes] = useState<BrewRoute[]>(() => getRoutes(workspaceId));
  const allOrders = useMemo(() => getOrders(workspaceId), [workspaceId]);
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<BrewRoute | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  
  // Form state
  const [name, setName] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  
  const refreshRoutes = () => {
    setRoutes(getRoutes(workspaceId));
  };
  
  // Get unassigned orders (confirmed, not yet on a route)
  const unassignedOrders = useMemo(() => {
    const assignedIds = new Set(routes.flatMap(r => r.orderIds));
    return allOrders.filter(o => 
      o.status === 'confirmed' && 
      !assignedIds.has(o.id)
    );
  }, [allOrders, routes]);
  
  const selectedRoute = routes.find(r => r.id === selectedRouteId);
  const selectedRouteOrders = useMemo(() => {
    if (!selectedRoute) return [];
    return selectedRoute.orderIds
      .map(id => allOrders.find(o => o.id === id))
      .filter(Boolean) as BrewOrder[];
  }, [selectedRoute, allOrders]);
  
  const handleAddNew = () => {
    setEditingRoute(null);
    setName('');
    setDeliveryDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setSelectedOrderIds([]);
    setIsDialogOpen(true);
  };
  
  const handleEdit = (route: BrewRoute) => {
    setEditingRoute(route);
    setName(route.name);
    setDeliveryDate(new Date(route.deliveryDate).toISOString().split('T')[0]);
    setNotes(route.notes || '');
    setSelectedOrderIds(route.orderIds);
    setIsDialogOpen(true);
  };
  
  const handleSubmit = () => {
    if (!name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    
    try {
      upsertRoute(workspaceId, {
        id: editingRoute?.id,
        name,
        deliveryDate: new Date(deliveryDate).getTime(),
        notes,
        orderIds: selectedOrderIds,
        status: editingRoute?.status || 'planned',
      });
      toast({ title: editingRoute ? "Route updated" : "Route created" });
      setIsDialogOpen(false);
      refreshRoutes();
    } catch (error) {
      toast({ title: "Failed to save route", variant: "destructive" });
    }
  };
  
  const handleToggleOrder = (orderId: string) => {
    if (selectedOrderIds.includes(orderId)) {
      setSelectedOrderIds(selectedOrderIds.filter(id => id !== orderId));
    } else {
      setSelectedOrderIds([...selectedOrderIds, orderId]);
    }
  };
  
  const handleMoveOrder = (orderId: string, direction: 'up' | 'down') => {
    if (!selectedRoute) return;
    
    const ids = [...selectedRoute.orderIds];
    const idx = ids.indexOf(orderId);
    if (idx === -1) return;
    
    if (direction === 'up' && idx > 0) {
      [ids[idx], ids[idx - 1]] = [ids[idx - 1], ids[idx]];
    } else if (direction === 'down' && idx < ids.length - 1) {
      [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
    }
    
    reorderRouteOrders(workspaceId, selectedRoute.id, ids);
    refreshRoutes();
  };
  
  const handleMarkOrderDelivered = (orderId: string) => {
    markOrderDelivered(workspaceId, orderId);
    toast({ title: "Order marked delivered" });
    refreshRoutes();
  };
  
  const handleCompleteRoute = (routeId: string) => {
    const route = routes.find(r => r.id === routeId);
    if (route) {
      upsertRoute(workspaceId, {
        ...route,
        status: 'completed',
      });
      toast({ title: "Route completed" });
      refreshRoutes();
    }
  };
  
  const getStatusBadgeVariant = (status: BrewRoute['status']) => {
    switch (status) {
      case 'planned': return 'secondary';
      case 'in_progress': return 'default';
      case 'completed': return 'outline';
    }
  };
  
  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-semibold">Routes</h1>
            <Badge variant="secondary">PARTIAL</Badge>
          </div>
          <p className="text-muted-foreground">
            Create delivery routes, assign orders, and reorder stops.
          </p>
          <p className="text-xs text-muted-foreground mt-1">Data Source: {DATA_SOURCE}</p>
        </div>
        <Button onClick={handleAddNew}>
          <Plus className="h-4 w-4 mr-2" />
          New Route
        </Button>
      </div>
      
      <div className="grid grid-cols-2 gap-6">
        {/* Routes List */}
        <Card>
          <CardHeader>
            <CardTitle>Delivery Routes</CardTitle>
            <CardDescription>Click a route to view/edit stops</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Stops</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {routes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No routes yet.</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  routes.map(route => (
                    <TableRow 
                      key={route.id}
                      className={`cursor-pointer ${selectedRouteId === route.id ? 'bg-muted' : ''}`}
                      onClick={() => setSelectedRouteId(route.id)}
                    >
                      <TableCell className="font-medium">{route.name}</TableCell>
                      <TableCell>{formatDate(route.deliveryDate)}</TableCell>
                      <TableCell>{route.orderIds.length}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(route.status)}>
                          {route.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Link href={`/route-manifest/${route.id}`}>
                            <Button variant="ghost" size="icon" title="View Manifest">
                              <ClipboardList className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={(e) => { e.stopPropagation(); handleEdit(route); }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        
        {/* Selected Route Details */}
        <Card>
          <CardHeader>
            <CardTitle>
              {selectedRoute ? `Route: ${selectedRoute.name}` : 'Select a Route'}
            </CardTitle>
            {selectedRoute && (
              <CardDescription>
                {formatDate(selectedRoute.deliveryDate)} • {selectedRoute.orderIds.length} stops
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {!selectedRoute ? (
              <div className="text-center text-muted-foreground py-8">
                <Truck className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Select a route to view stops</p>
              </div>
            ) : (
              <div className="space-y-4">
                {selectedRoute.status !== 'completed' && (
                  <Button 
                    className="w-full" 
                    onClick={() => handleCompleteRoute(selectedRoute.id)}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Complete Route
                  </Button>
                )}
                
                <div className="space-y-2">
                  {selectedRouteOrders.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No orders assigned to this route.
                    </p>
                  ) : (
                    selectedRouteOrders.map((order, idx) => (
                      <div 
                        key={order.id}
                        className="flex items-center gap-2 p-3 border rounded-md bg-muted/30"
                      >
                        <div className="font-bold text-muted-foreground w-6">
                          {idx + 1}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium">{order.customerName}</div>
                          <div className="text-sm text-muted-foreground">
                            {order.orderNumber} • {order.totalVolumeLitres.toFixed(0)}L
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={idx === 0}
                            onClick={() => handleMoveOrder(order.id, 'up')}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={idx === selectedRouteOrders.length - 1}
                            onClick={() => handleMoveOrder(order.id, 'down')}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          {order.status !== 'delivered' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleMarkOrderDelivered(order.id)}
                              title="Mark Delivered"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        {order.status === 'delivered' && (
                          <Badge variant="outline">Delivered</Badge>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRoute ? "Edit Route" : "Create Route"}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Route Name *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Monday North"
                />
              </div>
              <div>
                <Label>Delivery Date *</Label>
                <Input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                />
              </div>
            </div>
            
            <div>
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Route notes..."
                rows={2}
              />
            </div>
            
            {/* Order Selection */}
            <div>
              <Label>Assign Orders</Label>
              <p className="text-sm text-muted-foreground mb-2">
                Select confirmed orders to add to this route
              </p>
              
              <div className="border rounded-md max-h-48 overflow-y-auto">
                {unassignedOrders.length === 0 && selectedOrderIds.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No confirmed orders available
                  </div>
                ) : (
                  <div className="divide-y">
                    {/* Show already selected orders */}
                    {selectedOrderIds.map(orderId => {
                      const order = allOrders.find(o => o.id === orderId);
                      if (!order) return null;
                      return (
                        <div 
                          key={order.id}
                          className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted bg-muted/50"
                          onClick={() => handleToggleOrder(order.id)}
                        >
                          <input
                            type="checkbox"
                            checked={true}
                            readOnly
                            className="h-4 w-4"
                          />
                          <div className="flex-1">
                            <span className="font-medium">{order.customerName}</span>
                            <span className="text-muted-foreground ml-2 text-sm">
                              {order.orderNumber}
                            </span>
                          </div>
                          <span className="text-sm">{order.totalVolumeLitres.toFixed(0)}L</span>
                        </div>
                      );
                    })}
                    {/* Show unassigned orders */}
                    {unassignedOrders.map(order => (
                      <div 
                        key={order.id}
                        className={`flex items-center gap-2 p-2 cursor-pointer hover:bg-muted ${
                          selectedOrderIds.includes(order.id) ? 'bg-muted/50' : ''
                        }`}
                        onClick={() => handleToggleOrder(order.id)}
                      >
                        <input
                          type="checkbox"
                          checked={selectedOrderIds.includes(order.id)}
                          readOnly
                          className="h-4 w-4"
                        />
                        <div className="flex-1">
                          <span className="font-medium">{order.customerName}</span>
                          <span className="text-muted-foreground ml-2 text-sm">
                            {order.orderNumber}
                          </span>
                        </div>
                        <span className="text-sm">{order.totalVolumeLitres.toFixed(0)}L</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedOrderIds.length} orders selected
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit}>
              {editingRoute ? "Update Route" : "Create Route"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

