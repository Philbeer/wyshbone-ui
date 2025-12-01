import { describe, it, expect } from 'vitest';
import {
  getStatusColor,
  getStatusBadgeVariant,
  formatStatus,
  getBatchStatusOptions,
  getOrderStatusOptions,
  getContainerStatusOptions,
  getDeliveryRunStatusOptions,
} from '../status';

describe('getStatusColor', () => {
  describe('success states (green)', () => {
    it.each(['active', 'delivered', 'finished', 'packaged', 'completed', 'ready', 'in_stock'])(
      'returns green for %s',
      (status) => {
        expect(getStatusColor(status)).toBe('bg-green-100 text-green-800');
      }
    );
  });

  describe('warning states (yellow)', () => {
    it.each(['pending', 'brewing', 'fermenting', 'conditioning', 'in_progress', 'packaging', 'low_stock'])(
      'returns yellow for %s',
      (status) => {
        expect(getStatusColor(status)).toBe('bg-yellow-100 text-yellow-800');
      }
    );
  });

  describe('error states (red)', () => {
    it.each(['overdue', 'cancelled', 'lost', 'out_of_stock'])(
      'returns red for %s',
      (status) => {
        expect(getStatusColor(status)).toBe('bg-red-100 text-red-800');
      }
    );
  });

  describe('info states (blue)', () => {
    it.each(['confirmed', 'dispatched', 'in_transit'])(
      'returns blue for %s',
      (status) => {
        expect(getStatusColor(status)).toBe('bg-blue-100 text-blue-800');
      }
    );
  });

  describe('neutral states (gray)', () => {
    it.each(['draft', 'planned', 'at_brewery', 'retired', 'with_customer'])(
      'returns gray for %s',
      (status) => {
        expect(getStatusColor(status)).toBe('bg-gray-100 text-gray-800');
      }
    );
  });

  it('handles case insensitivity', () => {
    expect(getStatusColor('CONFIRMED')).toBe('bg-blue-100 text-blue-800');
    expect(getStatusColor('Delivered')).toBe('bg-green-100 text-green-800');
  });

  it('handles hyphens', () => {
    expect(getStatusColor('in-progress')).toBe('bg-yellow-100 text-yellow-800');
    expect(getStatusColor('out-of-stock')).toBe('bg-red-100 text-red-800');
  });

  it('returns gray for unknown statuses', () => {
    expect(getStatusColor('unknown_status')).toBe('bg-gray-100 text-gray-800');
  });
});

describe('getStatusBadgeVariant', () => {
  describe('default variant (success states)', () => {
    it.each(['active', 'delivered', 'finished', 'packaged', 'completed', 'ready', 'in_stock', 'confirmed'])(
      'returns default for %s',
      (status) => {
        expect(getStatusBadgeVariant(status)).toBe('default');
      }
    );
  });

  describe('destructive variant (error states)', () => {
    it.each(['cancelled', 'lost', 'overdue', 'out_of_stock'])(
      'returns destructive for %s',
      (status) => {
        expect(getStatusBadgeVariant(status)).toBe('destructive');
      }
    );
  });

  describe('outline variant (in-progress states)', () => {
    it.each(['in_progress', 'fermenting', 'packaging', 'dispatched', 'in_transit', 'with_customer'])(
      'returns outline for %s',
      (status) => {
        expect(getStatusBadgeVariant(status)).toBe('outline');
      }
    );
  });

  describe('secondary variant (pending states)', () => {
    it.each(['draft', 'planned', 'pending', 'at_brewery', 'retired', 'brewing', 'conditioning', 'low_stock'])(
      'returns secondary for %s',
      (status) => {
        expect(getStatusBadgeVariant(status)).toBe('secondary');
      }
    );
  });
});

describe('formatStatus', () => {
  it('replaces underscores with spaces', () => {
    expect(formatStatus('in_progress')).toBe('In Progress');
    expect(formatStatus('at_brewery')).toBe('At Brewery');
    expect(formatStatus('out_of_stock')).toBe('Out Of Stock');
  });

  it('replaces hyphens with spaces', () => {
    expect(formatStatus('in-progress')).toBe('In Progress');
  });

  it('capitalizes each word', () => {
    expect(formatStatus('draft')).toBe('Draft');
    expect(formatStatus('confirmed')).toBe('Confirmed');
  });
});

describe('status option functions', () => {
  describe('getBatchStatusOptions', () => {
    it('returns all batch status options', () => {
      const options = getBatchStatusOptions();
      expect(options).toHaveLength(6);
      expect(options.map(o => o.value)).toContain('planned');
      expect(options.map(o => o.value)).toContain('in_progress');
      expect(options.map(o => o.value)).toContain('fermenting');
      expect(options.map(o => o.value)).toContain('packaging');
      expect(options.map(o => o.value)).toContain('packaged');
      expect(options.map(o => o.value)).toContain('cancelled');
    });

    it('has human-readable labels', () => {
      const options = getBatchStatusOptions();
      const inProgress = options.find(o => o.value === 'in_progress');
      expect(inProgress?.label).toBe('In Progress');
    });
  });

  describe('getOrderStatusOptions', () => {
    it('returns all order status options', () => {
      const options = getOrderStatusOptions();
      expect(options).toHaveLength(5);
      expect(options.map(o => o.value)).toContain('draft');
      expect(options.map(o => o.value)).toContain('confirmed');
      expect(options.map(o => o.value)).toContain('dispatched');
      expect(options.map(o => o.value)).toContain('delivered');
      expect(options.map(o => o.value)).toContain('cancelled');
    });
  });

  describe('getContainerStatusOptions', () => {
    it('returns all container status options', () => {
      const options = getContainerStatusOptions();
      expect(options).toHaveLength(5);
      expect(options.map(o => o.value)).toContain('at_brewery');
      expect(options.map(o => o.value)).toContain('with_customer');
      expect(options.map(o => o.value)).toContain('in_transit');
      expect(options.map(o => o.value)).toContain('lost');
      expect(options.map(o => o.value)).toContain('retired');
    });
  });

  describe('getDeliveryRunStatusOptions', () => {
    it('returns all delivery run status options', () => {
      const options = getDeliveryRunStatusOptions();
      expect(options).toHaveLength(4);
      expect(options.map(o => o.value)).toContain('planned');
      expect(options.map(o => o.value)).toContain('in_progress');
      expect(options.map(o => o.value)).toContain('completed');
      expect(options.map(o => o.value)).toContain('cancelled');
    });
  });
});

