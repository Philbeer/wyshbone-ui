/**
 * Status Utilities for BrewCRM
 * 
 * Consistent status-to-color mapping for badges and UI elements.
 */

/**
 * Tailwind CSS class combinations for status badges.
 */
export type StatusColorClasses = string;

/**
 * Status categories for different entity types.
 */
export type BatchStatus = 'planned' | 'in_progress' | 'fermenting' | 'packaging' | 'packaged' | 'cancelled';
export type OrderStatus = 'draft' | 'confirmed' | 'dispatched' | 'delivered' | 'cancelled';
export type ContainerStatus = 'at_brewery' | 'with_customer' | 'in_transit' | 'lost' | 'retired';
export type DeliveryRunStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled';
export type InventoryStockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

/**
 * General status type covering all possible values.
 */
export type AnyStatus = 
  | BatchStatus 
  | OrderStatus 
  | ContainerStatus 
  | DeliveryRunStatus 
  | InventoryStockStatus 
  | string;

/**
 * Gets Tailwind CSS classes for a status badge.
 * Returns background and text color classes suitable for a Badge component.
 * 
 * @param status - The status string
 * @returns Tailwind CSS classes
 * 
 * @example
 * getStatusColor('confirmed') // "bg-blue-100 text-blue-800"
 * getStatusColor('cancelled') // "bg-red-100 text-red-800"
 */
export function getStatusColor(status: AnyStatus): StatusColorClasses {
  switch (status.toLowerCase().replace(/[_-]/g, '_')) {
    // Success states (green)
    case 'active':
    case 'delivered':
    case 'finished':
    case 'packaged':
    case 'completed':
    case 'ready':
    case 'in_stock':
      return 'bg-green-100 text-green-800';

    // Warning/In-progress states (yellow/amber)
    case 'pending':
    case 'brewing':
    case 'fermenting':
    case 'conditioning':
    case 'in_progress':
    case 'packaging':
    case 'low_stock':
      return 'bg-yellow-100 text-yellow-800';

    // Error/Cancelled states (red)
    case 'overdue':
    case 'cancelled':
    case 'lost':
    case 'out_of_stock':
      return 'bg-red-100 text-red-800';

    // Info/Confirmed states (blue)
    case 'confirmed':
    case 'dispatched':
    case 'in_transit':
      return 'bg-blue-100 text-blue-800';

    // Neutral/Draft states (gray)
    case 'draft':
    case 'planned':
    case 'at_brewery':
    case 'retired':
    case 'with_customer':
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

/**
 * Gets shadcn/ui Badge variant for a status.
 * 
 * @param status - The status string
 * @returns Badge variant name
 */
export function getStatusBadgeVariant(
  status: AnyStatus
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status.toLowerCase().replace(/[_-]/g, '_')) {
    // Success states
    case 'active':
    case 'delivered':
    case 'finished':
    case 'packaged':
    case 'completed':
    case 'ready':
    case 'in_stock':
    case 'confirmed':
      return 'default';

    // Error states
    case 'cancelled':
    case 'lost':
    case 'overdue':
    case 'out_of_stock':
      return 'destructive';

    // In-progress states
    case 'in_progress':
    case 'fermenting':
    case 'packaging':
    case 'dispatched':
    case 'in_transit':
    case 'with_customer':
      return 'outline';

    // Neutral/pending states
    case 'draft':
    case 'planned':
    case 'pending':
    case 'at_brewery':
    case 'retired':
    case 'brewing':
    case 'conditioning':
    case 'low_stock':
    default:
      return 'secondary';
  }
}

/**
 * Formats a status string for display (replaces underscores with spaces, capitalizes).
 * 
 * @param status - The status string
 * @returns Formatted status string
 * 
 * @example
 * formatStatus('in_progress') // "In Progress"
 * formatStatus('at_brewery') // "At Brewery"
 */
export function formatStatus(status: AnyStatus): string {
  return status
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Gets batch status options for select dropdowns.
 */
export function getBatchStatusOptions(): Array<{ value: BatchStatus; label: string }> {
  return [
    { value: 'planned', label: 'Planned' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'fermenting', label: 'Fermenting' },
    { value: 'packaging', label: 'Packaging' },
    { value: 'packaged', label: 'Packaged' },
    { value: 'cancelled', label: 'Cancelled' },
  ];
}

/**
 * Gets order status options for select dropdowns.
 */
export function getOrderStatusOptions(): Array<{ value: OrderStatus; label: string }> {
  return [
    { value: 'draft', label: 'Draft' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'dispatched', label: 'Dispatched' },
    { value: 'delivered', label: 'Delivered' },
    { value: 'cancelled', label: 'Cancelled' },
  ];
}

/**
 * Gets container status options for select dropdowns.
 */
export function getContainerStatusOptions(): Array<{ value: ContainerStatus; label: string }> {
  return [
    { value: 'at_brewery', label: 'At Brewery' },
    { value: 'with_customer', label: 'With Customer' },
    { value: 'in_transit', label: 'In Transit' },
    { value: 'lost', label: 'Lost' },
    { value: 'retired', label: 'Retired' },
  ];
}

/**
 * Gets delivery run status options for select dropdowns.
 */
export function getDeliveryRunStatusOptions(): Array<{ value: DeliveryRunStatus; label: string }> {
  return [
    { value: 'planned', label: 'Planned' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
  ];
}

