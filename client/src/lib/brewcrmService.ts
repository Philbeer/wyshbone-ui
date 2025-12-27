/**
 * BrewCRM Service Layer
 * 
 * Provides typed functions for all BrewCRM operations.
 * Uses Supabase where wired, falls back to localStorage mock otherwise.
 * 
 * TODO: Wire remaining endpoints to Supabase once tables are confirmed
 */

// ============================================================================
// TYPES
// ============================================================================

export type ProductType = 'beer' | 'cider';
export type PackageType = 'cask' | 'keg' | 'bag-in-box' | 'can' | 'bottle';
export type AbvBand = 'lt_3_5' | '3_5_to_8_5' | 'gt_8_5';
export type DutyCategoryKey = 
  | 'beer_draught_lt_3_5'
  | 'beer_draught_3_5_to_8_5'
  | 'beer_non_draught_lt_3_5'
  | 'beer_non_draught_3_5_to_8_5'
  | 'beer_gt_8_5'
  | 'cider_draught_lt_3_5'
  | 'cider_draught_3_5_to_8_5'
  | 'cider_non_draught_lt_3_5'
  | 'cider_non_draught_3_5_to_8_5'
  | 'cider_gt_8_5';

export interface BrewProduct {
  id: string;
  workspaceId: string;
  name: string;
  productType: ProductType;
  abv: number; // Percentage (e.g., 4.5)
  packageType: PackageType;
  packageSizeLitres: number;
  // Derived fields (computed at creation, stored read-only)
  isDraught: boolean;
  abvBand: AbvBand;
  dutyCategoryKey: DutyCategoryKey;
  displayDutyCategory: string;
  // Optional fields
  style?: string;
  sku?: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface BrewCustomer {
  id: string;
  workspaceId: string;
  name: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postcode?: string;
  country: string;
  deliveryNotes?: string;
  accountStatus: 'active' | 'inactive' | 'on_hold';
  defaultDeliveryDay?: string;
  defaultRouteId?: string;
  primaryContactName?: string;
  email?: string;
  phone?: string;
  lastOrderDate?: number;
  totalVolumeLitres: number;
  totalDutyPaid: number; // pence
  createdAt: number;
  updatedAt: number;
}

export interface BrewOrderLine {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  quantity: number;
  packageSizeLitres: number;
  volumeLitres: number; // quantity * packageSizeLitres
  dutyAmount: number; // pence
  createdAt: number;
  updatedAt: number;
}

export interface BrewOrder {
  id: string;
  workspaceId: string;
  customerId: string;
  customerName: string;
  orderNumber: string;
  status: 'draft' | 'confirmed' | 'delivered';
  orderDate: number;
  deliveryDate?: number;
  deliveredAt?: number;
  routeId?: string;
  lines: BrewOrderLine[];
  totalVolumeLitres: number;
  totalDutyAmount: number; // pence
  isRepeat: boolean;
  repeatFrequency?: 'weekly' | 'fortnightly';
  nextRepeatDate?: number;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface BrewRoute {
  id: string;
  workspaceId: string;
  name: string;
  deliveryDate: number;
  orderIds: string[]; // Ordered list of order IDs
  status: 'planned' | 'in_progress' | 'completed';
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface BrewStock {
  id: string;
  workspaceId: string;
  productId: string;
  productName: string;
  packageType: PackageType;
  packageSizeLitres: number;
  quantityUnits: number;
  totalVolumeLitres: number;
  location: string;
  lastUpdated: number;
}

export interface BrewContainer {
  id: string;
  workspaceId: string;
  containerCode: string;
  containerType: 'cask' | 'keg';
  volumeLitres: number;
  status: 'at_brewery' | 'with_customer' | 'in_transit' | 'lost' | 'retired';
  currentCustomerId?: string;
  currentCustomerName?: string;
  lastOutboundDate?: number;
  lastReturnDate?: number;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface LockedDutyRate {
  id: string;
  workspaceId: string;
  dutyCategoryKey: DutyCategoryKey;
  taxPeriodStart: number;
  taxPeriodEnd: number;
  ratePerHl: number; // pence per hectolitre
  discount: number; // percentage
  lookupVersion: string;
  createdAt: number;
}

export interface DutyReportLine {
  dutyCategoryKey: DutyCategoryKey;
  displayCategory: string;
  totalHl: number;
  ratePerHl: number;
  dutyPayable: number; // pence
}

export interface DutyReport {
  id: string;
  workspaceId: string;
  periodStart: number;
  periodEnd: number;
  lines: DutyReportLine[];
  grandTotalHl: number;
  grandTotalDuty: number; // pence
  generatedAt: number;
}

// ============================================================================
// DUTY RATE LOOKUP TABLE (MOCK DATA)
// 
// UK Small Brewery Relief formula uses piecewise/cumulative calculation:
// discount = (C + M * (HLPA - prev_threshold)) / HLPA
// 
// TODO: Wire to Supabase duty_rate_lookup table when available
// ============================================================================

interface DutyBandRow {
  dutyCategoryKey: DutyCategoryKey;
  displayCategory: string;
  thresholdHlpa: number;
  baseRatePerHl: number; // pence per hl - full rate before SBR
  cumulativeConstantC: number;
  marginalRateM: number;
}

// Current UK duty rates (2024/25) with Small Brewery Relief thresholds
// These are simplified - real SBR uses progressive bands
const DUTY_LOOKUP_TABLE: DutyBandRow[] = [
  // Beer - Draught < 3.5% ABV (reduced rate)
  { dutyCategoryKey: 'beer_draught_lt_3_5', displayCategory: 'Beer (Draught, < 3.5%)', thresholdHlpa: 0, baseRatePerHl: 942, cumulativeConstantC: 0, marginalRateM: 0.5 },
  { dutyCategoryKey: 'beer_draught_lt_3_5', displayCategory: 'Beer (Draught, < 3.5%)', thresholdHlpa: 2500, baseRatePerHl: 942, cumulativeConstantC: 1178, marginalRateM: 0.628 },
  { dutyCategoryKey: 'beer_draught_lt_3_5', displayCategory: 'Beer (Draught, < 3.5%)', thresholdHlpa: 5000, baseRatePerHl: 942, cumulativeConstantC: 2748, marginalRateM: 0.87 },
  
  // Beer - Draught 3.5% to 8.5% (standard draught rate)
  { dutyCategoryKey: 'beer_draught_3_5_to_8_5', displayCategory: 'Beer (Draught, 3.5%-8.5%)', thresholdHlpa: 0, baseRatePerHl: 1963, cumulativeConstantC: 0, marginalRateM: 0.5 },
  { dutyCategoryKey: 'beer_draught_3_5_to_8_5', displayCategory: 'Beer (Draught, 3.5%-8.5%)', thresholdHlpa: 2500, baseRatePerHl: 1963, cumulativeConstantC: 2454, marginalRateM: 0.628 },
  { dutyCategoryKey: 'beer_draught_3_5_to_8_5', displayCategory: 'Beer (Draught, 3.5%-8.5%)', thresholdHlpa: 5000, baseRatePerHl: 1963, cumulativeConstantC: 5724, marginalRateM: 0.87 },
  
  // Beer - Non-Draught < 3.5%
  { dutyCategoryKey: 'beer_non_draught_lt_3_5', displayCategory: 'Beer (Non-Draught, < 3.5%)', thresholdHlpa: 0, baseRatePerHl: 942, cumulativeConstantC: 0, marginalRateM: 0.5 },
  { dutyCategoryKey: 'beer_non_draught_lt_3_5', displayCategory: 'Beer (Non-Draught, < 3.5%)', thresholdHlpa: 2500, baseRatePerHl: 942, cumulativeConstantC: 1178, marginalRateM: 0.628 },
  { dutyCategoryKey: 'beer_non_draught_lt_3_5', displayCategory: 'Beer (Non-Draught, < 3.5%)', thresholdHlpa: 5000, baseRatePerHl: 942, cumulativeConstantC: 2748, marginalRateM: 0.87 },
  
  // Beer - Non-Draught 3.5% to 8.5%
  { dutyCategoryKey: 'beer_non_draught_3_5_to_8_5', displayCategory: 'Beer (Non-Draught, 3.5%-8.5%)', thresholdHlpa: 0, baseRatePerHl: 2101, cumulativeConstantC: 0, marginalRateM: 0.5 },
  { dutyCategoryKey: 'beer_non_draught_3_5_to_8_5', displayCategory: 'Beer (Non-Draught, 3.5%-8.5%)', thresholdHlpa: 2500, baseRatePerHl: 2101, cumulativeConstantC: 2626, marginalRateM: 0.628 },
  { dutyCategoryKey: 'beer_non_draught_3_5_to_8_5', displayCategory: 'Beer (Non-Draught, 3.5%-8.5%)', thresholdHlpa: 5000, baseRatePerHl: 2101, cumulativeConstantC: 6126, marginalRateM: 0.87 },
  
  // Beer > 8.5% (high strength - no draught distinction)
  { dutyCategoryKey: 'beer_gt_8_5', displayCategory: 'Beer (> 8.5%)', thresholdHlpa: 0, baseRatePerHl: 2850, cumulativeConstantC: 0, marginalRateM: 0.5 },
  { dutyCategoryKey: 'beer_gt_8_5', displayCategory: 'Beer (> 8.5%)', thresholdHlpa: 2500, baseRatePerHl: 2850, cumulativeConstantC: 3563, marginalRateM: 0.628 },
  { dutyCategoryKey: 'beer_gt_8_5', displayCategory: 'Beer (> 8.5%)', thresholdHlpa: 5000, baseRatePerHl: 2850, cumulativeConstantC: 8313, marginalRateM: 0.87 },
  
  // Cider rates (similar structure, different base rates)
  { dutyCategoryKey: 'cider_draught_lt_3_5', displayCategory: 'Cider (Draught, < 3.5%)', thresholdHlpa: 0, baseRatePerHl: 942, cumulativeConstantC: 0, marginalRateM: 0.5 },
  { dutyCategoryKey: 'cider_draught_3_5_to_8_5', displayCategory: 'Cider (Draught, 3.5%-8.5%)', thresholdHlpa: 0, baseRatePerHl: 5050, cumulativeConstantC: 0, marginalRateM: 0.5 },
  { dutyCategoryKey: 'cider_non_draught_lt_3_5', displayCategory: 'Cider (Non-Draught, < 3.5%)', thresholdHlpa: 0, baseRatePerHl: 942, cumulativeConstantC: 0, marginalRateM: 0.5 },
  { dutyCategoryKey: 'cider_non_draught_3_5_to_8_5', displayCategory: 'Cider (Non-Draught, 3.5%-8.5%)', thresholdHlpa: 0, baseRatePerHl: 5413, cumulativeConstantC: 0, marginalRateM: 0.5 },
  { dutyCategoryKey: 'cider_gt_8_5', displayCategory: 'Cider (> 8.5%)', thresholdHlpa: 0, baseRatePerHl: 6110, cumulativeConstantC: 0, marginalRateM: 0.5 },
];

// ============================================================================
// LOCAL STORAGE MOCK
// ============================================================================

const STORAGE_KEYS = {
  products: 'brewcrm_products',
  customers: 'brewcrm_customers',
  orders: 'brewcrm_orders',
  routes: 'brewcrm_routes',
  stock: 'brewcrm_stock',
  containers: 'brewcrm_containers',
  lockedRates: 'brewcrm_locked_rates',
  dutyReports: 'brewcrm_duty_reports',
};

function getLocalData<T>(key: string): T[] {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function setLocalData<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ============================================================================
// PRODUCT FUNCTIONS
// ============================================================================

export function deriveProductFields(
  productType: ProductType,
  abv: number,
  packageType: PackageType
): { isDraught: boolean; abvBand: AbvBand; dutyCategoryKey: DutyCategoryKey; displayDutyCategory: string } {
  // Draught = cask, keg, or bag-in-box
  const isDraught = ['cask', 'keg', 'bag-in-box'].includes(packageType);
  
  // ABV band
  let abvBand: AbvBand;
  if (abv < 3.5) {
    abvBand = 'lt_3_5';
  } else if (abv <= 8.5) {
    abvBand = '3_5_to_8_5';
  } else {
    abvBand = 'gt_8_5';
  }
  
  // Duty category key
  let dutyCategoryKey: DutyCategoryKey;
  if (abvBand === 'gt_8_5') {
    dutyCategoryKey = `${productType}_gt_8_5` as DutyCategoryKey;
  } else if (isDraught) {
    dutyCategoryKey = `${productType}_draught_${abvBand}` as DutyCategoryKey;
  } else {
    dutyCategoryKey = `${productType}_non_draught_${abvBand}` as DutyCategoryKey;
  }
  
  // Display category
  const row = DUTY_LOOKUP_TABLE.find(r => r.dutyCategoryKey === dutyCategoryKey);
  const displayDutyCategory = row?.displayCategory || dutyCategoryKey;
  
  return { isDraught, abvBand, dutyCategoryKey, displayDutyCategory };
}

export function getProducts(workspaceId: string): BrewProduct[] {
  const all = getLocalData<BrewProduct>(STORAGE_KEYS.products);
  return all.filter(p => p.workspaceId === workspaceId);
}

export function upsertProduct(
  workspaceId: string,
  data: Omit<BrewProduct, 'id' | 'workspaceId' | 'isDraught' | 'abvBand' | 'dutyCategoryKey' | 'displayDutyCategory' | 'createdAt' | 'updatedAt'> & { id?: string }
): BrewProduct {
  const all = getLocalData<BrewProduct>(STORAGE_KEYS.products);
  const now = Date.now();
  
  const derived = deriveProductFields(data.productType, data.abv, data.packageType);
  
  if (data.id) {
    // Update existing
    const idx = all.findIndex(p => p.id === data.id && p.workspaceId === workspaceId);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...data, ...derived, updatedAt: now };
      setLocalData(STORAGE_KEYS.products, all);
      return all[idx];
    }
  }
  
  // Create new
  const newProduct: BrewProduct = {
    id: generateId(),
    workspaceId,
    ...data,
    ...derived,
    isActive: data.isActive ?? true,
    createdAt: now,
    updatedAt: now,
  };
  all.push(newProduct);
  setLocalData(STORAGE_KEYS.products, all);
  return newProduct;
}

export function archiveProduct(workspaceId: string, productId: string): void {
  const all = getLocalData<BrewProduct>(STORAGE_KEYS.products);
  const idx = all.findIndex(p => p.id === productId && p.workspaceId === workspaceId);
  if (idx >= 0) {
    all[idx].isActive = false;
    all[idx].updatedAt = Date.now();
    setLocalData(STORAGE_KEYS.products, all);
  }
}

// ============================================================================
// DUTY RATE CALCULATOR
// 
// Implements exact spreadsheet logic:
// discount = (C + M * (HLPA - prev_threshold)) / HLPA
// final_rate = base_rate * (1 - discount)
// ============================================================================

export interface DutyRateResult {
  dutyCategoryKey: DutyCategoryKey;
  displayCategory: string;
  hlpa: number;
  baseRatePerHl: number; // pence
  discount: number; // 0-1
  discountPercent: number; // 0-100
  finalRatePerHl: number; // pence
  discountPerHl: number; // pence
}

export function computeDutyRate(
  hlpa: number,
  dutyCategoryKey: DutyCategoryKey,
  _taxPeriodStart?: number // Optional: for future period-specific lookups
): DutyRateResult {
  // Get all rows for this category, sorted by threshold
  const categoryRows = DUTY_LOOKUP_TABLE
    .filter(r => r.dutyCategoryKey === dutyCategoryKey)
    .sort((a, b) => a.thresholdHlpa - b.thresholdHlpa);
  
  if (categoryRows.length === 0) {
    throw new Error(`No duty rates found for category: ${dutyCategoryKey}`);
  }
  
  // Find the applicable band
  let applicableRow = categoryRows[0];
  let prevThreshold = 0;
  
  for (let i = categoryRows.length - 1; i >= 0; i--) {
    if (hlpa >= categoryRows[i].thresholdHlpa) {
      applicableRow = categoryRows[i];
      prevThreshold = categoryRows[i].thresholdHlpa;
      break;
    }
  }
  
  // Calculate discount using piecewise formula
  // discount = (C + M * (HLPA - prev_threshold)) / HLPA
  let discount = 0;
  if (hlpa > 0) {
    const C = applicableRow.cumulativeConstantC;
    const M = applicableRow.marginalRateM;
    discount = (C + M * (hlpa - prevThreshold)) / hlpa;
  }
  
  // Clamp discount to valid range
  discount = Math.max(0, Math.min(1, discount));
  
  const baseRatePerHl = applicableRow.baseRatePerHl;
  const finalRatePerHl = Math.round(baseRatePerHl * (1 - discount));
  const discountPerHl = baseRatePerHl - finalRatePerHl;
  
  return {
    dutyCategoryKey,
    displayCategory: applicableRow.displayCategory,
    hlpa,
    baseRatePerHl,
    discount,
    discountPercent: Math.round(discount * 10000) / 100,
    finalRatePerHl,
    discountPerHl,
  };
}

export function saveLockedDutyRate(workspaceId: string, result: DutyRateResult, taxPeriodStart: number, taxPeriodEnd: number): LockedDutyRate {
  const all = getLocalData<LockedDutyRate>(STORAGE_KEYS.lockedRates);
  const now = Date.now();
  
  const rate: LockedDutyRate = {
    id: generateId(),
    workspaceId,
    dutyCategoryKey: result.dutyCategoryKey,
    taxPeriodStart,
    taxPeriodEnd,
    ratePerHl: result.finalRatePerHl,
    discount: result.discountPercent,
    lookupVersion: '2024-01', // Version of the lookup table used
    createdAt: now,
  };
  
  all.push(rate);
  setLocalData(STORAGE_KEYS.lockedRates, all);
  return rate;
}

export function getLockedDutyRates(workspaceId: string): LockedDutyRate[] {
  const all = getLocalData<LockedDutyRate>(STORAGE_KEYS.lockedRates);
  return all.filter(r => r.workspaceId === workspaceId);
}

export function getLockedRateForPeriod(
  workspaceId: string,
  dutyCategoryKey: DutyCategoryKey,
  date: number
): LockedDutyRate | undefined {
  const rates = getLockedDutyRates(workspaceId);
  return rates.find(r => 
    r.dutyCategoryKey === dutyCategoryKey &&
    date >= r.taxPeriodStart &&
    date <= r.taxPeriodEnd
  );
}

// ============================================================================
// CUSTOMER FUNCTIONS
// ============================================================================

export function getCustomers(workspaceId: string): BrewCustomer[] {
  const all = getLocalData<BrewCustomer>(STORAGE_KEYS.customers);
  return all.filter(c => c.workspaceId === workspaceId);
}

export function upsertCustomer(
  workspaceId: string,
  data: Partial<BrewCustomer> & { name: string }
): BrewCustomer {
  const all = getLocalData<BrewCustomer>(STORAGE_KEYS.customers);
  const now = Date.now();
  
  if (data.id) {
    const idx = all.findIndex(c => c.id === data.id && c.workspaceId === workspaceId);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...data, updatedAt: now };
      setLocalData(STORAGE_KEYS.customers, all);
      return all[idx];
    }
  }
  
