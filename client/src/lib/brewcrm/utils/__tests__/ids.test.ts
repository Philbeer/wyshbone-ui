import { describe, it, expect } from 'vitest';
import {
  generateOrderNumber,
  generateBatchNumber,
  generateContainerId,
  generateProductSku,
  isValidOrderNumber,
  isValidBatchNumber,
  isValidContainerId,
  isValidProductSku,
  ID_PATTERNS,
} from '../ids';

describe('generateOrderNumber', () => {
  it('generates valid order numbers', () => {
    const orderNumber = generateOrderNumber();
    expect(isValidOrderNumber(orderNumber)).toBe(true);
  });

  it('matches expected format ORD-YYYYMMDD-XXX', () => {
    const orderNumber = generateOrderNumber();
    expect(orderNumber).toMatch(ID_PATTERNS.orderNumber);
  });

  it('uses provided date', () => {
    const date = new Date('2024-03-15');
    const orderNumber = generateOrderNumber(date);
    expect(orderNumber).toMatch(/^ORD-20240315-\d{3}$/);
  });

  it('generates unique numbers', () => {
    const numbers = new Set<string>();
    for (let i = 0; i < 100; i++) {
      numbers.add(generateOrderNumber());
    }
    // With 3 random digits, we should get at least 90 unique from 100
    expect(numbers.size).toBeGreaterThan(90);
  });

  it('starts with ORD prefix', () => {
    const orderNumber = generateOrderNumber();
    expect(orderNumber.startsWith('ORD-')).toBe(true);
  });
});

describe('generateBatchNumber', () => {
  it('generates valid batch numbers', () => {
    const batchNumber = generateBatchNumber('IPA');
    expect(isValidBatchNumber(batchNumber)).toBe(true);
  });

  it('matches expected format XXX-YYYYMMDD-XX', () => {
    const batchNumber = generateBatchNumber('Stout');
    expect(batchNumber).toMatch(ID_PATTERNS.batchNumber);
  });

  it('uses first 3 chars of product type as prefix', () => {
    const batchNumber = generateBatchNumber('Pilsner');
    expect(batchNumber).toMatch(/^PIL-/);
  });

  it('uppercases the prefix', () => {
    const batchNumber = generateBatchNumber('lager');
    expect(batchNumber).toMatch(/^LAG-/);
  });

  it('handles short product types', () => {
    const batchNumber = generateBatchNumber('PA');
    expect(batchNumber).toMatch(/^PA-/);
  });

  it('uses provided date', () => {
    const date = new Date('2024-06-20');
    const batchNumber = generateBatchNumber('Ale', date);
    expect(batchNumber).toMatch(/^ALE-20240620-\d{2}$/);
  });

  it('generates unique numbers', () => {
    const numbers = new Set<string>();
    for (let i = 0; i < 50; i++) {
      numbers.add(generateBatchNumber('IPA'));
    }
    // With 2 random digits, we should get at least 40 unique from 50
    expect(numbers.size).toBeGreaterThan(40);
  });
});

describe('generateContainerId', () => {
  it('generates valid container IDs', () => {
    const containerId = generateContainerId('cask');
    expect(isValidContainerId(containerId)).toBe(true);
  });

  it('matches expected format XXX-YYMM-XXXX', () => {
    const containerId = generateContainerId('keg');
    expect(containerId).toMatch(ID_PATTERNS.containerId);
  });

  it('uses first 3 chars of container type as prefix', () => {
    const containerId = generateContainerId('bottle');
    expect(containerId).toMatch(/^BOT-/);
  });

  it('uppercases the prefix', () => {
    const containerId = generateContainerId('cask');
    expect(containerId).toMatch(/^CAS-/);
  });

  it('uses short year-month format', () => {
    const date = new Date('2024-11-15');
    const containerId = generateContainerId('keg', date);
    expect(containerId).toMatch(/^KEG-2411-\d{4}$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateContainerId('cask'));
    }
    // With 4 random digits, we should get at least 95 unique from 100
    expect(ids.size).toBeGreaterThan(95);
  });
});

