import { useState, useMemo } from "react";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, ShoppingCart, RefreshCw, CheckCircle } from "lucide-react";
import { 
  getOrders, upsertOrder, getCustomers, getProducts, 
  getLockedRateForPeriod, computeDutyRate, markOrderDelivered,
  formatCurrency, formatDate,
  type BrewOrder, type BrewOrderLine, type BrewProduct, type BrewCustomer,
  DATA_SOURCE
} from "@/lib/brewcrmService";

const ORDER_STATUSES: { value: BrewOrder['status']; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'delivered', label: 'Delivered' },
];

interface OrderLineInput {
  productId: string;
  quantity: number;
}

export default function BrewCrmOrdersPage() {
  const { user } = useUser();
  const workspaceId = user.id;
  const { toast } = useToast();
  
  const [orders, setOrders] = useState<BrewOrder[]>(() => getOrders(workspaceId));
  const customers = useMemo(() => getCustomers(workspaceId), [workspaceId]);
  const products = useMemo(() => getProducts(workspaceId).filter(p => p.isActive), [workspaceId]);
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<BrewOrder | null>(null);
  
  // Form state
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [deliveryDate, setDeliveryDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isRepeat, setIsRepeat] = useState(false);
  const [repeatFrequency, setRepeatFrequency] = useState<'weekly' | 'fortnightly'>('weekly');
  const [lineInputs, setLineInputs] = useState<OrderLineInput[]>([]);
  
  const refreshOrders = () => {
    setOrders(getOrders(workspaceId));
  };
  
  const selectedCustomer = useMemo(() => 
    customers.find(c => c.id === selectedCustomerId),
    [customers, selectedCustomerId]
  );
  
  // Calculate order lines with duty
  const calculatedLines = useMemo<BrewOrderLine[]>(() => {
    return lineInputs.filter(l => l.productId && l.quantity > 0).map((input, idx) => {
      const product = products.find(p => p.id === input.productId);
      if (!product) return null;
      
      const volumeLitres = input.quantity * product.packageSizeLitres;
      const volumeHl = volumeLitres / 100;
      
      // Get locked rate or compute fresh
      const lockedRate = getLockedRateForPeriod(workspaceId, product.dutyCategoryKey, Date.now());
      let ratePerHl: number;
      if (lockedRate) {
        ratePerHl = lockedRate.ratePerHl;
      } else {
        // Use a default HLPA for computation (should be configured per brewery)
        const result = computeDutyRate(4500, product.dutyCategoryKey);
        ratePerHl = result.finalRatePerHl;
      }
      
      const dutyAmount = Math.round(volumeHl * ratePerHl);
      
      return {
        id: `line_${idx}`,
        orderId: editingOrder?.id || 'new',
        productId: product.id,
        productName: product.name,
        quantity: input.quantity,
        packageSizeLitres: product.packageSizeLitres,
        volumeLitres,
        dutyAmount,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    }).filter(Boolean) as BrewOrderLine[];
  }, [lineInputs, products, workspaceId, editingOrder]);
  
  const orderTotals = useMemo(() => ({
    totalVolume: calculatedLines.reduce((sum, l) => sum + l.volumeLitres, 0),
    totalDuty: calculatedLines.reduce((sum, l) => sum + l.dutyAmount, 0),
  }), [calculatedLines]);
  
  const handleAddNew = () => {
    setEditingOrder(null);
    setSelectedCustomerId('');
    setDeliveryDate('');
    setNotes('');
    setIsRepeat(false);
    setRepeatFrequency('weekly');
    setLineInputs([{ productId: '', quantity: 1 }]);
    setIsDialogOpen(true);
  };
  
  const handleEdit = (order: BrewOrder) => {
    setEditingOrder(order);
    setSelectedCustomerId(order.customerId);
    setDeliveryDate(order.deliveryDate ? new Date(order.deliveryDate).toISOString().split('T')[0] : '');
    setNotes(order.notes || '');
    setIsRepeat(order.isRepeat);
    setRepeatFrequency(order.repeatFrequency || 'weekly');
    setLineInputs(order.lines.map(l => ({ productId: l.productId, quantity: l.quantity })));
    setIsDialogOpen(true);
  };
  
  const handleAddLine = () => {
    setLineInputs([...lineInputs, { productId: '', quantity: 1 }]);
  };
  
  const handleRemoveLine = (idx: number) => {
    setLineInputs(lineInputs.filter((_, i) => i !== idx));
  };
  
  const handleLineChange = (idx: number, field: keyof OrderLineInput, value: string | number) => {
    const newLines = [...lineInputs];
    newLines[idx] = { ...newLines[idx], [field]: value };
    setLineInputs(newLines);
  };
  
  const handleSubmit = () => {
    if (!selectedCustomerId) {
      toast({ title: "Please select a customer", variant: "destructive" });
      return;
    }
    if (calculatedLines.length === 0) {
      toast({ title: "Add at least one product", variant: "destructive" });
      return;
    }
    
    try {
      upsertOrder(workspaceId, {
        id: editingOrder?.id,
        customerId: selectedCustomerId,
        customerName: selectedCustomer?.name || '',
        status: editingOrder?.status || 'draft',
        deliveryDate: deliveryDate ? new Date(deliveryDate).getTime() : undefined,
        notes,
        isRepeat,
        repeatFrequency: isRepeat ? repeatFrequency : undefined,
        lines: calculatedLines,
      });
      toast({ title: editingOrder ? "Order updated" : "Order created" });
      setIsDialogOpen(false);
      refreshOrders();
    } catch (error) {
      toast({ title: "Failed to save order", variant: "destructive" });
    }
  };
  
  const handleMarkDelivered = (orderId: string) => {
    markOrderDelivered(workspaceId, orderId);
    toast({ title: "Order marked as delivered" });
    refreshOrders();
  };
  
  const getStatusBadgeVariant = (status: BrewOrder['status']) => {
    switch (status) {
      case 'draft': return 'secondary';
      case 'confirmed': return 'default';
      case 'delivered': return 'outline';
    }
  };
  
  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-semibold">Orders</h1>
            <Badge variant="secondary">PARTIAL</Badge>
          </div>
          <p className="text-muted-foreground">
            Create orders with automatic duty calculation from locked or computed rates.
          </p>
          <p className="text-xs text-muted-foreground mt-1">Data Source: {DATA_SOURCE}</p>
        </div>
        <Button onClick={handleAddNew} disabled={customers.length === 0}>
          <Plus className="h-4 w-4 mr-2" />
          New Order
        </Button>
      </div>
      
      {customers.length === 0 && (
        <Card className="mb-6 border-yellow-500/50 bg-yellow-500/10">
          <CardContent className="pt-4">
            <p className="text-sm">Create customers before creating orders.</p>
          </CardContent>
        </Card>
      )}
      
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orders.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Draft</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orders.filter(o => o.status === 'draft').length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Confirmed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orders.filter(o => o.status === 'confirmed').length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Repeat Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              {orders.filter(o => o.isRepeat).length}
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Orders Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Delivery Date</TableHead>
                <TableHead className="text-right">Volume (L)</TableHead>
                <TableHead className="text-right">Duty</TableHead>
                <TableHead>Repeat</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No orders yet. Create your first order.</p>
                  </TableCell>
                </TableRow>
              ) : (
                orders.map(order => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-sm">{order.orderNumber}</TableCell>
                    <TableCell>{order.customerName}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(order.status)}>
                        {order.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {order.deliveryDate ? formatDate(order.deliveryDate) : '-'}
                    </TableCell>
                    <TableCell className="text-right">{order.totalVolumeLitres.toFixed(1)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(order.totalDutyAmount)}</TableCell>
                    <TableCell>
                      {order.isRepeat && (
                        <Badge variant="outline" className="flex items-center gap-1 w-fit">
                          <RefreshCw className="h-3 w-3" />
                          {order.repeatFrequency}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {order.status === 'confirmed' && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleMarkDelivered(order.id)}
                            title="Mark Delivered"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(order)}>
                          <Pencil className="h-4 w-4" />
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
      
      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingOrder ? "Edit Order" : "Create Order"}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Customer *</Label>
                <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer..." />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
            
            {/* Repeat Order Toggle */}
            <Card className="bg-muted/30">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Repeat Order</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically generate draft orders on a schedule
                    </p>
                  </div>
                  <Switch checked={isRepeat} onCheckedChange={setIsRepeat} />
                </div>
                {isRepeat && (
                  <div className="mt-4">
                    <Label>Frequency</Label>
                    <Select value={repeatFrequency} onValueChange={(v: 'weekly' | 'fortnightly') => setRepeatFrequency(v)}>
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="fortnightly">Fortnightly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* Order Lines */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <Label>Products</Label>
                <Button variant="outline" size="sm" onClick={handleAddLine}>
                  <Plus className="h-3 w-3 mr-1" />
                  Add Line
                </Button>
              </div>
              
              <div className="space-y-2">
                {lineInputs.map((line, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <Select 
                      value={line.productId || 'none'} 
                      onValueChange={(v) => handleLineChange(idx, 'productId', v === 'none' ? '' : v)}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select product..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" disabled>Select product...</SelectItem>
                        {products.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} ({p.packageSizeLitres}L {p.packageType})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="1"
                      value={line.quantity}
                      onChange={(e) => handleLineChange(idx, 'quantity', parseInt(e.target.value) || 1)}
                      className="w-24"
                      placeholder="Qty"
                    />
                    <Button variant="ghost" size="icon" onClick={() => handleRemoveLine(idx)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              
              {products.length === 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  Create products before adding order lines.
                </p>
              )}
            </div>
            
            {/* Calculated Summary */}
            {calculatedLines.length > 0 && (
              <Card className="bg-muted/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Order Summary (Auto-Calculated)</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Volume (L)</TableHead>
                        <TableHead className="text-right">Duty</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {calculatedLines.map(line => (
                        <TableRow key={line.id}>
                          <TableCell>{line.productName}</TableCell>
                          <TableCell className="text-right">{line.quantity}</TableCell>
                          <TableCell className="text-right">{line.volumeLitres.toFixed(1)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(line.dutyAmount)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-bold bg-muted/50">
                        <TableCell>TOTAL</TableCell>
                        <TableCell></TableCell>
                        <TableCell className="text-right">{orderTotals.totalVolume.toFixed(1)}L</TableCell>
                        <TableCell className="text-right">{formatCurrency(orderTotals.totalDuty)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
            
            <div>
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Order notes..."
                rows={2}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit}>
              {editingOrder ? "Update Order" : "Create Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

