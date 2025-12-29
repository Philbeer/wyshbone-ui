import { Route, Switch, Link, useLocation } from "wouter";
import { useUser } from "@/contexts/UserContext";
import { 
  Building2, Users, Package, Truck, Settings, ShoppingCart, 
  MapPin, FileText, Warehouse, Container, Beer, Boxes
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import CrmDashboard from "./dashboard";
import CrmCustomers from "./customers";
import CrmOrders from "./orders";
import CrmDeliveryRuns from "./delivery-runs";
import CrmSettings from "./settings";
import CrmProducts from "./products";
import CrmStock from "./stock";
import BrewCrmProducts from "../brewcrm/products";
import BrewCrmBatches from "../brewcrm/batches";
import BrewCrmInventory from "../brewcrm/inventory";
import BrewCrmContainers from "../brewcrm/containers";
import BrewCrmDutyReports from "../brewcrm/duty-reports";
import BrewCrmSettings from "../brewcrm/settings";
// New CRM features
import BrewCrmCustomers from "../brewcrm/customers";
import BrewCrmOrders from "../brewcrm/orders";
import BrewCrmRoutes from "../brewcrm/routes";
import BrewCrmRouteManifest from "../brewcrm/route-manifest";
import BrewCrmStock from "../brewcrm/stock";

export default function CrmLayout() {
  const [location] = useLocation();
  const { user } = useUser();
  
  const isBrewCrm = location.startsWith("/brew");
  
  // Helper to check if a path is active (for highlighting)
  const isActive = (path: string) => {
    if (path === "/" && !isBrewCrm) return location === "/";
    if (path === "/brew") return location === "/brew";
    return location === path;
  };
  
  return (
    <div className="h-full flex flex-col">
      <div className="border-b p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-crm-title">
              {isBrewCrm ? "Brewery CRM" : "CRM System"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isBrewCrm 
                ? "Brewery-specific management: products, batches, duty reports" 
                : "Manage customers, orders, products, and stock"
              }
            </p>
          </div>
          <Tabs value={isBrewCrm ? "brewery" : "generic"} className="w-auto">
            <TabsList>
              <TabsTrigger value="generic" asChild>
                <Link href="/" data-testid="link-crm-generic">
                  <Building2 className="w-4 h-4 mr-2" />
                  Generic CRM
                </Link>
              </TabsTrigger>
              <TabsTrigger value="brewery" asChild>
                <Link href="/brew" data-testid="link-crm-brewery">
                  <Beer className="w-4 h-4 mr-2" />
                  Brewery CRM
                </Link>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        
        {!isBrewCrm ? (
          // Generic CRM Navigation
          <div className="flex gap-2 flex-wrap">
            <Button variant={isActive("/") ? "default" : "ghost"} size="sm" asChild>
              <Link href="/" data-testid="link-crm-dashboard">
                <Building2 className="w-4 h-4 mr-2" />
                Dashboard
              </Link>
            </Button>
            <Button variant={isActive("/products") ? "default" : "ghost"} size="sm" asChild>
              <Link href="/products" data-testid="link-crm-products">
                <Package className="w-4 h-4 mr-2" />
                Products
              </Link>
            </Button>
            <Button variant={isActive("/customers") ? "default" : "ghost"} size="sm" asChild>
              <Link href="/customers" data-testid="link-crm-customers">
                <Users className="w-4 h-4 mr-2" />
                Customers
              </Link>
            </Button>
            <Button variant={isActive("/orders") ? "default" : "ghost"} size="sm" asChild>
              <Link href="/orders" data-testid="link-crm-orders">
                <FileText className="w-4 h-4 mr-2" />
                Orders
              </Link>
            </Button>
            <Button variant={isActive("/delivery-runs") ? "default" : "ghost"} size="sm" asChild>
              <Link href="/delivery-runs" data-testid="link-crm-delivery-runs">
                <Truck className="w-4 h-4 mr-2" />
                Delivery Runs
              </Link>
            </Button>
            <Button variant={isActive("/stock") ? "default" : "ghost"} size="sm" asChild>
              <Link href="/stock" data-testid="link-crm-stock">
                <Warehouse className="w-4 h-4 mr-2" />
                Stock
              </Link>
            </Button>
            <Button variant={isActive("/settings") ? "default" : "ghost"} size="sm" asChild>
              <Link href="/settings" data-testid="link-crm-settings">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Link>
            </Button>
          </div>
        ) : (
          // Brewery CRM Navigation
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex gap-2 pb-2">
              {/* Products */}
              <Button variant={location === "/brew" ? "default" : "ghost"} size="sm" asChild>
                <Link href="/brew" data-testid="link-brewcrm-products">
                  <Package className="w-4 h-4 mr-2" />
                  Products
                </Link>
              </Button>
              
              {/* Customers */}
              <Button variant={location === "/brew/customers" ? "default" : "ghost"} size="sm" asChild>
                <Link href="/brew/customers" data-testid="link-brewcrm-customers">
                  <Users className="w-4 h-4 mr-2" />
                  Customers
                </Link>
              </Button>
              
              {/* Orders */}
              <Button variant={location === "/brew/orders" ? "default" : "ghost"} size="sm" asChild>
                <Link href="/brew/orders" data-testid="link-brewcrm-orders">
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Orders
                </Link>
              </Button>
              
              {/* Routes */}
              <Button variant={location === "/brew/routes" || location.startsWith("/brew/route-manifest") ? "default" : "ghost"} size="sm" asChild>
                <Link href="/brew/routes" data-testid="link-brewcrm-routes">
                  <MapPin className="w-4 h-4 mr-2" />
                  Routes
                </Link>
              </Button>
              
              {/* Stock */}
              <Button variant={location === "/brew/stock" ? "default" : "ghost"} size="sm" asChild>
                <Link href="/brew/stock" data-testid="link-brewcrm-stock">
                  <Warehouse className="w-4 h-4 mr-2" />
                  Stock
                </Link>
              </Button>
              
              {/* Containers */}
              <Button variant={location === "/brew/containers" ? "default" : "ghost"} size="sm" asChild>
                <Link href="/brew/containers" data-testid="link-brewcrm-containers">
                  <Container className="w-4 h-4 mr-2" />
                  Containers
                </Link>
              </Button>
              
              {/* Duty Reports */}
              <Button variant={location === "/brew/duty-reports" ? "default" : "ghost"} size="sm" asChild>
                <Link href="/brew/duty-reports" data-testid="link-brewcrm-duty-reports">
                  <FileText className="w-4 h-4 mr-2" />
                  Duty Reports
                </Link>
              </Button>
              
              {/* Settings - contains duty calculator (FROZEN) */}
              <Button variant={location === "/brew/settings" ? "default" : "ghost"} size="sm" asChild>
                <Link href="/brew/settings" data-testid="link-brewcrm-settings">
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </Link>
              </Button>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        )}
      </div>
      
      <div className="flex-1 overflow-auto">
        <Switch>
          {/* Generic CRM Routes */}
          <Route path="/products" component={CrmProducts} />
          <Route path="/customers" component={CrmCustomers} />
          <Route path="/orders" component={CrmOrders} />
          <Route path="/delivery-runs" component={CrmDeliveryRuns} />
          <Route path="/stock" component={CrmStock} />
          <Route path="/settings" component={CrmSettings} />
          
          {/* Brewery CRM Routes */}
          <Route path="/brew/customers" component={BrewCrmCustomers} />
          <Route path="/brew/orders" component={BrewCrmOrders} />
          <Route path="/brew/routes" component={BrewCrmRoutes} />
          <Route path="/brew/route-manifest/:routeId" component={BrewCrmRouteManifest} />
          <Route path="/brew/stock" component={BrewCrmStock} />
          <Route path="/brew/batches" component={BrewCrmBatches} />
          <Route path="/brew/inventory" component={BrewCrmInventory} />
          <Route path="/brew/containers" component={BrewCrmContainers} />
          <Route path="/brew/duty-reports" component={BrewCrmDutyReports} />
          <Route path="/brew/settings" component={BrewCrmSettings} />
          <Route path="/brew" component={BrewCrmProducts} />
          
          {/* Default Route - Generic CRM Dashboard */}
          <Route path="/" component={CrmDashboard} />
        </Switch>
      </div>
    </div>
  );
}
