import { useMemo } from "react";
import { useUser } from "@/contexts/UserContext";
import { useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Printer, ClipboardList } from "lucide-react";
import { 
  getRoutes, getOrders, getCustomers, formatDate,
  type BrewRoute, type BrewOrder, type BrewCustomer,
  DATA_SOURCE
} from "@/lib/brewcrmService";

export default function BrewCrmRouteManifestPage() {
  const { user } = useUser();
  const workspaceId = user.id;
  
  const [, params] = useRoute('/route-manifest/:routeId');
  const routeId = params?.routeId;
  
  const routes = useMemo(() => getRoutes(workspaceId), [workspaceId]);
  const allOrders = useMemo(() => getOrders(workspaceId), [workspaceId]);
  const customers = useMemo(() => getCustomers(workspaceId), [workspaceId]);
  
  const route = routes.find(r => r.id === routeId);
  
  const routeOrders = useMemo(() => {
    if (!route) return [];
    return route.orderIds
      .map(id => allOrders.find(o => o.id === id))
      .filter(Boolean) as BrewOrder[];
  }, [route, allOrders]);
  
  const getCustomer = (customerId: string): BrewCustomer | undefined => {
    return customers.find(c => c.id === customerId);
  };
  
  const handlePrint = () => {
    window.print();
  };
  
  if (!routeId) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-semibold">Route Manifest</h1>
            <Badge variant="secondary">PARTIAL</Badge>
          </div>
          <p className="text-muted-foreground">
            Select a route from the Routes page to view its manifest.
          </p>
          <p className="text-xs text-muted-foreground mt-1">Data Source: {DATA_SOURCE}</p>
        </div>
        
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No route selected. Go to Routes and click the manifest icon.</p>
            <Link href="/routes">
              <Button variant="outline" className="mt-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Go to Routes
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (!route) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>Route not found.</p>
            <Link href="/routes">
              <Button variant="outline" className="mt-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Go to Routes
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  const totalVolume = routeOrders.reduce((sum, o) => sum + o.totalVolumeLitres, 0);
  
  return (
    <div className="p-6">
      {/* Header - Hidden in print */}
      <div className="flex items-start justify-between mb-6 print:hidden">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link href="/routes">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-2xl font-semibold">Route Manifest</h1>
            <Badge variant="secondary">PARTIAL</Badge>
          </div>
          <p className="text-muted-foreground">
            Print-friendly delivery manifest for drivers.
          </p>
        </div>
        <Button onClick={handlePrint}>
          <Printer className="h-4 w-4 mr-2" />
          Print
        </Button>
      </div>
      
      {/* Manifest Content - Print-friendly */}
      <div className="space-y-6 print:space-y-4">
        {/* Route Header */}
        <Card className="print:shadow-none print:border-2">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-2xl">{route.name}</CardTitle>
                <div className="text-lg text-muted-foreground mt-1">
                  {formatDate(route.deliveryDate)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Total Stops</div>
                <div className="text-3xl font-bold">{routeOrders.length}</div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-8 text-sm">
              <div>
                <span className="text-muted-foreground">Total Volume:</span>
                <span className="font-bold ml-2">{totalVolume.toFixed(0)}L</span>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>
                <span className="font-bold ml-2 capitalize">{route.status.replace('_', ' ')}</span>
              </div>
            </div>
            {route.notes && (
              <div className="mt-4 p-3 bg-muted rounded-md">
                <div className="text-sm font-medium">Notes:</div>
                <div className="text-sm">{route.notes}</div>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Delivery Stops */}
        {routeOrders.map((order, idx) => {
          const customer = getCustomer(order.customerId);
          return (
            <Card key={order.id} className="print:shadow-none print:border print:break-inside-avoid">
              <CardHeader className="pb-2">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold">
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <CardTitle>{order.customerName}</CardTitle>
                    <div className="text-sm text-muted-foreground">
                      Order: {order.orderNumber}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground">Volume</div>
                    <div className="text-xl font-bold">{order.totalVolumeLitres.toFixed(0)}L</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Address */}
                {customer && (customer.addressLine1 || customer.city) && (
                  <div className="mb-4">
                    <div className="text-sm font-medium text-muted-foreground mb-1">Address</div>
                    <div className="text-sm">
                      {customer.addressLine1 && <div>{customer.addressLine1}</div>}
                      {customer.addressLine2 && <div>{customer.addressLine2}</div>}
                      {customer.city && <span>{customer.city}</span>}
                      {customer.postcode && <span className="ml-2">{customer.postcode}</span>}
                    </div>
                  </div>
                )}
                
                {/* Delivery Notes */}
                {customer?.deliveryNotes && (
                  <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                    <div className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                      Delivery Notes
                    </div>
                    <div className="text-sm">{customer.deliveryNotes}</div>
                  </div>
                )}
                
                <Separator className="my-3" />
                
                {/* Order Contents */}
                <div className="text-sm font-medium text-muted-foreground mb-2">Order Contents</div>
                <div className="space-y-1">
                  {order.lines.map((line, lineIdx) => (
                    <div key={lineIdx} className="flex justify-between text-sm py-1 border-b last:border-0">
                      <span>{line.productName}</span>
                      <span className="font-medium">
                        {line.quantity} × {line.packageSizeLitres}L = {line.volumeLitres}L
                      </span>
                    </div>
                  ))}
                </div>
                
                {order.notes && (
                  <div className="mt-3 text-sm text-muted-foreground">
                    <strong>Order Notes:</strong> {order.notes}
                  </div>
                )}
                
                {/* Signature Box - for print */}
                <div className="mt-4 pt-4 border-t print:block hidden">
                  <div className="flex gap-8">
                    <div className="flex-1">
                      <div className="text-sm text-muted-foreground mb-2">Received by:</div>
                      <div className="border-b border-dashed h-8"></div>
                    </div>
                    <div className="w-32">
                      <div className="text-sm text-muted-foreground mb-2">Time:</div>
                      <div className="border-b border-dashed h-8"></div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        
        {routeOrders.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No orders assigned to this route.
            </CardContent>
          </Card>
        )}
      </div>
      
      {/* Print Styles */}
      <style>{`
        @media print {
          body { 
            font-size: 12pt;
            background: white !important;
          }
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:border { border: 1px solid #ccc !important; }
          .print\\:border-2 { border: 2px solid #000 !important; }
          .print\\:break-inside-avoid { break-inside: avoid; }
          .print\\:space-y-4 > * + * { margin-top: 1rem; }
        }
      `}</style>
    </div>
  );
}

