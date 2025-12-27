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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Minus, Warehouse, Package } from "lucide-react";
import { 
  getStock, adjustStock, getProducts,
  type BrewStock, type BrewProduct, type PackageType,
  DATA_SOURCE
} from "@/lib/brewcrmService";

export default function BrewCrmStockPage() {
  const { user } = useUser();
  const workspaceId = user.id;
  const { toast } = useToast();
  
  const [stock, setStock] = useState<BrewStock[]>(() => getStock(workspaceId));
  const products = useMemo(() => getProducts(workspaceId).filter(p => p.isActive), [workspaceId]);
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [adjustmentType, setAdjustmentType] = useState<'add' | 'remove'>('add');
  
  // Form state
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [location, setLocation] = useState<string>('warehouse');
  
  const refreshStock = () => {
    setStock(getStock(workspaceId));
  };
  
  const selectedProduct = useMemo(() => 
    products.find(p => p.id === selectedProductId),
    [products, selectedProductId]
  );
  
  const handleOpenAdjustment = (type: 'add' | 'remove') => {
    setAdjustmentType(type);
    setSelectedProductId('');
    setQuantity(1);
    setLocation('warehouse');
    setIsDialogOpen(true);
  };
  
  const handleSubmit = () => {
    if (!selectedProduct) {
      toast({ title: "Select a product", variant: "destructive" });
      return;
    }
    
    const adjustment = adjustmentType === 'add' ? quantity : -quantity;
    
    try {
      adjustStock(
        workspaceId,
        selectedProduct.id,
        selectedProduct.name,
        selectedProduct.packageType,
        selectedProduct.packageSizeLitres,
        adjustment,
        location
      );
      toast({ title: `Stock ${adjustmentType === 'add' ? 'added' : 'removed'}` });
      setIsDialogOpen(false);
      refreshStock();
    } catch (error) {
      toast({ title: "Failed to adjust stock", variant: "destructive" });
    }
  };
  
  // Group stock by product
  const stockByProduct = useMemo(() => {
    const grouped = new Map<string, BrewStock[]>();
    for (const s of stock) {
      const existing = grouped.get(s.productId) || [];
      existing.push(s);
      grouped.set(s.productId, existing);
    }
    return grouped;
  }, [stock]);
  
  const totalVolume = stock.reduce((sum, s) => sum + s.totalVolumeLitres, 0);
  const totalUnits = stock.reduce((sum, s) => sum + s.quantityUnits, 0);
  
  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-semibold">Stock</h1>
            <Badge variant="secondary">PARTIAL</Badge>
          </div>
          <p className="text-muted-foreground">
            Track inventory by product and package type. Adjust on delivery or manually.
          </p>
          <p className="text-xs text-muted-foreground mt-1">Data Source: {DATA_SOURCE}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleOpenAdjustment('remove')}>
            <Minus className="h-4 w-4 mr-2" />
            Remove Stock
          </Button>
          <Button onClick={() => handleOpenAdjustment('add')}>
            <Plus className="h-4 w-4 mr-2" />
            Add Stock
          </Button>
        </div>
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Volume</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalVolume.toFixed(0)}L</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Units</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUnits}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Products in Stock</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stockByProduct.size}</div>
          </CardContent>
        </Card>
      </div>
      
      {/* Stock Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Package</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="text-right">Volume (L)</TableHead>
                <TableHead className="text-right">Last Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stock.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    <Warehouse className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No stock recorded. Add stock to get started.</p>
                  </TableCell>
                </TableRow>
              ) : (
                stock.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.productName}</TableCell>
                    <TableCell className="capitalize">
                      {s.packageType} ({s.packageSizeLitres}L)
                    </TableCell>
                    <TableCell className="capitalize">{s.location}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={s.quantityUnits > 0 ? 'default' : 'secondary'}>
                        {s.quantityUnits}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{s.totalVolumeLitres.toFixed(1)}</TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm">
                      {new Date(s.lastUpdated).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      {/* Adjustment Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {adjustmentType === 'add' ? 'Add Stock' : 'Remove Stock'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Product *</Label>
              <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select product..." />
                </SelectTrigger>
                <SelectContent>
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.packageSizeLitres}L {p.packageType})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Quantity (units) *</Label>
              <Input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              />
              {selectedProduct && (
                <p className="text-sm text-muted-foreground mt-1">
                  = {(quantity * selectedProduct.packageSizeLitres).toFixed(1)}L total
                </p>
              )}
            </div>
            
            <div>
              <Label>Location</Label>
              <Select value={location} onValueChange={setLocation}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="warehouse">Warehouse</SelectItem>
                  <SelectItem value="coldstore">Cold Store</SelectItem>
                  <SelectItem value="conditioning">Conditioning</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleSubmit}
              variant={adjustmentType === 'remove' ? 'destructive' : 'default'}
            >
              {adjustmentType === 'add' ? 'Add' : 'Remove'} Stock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

