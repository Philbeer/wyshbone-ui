/**
 * CRM Dashboard - Brewery Overview
 * 
 * SANITY PASS CHANGES (Dec 2024):
 * 
 * 1. "Products" card:
 *    - Now filters by isActive field (only counts active products)
 *    - Shows "X inactive" subtitle when some products are deactivated
 * 
 * 2. "Scheduled Runs" card (was "Delivery Runs"):
 *    - Renamed from "Delivery Runs" to "Scheduled Runs" for clarity
 *    - Main number now shows planned + in_progress combined
 *    - Subtitle shows "X in progress" or "none in progress"
 *    - Consistent with the "Active Deliveries" panel and Alerts
 * 
 * 3. "Active Deliveries" panel:
 *    - Already fixed in prior change to use status-based filtering
 *    - Matches Alerts panel logic (planned OR in_progress)
 * 
 * 4. "Production Status" panel:
 *    - Now only shows batches actually in production pipeline
 *      (planned, in_progress, fermenting, packaging)
 *    - Excludes "packaged" and "cancelled" batches
 *    - Empty state correctly says "No batches in production"
 * 
 * FOLLOW-UP IMPROVEMENTS RECOMMENDED:
 * - Add a date picker to delivery runs form (scheduledDate not captured)
 * - Consider adding a "Recent Activity" feed for audit trail
 * - Low stock alerts could be added (minimumStockUnits field exists)
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/contexts/UserContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  Users, Package, Truck, TrendingUp, AlertTriangle, 
  Factory, Clock, CheckCircle, Calendar, 
  PoundSterling, ShoppingCart, Warehouse
} from "lucide-react";
import type { SelectCrmCustomer, SelectCrmOrder, SelectCrmDeliveryRun, SelectBrewProduct, SelectBrewBatch, SelectBrewContainer } from "@shared/schema";

export default function CrmDashboard() {
  const { user } = useUser();
  const workspaceId = user.id;

  const { data: customers = [], isLoading: loadingCustomers } = useQuery<SelectCrmCustomer[]>({
    queryKey: ['/api/crm/customers', workspaceId],
    enabled: !!workspaceId,
  });

  const { data: orders = [], isLoading: loadingOrders } = useQuery<SelectCrmOrder[]>({
    queryKey: ['/api/crm/orders', workspaceId],
    enabled: !!workspaceId,
  });

  const { data: deliveryRuns = [], isLoading: loadingDeliveryRuns } = useQuery<SelectCrmDeliveryRun[]>({
    queryKey: ['/api/crm/delivery-runs', workspaceId],
    enabled: !!workspaceId,
  });

  const { data: products = [], isLoading: loadingProducts } = useQuery<SelectBrewProduct[]>({
    queryKey: ['/api/brewcrm/products', workspaceId],
    enabled: !!workspaceId,
  });

  const { data: batches = [], isLoading: loadingBatches } = useQuery<SelectBrewBatch[]>({
    queryKey: ['/api/brewcrm/batches', workspaceId],
    enabled: !!workspaceId,
  });

  const { data: containers = [], isLoading: loadingContainers } = useQuery<SelectBrewContainer[]>({
    queryKey: ['/api/brewcrm/containers', workspaceId],
    enabled: !!workspaceId,
  });

  const isLoading = loadingCustomers || loadingOrders || loadingDeliveryRuns || loadingProducts || loadingBatches || loadingContainers;

  // Calculate metrics
  const metrics = useMemo(() => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    
    const recentOrders = orders.filter((o: any) => o.orderDate >= thirtyDaysAgo);
    const totalRevenue = orders.reduce((sum: number, order: any) => sum + (order.totalIncVat || order.totalAmount || 0), 0);
    const monthlyRevenue = recentOrders.reduce((sum: number, order: any) => sum + (order.totalIncVat || order.totalAmount || 0), 0);
    
    const activeDeliveryRuns = deliveryRuns.filter((run: any) => run.status === 'in_progress');
    const plannedDeliveryRuns = deliveryRuns.filter((run: any) => run.status === 'planned');
    
    const pendingOrders = orders.filter((o: any) => o.status === 'draft' || o.status === 'confirmed');
    const confirmedOrders = orders.filter((o: any) => o.status === 'confirmed');
    const deliveredOrders = orders.filter((o: any) => o.status === 'delivered');
    
    const activeBatches = batches.filter((b: any) => 
      ['in_progress', 'fermenting', 'packaging'].includes(b.status)
    );
    const plannedBatches = batches.filter((b: any) => b.status === 'planned');
    
    const containersWithCustomer = containers.filter((c: any) => c.status === 'with_customer');
    const overdueContainers = containers.filter((c: any) => {
      if (c.status === 'with_customer' && c.expectedReturnDate) {
        return c.expectedReturnDate < now;
      }
      return false;
    });
    
    // Count only active products (isActive === 1)
    const activeProducts = products.filter((p: any) => p.isActive === 1);

    return {
      customers: customers.length,
      totalOrders: orders.length,
      pendingOrders: pendingOrders.length,
      confirmedOrders: confirmedOrders.length,
      deliveredOrders: deliveredOrders.length,
      totalRevenue,
      monthlyRevenue,
      activeDeliveryRuns: activeDeliveryRuns.length,
      plannedDeliveryRuns: plannedDeliveryRuns.length,
      products: activeProducts.length,
      totalProducts: products.length,
      activeBatches: activeBatches.length,
      plannedBatches: plannedBatches.length,
      totalContainers: containers.length,
      containersOut: containersWithCustomer.length,
      overdueContainers: overdueContainers.length,
    };
  }, [customers, orders, deliveryRuns, products, batches, containers]);

  // Generate alerts
  const alerts = useMemo(() => {
    const alertList: { type: 'warning' | 'danger' | 'info'; message: string }[] = [];
    
    if (metrics.overdueContainers > 0) {
      alertList.push({
        type: 'danger',
        message: `${metrics.overdueContainers} container${metrics.overdueContainers > 1 ? 's' : ''} overdue for return`
      });
    }
    
    if (metrics.pendingOrders > 5) {
      alertList.push({
        type: 'warning',
        message: `${metrics.pendingOrders} orders awaiting processing`
      });
    }
    
    if (metrics.plannedDeliveryRuns > 0) {
      alertList.push({
        type: 'info',
        message: `${metrics.plannedDeliveryRuns} delivery run${metrics.plannedDeliveryRuns > 1 ? 's' : ''} scheduled`
      });
    }
    
    if (metrics.activeBatches > 0) {
      alertList.push({
        type: 'info',
        message: `${metrics.activeBatches} batch${metrics.activeBatches > 1 ? 'es' : ''} in production`
      });
    }
    
    return alertList;
  }, [metrics]);

  // Get recent orders (last 5)
  const recentOrders = useMemo(() => {
    return [...orders]
      .sort((a: any, b: any) => (b.orderDate || 0) - (a.orderDate || 0))
      .slice(0, 5);
  }, [orders]);

  // Get active delivery runs (planned or in progress)
  // Note: Using status-based filtering to match Alerts panel logic, since the 
  // delivery run form currently doesn't capture scheduledDate from user input
  const upcomingDeliveryRuns = useMemo(() => {
    return [...deliveryRuns]
      .filter((run: any) => run.status === 'planned' || run.status === 'in_progress')
      .sort((a: any, b: any) => (a.scheduledDate || 0) - (b.scheduledDate || 0))
      .slice(0, 5);
  }, [deliveryRuns]);

  const formatCurrency = (pence: number) => `£${(pence / 100).toFixed(2)}`;
  const formatDate = (timestamp: number) => new Date(timestamp).toLocaleDateString();

  const getCustomerName = (customerId: string) => {
    const customer = customers.find((c: any) => c.id === customerId);
    return customer?.name || "Unknown";
  };

  const getStatusBadgeVariant = (status: string): "secondary" | "default" | "outline" | "destructive" => {
    switch (status) {
      case "draft": return "secondary";
      case "confirmed": return "default";
      case "dispatched": return "outline";
      case "delivered": return "default";
      case "cancelled": return "destructive";
      case "planned": return "secondary";
      case "in_progress": return "default";
      case "completed": return "default";
      default: return "secondary";
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold" data-testid="text-dashboard-title">CRM Dashboard</h2>
        <p className="text-sm text-muted-foreground">Overview of your brewery operations and sales</p>
      </div>

      {/* Primary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="card-revenue">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold" data-testid="text-total-revenue">
                  {formatCurrency(metrics.totalRevenue)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(metrics.monthlyRevenue)} this month
                </p>
              </div>
              <PoundSterling className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-customers">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Customers</p>
                <p className="text-2xl font-bold" data-testid="text-customer-count">{metrics.customers}</p>
              </div>
              <Users className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-orders">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Orders</p>
                <p className="text-2xl font-bold" data-testid="text-order-count">{metrics.totalOrders}</p>
                <p className="text-xs text-muted-foreground">
                  {metrics.pendingOrders} pending
                </p>
              </div>
              <ShoppingCart className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-products">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Products</p>
                <p className="text-2xl font-bold">{metrics.products}</p>
                <p className="text-xs text-muted-foreground">
                  {metrics.totalProducts > metrics.products ? `${metrics.totalProducts - metrics.products} inactive` : 'all active'}
                </p>
              </div>
              <Package className="h-8 w-8 text-amber-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="card-delivery-runs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Scheduled Runs</p>
                <p className="text-2xl font-bold" data-testid="text-active-deliveries">
                  {metrics.plannedDeliveryRuns + metrics.activeDeliveryRuns}
                </p>
                <p className="text-xs text-muted-foreground">
                  {metrics.activeDeliveryRuns > 0 ? `${metrics.activeDeliveryRuns} in progress` : 'none in progress'}
                </p>
              </div>
              <Truck className="h-8 w-8 text-indigo-600" />
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-batches">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Batches</p>
                <p className="text-2xl font-bold">{metrics.activeBatches}</p>
                <p className="text-xs text-muted-foreground">
                  {metrics.plannedBatches} planned
                </p>
              </div>
              <Factory className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-containers">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Containers Out</p>
                <p className="text-2xl font-bold">{metrics.containersOut}</p>
                <p className="text-xs text-muted-foreground">
                  of {metrics.totalContainers} total
                </p>
              </div>
              <Warehouse className="h-8 w-8 text-cyan-600" />
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-overdue">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Overdue Returns</p>
                <p className={`text-2xl font-bold ${metrics.overdueContainers > 0 ? 'text-red-600' : ''}`}>
                  {metrics.overdueContainers}
                </p>
              </div>
              <AlertTriangle className={`h-8 w-8 ${metrics.overdueContainers > 0 ? 'text-red-600' : 'text-muted-foreground'}`} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Orders */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Recent Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No orders yet</p>
            ) : (
              <div className="space-y-3">
                {recentOrders.map((order: any) => (
                  <div key={order.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{order.orderNumber}</p>
                      <p className="text-sm text-muted-foreground">{getCustomerName(order.customerId)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{formatCurrency(order.totalIncVat || order.totalAmount || 0)}</p>
                      <Badge variant={getStatusBadgeVariant(order.status)} className="text-xs">
                        {order.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alerts & Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {alerts.length === 0 ? (
              <div className="flex items-center justify-center py-4 text-center">
                <div>
                  <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">All clear! No alerts.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {alerts.map((alert, index) => (
                  <div 
                    key={index} 
                    className={`p-3 rounded-lg border-l-4 ${
                      alert.type === 'danger' ? 'bg-red-50 border-red-500 dark:bg-red-950/20' :
                      alert.type === 'warning' ? 'bg-yellow-50 border-yellow-500 dark:bg-yellow-950/20' :
                      'bg-blue-50 border-blue-500 dark:bg-blue-950/20'
                    }`}
                  >
                    <p className={`text-sm font-medium ${
                      alert.type === 'danger' ? 'text-red-700 dark:text-red-400' :
                      alert.type === 'warning' ? 'text-yellow-700 dark:text-yellow-400' :
                      'text-blue-700 dark:text-blue-400'
                    }`}>
                      {alert.message}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delivery Runs & Production Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Delivery Runs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Active Deliveries
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingDeliveryRuns.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No active deliveries</p>
            ) : (
              <div className="space-y-3">
                {upcomingDeliveryRuns.map((run: any) => (
                  <div key={run.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{run.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {run.driverName || "No driver assigned"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {formatDate(run.scheduledDate)}
                      </p>
                      <Badge variant={getStatusBadgeVariant(run.status)} className="text-xs">
                        {run.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Production Status - only shows batches actively in production pipeline */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Factory className="h-5 w-5" />
              Production Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              // Only show batches in the production pipeline (not packaged/cancelled)
              const productionBatches = batches
                .filter((b: any) => ['planned', 'in_progress', 'fermenting', 'packaging'].includes(b.status))
                .sort((a: any, b: any) => {
                  // Sort by status priority (most active first)
                  const statusOrder = { in_progress: 0, fermenting: 1, packaging: 2, planned: 3 };
                  return (statusOrder[a.status as keyof typeof statusOrder] ?? 5) - 
                         (statusOrder[b.status as keyof typeof statusOrder] ?? 5);
                })
                .slice(0, 5);
              
              if (productionBatches.length === 0) {
                return (
                  <p className="text-sm text-muted-foreground text-center py-4">No batches in production</p>
                );
              }
              
              return (
                <div className="space-y-3">
                  {productionBatches.map((batch: any) => {
                    const product = products.find((p: any) => p.id === batch.productId);
                    return (
                      <div key={batch.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium">{batch.batchCode}</p>
                          <p className="text-sm text-muted-foreground">
                            {product?.name || "Unknown product"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">
                            {(batch.plannedVolumeLitres / 1000).toFixed(0)}L
                          </p>
                          <Badge 
                            variant={
                              batch.status === 'in_progress' || batch.status === 'fermenting' ? 'default' : 'secondary'
                            } 
                            className="text-xs"
                          >
                            {batch.status.replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
