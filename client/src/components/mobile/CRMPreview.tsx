/**
 * CRMPreview - Mobile-friendly CRM preview with desktop prompt
 * 
 * Shows:
 * - Desktop prompt encouraging full CRM use on desktop
 * - Quick stats overview
 * - Limited read-only actions
 */

import { Link } from "wouter";
import { 
  Monitor, 
  Users, 
  FileText, 
  Package,
  ChevronRight,
  ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface CRMPreviewProps {
  className?: string;
}

export function CRMPreview({ className }: CRMPreviewProps) {
  // Mock stats - would come from API
  const crmStats = {
    totalCustomers: 0,
    pendingOrders: 0,
    activeProducts: 0,
    recentActivity: 0,
  };

  return (
    <div className={cn("flex flex-col h-full overflow-y-auto", className)}>
      <div className="p-4 space-y-4">
        {/* Desktop Prompt Card */}
        <Card className="bg-gradient-to-br from-chart-1/10 via-chart-1/5 to-transparent border-chart-1/20">
          <CardContent className="p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-chart-1/20 flex items-center justify-center mx-auto mb-4">
              <Monitor className="w-8 h-8 text-chart-1" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              CRM Works Best on Desktop
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              For full CRM features including editing, bulk actions, and detailed reports, 
              open Wyshbone on your computer.
            </p>
            <Button size="lg" className="w-full" asChild>
              <a 
                href={window.location.origin} 
                target="_blank" 
                rel="noopener noreferrer"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Open on Desktop
              </a>
            </Button>
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Quick Overview</CardTitle>
            <CardDescription>Your CRM at a glance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-primary" />
                  <span className="text-sm text-muted-foreground">Customers</span>
                </div>
                <div className="text-2xl font-bold">{crmStats.totalCustomers}</div>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4 text-chart-2" />
                  <span className="text-sm text-muted-foreground">Pending Orders</span>
                </div>
                <div className="text-2xl font-bold">{crmStats.pendingOrders}</div>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-2">
                  <Package className="w-4 h-4 text-chart-3" />
                  <span className="text-sm text-muted-foreground">Products</span>
                </div>
                <div className="text-2xl font-bold">{crmStats.activeProducts}</div>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-2">
                  <ChevronRight className="w-4 h-4 text-chart-4" />
                  <span className="text-sm text-muted-foreground">Recent Activity</span>
                </div>
                <div className="text-2xl font-bold">{crmStats.recentActivity}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Limited Actions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Quick Access</CardTitle>
            <CardDescription>View-only access on mobile</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-between" asChild>
              <Link href="/auth/crm/customers">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  <span>View Customers</span>
                </div>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button variant="outline" className="w-full justify-between" asChild>
              <Link href="/auth/crm/orders">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  <span>View Orders</span>
                </div>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button variant="outline" className="w-full justify-between" asChild>
              <Link href="/leads">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  <span>View Leads</span>
                </div>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Info Notice */}
        <div className="text-center py-4 px-6">
          <p className="text-xs text-muted-foreground">
            💡 Tip: Your AI agent can do most CRM tasks for you. 
            Just ask in chat!
          </p>
        </div>
      </div>
    </div>
  );
}

export default CRMPreview;