  const newCustomer: BrewCustomer = {
    id: generateId(),
    workspaceId,
    name: data.name,
    accountStatus: data.accountStatus || 'active',
    country: data.country || 'United Kingdom',
    totalVolumeLitres: 0,
    totalDutyPaid: 0,
    createdAt: now,
    updatedAt: now,
    ...data,
  };
  all.push(newCustomer);
  setLocalData(STORAGE_KEYS.customers, all);
  return newCustomer;
}

// ============================================================================
// ORDER FUNCTIONS
// ============================================================================

export function getOrders(workspaceId: string): BrewOrder[] {
  const all = getLocalData<BrewOrder>(STORAGE_KEYS.orders);
  return all.filter(o => o.workspaceId === workspaceId);
}

export function getOrdersByCustomer(workspaceId: string, customerId: string): BrewOrder[] {
  return getOrders(workspaceId).filter(o => o.customerId === customerId);
}

export function upsertOrder(
  workspaceId: string,
  data: Partial<BrewOrder> & { customerId: string; customerName: string }
): BrewOrder {
  const all = getLocalData<BrewOrder>(STORAGE_KEYS.orders);
  const now = Date.now();
  
  // Calculate totals from lines
  const lines = data.lines || [];
  const totalVolumeLitres = lines.reduce((sum, l) => sum + l.volumeLitres, 0);
  const totalDutyAmount = lines.reduce((sum, l) => sum + l.dutyAmount, 0);
  
  if (data.id) {
    const idx = all.findIndex(o => o.id === data.id && o.workspaceId === workspaceId);
    if (idx >= 0) {
      all[idx] = { 
        ...all[idx], 
        ...data, 
        totalVolumeLitres, 
        totalDutyAmount, 
        updatedAt: now 
      };
      setLocalData(STORAGE_KEYS.orders, all);
      return all[idx];
    }
  }
  
  const orderNumber = `ORD-${now.toString(36).toUpperCase()}`;
  const newOrder: BrewOrder = {
    id: generateId(),
    workspaceId,
    orderNumber,
    status: 'draft',
    orderDate: now,
    lines: [],
    totalVolumeLitres,
    totalDutyAmount,
    isRepeat: false,
    createdAt: now,
    updatedAt: now,
    ...data,
  };
  all.push(newOrder);
  setLocalData(STORAGE_KEYS.orders, all);
  return newOrder;
}

export function markOrderDelivered(workspaceId: string, orderId: string): void {
  const all = getLocalData<BrewOrder>(STORAGE_KEYS.orders);
  const idx = all.findIndex(o => o.id === orderId && o.workspaceId === workspaceId);
  if (idx >= 0) {
    all[idx].status = 'delivered';
    all[idx].deliveredAt = Date.now();
    all[idx].updatedAt = Date.now();
    setLocalData(STORAGE_KEYS.orders, all);
    
    // Update customer totals
    updateCustomerTotals(workspaceId, all[idx].customerId);
  }
}

function updateCustomerTotals(workspaceId: string, customerId: string): void {
  const orders = getOrdersByCustomer(workspaceId, customerId).filter(o => o.status === 'delivered');
  const totalVolume = orders.reduce((sum, o) => sum + o.totalVolumeLitres, 0);
  const totalDuty = orders.reduce((sum, o) => sum + o.totalDutyAmount, 0);
  const lastOrder = orders.sort((a, b) => (b.deliveredAt || 0) - (a.deliveredAt || 0))[0];
  
  const customers = getLocalData<BrewCustomer>(STORAGE_KEYS.customers);
  const idx = customers.findIndex(c => c.id === customerId);
  if (idx >= 0) {
    customers[idx].totalVolumeLitres = totalVolume;
    customers[idx].totalDutyPaid = totalDuty;
    customers[idx].lastOrderDate = lastOrder?.deliveredAt;
    customers[idx].updatedAt = Date.now();
    setLocalData(STORAGE_KEYS.customers, customers);
  }
}

// ============================================================================
// ROUTE FUNCTIONS
// ============================================================================

export function getRoutes(workspaceId: string): BrewRoute[] {
  const all = getLocalData<BrewRoute>(STORAGE_KEYS.routes);
  return all.filter(r => r.workspaceId === workspaceId);
}

export function upsertRoute(
  workspaceId: string,
  data: Partial<BrewRoute> & { name: string; deliveryDate: number }
): BrewRoute {
  const all = getLocalData<BrewRoute>(STORAGE_KEYS.routes);
  const now = Date.now();
  
  if (data.id) {
    const idx = all.findIndex(r => r.id === data.id && r.workspaceId === workspaceId);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...data, updatedAt: now };
      setLocalData(STORAGE_KEYS.routes, all);
      return all[idx];
    }
  }
  
  const newRoute: BrewRoute = {
    id: generateId(),
    workspaceId,
    orderIds: [],
    status: 'planned',
    createdAt: now,
    updatedAt: now,
    ...data,
  };
  all.push(newRoute);
  setLocalData(STORAGE_KEYS.routes, all);
  return newRoute;
}

