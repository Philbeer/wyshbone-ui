/**
 * BrewCRM Service Layer
 * 
 * Provides typed functions for CRM operations.
 * Uses localStorage for data persistence.
 * 
 * NOTE: Duty calculator logic is in settings.tsx and is FROZEN.
 * Do NOT add duty calculation logic here.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface BrewCustomer {
  id: string;
  workspaceId: string;
  name: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postcode?: string;
  deliveryNotes?: string;
  accountStatus: 'active' | 'inactive' | 'on_hold';
  defaultDeliveryDay?: string;
  createdAt: number;
  updatedAt: number;
}

export interface OrderLine {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number; // pence
}

export interface BrewOrder {
  id: string;
  workspaceId: string;
  customerId: string;
  customerName: string;
  lines: OrderLine[];
  status: 'draft' | 'confirmed' | 'delivered';
  deliveryDate?: number;
  deliveredAt?: number;
  routeId?: string;
  totalAmount: number; // pence
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface DeliveryRoute {
  id: string;
  workspaceId: string;
  name: string;
  deliveryDate: number;
  orderIds: string[];
  status: 'planned' | 'in_progress' | 'completed';
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface StockItem {
  id: string;
  workspaceId: string;
  productId: string;
  productName: string;
  quantity: number;
  location: string;
  updatedAt: number;
}

// ============================================================================
// LOCAL STORAGE HELPERS
// ============================================================================

const STORAGE_KEYS = {
  customers: 'brewcrm_customers',
  orders: 'brewcrm_orders',
  routes: 'brewcrm_routes',
  stock: 'brewcrm_stock',
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
// CUSTOMER FUNCTIONS
// ============================================================================

export function getCustomers(workspaceId: string): BrewCustomer[] {
  return getLocalData<BrewCustomer>(STORAGE_KEYS.customers)
    .filter(c => c.workspaceId === workspaceId);
}

export function getCustomer(workspaceId: string, id: string): BrewCustomer | undefined {
  return getCustomers(workspaceId).find(c => c.id === id);
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
    accountStatus: 'active',
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
  return getLocalData<BrewOrder>(STORAGE_KEYS.orders)
    .filter(o => o.workspaceId === workspaceId);
}

export function getOrder(workspaceId: string, id: string): BrewOrder | undefined {
  return getOrders(workspaceId).find(o => o.id === id);
}

export function getOrdersByRoute(workspaceId: string, routeId: string): BrewOrder[] {
  return getOrders(workspaceId).filter(o => o.routeId === routeId);
}

export function upsertOrder(
  workspaceId: string,
  data: Partial<BrewOrder> & { customerId: string; customerName: string }
): BrewOrder {
  const all = getLocalData<BrewOrder>(STORAGE_KEYS.orders);
  const now = Date.now();
  
  if (data.id) {
    const idx = all.findIndex(o => o.id === data.id && o.workspaceId === workspaceId);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...data, updatedAt: now };
      setLocalData(STORAGE_KEYS.orders, all);
      return all[idx];
    }
  }
  
  const newOrder: BrewOrder = {
    id: generateId(),
    workspaceId,
    lines: [],
    status: 'draft',
    totalAmount: 0,
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
  }
}

// ============================================================================
// ROUTE FUNCTIONS
// ============================================================================

export function getRoutes(workspaceId: string): DeliveryRoute[] {
  return getLocalData<DeliveryRoute>(STORAGE_KEYS.routes)
    .filter(r => r.workspaceId === workspaceId);
}

export function getRoute(workspaceId: string, id: string): DeliveryRoute | undefined {
  return getRoutes(workspaceId).find(r => r.id === id);
}

export function upsertRoute(
  workspaceId: string,
  data: Partial<DeliveryRoute> & { name: string }
): DeliveryRoute {
  const all = getLocalData<DeliveryRoute>(STORAGE_KEYS.routes);
  const now = Date.now();
  
  if (data.id) {
    const idx = all.findIndex(r => r.id === data.id && r.workspaceId === workspaceId);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...data, updatedAt: now };
      setLocalData(STORAGE_KEYS.routes, all);
      return all[idx];
    }
  }
  
  const newRoute: DeliveryRoute = {
    id: generateId(),
    workspaceId,
    deliveryDate: now,
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

export function addOrderToRoute(workspaceId: string, routeId: string, orderId: string): void {
  const routes = getLocalData<DeliveryRoute>(STORAGE_KEYS.routes);
  const orders = getLocalData<BrewOrder>(STORAGE_KEYS.orders);
  
  const routeIdx = routes.findIndex(r => r.id === routeId && r.workspaceId === workspaceId);
  const orderIdx = orders.findIndex(o => o.id === orderId && o.workspaceId === workspaceId);
  
  if (routeIdx >= 0 && orderIdx >= 0) {
    if (!routes[routeIdx].orderIds.includes(orderId)) {
      routes[routeIdx].orderIds.push(orderId);
      routes[routeIdx].updatedAt = Date.now();
      setLocalData(STORAGE_KEYS.routes, routes);
    }
    orders[orderIdx].routeId = routeId;
    orders[orderIdx].updatedAt = Date.now();
    setLocalData(STORAGE_KEYS.orders, orders);
  }
}

export function completeRoute(workspaceId: string, routeId: string): void {
  const routes = getLocalData<DeliveryRoute>(STORAGE_KEYS.routes);
  const orders = getLocalData<BrewOrder>(STORAGE_KEYS.orders);
  
  const routeIdx = routes.findIndex(r => r.id === routeId && r.workspaceId === workspaceId);
  if (routeIdx >= 0) {
    const route = routes[routeIdx];
    route.status = 'completed';
    route.completedAt = Date.now();
    route.updatedAt = Date.now();
    setLocalData(STORAGE_KEYS.routes, routes);
    
    // Mark all orders as delivered
    for (const orderId of route.orderIds) {
      const orderIdx = orders.findIndex(o => o.id === orderId);
      if (orderIdx >= 0) {
        orders[orderIdx].status = 'delivered';
        orders[orderIdx].deliveredAt = Date.now();
        orders[orderIdx].updatedAt = Date.now();
      }
    }
    setLocalData(STORAGE_KEYS.orders, orders);
  }
}

// ============================================================================
// STOCK FUNCTIONS
// ============================================================================

export function getStock(workspaceId: string): StockItem[] {
  return getLocalData<StockItem>(STORAGE_KEYS.stock)
    .filter(s => s.workspaceId === workspaceId);
}

export function adjustStock(
  workspaceId: string,
  productId: string,
  productName: string,
  adjustment: number,
  location: string = 'default'
): StockItem {
  const all = getLocalData<StockItem>(STORAGE_KEYS.stock);
  const now = Date.now();
  
  const idx = all.findIndex(s => 
    s.workspaceId === workspaceId && 
    s.productId === productId && 
    s.location === location
  );
  
  if (idx >= 0) {
    all[idx].quantity += adjustment;
    all[idx].updatedAt = now;
    setLocalData(STORAGE_KEYS.stock, all);
    return all[idx];
  }
  
  const newItem: StockItem = {
    id: generateId(),
    workspaceId,
    productId,
    productName,
    quantity: adjustment,
    location,
    updatedAt: now,
  };
  all.push(newItem);
  setLocalData(STORAGE_KEYS.stock, all);
  return newItem;
}

// ============================================================================
// UTILITIES
// ============================================================================

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-GB');
}

export function formatCurrency(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

