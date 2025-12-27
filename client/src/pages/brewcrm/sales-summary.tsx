import { useState, useMemo } from "react";
import { useUser } from "@/contexts/UserContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { BarChart3, TrendingUp, Package, Users } from "lucide-react";
import { 
  getSalesSummary, formatCurrency,
  type SalesSummary,
  DATA_SOURCE
} from "@/lib/brewcrmService";

export default function BrewCrmSalesSummaryPage() {
  const { user } = useUser();
  const workspaceId = user.id;
  
  // Default to current month
  const [periodStart, setPeriodStart] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [periodEnd, setPeriodEnd] = useState<string>(() => {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
  });
  
  const summary = useMemo<SalesSummary>(() => {
    return getSalesSummary(
      workspaceId,
      new Date(periodStart).getTime(),
      new Date(periodEnd).getTime()
    );
  }, [workspaceId, periodStart, periodEnd]);
  
  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-semibold">Sales Summary</h1>
          <Badge variant="secondary">PARTIAL</Badge>
        </div>
        <p className="text-muted-foreground">
          Overview of sales performance: volume, duty, and top performers.
        </p>
        <p className="text-xs text-muted-foreground mt-1">Data Source: {DATA_SOURCE}</p>
      </div>
      
      {/* Date Range Selection */}
      <Card className="mb-6">
        <CardContent className="pt-4">
          <div className="flex gap-4 items-end">
            <div>
              <Label>Period Start</Label>
              <Input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div>
              <Label>Period End</Label>
              <Input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Total Volume
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{summary.totalVolumeHl.toFixed(2)} HL</div>
            <div className="text-sm text-muted-foreground">
              {summary.totalVolumeLitres.toFixed(0)} litres
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Duty</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatCurrency(summary.totalDuty)}</div>
            <div className="text-sm text-muted-foreground">
              Payable this period
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Average per HL</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {summary.totalVolumeHl > 0 
                ? formatCurrency(Math.round(summary.totalDuty / summary.totalVolumeHl))
                : '—'}
            </div>
            <div className="text-sm text-muted-foreground">
              Effective duty rate
            </div>
          </CardContent>
        </Card>
      </div>
      
      <div className="grid grid-cols-2 gap-6">
        {/* Top Products */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Top Products
            </CardTitle>
            <CardDescription>By volume sold</CardDescription>
          </CardHeader>
          <CardContent>
            {summary.topProducts.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No sales data in this period</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Volume (L)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.topProducts.map((product, idx) => (
                    <TableRow key={product.productId}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-muted-foreground w-4">{idx + 1}</span>
                          <span className="font-medium">{product.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{product.orderCount}</TableCell>
                      <TableCell className="text-right font-medium">
                        {product.volumeLitres.toFixed(0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        
        {/* Top Customers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Top Customers
            </CardTitle>
            <CardDescription>By volume ordered</CardDescription>
          </CardHeader>
          <CardContent>
            {summary.topCustomers.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No sales data in this period</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Volume (L)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.topCustomers.map((customer, idx) => (
                    <TableRow key={customer.customerId}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-muted-foreground w-4">{idx + 1}</span>
                          <span className="font-medium">{customer.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{customer.orderCount}</TableCell>
                      <TableCell className="text-right font-medium">
                        {customer.volumeLitres.toFixed(0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

