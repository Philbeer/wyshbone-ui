import { Route, Switch, Link, useLocation } from "wouter";
import { useUser } from "@/contexts/UserContext";
import { Building2, Users, Package, Truck, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CrmDashboard from "./dashboard";
import CrmCustomers from "./customers";
import CrmOrders from "./orders";
import CrmDeliveryRuns from "./delivery-runs";
import CrmSettings from "./settings";
import BrewCrmProducts from "../brewcrm/products";
import BrewCrmBatches from "../brewcrm/batches";
import BrewCrmInventory from "../brewcrm/inventory";
import BrewCrmContainers from "../brewcrm/containers";
import BrewCrmDutyReports from "../brewcrm/duty-reports";
import BrewCrmSettings from "../brewcrm/settings";

export default function CrmLayout() {
  const [location] = useLocation();
  const { user } = useUser();
  
  const isBrewCrm = location.startsWith("/crm/brew");
  
  return (
    <div className="h-full flex flex-col">
      <div className="border-b p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-crm-title">CRM System</h1>
            <p className="text-sm text-muted-foreground">Manage customers, orders, and operations</p>
          </div>
          <Tabs value={isBrewCrm ? "brewery" : "generic"} className="w-auto">
            <TabsList>
              <TabsTrigger value="generic" asChild>
                <Link href="/crm" data-testid="link-crm-generic">
                  <Building2 className="w-4 h-4 mr-2" />
                  Generic CRM
                </Link>
              </TabsTrigger>
              <TabsTrigger value="brewery" asChild>
                <Link href="/crm/brew" data-testid="link-crm-brewery">
                  <Package className="w-4 h-4 mr-2" />
                  Brewery CRM
                </Link>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        
        {!isBrewCrm ? (
          <div className="flex gap-2">
            <Button variant={location === "/crm" ? "default" : "ghost"} size="sm" asChild>
              <Link href="/crm" data-testid="link-crm-dashboard">
                <Building2 className="w-4 h-4 mr-2" />
                Dashboard
              </Link>
            </Button>
            <Button variant={location === "/crm/customers" ? "default" : "ghost"} size="sm" asChild>
              <Link href="/crm/customers" data-testid="link-crm-customers">
                <Users className="w-4 h-4 mr-2" />
                Customers
              </Link>
            </Button>
            <Button variant={location === "/crm/orders" ? "default" : "ghost"} size="sm" asChild>
              <Link href="/crm/orders" data-testid="link-crm-orders">
                <Package className="w-4 h-4 mr-2" />
                Orders
              </Link>
            </Button>
            <Button variant={location === "/crm/delivery-runs" ? "default" : "ghost"} size="sm" asChild>
              <Link href="/crm/delivery-runs" data-testid="link-crm-delivery-runs">
                <Truck className="w-4 h-4 mr-2" />
                Delivery Runs
              </Link>
            </Button>
            <Button variant={location === "/crm/settings" ? "default" : "ghost"} size="sm" asChild>
              <Link href="/crm/settings" data-testid="link-crm-settings">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Link>
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant={location === "/crm/brew" ? "default" : "ghost"} size="sm" asChild>
              <Link href="/crm/brew" data-testid="link-brewcrm-products">
                <Package className="w-4 h-4 mr-2" />
                Products
              </Link>
            </Button>
            <Button variant={location === "/crm/brew/batches" ? "default" : "ghost"} size="sm" asChild>
              <Link href="/crm/brew/batches" data-testid="link-brewcrm-batches">
                <Package className="w-4 h-4 mr-2" />
                Batches
              </Link>
            </Button>
            <Button variant={location === "/crm/brew/inventory" ? "default" : "ghost"} size="sm" asChild>
              <Link href="/crm/brew/inventory" data-testid="link-brewcrm-inventory">
                <Package className="w-4 h-4 mr-2" />
                Inventory
              </Link>
            </Button>
            <Button variant={location === "/crm/brew/containers" ? "default" : "ghost"} size="sm" asChild>
              <Link href="/crm/brew/containers" data-testid="link-brewcrm-containers">
                <Package className="w-4 h-4 mr-2" />
                Containers
              </Link>
            </Button>
            <Button variant={location === "/crm/brew/duty-reports" ? "default" : "ghost"} size="sm" asChild>
              <Link href="/crm/brew/duty-reports" data-testid="link-brewcrm-duty-reports">
                <Package className="w-4 h-4 mr-2" />
                Duty Reports
              </Link>
            </Button>
            <Button variant={location === "/crm/brew/settings" ? "default" : "ghost"} size="sm" asChild>
              <Link href="/crm/brew/settings" data-testid="link-brewcrm-settings">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Link>
            </Button>
          </div>
        )}
      </div>
      
      <div className="flex-1 overflow-auto">
        <Switch>
          <Route path="/crm" component={CrmDashboard} />
          <Route path="/crm/customers" component={CrmCustomers} />
          <Route path="/crm/orders" component={CrmOrders} />
          <Route path="/crm/delivery-runs" component={CrmDeliveryRuns} />
          <Route path="/crm/settings" component={CrmSettings} />
          
          <Route path="/crm/brew" component={BrewCrmProducts} />
          <Route path="/crm/brew/batches" component={BrewCrmBatches} />
          <Route path="/crm/brew/inventory" component={BrewCrmInventory} />
          <Route path="/crm/brew/containers" component={BrewCrmContainers} />
          <Route path="/crm/brew/duty-reports" component={BrewCrmDutyReports} />
          <Route path="/crm/brew/settings" component={BrewCrmSettings} />
        </Switch>
      </div>
    </div>
  );
}
