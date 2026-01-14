import { useMemo } from "react";
import { useUser } from "@/contexts/UserContext";
import { useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Printer, FileText, MapPin } from "lucide-react";
import { 
  getRoute, getOrdersByRoute, getCustomer,
  formatDate,
} from "@/lib/brewcrmService";

export default function BrewCrmRouteManifest() {
  const { user } = useUser();
  const workspaceId = user.id;
  
  const [, params] = useRoute("/brew/route-manifest/:routeId");
  const routeId = params?.routeId;
  
  const route = useMemo(() => {
    if (!routeId) return null;
    return getRoute(workspaceId, routeId);
  }, [workspaceId, routeId]);
  
  const orders = useMemo(() => {
    if (!routeId) return [];
    return getOrdersByRoute(workspaceId, routeId);
  }, [workspaceId, routeId]);
  
  const ordersWithCustomers = useMemo(() => {
    return orders.map(order => {
      const customer = getCustomer(workspaceId, order.customerId);
      return { order, customer };
    });
  }, [orders, workspaceId]);
  
  const handlePrint = () => {
    window.print();
  };
  
  if (!route) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Route Not Found</h2>
          <p className="text-muted-foreground mb-4">
            The route you're looking for doesn't exist.
          </p>
          <Button asChild>
            <Link href="/brew/routes">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Routes
            </Link>
          </Button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="p-6">
      {/* Header - hidden when printing */}
      <div className="mb-6 print:hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/brew/routes">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Link>
            </Button>
            <div>
              <h2 className="text-2xl font-semibold flex items-center gap-2">
                <FileText className="h-6 w-6" />
                Route Manifest
              </h2>
              <p className="text-sm text-muted-foreground">{route.name}</p>
            </div>
          </div>
          <Button onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print Manifest
          </Button>
        </div>
      </div>
      
      {/* Printable Content */}
      <div className="space-y-6">
        {/* Route Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              {route.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Delivery Date:</span>
                <p className="font-medium">{formatDate(route.deliveryDate)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Total Stops:</span>
                <p className="font-medium">{orders.length}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>
                <p>
                  <Badge variant={route.status === 'completed' ? 'default' : 'secondary'}>
                    {route.status}
                  </Badge>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Delivery Stops */}
        {ordersWithCustomers.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-muted-foreground">
                No orders assigned to this route yet.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {ordersWithCustomers.map(({ order, customer }, index) => (
              <Card key={order.id}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                      {index + 1}
                    </span>
                    {order.customerName}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-4">
                    {/* Delivery Address */}
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground mb-1">Delivery Address</h4>
                      {customer ? (
                        <div className="text-sm">
                          {customer.addressLine1 && <p>{customer.addressLine1}</p>}
                          {customer.addressLine2 && <p>{customer.addressLine2}</p>}
                          {customer.city && <p>{customer.city}</p>}
                          {customer.postcode && <p>{customer.postcode}</p>}
                          {!customer.addressLine1 && !customer.city && (
                            <p className="text-muted-foreground italic">No address on file</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">Customer not found</p>
                      )}
                    </div>
                    
                    {/* Delivery Notes */}
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground mb-1">Delivery Notes</h4>
                      <p className="text-sm">
                        {customer?.deliveryNotes || order.notes || (
                          <span className="text-muted-foreground italic">No notes</span>
                        )}
                      </p>
                    </div>
                  </div>
                  
                  {/* Order Lines */}
                  {order.lines && order.lines.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <h4 className="font-medium text-sm text-muted-foreground mb-2">Order Contents</h4>
                      <ul className="text-sm space-y-1">
                        {order.lines.map((line, i) => (
                          <li key={i}>
                            {line.quantity}x {line.productName}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {/* Delivery Status */}
                  <div className="mt-4 pt-4 border-t flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Status:</span>
                    <Badge variant={order.status === 'delivered' ? 'default' : 'secondary'}>
                      {order.status}
                    </Badge>
                    {order.deliveredAt && (
                      <span className="text-sm text-muted-foreground">
                        Delivered {formatDate(order.deliveredAt)}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
      
      {/* Print Styles */}
      <style>{`
        @media print {
          body { background: white; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}

