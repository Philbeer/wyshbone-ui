/**
 * Price Book Detail Page
 * 
 * Manage product prices for a specific price book.
 */

import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Save, Copy, Search, DollarSign, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { usePriceBook, useUpdatePriceBookPrices, useCopyPriceBookPrices, usePriceBooks } from '@/features/brewery/usePriceBooks';
import { formatPrice, isPriceBookDefault, isPriceBookActive } from '@/features/brewery/types';
import { useUser } from '@/contexts/UserContext';
import { apiRequest } from '@/lib/queryClient';

interface BrewProduct {
  id: string;
  name: string;
  sku: string | null;
  style: string | null;
  abv: number;
  defaultUnitPriceExVat: number | null;
  isActive: number;
}

export default function PriceBookDetail() {
  const params = useParams<{ id: string }>();
  const priceBookId = parseInt(params.id || '0');
  const { user } = useUser();
  const workspaceId = user.id;
  
  const { data: priceBook, isLoading: loadingPriceBook } = usePriceBook(priceBookId);
  const { data: allPriceBooks } = usePriceBooks();
  const updatePrices = useUpdatePriceBookPrices();
  const copyPrices = useCopyPriceBookPrices();
  
  // Fetch products
  const { data: products, isLoading: loadingProducts } = useQuery<BrewProduct[]>({
    queryKey: ['/api/brewcrm/products', workspaceId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/brewcrm/products/${workspaceId}`);
      return response.json();
    },
    enabled: !!workspaceId,
  });

  // Local state for price editing
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [sourcePriceBookId, setSourcePriceBookId] = useState<string>('');

  // Initialize prices from price book data
  useEffect(() => {
    if (priceBook?.productPrices) {
      const priceMap: Record<string, string> = {};
      priceBook.productPrices.forEach((pp) => {
        // Convert from pence to pounds for display
        priceMap[pp.productId] = (pp.price / 100).toFixed(2);
      });
      setPrices(priceMap);
      setHasChanges(false);
    }
  }, [priceBook]);

  // Filter products by search term
  const filteredProducts = useMemo(() => {
    if (!products) return [];
    if (!searchTerm) return products;
    
    const term = searchTerm.toLowerCase();
    return products.filter(p => 
      p.name.toLowerCase().includes(term) ||
      p.sku?.toLowerCase().includes(term) ||
      p.style?.toLowerCase().includes(term)
    );
  }, [products, searchTerm]);

  // Active products only
  const activeProducts = useMemo(() => {
    return filteredProducts.filter(p => p.isActive === 1);
  }, [filteredProducts]);

  const handlePriceChange = (productId: string, value: string) => {
    setPrices(prev => ({ ...prev, [productId]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    const productPrices = Object.entries(prices)
      .filter(([, price]) => price && parseFloat(price) > 0)
      .map(([productId, price]) => ({
        productId,
        price: Math.round(parseFloat(price) * 100), // Convert pounds to pence
      }));

    updatePrices.mutate(
      { priceBookId, productPrices },
      {
        onSuccess: () => {
          setHasChanges(false);
        },
      }
    );
  };

  const handleCopyPrices = () => {
    if (!sourcePriceBookId) return;
    
    copyPrices.mutate(
      { targetPriceBookId: priceBookId, sourcePriceBookId: parseInt(sourcePriceBookId) },
      {
        onSuccess: () => {
          setCopyDialogOpen(false);
          setSourcePriceBookId('');
        },
      }
    );
  };

  // Other price books to copy from
  const otherPriceBooks = allPriceBooks?.filter(pb => pb.id !== priceBookId) || [];

  if (loadingPriceBook || loadingProducts) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!priceBook) {
    return (
      <div className="container mx-auto py-6">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Price Book Not Found</CardTitle>
            <CardDescription>
              The price book you're looking for doesn't exist or you don't have access to it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/brew/price-books">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Price Books
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isDefault = isPriceBookDefault(priceBook);
  const isActive = isPriceBookActive(priceBook);

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/brew/price-books">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{priceBook.name}</h1>
            {isDefault && (
              <Badge className="bg-amber-100 text-amber-800">Default</Badge>
            )}
            {!isActive && (
              <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1">
            {priceBook.description || 'Manage product prices for this price book'}
          </p>
        </div>
        <div className="flex gap-2">
          {otherPriceBooks.length > 0 && (
            <Button variant="outline" onClick={() => setCopyDialogOpen(true)}>
              <Copy className="w-4 h-4 mr-2" />
              Copy Prices
            </Button>
          )}
          <Button 
            onClick={handleSave} 
            disabled={!hasChanges || updatePrices.isPending}
          >
            <Save className="w-4 h-4 mr-2" />
            {updatePrices.isPending ? 'Saving...' : 'Save Prices'}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Products with Prices</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Object.values(prices).filter(p => p && parseFloat(p) > 0).length}
            </div>
            <p className="text-xs text-muted-foreground">
              of {activeProducts.length} active products
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Active Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeProducts.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unsaved Changes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${hasChanges ? 'text-amber-600' : 'text-green-600'}`}>
              {hasChanges ? 'Yes' : 'No'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Product Prices Table */}
      <Card>
        <CardHeader>
          <CardTitle>Product Prices</CardTitle>
          <CardDescription>
            Set the price for each product in this price book. Prices are in £ (GBP).
          </CardDescription>
          <div className="flex items-center gap-2 pt-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>ABV</TableHead>
                  <TableHead>Default Price</TableHead>
                  <TableHead className="w-[160px]">Price Book Price (£)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      {searchTerm ? 'No products match your search.' : 'No active products found.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  activeProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div className="font-medium">{product.name}</div>
                        {product.style && (
                          <div className="text-sm text-muted-foreground">{product.style}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {product.sku || '-'}
                      </TableCell>
                      <TableCell>
                        {(product.abv / 100).toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {product.defaultUnitPriceExVat 
                          ? formatPrice(product.defaultUnitPriceExVat)
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={prices[product.id] || ''}
                          onChange={(e) => handlePriceChange(product.id, e.target.value)}
                          className="w-full"
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Copy Prices Dialog */}
      <Dialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy Prices from Another Price Book</DialogTitle>
            <DialogDescription>
              This will copy all product prices from the selected price book to "{priceBook.name}".
              Existing prices will be overwritten.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={sourcePriceBookId} onValueChange={setSourcePriceBookId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a price book to copy from..." />
              </SelectTrigger>
              <SelectContent>
                {otherPriceBooks.map((pb) => (
                  <SelectItem key={pb.id} value={pb.id.toString()}>
                    {pb.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCopyPrices}
              disabled={!sourcePriceBookId || copyPrices.isPending}
            >
              {copyPrices.isPending ? 'Copying...' : 'Copy Prices'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

