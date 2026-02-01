/**
 * AgentWorkspace - The default right panel view showing agent activity
 * 
 * Layout: Vertical stack with Live Activity anchored at bottom (chat-style)
 * - Header (fixed)
 * - Metrics cards (compact, collapsible)
 * - Live Activity Panel (flex-grow, takes remaining height like a chat)
 */

import { useState } from "react";
import { Link } from "wouter";
import { 
  TrendingUp, 
  Target,
  Mail,
  Calendar,
  Zap,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LiveActivityPanel } from "@/components/live-activity-panel";

interface AgentWorkspaceProps {
  className?: string;
}

export function AgentWorkspace({ className }: AgentWorkspaceProps) {
  const [showMetrics, setShowMetrics] = useState(true);
  
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

  return (
    <div className={cn("flex flex-col h-full overflow-hidden", className)}>
      {/* Header - Fixed at top */}
      <div className="flex-shrink-0 p-6 pb-4 border-b border-border">
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

      {/* Collapsible Metrics Section */}
      <div className="flex-shrink-0 border-b border-border/50">
        <button
          onClick={() => setShowMetrics(!showMetrics)}
          className="w-full flex items-center justify-between px-4 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
        >
          <span>Dashboard Metrics</span>
          {showMetrics ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        
        {showMetrics && (
          <div className="px-4 pb-3">
            <div className="grid grid-cols-4 gap-2">
              <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
                <CardContent className="p-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded-md bg-primary/20">
                      <Target className="w-3 h-3 text-primary" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-foreground">
                        {activitySummary.leadsFound}
                      </div>
                      <div className="text-[9px] text-muted-foreground">Leads Found</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-chart-2/10 to-chart-2/5 border-chart-2/20">
                <CardContent className="p-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded-md bg-chart-2/20">
                      <Mail className="w-3 h-3 text-chart-2" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-foreground">
                        {activitySummary.emailsSent}
                      </div>
                      <div className="text-[9px] text-muted-foreground">Emails Sent</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-chart-3/10 to-chart-3/5 border-chart-3/20">
                <CardContent className="p-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded-md bg-chart-3/20">
                      <Calendar className="w-3 h-3 text-chart-3" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-foreground">
                        {activitySummary.meetingsBooked}
                      </div>
                      <div className="text-[9px] text-muted-foreground">Meetings</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-chart-4/10 to-chart-4/5 border-chart-4/20">
                <CardContent className="p-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded-md bg-chart-4/20">
                      <TrendingUp className="w-3 h-3 text-chart-4" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-foreground">
                        {activitySummary.successRate}%
                      </div>
                      <div className="text-[9px] text-muted-foreground">Success</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Discoveries - compact inline */}
            {recentDiscoveries.length > 0 && (
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {recentDiscoveries.length} recent discoveries
                </span>
                <Button variant="ghost" size="sm" className="h-6 text-xs" asChild>
                  <Link href="/leads">
                    View All <ChevronRight className="w-3 h-3 ml-1" />
                  </Link>
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Live Activity Panel - Takes remaining height (flex-grow), chat-style at bottom */}
      <div className="flex-1 min-h-0 p-4">
        <LiveActivityPanel />
      </div>
    </div>
  );
}

export default AgentWorkspace;
