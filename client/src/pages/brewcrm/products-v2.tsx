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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Archive, Package } from "lucide-react";
import { 
  getProducts, upsertProduct, archiveProduct, deriveProductFields,
  type BrewProduct, type ProductType, type PackageType,
  DATA_SOURCE
} from "@/lib/brewcrmService";

const PRODUCT_TYPES: { value: ProductType; label: string }[] = [
  { value: 'beer', label: 'Beer' },
  { value: 'cider', label: 'Cider' },
];

const PACKAGE_TYPES: { value: PackageType; label: string; isDraught: boolean }[] = [
  { value: 'cask', label: 'Cask', isDraught: true },
  { value: 'keg', label: 'Keg', isDraught: true },
  { value: 'bag-in-box', label: 'Bag-in-Box', isDraught: true },
  { value: 'can', label: 'Can', isDraught: false },
  { value: 'bottle', label: 'Bottle', isDraught: false },
];

interface ProductFormData {
  name: string;
  productType: ProductType;
  abv: number;
  packageType: PackageType;
  packageSizeLitres: number;
  style?: string;
  sku?: string;
}

const defaultFormData: ProductFormData = {
  name: '',
  productType: 'beer',
  abv: 4.5,
  packageType: 'cask',
  packageSizeLitres: 40.9,
  style: '',
  sku: '',
};