export function reorderRouteOrders(workspaceId: string, routeId: string, orderIds: string[]): void {
  const all = getLocalData<BrewRoute>(STORAGE_KEYS.routes);
  const idx = all.findIndex(r => r.id === routeId && r.workspaceId === workspaceId);
  if (idx >= 0) {
    all[idx].orderIds = orderIds;
    all[idx].updatedAt = Date.now();
    setLocalData(STORAGE_KEYS.routes, all);
  }
}

// ============================================================================
// STOCK FUNCTIONS
// ============================================================================

export function getStock(workspaceId: string): BrewStock[] {
  const all = getLocalData<BrewStock>(STORAGE_KEYS.stock);
  return all.filter(s => s.workspaceId === workspaceId);
}

export function adjustStock(
  workspaceId: string,
  productId: string,
  productName: string,
  packageType: PackageType,
  packageSizeLitres: number,
  adjustment: number, // Positive = add, negative = remove
  location: string = 'warehouse'
): void {
  const all = getLocalData<BrewStock>(STORAGE_KEYS.stock);
  const now = Date.now();
  
  const idx = all.findIndex(s => 
    s.workspaceId === workspaceId && 
    s.productId === productId && 
    s.packageType === packageType &&
    s.location === location
  );
  
  if (idx >= 0) {
    all[idx].quantityUnits += adjustment;
    all[idx].totalVolumeLitres = all[idx].quantityUnits * all[idx].packageSizeLitres;
    all[idx].lastUpdated = now;
  } else if (adjustment > 0) {
    all.push({
      id: generateId(),
      workspaceId,
      productId,
      productName,
      packageType,
      packageSizeLitres,
      quantityUnits: adjustment,
      totalVolumeLitres: adjustment * packageSizeLitres,
      location,
      lastUpdated: now,
    });
  }
  
  setLocalData(STORAGE_KEYS.stock, all);
}

