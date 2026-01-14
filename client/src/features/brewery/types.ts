/**
 * Price Books Types
 * 
 * TypeScript types for the price books feature.
 */

export interface PriceBook {
  id: number;
  workspaceId: string;
  name: string;
  description: string | null;
  isDefault: number; // 0 or 1
  parentPriceBookId: number | null;
  discountType: string | null; // 'percentage' | 'fixed'
  discountValue: number | null; // basis points for %, pence for fixed
  isActive: number; // 0 or 1
  createdAt: number;
  updatedAt: number;
}

export interface ProductPrice {
  id: number;
  workspaceId: string;
  productId: string;
  priceBookId: number;
  price: number; // in pence
  createdAt: number;
  updatedAt: number;
}

export interface PriceBand {
  id: number;
  workspaceId: string;
  priceBookId: number;
  productId: string | null; // null = applies to all products
  minQuantity: number;
  maxQuantity: number | null; // null = no upper limit
  discountType: string; // 'percentage' | 'fixed'
  discountValue: number; // basis points for %, pence for fixed
  createdAt: number;
}

export interface PriceBookWithPrices extends PriceBook {
  productPrices: ProductPrice[];
  priceBands: PriceBand[];
}

export interface CreatePriceBookData {
  name: string;
  description?: string;
  isDefault?: boolean;
  parentPriceBookId?: number;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  isActive?: boolean;
}

export interface UpdatePriceBookData extends Partial<CreatePriceBookData> {}

export interface ProductPriceUpdate {
  productId: string;
  price: number;
}

export interface EffectivePrice {
  price: number;
  priceBookName: string | null;
  priceBookId: number | null;
}

// Helper functions
export function isPriceBookDefault(priceBook: PriceBook): boolean {
  return priceBook.isDefault === 1;
}

export function isPriceBookActive(priceBook: PriceBook): boolean {
  return priceBook.isActive === 1;
}

export function formatPrice(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export function formatDiscountValue(type: string | null, value: number | null): string {
  if (!type || value === null) return '-';
  if (type === 'percentage') {
    return `${(value / 100).toFixed(1)}%`;
  }
  return formatPrice(value);
}