export default function BrewCrmProductsPage() {
  const { user } = useUser();
  const workspaceId = user.id;
  const { toast } = useToast();
  
  const [products, setProducts] = useState<BrewProduct[]>(() => getProducts(workspaceId));
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<BrewProduct | null>(null);
  const [formData, setFormData] = useState<ProductFormData>(defaultFormData);
  const [archivingProductId, setArchivingProductId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  
  // Computed derived fields preview
  const derivedPreview = useMemo(() => {
    return deriveProductFields(formData.productType, formData.abv, formData.packageType);
  }, [formData.productType, formData.abv, formData.packageType]);
  
  const filteredProducts = useMemo(() => {
    return products.filter(p => showArchived || p.isActive);
  }, [products, showArchived]);
  
  const refreshProducts = () => {
    setProducts(getProducts(workspaceId));
  };
  
  const handleAddNew = () => {
    setEditingProduct(null);
    setFormData(defaultFormData);
    setIsDialogOpen(true);
  };
  
  const handleEdit = (product: BrewProduct) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      productType: product.productType,
      abv: product.abv,
      packageType: product.packageType,
      packageSizeLitres: product.packageSizeLitres,
      style: product.style || '',
      sku: product.sku || '',
    });
    setIsDialogOpen(true);
  };
  
  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    
    try {
      upsertProduct(workspaceId, {
        id: editingProduct?.id,
        ...formData,
        isActive: editingProduct?.isActive ?? true,
      });
      toast({ title: editingProduct ? "Product updated" : "Product created" });
      setIsDialogOpen(false);
      refreshProducts();
    } catch (error) {
      toast({ title: "Failed to save product", variant: "destructive" });
    }
  };
  
  const handleArchive = () => {
    if (archivingProductId) {
      archiveProduct(workspaceId, archivingProductId);
      toast({ title: "Product archived" });
      setArchivingProductId(null);
      refreshProducts();
    }
  };
  
  const activeCount = products.filter(p => p.isActive).length;
  const archivedCount = products.filter(p => !p.isActive).length;
  
  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-semibold">Products</h1>
            <Badge variant="default">LIVE</Badge>
          </div>
          <p className="text-muted-foreground">
            Manage brewery products with automatic duty category derivation.
          </p>
          <p className="text-xs text-muted-foreground mt-1">Data Source: {DATA_SOURCE}</p>
        </div>
        <Button onClick={handleAddNew}>
          <Plus className="h-4 w-4 mr-2" />
          Add Product
        </Button>
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Products</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Archived</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">{archivedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <Button 
              variant={showArchived ? "secondary" : "outline"} 
              size="sm"
              onClick={() => setShowArchived(!showArchived)}
            >
              {showArchived ? "Showing All" : "Show Archived"}
            </Button>
          </CardContent>
        </Card>
      </div>
      
      {/* Products Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>ABV</TableHead>
                <TableHead>Package</TableHead>
                <TableHead>Draught?</TableHead>
                <TableHead>ABV Band</TableHead>
                <TableHead>Duty Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No products found. Create your first product to get started.</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredProducts.map(product => (
                  <TableRow key={product.id} className={!product.isActive ? "opacity-50" : ""}>
                    <TableCell className="font-medium">
                      {product.name}
                      {product.style && <span className="text-muted-foreground text-sm ml-1">({product.style})</span>}
                    </TableCell>
                    <TableCell className="capitalize">{product.productType}</TableCell>
                    <TableCell>{product.abv.toFixed(1)}%</TableCell>
                    <TableCell className="capitalize">
                      {product.packageType} ({product.packageSizeLitres}L)
                    </TableCell>
                    <TableCell>
                      <Badge variant={product.isDraught ? "default" : "outline"}>
                        {product.isDraught ? "Yes" : "No"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {product.abvBand === 'lt_3_5' && '< 3.5%'}
                      {product.abvBand === '3_5_to_8_5' && '3.5% - 8.5%'}
                      {product.abvBand === 'gt_8_5' && '> 8.5%'}
                    </TableCell>
                    <TableCell className="text-sm max-w-48 truncate" title={product.displayDutyCategory}>
                      {product.displayDutyCategory}
                    </TableCell>
                    <TableCell>
                      <Badge variant={product.isActive ? "default" : "secondary"}>
                        {product.isActive ? "Active" : "Archived"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(product)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {product.isActive && (
                          <Button variant="ghost" size="icon" onClick={() => setArchivingProductId(product.id)}>
                            <Archive className="h-4 w-4" />
                          </Button>
                        )}
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Edit Product" : "Add Product"}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Product Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Best Bitter"
                />
              </div>
              <div>
                <Label>Style (optional)</Label>
                <Input
                  value={formData.style}
                  onChange={(e) => setFormData({ ...formData, style: e.target.value })}
                  placeholder="e.g., English Bitter"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Product Type *</Label>
                <Select 
                  value={formData.productType} 
                  onValueChange={(v: ProductType) => setFormData({ ...formData, productType: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCT_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>ABV (%) *</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="20"
                  value={formData.abv}
                  onChange={(e) => setFormData({ ...formData, abv: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Package Type *</Label>
                <Select 
                  value={formData.packageType} 
                  onValueChange={(v: PackageType) => setFormData({ ...formData, packageType: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PACKAGE_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label} {t.isDraught ? "(Draught)" : "(Non-Draught)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Package Size (litres) *</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={formData.packageSizeLitres}
                  onChange={(e) => setFormData({ ...formData, packageSizeLitres: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
            
            <div>
              <Label>SKU (optional)</Label>
              <Input
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                placeholder="e.g., BB-CASK-40"
              />
            </div>
            
            {/* Derived Fields Preview */}
            <Card className="bg-muted/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Derived Duty Fields (Read-Only)</CardTitle>
                <CardDescription className="text-xs">
                  These are computed automatically from product type, ABV, and package type
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Draught:</span>
                  <Badge variant={derivedPreview.isDraught ? "default" : "outline"}>
                    {derivedPreview.isDraught ? "Yes" : "No"}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ABV Band:</span>
                  <span>
                    {derivedPreview.abvBand === 'lt_3_5' && '< 3.5%'}
                    {derivedPreview.abvBand === '3_5_to_8_5' && '3.5% - 8.5%'}
                    {derivedPreview.abvBand === 'gt_8_5' && '> 8.5%'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Duty Category Key:</span>
                  <code className="text-xs bg-muted px-1 rounded">{derivedPreview.dutyCategoryKey}</code>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Display Category:</span>
                  <span>{derivedPreview.displayDutyCategory}</span>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit}>
              {editingProduct ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Archive Confirmation */}
      <AlertDialog open={!!archivingProductId} onOpenChange={() => setArchivingProductId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Product?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the product as inactive. It won't appear in new orders but historical data will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive}>Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