// ============================================================================
// CONTAINER FUNCTIONS
// ============================================================================

export function getContainers(workspaceId: string): BrewContainer[] {
  const all = getLocalData<BrewContainer>(STORAGE_KEYS.containers);
  return all.filter(c => c.workspaceId === workspaceId);
}

export function upsertContainer(
  workspaceId: string,
  data: Partial<BrewContainer> & { containerCode: string; containerType: 'cask' | 'keg'; volumeLitres: number }
): BrewContainer {
  const all = getLocalData<BrewContainer>(STORAGE_KEYS.containers);
  const now = Date.now();
  
  if (data.id) {
    const idx = all.findIndex(c => c.id === data.id && c.workspaceId === workspaceId);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...data, updatedAt: now };
      setLocalData(STORAGE_KEYS.containers, all);
      return all[idx];
    }
  }
  
  const newContainer: BrewContainer = {
    id: generateId(),
    workspaceId,
    status: 'at_brewery',
    createdAt: now,
    updatedAt: now,
    ...data,
  };
  all.push(newContainer);
  setLocalData(STORAGE_KEYS.containers, all);
  return newContainer;
}

export function updateContainerStatus(
  workspaceId: string,
  containerId: string,
  status: BrewContainer['status'],
  customerId?: string,
  customerName?: string
): void {
  const all = getLocalData<BrewContainer>(STORAGE_KEYS.containers);
  const idx = all.findIndex(c => c.id === containerId && c.workspaceId === workspaceId);
  if (idx >= 0) {
    const now = Date.now();
    all[idx].status = status;
    all[idx].updatedAt = now;
    
    if (status === 'with_customer' && customerId) {
      all[idx].currentCustomerId = customerId;
      all[idx].currentCustomerName = customerName;
      all[idx].lastOutboundDate = now;
    } else if (status === 'at_brewery') {
      all[idx].currentCustomerId = undefined;
      all[idx].currentCustomerName = undefined;
      all[idx].lastReturnDate = now;
    }
    
    setLocalData(STORAGE_KEYS.containers, all);
  }
}