describe('generateProductSku', () => {
  it('generates valid SKUs', () => {
    const sku = generateProductSku('Summer Ale');
    expect(isValidProductSku(sku)).toBe(true);
  });

  it('matches expected format XXX-XXXX', () => {
    const sku = generateProductSku('Winter Warmer');
    expect(sku).toMatch(ID_PATTERNS.productSku);
  });

  it('uses first 3 chars of product name', () => {
    const sku = generateProductSku('Hoppy IPA');
    expect(sku).toMatch(/^HOP-/);
  });

  it('uppercases the prefix', () => {
    const sku = generateProductSku('amber ale');
    expect(sku).toMatch(/^AMB-/);
  });
});

describe('ID_PATTERNS', () => {
  describe('orderNumber pattern', () => {
    it('matches valid order numbers', () => {
      expect(ID_PATTERNS.orderNumber.test('ORD-20241129-001')).toBe(true);
      expect(ID_PATTERNS.orderNumber.test('ORD-20240101-999')).toBe(true);
    });

    it('rejects invalid order numbers', () => {
      expect(ID_PATTERNS.orderNumber.test('ord-20241129-001')).toBe(false);
      expect(ID_PATTERNS.orderNumber.test('ORD-2024129-001')).toBe(false);
      expect(ID_PATTERNS.orderNumber.test('ORD-20241129-01')).toBe(false);
      expect(ID_PATTERNS.orderNumber.test('ORD2024112901')).toBe(false);
    });
  });

  describe('batchNumber pattern', () => {
    it('matches valid batch numbers', () => {
      expect(ID_PATTERNS.batchNumber.test('IPA-20241129-01')).toBe(true);
      expect(ID_PATTERNS.batchNumber.test('STO-20240515-99')).toBe(true);
    });

    it('rejects invalid batch numbers', () => {
      expect(ID_PATTERNS.batchNumber.test('ipa-20241129-01')).toBe(false);
      expect(ID_PATTERNS.batchNumber.test('IP-20241129-01')).toBe(false);
      expect(ID_PATTERNS.batchNumber.test('IPA-2024129-01')).toBe(false);
    });
  });

  describe('containerId pattern', () => {
    it('matches valid container IDs', () => {
      expect(ID_PATTERNS.containerId.test('CAS-2411-0001')).toBe(true);
      expect(ID_PATTERNS.containerId.test('KEG-2501-9999')).toBe(true);
    });

    it('rejects invalid container IDs', () => {
      expect(ID_PATTERNS.containerId.test('cas-2411-0001')).toBe(false);
      expect(ID_PATTERNS.containerId.test('CAS-241-0001')).toBe(false);
      expect(ID_PATTERNS.containerId.test('CAS-2411-001')).toBe(false);
    });
  });

  describe('productSku pattern', () => {
    it('matches valid SKUs', () => {
      expect(ID_PATTERNS.productSku.test('SUM-0001')).toBe(true);
      expect(ID_PATTERNS.productSku.test('ALE-9999')).toBe(true);
    });

    it('rejects invalid SKUs', () => {
      expect(ID_PATTERNS.productSku.test('sum-0001')).toBe(false);
      expect(ID_PATTERNS.productSku.test('SU-0001')).toBe(false);
      expect(ID_PATTERNS.productSku.test('SUM-001')).toBe(false);
    });
  });
});

describe('validation functions', () => {
  it('isValidOrderNumber validates correctly', () => {
    expect(isValidOrderNumber('ORD-20241129-001')).toBe(true);
    expect(isValidOrderNumber('invalid')).toBe(false);
  });

  it('isValidBatchNumber validates correctly', () => {
    expect(isValidBatchNumber('IPA-20241129-01')).toBe(true);
    expect(isValidBatchNumber('invalid')).toBe(false);
  });

  it('isValidContainerId validates correctly', () => {
    expect(isValidContainerId('CAS-2411-0001')).toBe(true);
    expect(isValidContainerId('invalid')).toBe(false);
  });

  it('isValidProductSku validates correctly', () => {
    expect(isValidProductSku('SUM-0001')).toBe(true);
    expect(isValidProductSku('invalid')).toBe(false);
  });
});

