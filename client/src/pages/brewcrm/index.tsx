import { Route, Switch, Link, useLocation } from "wouter";
import { useUser } from "@/contexts/UserContext";
import { 
  Package, Users, ShoppingCart, Truck, ClipboardList, 
  Calculator, FileText, BarChart3, Warehouse, Container,
  Settings, Home, RefreshCw, MapPin, CheckCircle, Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

// Import all BrewCRM pages
import BrewCrmProductsPage from "./products-v2";
import BrewCrmCustomersPage from "./customers-v2";
import BrewCrmOrdersPage from "./orders-v2";
import BrewCrmDutyCalculatorPage from "./duty-calculator";
import BrewCrmDutyReportPage from "./duty-report";
import BrewCrmRoutesPage from "./routes";
import BrewCrmRouteManifestPage from "./route-manifest";
import BrewCrmStockPage from "./stock";
import BrewCrmContainersPage from "./containers-v2";
import BrewCrmSalesSummaryPage from "./sales-summary";
import BrewCrmCustomerActivityPage from "./customer-activity";
import BrewCrmSettingsPage from "./settings";

// Feature index with status
interface Feature {
  id: string;
  code: string;
  name: string;
  description: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  status: 'LIVE' | 'PARTIAL' | 'STUB';
  category: 'A' | 'B' | 'C' | 'D' | 'E';
}

const FEATURES: Feature[] = [
  // A. Products & Duty
  { id: 'A1', code: 'A1', name: 'Products', description: 'Product CRUD with duty category derivation', path: '/products', icon: Package, status: 'LIVE', category: 'A' },
  { id: 'A2', code: 'A2', name: 'Duty Calculator', description: 'SBR piecewise rate calculation', path: '/duty-calculator', icon: Calculator, status: 'LIVE', category: 'A' },
  { id: 'A3', code: 'A3', name: 'Duty Report', description: 'Monthly HMRC duty report', path: '/duty-report', icon: FileText, status: 'PARTIAL', category: 'A' },
  
  // B. Customers & Sales
  { id: 'B1', code: 'B1', name: 'Customers', description: 'Customer CRUD with delivery notes', path: '/customers', icon: Users, status: 'LIVE', category: 'B' },
  { id: 'B2', code: 'B2', name: 'Customer Filters', description: 'Filter & sort customers', path: '/customers', icon: Users, status: 'LIVE', category: 'B' },
  { id: 'B3', code: 'B3', name: 'Orders', description: 'Orders with auto duty calc', path: '/orders', icon: ShoppingCart, status: 'PARTIAL', category: 'B' },
  { id: 'B4', code: 'B4', name: 'Repeat Orders', description: 'Weekly/fortnightly repeats', path: '/orders', icon: RefreshCw, status: 'PARTIAL', category: 'B' },
  
  // C. Delivery & Routes
  { id: 'C1', code: 'C1', name: 'Routes', description: 'Manual route management', path: '/routes', icon: MapPin, status: 'PARTIAL', category: 'C' },
  { id: 'C2', code: 'C2', name: 'Route Manifest', description: 'Print-friendly delivery list', path: '/route-manifest', icon: ClipboardList, status: 'PARTIAL', category: 'C' },
  { id: 'C3', code: 'C3', name: 'Delivery Completion', description: 'Mark delivered + timestamp', path: '/routes', icon: CheckCircle, status: 'PARTIAL', category: 'C' },
  
  // D. Stock & Containers
  { id: 'D1', code: 'D1', name: 'Stock', description: 'Track by product & package', path: '/stock', icon: Warehouse, status: 'PARTIAL', category: 'D' },
  { id: 'D2', code: 'D2', name: 'Containers', description: 'Cask/keg tracking', path: '/containers', icon: Container, status: 'PARTIAL', category: 'D' },
  
  // E. Reporting
  { id: 'E1', code: 'E1', name: 'Sales Summary', description: 'Volume, duty, top products/customers', path: '/sales-summary', icon: BarChart3, status: 'PARTIAL', category: 'E' },
  { id: 'E2', code: 'E2', name: 'Customer Activity', description: 'Per-customer volume & duty YTD', path: '/customer-activity', icon: Activity, status: 'PARTIAL', category: 'E' },
];

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  'A': { label: 'Products & Duty', color: 'bg-green-500' },
  'B': { label: 'Customers & Sales', color: 'bg-blue-500' },
  'C': { label: 'Delivery & Routes', color: 'bg-yellow-500' },
  'D': { label: 'Stock & Containers', color: 'bg-purple-500' },
  'E': { label: 'Reporting', color: 'bg-red-500' },
};

function getStatusBadgeVariant(status: Feature['status']): 'default' | 'secondary' | 'outline' {
  switch (status) {
    case 'LIVE': return 'default';
    case 'PARTIAL': return 'secondary';
    case 'STUB': return 'outline';
  }
}

