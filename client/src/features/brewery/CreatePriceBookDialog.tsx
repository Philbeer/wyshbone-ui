/**
 * Create/Edit Price Book Dialog
 * 
 * Dialog for creating a new price book or editing an existing one.
 */

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreatePriceBook, useUpdatePriceBook, usePriceBooks } from './usePriceBooks';
import type { PriceBook, CreatePriceBookData } from './types';

const formSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  description: z.string().optional(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  parentPriceBookId: z.string().optional(), // string because of Select value
  discountType: z.enum(['percentage', 'fixed', 'none']).optional(),
  discountValue: z.string().optional(), // string for input, converted to number
});

type FormValues = z.infer<typeof formSchema>;

interface CreatePriceBookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingPriceBook?: PriceBook | null;
}

export function CreatePriceBookDialog({ 
  open, 
  onOpenChange, 
  editingPriceBook 
}: CreatePriceBookDialogProps) {
  const createPriceBook = useCreatePriceBook();
  const updatePriceBook = useUpdatePriceBook();
  const { data: priceBooks } = usePriceBooks();
  
  const isEditing = !!editingPriceBook;
  const isSubmitting = createPriceBook.isPending || updatePriceBook.isPending;
  
  // Filter out the current price book from parent options
  const parentOptions = priceBooks?.filter(pb => 
    !editingPriceBook || pb.id !== editingPriceBook.id
  ) || [];

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      isDefault: false,
      isActive: true,
      parentPriceBookId: undefined,
      discountType: 'none',
      discountValue: '',
    },
  });

  // Reset form when dialog opens/closes or when editing different price book
  useEffect(() => {
    if (open) {
      if (editingPriceBook) {
        form.reset({
          name: editingPriceBook.name,
          description: editingPriceBook.description || '',
          isDefault: editingPriceBook.isDefault === 1,
          isActive: editingPriceBook.isActive === 1,
          parentPriceBookId: editingPriceBook.parentPriceBookId?.toString() || undefined,
          discountType: editingPriceBook.discountType as 'percentage' | 'fixed' | 'none' || 'none',
          discountValue: editingPriceBook.discountValue?.toString() || '',
        });
      } else {
        form.reset({
          name: '',
          description: '',
          isDefault: false,
          isActive: true,
          parentPriceBookId: undefined,
          discountType: 'none',
          discountValue: '',
        });
      }
    }
  }, [open, editingPriceBook, form]);

  const watchDiscountType = form.watch('discountType');
  const watchParentPriceBookId = form.watch('parentPriceBookId');

  const onSubmit = (values: FormValues) => {
    const data: CreatePriceBookData = {
      name: values.name,
      description: values.description || undefined,
      isDefault: values.isDefault,
      isActive: values.isActive,
      parentPriceBookId: values.parentPriceBookId ? parseInt(values.parentPriceBookId) : undefined,
      discountType: values.discountType === 'none' ? undefined : values.discountType,
      discountValue: values.discountValue && values.discountType !== 'none' 
        ? parseFloat(values.discountValue) 
        : undefined,
    };

    if (isEditing) {
      updatePriceBook.mutate(
        { id: editingPriceBook.id, data },
        {
          onSuccess: () => {
            onOpenChange(false);
          },
        }
      );
    } else {
      createPriceBook.mutate(data, {
        onSuccess: () => {
          onOpenChange(false);
        },
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Price Book' : 'Create Price Book'}</DialogTitle>
          <DialogDescription>
            {isEditing 
              ? 'Update the price book details below.' 
              : 'Create a new price book to manage customer-specific pricing.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Trade, Retail, Wholesale" {...field} />
                  </FormControl>
                  <FormDescription>
                    A descriptive name for this pricing tier.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Optional description for this price book..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="isDefault"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel>Default</FormLabel>
                      <FormDescription className="text-xs">
                        Use for new customers
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel>Active</FormLabel>
                      <FormDescription className="text-xs">
                        Available for use
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* Parent Price Book (for discount books) */}
            <FormField
              control={form.control}
              name="parentPriceBookId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Based On (Optional)</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    value={field.value || ''}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a parent price book..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="">None (standalone pricing)</SelectItem>
                      {parentOptions.map((pb) => (
                        <SelectItem key={pb.id} value={pb.id.toString()}>
                          {pb.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    If selected, this price book will apply a discount to the parent's prices.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Discount settings (only show if parent is selected) */}
            {watchParentPriceBookId && (
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="discountType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Discount Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || 'none'}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">No Discount</SelectItem>
                          <SelectItem value="percentage">Percentage</SelectItem>
                          <SelectItem value="fixed">Fixed Amount</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="discountValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Discount Value {watchDiscountType === 'percentage' ? '(%)' : '(£)'}
                      </FormLabel>
                      <FormControl>
                        <Input 
                          type="number"
                          step={watchDiscountType === 'percentage' ? '0.1' : '0.01'}
                          min="0"
                          placeholder={watchDiscountType === 'percentage' ? '10' : '5.00'}
                          {...field}
                          disabled={watchDiscountType === 'none'}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <DialogFooter className="pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting 
                  ? (isEditing ? 'Saving...' : 'Creating...') 
                  : (isEditing ? 'Save Changes' : 'Create Price Book')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

