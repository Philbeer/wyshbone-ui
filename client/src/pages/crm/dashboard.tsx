import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/contexts/UserContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Package, Truck, Settings } from "lucide-react";

export default function CrmDashboard() {
  const { user } = useUser();
  const workspaceId = user.id;

  const { data: customers, isLoading: loadingCustomers } = useQuery({
    queryKey: ['/api/crm/customers', workspaceId],
    enabled: !!workspaceId,
  });

  const { data: orders, isLoading: loadingOrders } = useQuery({
    queryKey: ['/api/crm/orders', workspaceId],
    enabled: !!workspaceId,
  });

  const { data: deliveryRuns, isLoading: loadingDeliveryRuns } = useQuery({
    queryKey: ['/api/crm/delivery-runs', workspaceId],
    enabled: !!workspaceId,
  });

  const isLoading = loadingCustomers || loadingOrders || loadingDeliveryRuns;

  const customerCount = customers?.length || 0;
  const orderCount = orders?.length || 0;
  const activeDeliveryRuns = deliveryRuns?.filter((run: any) => run.status === 'in_progress').length || 0;
  const totalRevenue = orders?.reduce((sum: number, order: any) => sum + (order.totalAmount || 0), 0) || 0;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold" data-testid="text-dashboard-title">CRM Dashboard</h2>
        <p className="text-sm text-muted-foreground">Overview of your CRM operations</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card data-testid="card-customers">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-customer-count">{customerCount}</div>
            </CardContent>
          </Card>

          <Card data-testid="card-orders">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-order-count">{orderCount}</div>
            </CardContent>
          </Card>

          <Card data-testid="card-delivery-runs">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Deliveries</CardTitle>
              <Truck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-active-deliveries">{activeDeliveryRuns}</div>
            </CardContent>
          </Card>

          <Card data-testid="card-revenue">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-revenue">
                £{(totalRevenue / 100).toFixed(2)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
