/**
 * Price Books Page
 * 
 * Manage pricing tiers for different customer types.
 */

import { useState } from 'react';
import { Plus, BookOpen, PoundSterling, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePriceBooks } from '@/features/brewery/usePriceBooks';
import { PriceBooksList } from '@/features/brewery/PriceBooksList';
import { CreatePriceBookDialog } from '@/features/brewery/CreatePriceBookDialog';
import type { PriceBook } from '@/features/brewery/types';

export default function PriceBooks() {
  const { data: priceBooks, isLoading, error } = usePriceBooks();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingPriceBook, setEditingPriceBook] = useState<PriceBook | null>(null);

  const handleEdit = (priceBook: PriceBook) => {
    setEditingPriceBook(priceBook);
    setCreateDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    setCreateDialogOpen(open);
    if (!open) {
      setEditingPriceBook(null);
    }
  };

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error Loading Price Books</CardTitle>
            <CardDescription>
              {error instanceof Error ? error.message : 'An unexpected error occurred'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => window.location.reload()}>
              Reload Page
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Price Books</h1>
          <p className="text-muted-foreground mt-1">
            Manage pricing tiers for different customer types
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} size="lg">
          <Plus className="w-5 h-5 mr-2" />
          New Price Book
        </Button>
      </div>

      {/* Stats Cards */}
      {!isLoading && priceBooks && priceBooks.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Price Books</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{priceBooks.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Price Books</CardTitle>
              <PoundSterling className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {priceBooks.filter(pb => pb.isActive === 1).length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Default Price Book</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-medium truncate">
                {priceBooks.find(pb => pb.isDefault === 1)?.name || 'None set'}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-48 mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && (!priceBooks || priceBooks.length === 0) && (
        <Card className="border-dashed">
          <CardHeader className="text-center">
            <div className="mx-auto rounded-full bg-muted p-4 w-fit mb-4">
              <PoundSterling className="h-8 w-8 text-muted-foreground" />
            </div>
            <CardTitle>No price books yet</CardTitle>
            <CardDescription className="max-w-md mx-auto">
              Create your first price book to start managing customer-specific pricing. 
              Different pricing tiers help you serve trade, retail, and wholesale customers 
              with appropriate pricing.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => setCreateDialogOpen(true)} size="lg">
              <Plus className="w-5 h-5 mr-2" />
              Create Your First Price Book
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Price Books List */}
      {!isLoading && priceBooks && priceBooks.length > 0 && (
        <PriceBooksList priceBooks={priceBooks} onEdit={handleEdit} />
      )}

      {/* Create/Edit Dialog */}
      <CreatePriceBookDialog
        open={createDialogOpen}
        onOpenChange={handleDialogClose}
        editingPriceBook={editingPriceBook}
      />
    </div>
  );
}

