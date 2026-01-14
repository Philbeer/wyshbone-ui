/**
 * Customer Price Book Selector
 * 
 * A reusable component for assigning customers to price books.
 */

import { useActivePriceBooks, useUpdateCustomerPriceBook } from './usePriceBooks';
import { isPriceBookDefault, formatDiscountValue } from './types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Star } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface CustomerPriceBookSelectorProps {
  customerId: string;
  currentPriceBookId: number | null;
  onChange?: (priceBookId: number | null) => void;
  disabled?: boolean;
}

export function CustomerPriceBookSelector({
  customerId,
  currentPriceBookId,
  onChange,
  disabled = false,
}: CustomerPriceBookSelectorProps) {
  const { data: priceBooks, isLoading } = useActivePriceBooks();
  const updatePriceBook = useUpdateCustomerPriceBook();

  const handleChange = (value: string) => {
    const newPriceBookId = value === 'default' ? null : parseInt(value);
    
    updatePriceBook.mutate(
      { customerId, priceBookId: newPriceBookId },
      {
        onSuccess: () => {
          onChange?.(newPriceBookId);
        },
      }
    );
  };

  if (isLoading) {
    return <Skeleton className="h-10 w-full" />;
  }

  const currentValue = currentPriceBookId?.toString() || 'default';

  return (
    <Select 
      value={currentValue} 
      onValueChange={handleChange}
      disabled={disabled || updatePriceBook.isPending}
    >
      <SelectTrigger>
        <SelectValue placeholder="Select price book..." />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="default">
          <span className="flex items-center gap-2">
            Default Pricing
          </span>
        </SelectItem>
        {priceBooks?.map((book) => (
          <SelectItem key={book.id} value={book.id.toString()}>
            <span className="flex items-center gap-2">
              {book.name}
              {isPriceBookDefault(book) && (
                <Badge variant="outline" className="text-xs">
                  <Star className="w-3 h-3 mr-1" />
                  Default
                </Badge>
              )}
              {book.discountType && book.discountValue && (
                <Badge variant="secondary" className="text-xs">
                  {formatDiscountValue(book.discountType, book.discountValue)}
                </Badge>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Standalone price book select (for forms - doesn't auto-save)
 */
interface PriceBookSelectProps {
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
}

export function PriceBookSelect({ value, onChange, disabled }: PriceBookSelectProps) {
  const { data: priceBooks, isLoading } = useActivePriceBooks();

  const handleChange = (selectValue: string) => {
    onChange(selectValue === 'default' ? null : parseInt(selectValue));
  };

  if (isLoading) {
    return <Skeleton className="h-10 w-full" />;
  }

  const currentValue = value?.toString() || 'default';

  return (
    <Select 
      value={currentValue} 
      onValueChange={handleChange}
      disabled={disabled}
    >
      <SelectTrigger>
        <SelectValue placeholder="Select price book..." />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="default">
          Default Pricing
        </SelectItem>
        {priceBooks?.map((book) => (
          <SelectItem key={book.id} value={book.id.toString()}>
            <span className="flex items-center gap-2">
              {book.name}
              {isPriceBookDefault(book) && (
                <Badge variant="outline" className="text-xs ml-1">Default</Badge>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

