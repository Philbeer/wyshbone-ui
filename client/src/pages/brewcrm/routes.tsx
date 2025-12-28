import { useState, useMemo } from "react";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Plus, FileText, Check, Truck } from "lucide-react";
import { 
  getRoutes, getOrders, upsertRoute, addOrderToRoute, completeRoute,
  formatDate,
  type DeliveryRoute, type BrewOrder
} from "@/lib/brewcrmService";

export default function BrewCrmRoutes() {
  const { user } = useUser();
  const workspaceId = user.id;
  const { toast } = useToast();
  
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  
  // Form state
  const [formName, setFormName] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formOrderId, setFormOrderId] = useState("");
  
  const routes = useMemo(() => {
    return getRoutes(workspaceId).sort((a, b) => b.deliveryDate - a.deliveryDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, version]);
  
  const unassignedOrders = useMemo(() => {
    return getOrders(workspaceId)
      .filter(o => !o.routeId && o.status !== 'delivered')
      .sort((a, b) => a.customerName.localeCompare(b.customerName));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, version]);
  
  const openNew = () => {
    setFormName("");
    setFormDate(new Date().toISOString().split('T')[0]);
    setShowNewDialog(true);
  };
  
  const handleSaveRoute = () => {
    if (!formName.trim()) {
      toast({ title: "Route name is required", variant: "destructive" });
      return;
    }
    
    upsertRoute(workspaceId, {
      name: formName.trim(),
      deliveryDate: formDate ? new Date(formDate).getTime() : Date.now(),
    });
    
    setShowNewDialog(false);
    setVersion(v => v + 1);
    toast({ title: "Route created" });
  };
  
  const openAssign = (routeId: string) => {
    setSelectedRouteId(routeId);
    setFormOrderId("");
    setShowAssignDialog(true);
  };
  
  const handleAssignOrder = () => {
    if (!selectedRouteId || !formOrderId) return;
    
    addOrderToRoute(workspaceId, selectedRouteId, formOrderId);
    setShowAssignDialog(false);
    setVersion(v => v + 1);
    toast({ title: "Order added to route" });
  };
  
  const handleCompleteRoute = (routeId: string) => {
    completeRoute(workspaceId, routeId);
    setVersion(v => v + 1);
    toast({ title: "Route completed - all orders marked as delivered" });
  };
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'planned': return <Badge variant="secondary">Planned</Badge>;
      case 'in_progress': return <Badge variant="default">In Progress</Badge>;
      case 'completed': return <Badge className="bg-green-600">Completed</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };
  
  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold flex items-center gap-2">
              <MapPin className="h-6 w-6" />
              Delivery Routes
            </h2>
            <p className="text-sm text-muted-foreground">Plan and manage delivery routes</p>
          </div>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-2" />
            New Route
          </Button>
        </div>
      </div>
      
      {/* Route List */}
      <Card>
        <CardHeader>
          <CardTitle>{routes.length} Routes</CardTitle>
        </CardHeader>
        <CardContent>
          {routes.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No routes yet. Click "New Route" to create one.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Route Name</TableHead>
                  <TableHead>Delivery Date</TableHead>
                  <TableHead>Orders</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-48"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {routes.map(route => (
                  <TableRow key={route.id}>
                    <TableCell className="font-medium">{route.name}</TableCell>
                    <TableCell>{formatDate(route.deliveryDate)}</TableCell>
                    <TableCell>{route.orderIds.length} orders</TableCell>
                    <TableCell>{getStatusBadge(route.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/brew/route-manifest/${route.id}`}>
                            <FileText className="h-4 w-4 mr-1" />
                            Manifest
                          </Link>
                        </Button>
                        {route.status !== 'completed' && (
                          <>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => openAssign(route.id)}
                            >
                              <Truck className="h-4 w-4 mr-1" />
                              Add
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleCompleteRoute(route.id)}
                            >
                              <Check className="h-4 w-4 mr-1" />
                              Complete
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      
      {/* New Route Dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Route</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Route Name *</Label>
              <Input 
                value={formName} 
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Monday Deliveries"
              />
            </div>
            <div>
              <Label>Delivery Date</Label>
              <Input 
                type="date" 
                value={formDate} 
                onChange={(e) => setFormDate(e.target.value)} 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveRoute}>Create Route</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Assign Order Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Order to Route</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Select Order</Label>
              <Select value={formOrderId} onValueChange={setFormOrderId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an order" />
                </SelectTrigger>
                <SelectContent>
                  {unassignedOrders.map(o => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.customerName} - {o.deliveryDate ? formatDate(o.deliveryDate) : 'No date'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {unassignedOrders.length === 0 && (
                <p className="text-sm text-muted-foreground mt-1">
                  No unassigned orders available.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignDialog(false)}>Cancel</Button>
            <Button onClick={handleAssignOrder} disabled={!formOrderId}>Add to Route</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

