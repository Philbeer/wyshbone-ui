import { useMemo } from "react";
import { useUser } from "@/contexts/UserContext";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, Users, TrendingUp, AlertTriangle } from "lucide-react";
import { 
  getCustomerActivity, formatCurrency, formatDate,
  type CustomerActivity,
  DATA_SOURCE
} from "@/lib/brewcrmService";

export default function BrewCrmCustomerActivityPage() {
  const { user } = useUser();
  const workspaceId = user.id;
  
  const activities = useMemo<CustomerActivity[]>(() => {
    return getCustomerActivity(workspaceId);
  }, [workspaceId]);
  
  // Sort by volume YTD descending
  const sortedActivities = useMemo(() => {
    return [...activities].sort((a, b) => b.volumeYtdLitres - a.volumeYtdLitres);
  }, [activities]);
  
  // Calculate totals
  const totals = useMemo(() => {
    const totalVolume = activities.reduce((sum, a) => sum + a.volumeYtdLitres, 0);
    const totalDuty = activities.reduce((sum, a) => sum + a.dutyYtdPence, 0);
    const totalOrders = activities.reduce((sum, a) => sum + a.orderCountYtd, 0);
    const activeCustomers = activities.filter(a => a.orderCountYtd > 0).length;
    return { totalVolume, totalDuty, totalOrders, activeCustomers };
  }, [activities]);
  
  // Find customers who haven't ordered recently (30+ days)
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const dormantCustomers = activities.filter(a => 
    !a.lastOrderDate || a.lastOrderDate < thirtyDaysAgo
  );
  
  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-semibold">Customer Activity</h1>
          <Badge variant="secondary">PARTIAL</Badge>
        </div>
        <p className="text-muted-foreground">
          Year-to-date performance by customer: orders, volume, and duty contribution.
        </p>
        <p className="text-xs text-muted-foreground mt-1">Data Source: {DATA_SOURCE}</p>
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Active Customers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totals.activeCustomers}</div>
            <div className="text-sm text-muted-foreground">
              of {activities.length} total
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Total Volume YTD
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totals.totalVolume.toFixed(0)}L</div>
            <div className="text-sm text-muted-foreground">
              {(totals.totalVolume / 100).toFixed(2)} HL
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Duty YTD</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatCurrency(totals.totalDuty)}</div>
            <div className="text-sm text-muted-foreground">
              {totals.totalOrders} orders
            </div>
          </CardContent>
        </Card>
        <Card className={dormantCustomers.length > 0 ? 'border-yellow-500/50' : ''}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Dormant (30+ days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">{dormantCustomers.length}</div>
            <div className="text-sm text-muted-foreground">
              Need follow-up
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Activity Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Customer Activity YTD
          </CardTitle>
          <CardDescription>Sorted by volume (highest first)</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead></TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Last Order</TableHead>
                <TableHead className="text-right">Orders YTD</TableHead>
                <TableHead className="text-right">Volume YTD (L)</TableHead>
                <TableHead className="text-right">Duty YTD</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedActivities.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No customers found. Add customers to see activity.</p>
                  </TableCell>
                </TableRow>
              ) : (
                sortedActivities.map((activity, idx) => {
                  const isDormant = !activity.lastOrderDate || activity.lastOrderDate < thirtyDaysAgo;
                  return (
                    <TableRow key={activity.customerId}>
                      <TableCell className="font-bold text-muted-foreground w-8">
                        {idx + 1}
                      </TableCell>
                      <TableCell className="font-medium">{activity.customerName}</TableCell>
                      <TableCell>
                        {activity.lastOrderDate 
                          ? formatDate(activity.lastOrderDate)
                          : <span className="text-muted-foreground">Never</span>
                        }
                      </TableCell>
                      <TableCell className="text-right">{activity.orderCountYtd}</TableCell>
                      <TableCell className="text-right font-medium">
                        {activity.volumeYtdLitres.toFixed(0)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(activity.dutyYtdPence)}
                      </TableCell>
                      <TableCell>
                        {isDormant ? (
                          <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                            Dormant
                          </Badge>
                        ) : (
                          <Badge variant="default">Active</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

