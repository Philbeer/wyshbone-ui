import { Route, Switch, Link, useLocation } from "wouter";
import { useUser } from "@/contexts/UserContext";
import { Building2, Users, Package, Truck, Settings, Warehouse, Beer, FileText, Container, Boxes, Phone, DollarSign, BarChart3, CheckSquare, Activity, Store, QrCode, Calendar, ClipboardCheck, Factory } from "lucide-react";
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
import CrmDiary from "./diary";
import CrmTasks from "./tasks";
import CrmActivities from "./activities";
import CrmSuppliers from "./suppliers";
// TODO: Re-enable when filter API endpoints are implemented
// import CrmCustomerFilters from "./customer-filters";
import BrewCrmBatches from "../brewcrm/batches";
import BrewCrmContainers from "../brewcrm/containers";
import BrewCrmDutyReports from "../brewcrm/duty-reports";
import BrewCrmSettings from "../brewcrm/settings";
import BrewCrmPriceBooks from "../brewcrm/price-books";
import BrewCrmPriceBookDetail from "../brewcrm/price-book-detail";
import BrewCrmTradeStoreSettings from "../brewcrm/trade-store-settings";
import BrewCrmContainerScan from "../brewcrm/container-scan";
// Discovery pages
import EventsPage from "../events";
import EntityReviewPage from "../entity-review";
// New CRM features
import BrewCrmCustomers from "../brewcrm/customers";
import BrewCrmOrders from "../brewcrm/orders";
import BrewCrmRoutes from "../brewcrm/routes";
import BrewCrmRouteManifest from "../brewcrm/route-manifest";
import BrewCrmStock from "../brewcrm/stock";