// ============================================================================
// DUTY REPORT GENERATION
// ============================================================================

export function generateDutyReport(
  workspaceId: string,
  periodStart: number,
  periodEnd: number
): DutyReport {
  const orders = getOrders(workspaceId).filter(o => 
    o.status === 'delivered' &&
    o.deliveredAt &&
    o.deliveredAt >= periodStart &&
    o.deliveredAt <= periodEnd
  );
  
  // Group by duty category
  const categoryTotals = new Map<DutyCategoryKey, { volumeLitres: number; dutyAmount: number }>();
  
  for (const order of orders) {
    for (const line of order.lines) {
      const product = getProducts(workspaceId).find(p => p.id === line.productId);
      if (product) {
        const existing = categoryTotals.get(product.dutyCategoryKey) || { volumeLitres: 0, dutyAmount: 0 };
        existing.volumeLitres += line.volumeLitres;
        existing.dutyAmount += line.dutyAmount;
        categoryTotals.set(product.dutyCategoryKey, existing);
      }
    }
  }
  
  // Build report lines
  const lines: DutyReportLine[] = [];
  let grandTotalHl = 0;
  let grandTotalDuty = 0;
  
  for (const [dutyCategoryKey, totals] of categoryTotals) {
    const row = DUTY_LOOKUP_TABLE.find(r => r.dutyCategoryKey === dutyCategoryKey);
    const hl = totals.volumeLitres / 100;
    
    // Get locked rate or compute fresh
    const lockedRate = getLockedRateForPeriod(workspaceId, dutyCategoryKey, periodStart);
    const ratePerHl = lockedRate?.ratePerHl || row?.baseRatePerHl || 0;
    const dutyPayable = Math.round(hl * ratePerHl);
    
    lines.push({
      dutyCategoryKey,
      displayCategory: row?.displayCategory || dutyCategoryKey,
      totalHl: hl,
      ratePerHl,
      dutyPayable,
    });
    
    grandTotalHl += hl;
    grandTotalDuty += dutyPayable;
  }
  
  const report: DutyReport = {
    id: generateId(),
    workspaceId,
    periodStart,
    periodEnd,
    lines,
    grandTotalHl,
    grandTotalDuty,
    generatedAt: Date.now(),
  };
  
  // Save the report
  const allReports = getLocalData<DutyReport>(STORAGE_KEYS.dutyReports);
  allReports.push(report);
  setLocalData(STORAGE_KEYS.dutyReports, allReports);
  
  return report;
}

