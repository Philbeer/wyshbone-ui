import { useState, useMemo } from "react";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShoppingCart, Plus, Search, Check } from "lucide-react";
import { 
  getOrders, getCustomers, upsertOrder, markOrderDelivered,
  formatDate, formatCurrency,
  type BrewOrder, type BrewCustomer
} from "@/lib/brewcrmService";

export default function BrewCrmOrders() {
  const { user } = useUser();
  const workspaceId = user.id;
  const { toast } = useToast();
  
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showDialog, setShowDialog] = useState(false);
  const [version, setVersion] = useState(0);
  
  // Form state
  const [formCustomerId, setFormCustomerId] = useState("");
  const [formDeliveryDate, setFormDeliveryDate] = useState("");
  const [formNotes, setFormNotes] = useState("");
  
  const customers = useMemo(() => getCustomers(workspaceId), [workspaceId, version]);
  
  const orders = useMemo(() => {
    let result = getOrders(workspaceId);
    
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(o => o.customerName.toLowerCase().includes(q));
    }
    
    if (statusFilter !== "all") {
      result = result.filter(o => o.status === statusFilter);
    }
    
    return result.sort((a, b) => b.createdAt - a.createdAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, search, statusFilter, version]);
  
  const openNew = () => {
    setFormCustomerId("");
    setFormDeliveryDate("");
    setFormNotes("");
    setShowDialog(true);
  };
  
  const handleSave = () => {
    if (!formCustomerId) {
      toast({ title: "Please select a customer", variant: "destructive" });
      return;
    }
    
    const customer = customers.find(c => c.id === formCustomerId);
    if (!customer) return;
    
    upsertOrder(workspaceId, {
      customerId: formCustomerId,
      customerName: customer.name,
      deliveryDate: formDeliveryDate ? new Date(formDeliveryDate).getTime() : undefined,
      notes: formNotes.trim() || undefined,
      status: 'draft',
    });
    
    setShowDialog(false);
    setVersion(v => v + 1);
    toast({ title: "Order created" });
  };
  
  const handleMarkDelivered = (orderId: string) => {
    markOrderDelivered(workspaceId, orderId);
    setVersion(v => v + 1);
    toast({ title: "Order marked as delivered" });
  };
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft': return <Badge variant="secondary">Draft</Badge>;
      case 'confirmed': return <Badge variant="default">Confirmed</Badge>;
      case 'delivered': return <Badge className="bg-green-600">Delivered</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };
  
  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold flex items-center gap-2">
              <ShoppingCart className="h-6 w-6" />
              Orders
            </h2>
            <p className="text-sm text-muted-foreground">Manage customer orders</p>
          </div>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-2" />
            New Order
          </Button>
        </div>
      </div>
      
      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by customer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      
      {/* Order List */}
      <Card>
        <CardHeader>
          <CardTitle>{orders.length} Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No orders found. Click "New Order" to create one.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Delivery Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map(order => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.customerName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {order.deliveryDate ? formatDate(order.deliveryDate) : "-"}
                    </TableCell>
                    <TableCell>{getStatusBadge(order.status)}</TableCell>
                    <TableCell>{formatCurrency(order.totalAmount)}</TableCell>
                    <TableCell>
                      {order.status !== 'delivered' && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleMarkDelivered(order.id)}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Deliver
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      
      {/* New Order Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Customer *</Label>
              <Select value={formCustomerId} onValueChange={setFormCustomerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {customers.length === 0 && (
                <p className="text-sm text-muted-foreground mt-1">
                  No customers yet. Add a customer first.
                </p>
              )}
            </div>
            <div>
              <Label>Delivery Date</Label>
              <Input 
                type="date" 
                value={formDeliveryDate} 
                onChange={(e) => setFormDeliveryDate(e.target.value)} 
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={formNotes} onChange={(e) => setFormNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={customers.length === 0}>Create Order</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

