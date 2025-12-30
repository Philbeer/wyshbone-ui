/**
 * Price Books List Component
 * 
 * Displays all price books as cards with actions.
 */

import { useState } from 'react';
import { Edit, Trash2, DollarSign, Star, MoreVertical, Copy } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'wouter';
import { useDeletePriceBook } from './usePriceBooks';
import { isPriceBookDefault, isPriceBookActive, formatDiscountValue } from './types';
import type { PriceBook } from './types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface PriceBooksListProps {
  priceBooks: PriceBook[];
  onEdit?: (priceBook: PriceBook) => void;
}

export function PriceBooksList({ priceBooks, onEdit }: PriceBooksListProps) {
  const deletePriceBook = useDeletePriceBook();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [priceBookToDelete, setPriceBookToDelete] = useState<PriceBook | null>(null);

  const handleDeleteClick = (priceBook: PriceBook) => {
    setPriceBookToDelete(priceBook);
    setDeleteDialogOpen(true);
  };

  const handleDelete = () => {
    if (priceBookToDelete) {
      deletePriceBook.mutate(priceBookToDelete.id, {
        onSuccess: () => {
          setDeleteDialogOpen(false);
          setPriceBookToDelete(null);
        },
      });
    }
  };

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {priceBooks.map((book) => {
          const isDefault = isPriceBookDefault(book);
          const isActive = isPriceBookActive(book);
          
          return (
            <Card 
              key={book.id} 
              className={`transition-all hover:shadow-md ${!isActive ? 'opacity-60' : ''}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-1">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      {book.name}
                      {isDefault && (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                          <Star className="w-3 h-3 mr-1 fill-current" />
                          Default
                        </Badge>
                      )}
                      {!isActive && (
                        <Badge variant="outline" className="text-muted-foreground">
                          Inactive
                        </Badge>
                      )}
                    </CardTitle>
                    {book.description && (
                      <CardDescription className="text-sm line-clamp-2">
                        {book.description}
                      </CardDescription>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                        <span className="sr-only">Open menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit?.(book)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit Details
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/brew/price-books/${book.id}`}>
                          <DollarSign className="mr-2 h-4 w-4" />
                          Manage Prices
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => handleDeleteClick(book)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-3">
                  {/* Discount info if this is a discount book */}
                  {book.parentPriceBookId && book.discountType && (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">
                        Discount: {formatDiscountValue(book.discountType, book.discountValue)}
                        {book.discountType === 'percentage' ? ' off parent' : ' off'}
                      </Badge>
                    </div>
                  )}

                  {/* Main action button */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    asChild
                  >
                    <Link href={`/brew/price-books/${book.id}`}>
                      <DollarSign className="w-4 h-4 mr-2" />
                      Manage Product Prices
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Price Book?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>"{priceBookToDelete?.name}"</strong> and all 
              associated product prices. Customers assigned to this price book will revert to 
              the default pricing.
              <br /><br />
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletePriceBook.isPending ? 'Deleting...' : 'Delete Price Book'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