export function getDutyReports(workspaceId: string): DutyReport[] {
  const all = getLocalData<DutyReport>(STORAGE_KEYS.dutyReports);
  return all.filter(r => r.workspaceId === workspaceId);
}

// ============================================================================
// REPORTING FUNCTIONS
// ============================================================================

export interface SalesSummary {
  totalVolumeLitres: number;
  totalVolumeHl: number;
  totalDuty: number; // pence
  topProducts: { productId: string; name: string; volumeLitres: number; orderCount: number }[];
  topCustomers: { customerId: string; name: string; volumeLitres: number; orderCount: number }[];
}

export function getSalesSummary(workspaceId: string, periodStart: number, periodEnd: number): SalesSummary {
  const orders = getOrders(workspaceId).filter(o => 
    o.status === 'delivered' &&
    o.deliveredAt &&
    o.deliveredAt >= periodStart &&
    o.deliveredAt <= periodEnd
  );
  
  const productStats = new Map<string, { name: string; volumeLitres: number; orderCount: number }>();
  const customerStats = new Map<string, { name: string; volumeLitres: number; orderCount: number }>();
  
  let totalVolume = 0;
  let totalDuty = 0;
  
  for (const order of orders) {
    totalVolume += order.totalVolumeLitres;
    totalDuty += order.totalDutyAmount;
    
    // Customer stats
    const custStat = customerStats.get(order.customerId) || { name: order.customerName, volumeLitres: 0, orderCount: 0 };
    custStat.volumeLitres += order.totalVolumeLitres;
    custStat.orderCount += 1;
    customerStats.set(order.customerId, custStat);
    
    // Product stats
    for (const line of order.lines) {
      const prodStat = productStats.get(line.productId) || { name: line.productName, volumeLitres: 0, orderCount: 0 };
      prodStat.volumeLitres += line.volumeLitres;
      prodStat.orderCount += 1;
      productStats.set(line.productId, prodStat);
    }
  }
  
  const topProducts = Array.from(productStats.entries())
    .map(([productId, stat]) => ({ productId, ...stat }))
    .sort((a, b) => b.volumeLitres - a.volumeLitres)
    .slice(0, 10);
  
  const topCustomers = Array.from(customerStats.entries())
    .map(([customerId, stat]) => ({ customerId, ...stat }))
    .sort((a, b) => b.volumeLitres - a.volumeLitres)
    .slice(0, 10);
  
  return {
    totalVolumeLitres: totalVolume,
    totalVolumeHl: totalVolume / 100,
    totalDuty,
    topProducts,
    topCustomers,
  };
}