function FeatureIndex() {
  const categories = ['A', 'B', 'C', 'D', 'E'] as const;
  
  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Brew CRM V1</h1>
        <p className="text-muted-foreground">
          Full brewery CRM with duty calculation, customer management, orders, routes, and reporting.
        </p>
        <div className="flex gap-4 mt-4">
          <div className="flex items-center gap-2">
            <Badge variant="default">LIVE</Badge>
            <span className="text-sm text-muted-foreground">Fully functional</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">PARTIAL</Badge>
            <span className="text-sm text-muted-foreground">Core features working</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">STUB</Badge>
            <span className="text-sm text-muted-foreground">UI placeholder</span>
          </div>
        </div>
        <div className="mt-4 p-3 bg-muted/30 rounded-md inline-flex items-center gap-2">
          <span className="text-sm font-medium">Data Source:</span>
          <Badge variant="outline">LOCAL MOCK (localStorage)</Badge>
        </div>
      </div>

      <div className="space-y-8">
        {categories.map(cat => {
          const categoryInfo = CATEGORY_LABELS[cat];
          const categoryFeatures = FEATURES.filter(f => f.category === cat);
          
          return (
            <div key={cat}>
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-2 h-8 rounded ${categoryInfo.color}`} />
                <h2 className="text-xl font-semibold">{categoryInfo.label}</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {categoryFeatures.map(feature => (
                  <Link key={feature.id} href={feature.path}>
                    <Card className="cursor-pointer hover:bg-muted/50 transition-colors h-full">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <feature.icon className="h-5 w-5 text-muted-foreground" />
                            <CardTitle className="text-base">{feature.code}: {feature.name}</CardTitle>
                          </div>
                          <Badge variant={getStatusBadgeVariant(feature.status)}>
                            {feature.status}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <CardDescription>{feature.description}</CardDescription>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Navigation items for the sidebar
const NAV_ITEMS = [
  { path: '/', label: 'Feature Index', icon: Home },
  null, // Separator
  { path: '/products', label: 'Products', icon: Package },
  { path: '/duty-calculator', label: 'Duty Calculator', icon: Calculator },
  { path: '/duty-report', label: 'Duty Report', icon: FileText },
  null,
  { path: '/customers', label: 'Customers', icon: Users },
  { path: '/orders', label: 'Orders', icon: ShoppingCart },
  null,
  { path: '/routes', label: 'Routes', icon: MapPin },
  { path: '/route-manifest', label: 'Route Manifest', icon: ClipboardList },
  null,
  { path: '/stock', label: 'Stock', icon: Warehouse },
  { path: '/containers', label: 'Containers', icon: Container },
  null,
  { path: '/sales-summary', label: 'Sales Summary', icon: BarChart3 },
  { path: '/customer-activity', label: 'Customer Activity', icon: Activity },
  null,
  { path: '/settings', label: 'Settings', icon: Settings },
];

export default function BrewCrmLayout() {
  const [location] = useLocation();
  const { user } = useUser();
  
  return (
    <div className="h-full flex">
      {/* Sidebar Navigation */}
      <div className="w-64 border-r bg-muted/20 flex flex-col">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-lg">Brew CRM</h2>
          <p className="text-xs text-muted-foreground">Brewery Management System</p>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {NAV_ITEMS.map((item, idx) => {
              if (item === null) {
                return <div key={idx} className="h-px bg-border my-2" />;
              }
              const isActive = location === item.path || 
                (item.path !== '/' && location.startsWith(item.path));
              return (
                <Link key={item.path} href={item.path}>
                  <Button
                    variant={isActive ? 'secondary' : 'ghost'}
                    size="sm"
                    className="w-full justify-start"
                  >
                    <item.icon className="h-4 w-4 mr-2" />
                    {item.label}
                  </Button>
                </Link>
              );
            })}
          </div>
        </ScrollArea>
        <div className="p-3 border-t text-xs text-muted-foreground">
          <div>Data: LOCAL MOCK</div>
          <div>User: {user.id?.substring(0, 8)}...</div>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <Switch>
          <Route path="/products" component={BrewCrmProductsPage} />
          <Route path="/duty-calculator" component={BrewCrmDutyCalculatorPage} />
          <Route path="/duty-report" component={BrewCrmDutyReportPage} />
          <Route path="/customers" component={BrewCrmCustomersPage} />
          <Route path="/orders" component={BrewCrmOrdersPage} />
          <Route path="/routes" component={BrewCrmRoutesPage} />
          <Route path="/route-manifest" component={BrewCrmRouteManifestPage} />
          <Route path="/route-manifest/:routeId" component={BrewCrmRouteManifestPage} />
          <Route path="/stock" component={BrewCrmStockPage} />
          <Route path="/containers" component={BrewCrmContainersPage} />
          <Route path="/sales-summary" component={BrewCrmSalesSummaryPage} />
          <Route path="/customer-activity" component={BrewCrmCustomerActivityPage} />
          <Route path="/settings" component={BrewCrmSettingsPage} />
          <Route path="/" component={FeatureIndex} />
        </Switch>
      </div>
    </div>
  );
}