export default function CrmLayout() {
  const [location] = useLocation();
  const { user } = useUser();
  
  // Strip query params for path matching
  const locationPath = location.split('?')[0];
  const isBrewCrm = locationPath.startsWith("/brew");
  
  // Helper to check if a path is active (for highlighting)
  const isActive = (path: string) => {
    if (path === "/" && !isBrewCrm) return locationPath === "/";
    if (path === "/brew") return locationPath === "/brew";
    return locationPath === path || locationPath.startsWith(path + "/");
  };
  
  return (
    <div className="h-full flex flex-col">
      <div className="border-b p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-crm-title">
              {isBrewCrm ? "Agent's Brewery Workspace" : "Agent's Workspace"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isBrewCrm 
                ? "Your agent tracks brewery batches, containers, and duty reports here" 
                : "Your agent tracks customers, orders, products, and stock here"
              }
            </p>
          </div>
          <Tabs value={isBrewCrm ? "brewery" : "generic"} className="w-auto">
            <TabsList>
              <TabsTrigger value="generic" asChild>
                <Link href="/" data-testid="link-crm-generic">
                  <Building2 className="w-4 h-4 mr-2" />
                  Standard Workspace
                </Link>
              </TabsTrigger>
              <TabsTrigger value="brewery" asChild>
                <Link href="/brew" data-testid="link-crm-brewery">
                  <Beer className="w-4 h-4 mr-2" />
                  Brewery Workspace
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
                <BarChart3 className="w-4 h-4 mr-2" />
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
            <Button variant={isActive("/suppliers") ? "default" : "ghost"} size="sm" asChild>
              <Link href="/suppliers" data-testid="link-crm-suppliers">
                <Factory className="w-4 h-4 mr-2" />
                Suppliers
              </Link>
            </Button>
            {/* TODO: Add filters functionality later - requires /api/crm/saved-filters and /api/crm/customers/filter endpoints */}
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
            <Button variant={isActive("/diary") ? "default" : "ghost"} size="sm" asChild>
              <Link href="/diary" data-testid="link-crm-diary">
                <Phone className="w-4 h-4 mr-2" />
                Sales Diary
              </Link>
            </Button>
            <Button variant={isActive("/tasks") ? "default" : "ghost"} size="sm" asChild>
              <Link href="/tasks" data-testid="link-crm-tasks">
                <CheckSquare className="w-4 h-4 mr-2" />
                Tasks
              </Link>
            </Button>
            <Button variant={isActive("/activities") ? "default" : "ghost"} size="sm" asChild>
              <Link href="/activities" data-testid="link-crm-activities">
                <Activity className="w-4 h-4 mr-2" />
                Activities
              </Link>
            </Button>
            <Button variant={isActive("/events") ? "default" : "ghost"} size="sm" asChild>
              <Link href="/events" data-testid="link-crm-events">
                <Calendar className="w-4 h-4 mr-2" />
                Events
              </Link>
            </Button>
            <Button variant={isActive("/entity-review") ? "default" : "ghost"} size="sm" asChild>
              <Link href="/entity-review" data-testid="link-crm-entity-review">
                <ClipboardCheck className="w-4 h-4 mr-2" />
                Review Queue
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
          <div className="flex gap-2 flex-wrap">
            <Button variant={isActive("/brew") || isActive("/brew/batches") ? "default" : "ghost"} size="sm" asChild>
              <Link href="/brew" data-testid="link-brewcrm-batches">
                <Boxes className="w-4 h-4 mr-2" />
                Batches
              </Link>
            </Button>
            <Button variant={isActive("/brew/containers") ? "default" : "ghost"} size="sm" asChild>
              <Link href="/brew/containers" data-testid="link-brewcrm-containers">
                <Container className="w-4 h-4 mr-2" />
                Containers
              </Link>
            </Button>
            <Button variant={isActive("/brew/container-scan") ? "default" : "ghost"} size="sm" asChild>
              <Link href="/brew/container-scan" data-testid="link-brewcrm-container-scan">
                <QrCode className="w-4 h-4 mr-2" />
                Scanner
              </Link>
            </Button>
            <Button variant={isActive("/brew/duty-reports") ? "default" : "ghost"} size="sm" asChild>
              <Link href="/brew/duty-reports" data-testid="link-brewcrm-duty-reports">
                <FileText className="w-4 h-4 mr-2" />
                Duty Reports
              </Link>
            </Button>
            <Button variant={locationPath.startsWith("/brew/price-books") ? "default" : "ghost"} size="sm" asChild>
              <Link href="/brew/price-books" data-testid="link-brewcrm-price-books">
                <DollarSign className="w-4 h-4 mr-2" />
                Price Books
              </Link>
            </Button>
            <Button variant={isActive("/brew/trade-store") ? "default" : "ghost"} size="sm" asChild>
              <Link href="/brew/trade-store" data-testid="link-brewcrm-trade-store">
                <Store className="w-4 h-4 mr-2" />
                Trade Store
              </Link>
            </Button>
            <Button variant={isActive("/brew/settings") ? "default" : "ghost"} size="sm" asChild>
              <Link href="/brew/settings" data-testid="link-brewcrm-settings">
                <Settings className="w-4 h-4 mr-2" />
                Brewery Settings
              </Link>
            </Button>
          </div>
        )}
      </div>
      
      <div className="flex-1 overflow-auto">
        <Switch>
          {/* Generic CRM Routes */}
          <Route path="/products" component={CrmProducts} />
          <Route path="/customers" component={CrmCustomers} />
          <Route path="/suppliers" component={CrmSuppliers} />
          {/* TODO: Re-enable when filter API endpoints are implemented */}
          {/* <Route path="/filters" component={CrmCustomerFilters} /> */}
          <Route path="/orders" component={CrmOrders} />
          <Route path="/delivery-runs" component={CrmDeliveryRuns} />
          <Route path="/stock" component={CrmStock} />
          <Route path="/diary" component={CrmDiary} />
          <Route path="/tasks" component={CrmTasks} />
          <Route path="/activities" component={CrmActivities} />
          <Route path="/events" component={EventsPage} />
          <Route path="/entity-review" component={EntityReviewPage} />
          <Route path="/settings" component={CrmSettings} />
          
          {/* Brewery CRM Routes */}
          <Route path="/brew/batches" component={BrewCrmBatches} />
          <Route path="/brew/containers" component={BrewCrmContainers} />
          <Route path="/brew/container-scan" component={BrewCrmContainerScan} />
          <Route path="/brew/duty-reports" component={BrewCrmDutyReports} />
          <Route path="/brew/price-books/:id" component={BrewCrmPriceBookDetail} />
          <Route path="/brew/price-books" component={BrewCrmPriceBooks} />
          <Route path="/brew/trade-store" component={BrewCrmTradeStoreSettings} />
          <Route path="/brew/settings" component={BrewCrmSettings} />
          <Route path="/brew" component={BrewCrmBatches} />
          
          {/* Default Route - Generic CRM Dashboard */}
          <Route path="/" component={CrmDashboard} />
        </Switch>
      </div>
    </div>
  );
}
