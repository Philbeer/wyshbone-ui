/**
 * AgentWorkspace - The default right panel view showing agent activity
 * 
 * Displays:
 * - Activity summary (today's agent work)
 * - Recent discoveries (leads found, opportunities)
 * - Upcoming tasks
 * - Quick access to CRM tools
 */

import { Link } from "wouter";
import { 
  TrendingUp, 
  Users, 
  FileText, 
  Package, 
  ChevronRight,
  Zap,
  Target,
  Mail,
  Calendar,
  Search,
  ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MostRecentRunPanel } from "@/components/most-recent-run-panel";

interface AgentWorkspaceProps {
  className?: string;
}

export function AgentWorkspace({ className }: AgentWorkspaceProps) {
  // Mock data - these would come from real API calls
  const activitySummary = {
    leadsFound: 0,
    emailsSent: 0,
    meetingsBooked: 0,
    successRate: 0,
  };

  const recentDiscoveries: Array<{
    id: string;
    name: string;
    type: string;
    score: number;
    foundAt: string;
  }> = [];

  const upcomingTasks: Array<{
    id: string;
    title: string;
    dueAt: string;
    priority: "high" | "medium" | "low";
  }> = [];

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex-shrink-0 p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              Agent Activity
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              What your AI sales agent has been working on
            </p>
          </div>
          <Badge variant="secondary" className="text-xs">
            <Zap className="w-3 h-3 mr-1" />
            24/7 Active
          </Badge>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Most Recent Run - AFR Summary (dev-only) */}
          <MostRecentRunPanel />
          
          {/* Activity Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/20">
                    <Target className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-foreground">
                      {activitySummary.leadsFound}
                    </div>
                    <div className="text-xs text-muted-foreground">Leads Found</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-chart-2/10 to-chart-2/5 border-chart-2/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-chart-2/20">
                    <Mail className="w-5 h-5 text-chart-2" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-foreground">
                      {activitySummary.emailsSent}
                    </div>
                    <div className="text-xs text-muted-foreground">Emails Sent</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-chart-3/10 to-chart-3/5 border-chart-3/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-chart-3/20">
                    <Calendar className="w-5 h-5 text-chart-3" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-foreground">
                      {activitySummary.meetingsBooked}
                    </div>
                    <div className="text-xs text-muted-foreground">Meetings Booked</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-chart-4/10 to-chart-4/5 border-chart-4/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-chart-4/20">
                    <TrendingUp className="w-5 h-5 text-chart-4" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-foreground">
                      {activitySummary.successRate}%
                    </div>
                    <div className="text-xs text-muted-foreground">Success Rate</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Discoveries */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Recent Discoveries</CardTitle>
                  <CardDescription>New leads found by your agent</CardDescription>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/leads">
                    View All <ChevronRight className="w-4 h-4 ml-1" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {recentDiscoveries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Search className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-medium text-foreground mb-1">
                    Your agent is searching...
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Tell your agent what kind of customers you're looking for, 
                    and they'll find them for you.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentDiscoveries.map((discovery) => (
                    <div
                      key={discovery.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Target className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{discovery.name}</div>
                          <div className="text-xs text-muted-foreground">{discovery.type}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          Score: {discovery.score}
                        </Badge>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming Agent Tasks */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Agent's Work Queue</CardTitle>
                  <CardDescription>What your agent is planning to do</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {upcomingTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Zap className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-medium text-foreground mb-1">
                    Ready for instructions
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Your agent is waiting for your next instruction. 
                    Tell them what you need!
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {upcomingTasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Badge
                          variant={
                            task.priority === "high"
                              ? "destructive"
                              : task.priority === "medium"
                              ? "default"
                              : "secondary"
                          }
                          className="text-xs"
                        >
                          {task.priority}
                        </Badge>
                        <span className="text-sm text-foreground">{task.title}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{task.dueAt}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Access CRM */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Agent's Workspace Tools</CardTitle>
              <CardDescription>Access the CRM where your agent tracks everything</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Button
                  variant="outline"
                  className="h-auto py-4 flex-col gap-2"
                  asChild
                >
                  <Link href="/auth/crm/customers">
                    <Users className="w-5 h-5 text-primary" />
                    <span className="text-sm">Customers</span>
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto py-4 flex-col gap-2"
                  asChild
                >
                  <Link href="/auth/crm/orders">
                    <FileText className="w-5 h-5 text-primary" />
                    <span className="text-sm">Orders</span>
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto py-4 flex-col gap-2"
                  asChild
                >
                  <Link href="/auth/crm/products">
                    <Package className="w-5 h-5 text-primary" />
                    <span className="text-sm">Products</span>
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto py-4 flex-col gap-2"
                  asChild
                >
                  <Link href="/leads">
                    <Target className="w-5 h-5 text-primary" />
                    <span className="text-sm">Leads</span>
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}

export default AgentWorkspace;