export interface CustomerActivity {
  customerId: string;
  customerName: string;
  lastOrderDate?: number;
  volumeYtdLitres: number;
  dutyYtdPence: number;
  orderCountYtd: number;
}

export function getCustomerActivity(workspaceId: string): CustomerActivity[] {
  const customers = getCustomers(workspaceId);
  const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
  
  return customers.map(customer => {
    const orders = getOrdersByCustomer(workspaceId, customer.id).filter(o => 
      o.status === 'delivered' &&
      o.deliveredAt &&
      o.deliveredAt >= yearStart
    );
    
    const volumeYtd = orders.reduce((sum, o) => sum + o.totalVolumeLitres, 0);
    const dutyYtd = orders.reduce((sum, o) => sum + o.totalDutyAmount, 0);
    
    return {
      customerId: customer.id,
      customerName: customer.name,
      lastOrderDate: customer.lastOrderDate,
      volumeYtdLitres: volumeYtd,
      dutyYtdPence: dutyYtd,
      orderCountYtd: orders.length,
    };
  });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export function formatCurrency(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-GB');
}

export function getDefaultDutyPeriod(): { start: number; end: number } {
  // HMRC duty period: 26th of previous month to 25th of current month
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  
  const start = new Date(year, month - 1, 26);
  const end = new Date(year, month, 25);
  
  return { start: start.getTime(), end: end.getTime() };
}

export const DATA_SOURCE = 'LOCAL_MOCK' as const;

