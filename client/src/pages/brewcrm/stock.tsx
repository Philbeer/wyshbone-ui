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
import { Warehouse, Plus, Minus, Package } from "lucide-react";
import { getStock, adjustStock, formatDate, type StockItem } from "@/lib/brewcrmService";

export default function BrewCrmStock() {
  const { user } = useUser();
  const workspaceId = user.id;
  const { toast } = useToast();
  
  const [showDialog, setShowDialog] = useState(false);
  const [version, setVersion] = useState(0);
  
  // Form state
  const [formProductId, setFormProductId] = useState("");
  const [formProductName, setFormProductName] = useState("");
  const [formQuantity, setFormQuantity] = useState("");
  const [formLocation, setFormLocation] = useState("default");
  const [adjustmentType, setAdjustmentType] = useState<"add" | "remove">("add");
  
  const stockItems = useMemo(() => {
    return getStock(workspaceId).sort((a, b) => a.productName.localeCompare(b.productName));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, version]);
  
  const totalItems = stockItems.reduce((sum, item) => sum + item.quantity, 0);
  
  const openAddStock = () => {
    setAdjustmentType("add");
    setFormProductId("");
    setFormProductName("");
    setFormQuantity("");
    setFormLocation("default");
    setShowDialog(true);
  };
  
  const handleAdjust = () => {
    const qty = parseInt(formQuantity);
    if (isNaN(qty) || qty <= 0) {
      toast({ title: "Please enter a valid quantity", variant: "destructive" });
      return;
    }
    
    if (!formProductName.trim()) {
      toast({ title: "Please enter a product name", variant: "destructive" });
      return;
    }
    
    const adjustment = adjustmentType === "add" ? qty : -qty;
    adjustStock(
      workspaceId,
      formProductId || formProductName.toLowerCase().replace(/\s+/g, '_'),
      formProductName.trim(),
      adjustment,
      formLocation
    );
    
    setShowDialog(false);
    setVersion(v => v + 1);
    toast({ 
      title: adjustmentType === "add" ? "Stock added" : "Stock removed",
      description: `${Math.abs(adjustment)} x ${formProductName.trim()}`
    });
  };
  
  const quickAdjust = (item: StockItem, amount: number) => {
    adjustStock(workspaceId, item.productId, item.productName, amount, item.location);
    setVersion(v => v + 1);
  };
  
  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold flex items-center gap-2">
              <Warehouse className="h-6 w-6" />
              Stock
            </h2>
            <p className="text-sm text-muted-foreground">Track product inventory</p>
          </div>
          <Button onClick={openAddStock}>
            <Plus className="h-4 w-4 mr-2" />
            Add Stock
          </Button>
        </div>
      </div>
      
      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Package className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{stockItems.length}</p>
                <p className="text-sm text-muted-foreground">Products in stock</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Warehouse className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{totalItems}</p>
                <p className="text-sm text-muted-foreground">Total units</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Stock List */}
      <Card>
        <CardHeader>
          <CardTitle>Inventory</CardTitle>
        </CardHeader>
        <CardContent>
          {stockItems.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No stock recorded. Click "Add Stock" to start tracking.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead className="w-32"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockItems.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.productName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.location}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {item.quantity < 0 ? (
                        <span className="text-red-600">{item.quantity}</span>
                      ) : item.quantity === 0 ? (
                        <span className="text-muted-foreground">0</span>
                      ) : (
                        item.quantity
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(item.updatedAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => quickAdjust(item, -1)}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => quickAdjust(item, 1)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      
      {/* Add/Remove Stock Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {adjustmentType === "add" ? "Add Stock" : "Remove Stock"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Product Name *</Label>
              <Input 
                value={formProductName} 
                onChange={(e) => setFormProductName(e.target.value)}
                placeholder="e.g. Pale Ale 500ml"
              />
            </div>
            <div>
              <Label>Quantity *</Label>
              <Input 
                type="number"
                min="1"
                value={formQuantity} 
                onChange={(e) => setFormQuantity(e.target.value)}
                placeholder="e.g. 24"
              />
            </div>
            <div>
              <Label>Location</Label>
              <Input 
                value={formLocation} 
                onChange={(e) => setFormLocation(e.target.value)}
                placeholder="e.g. Warehouse A"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleAdjust}>
              {adjustmentType === "add" ? "Add Stock" : "Remove Stock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

