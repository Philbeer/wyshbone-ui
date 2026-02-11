/**
 * AgentWorkspace - The default right panel view showing agent activity
 * 
 * Displays:
 * - Activity summary (today's agent work)
 * - Recent discoveries (leads found, opportunities)
 * - Upcoming tasks
 * - Quick access to CRM tools
 */

import { useState } from "react";
import { 
  TrendingUp, 
  Zap,
  Target,
  Mail,
  Calendar,
  Play
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LiveActivityPanel } from "@/components/live-activity-panel";
import { useCurrentRequest } from "@/contexts/CurrentRequestContext";

interface AgentWorkspaceProps {
  className?: string;
}

export function AgentWorkspace({ className }: AgentWorkspaceProps) {
  const { currentClientRequestId, setCurrentClientRequestId, pinnedClientRequestId, setPinnedClientRequestId, lastCompletedClientRequestId } = useCurrentRequest();
  const [demoStatus, setDemoStatus] = useState<string | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [proofLoading, setProofLoading] = useState(false);

  async function handleRunSupervisorDemo() {
    setDemoLoading(true);
    setDemoStatus(null);
    try {
      const res = await fetch("/api/debug/demo-plan-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded ${res.status}`);
      }
      const data = await res.json();
      const id = data.clientRequestId;
      if (!id) throw new Error("No clientRequestId in response");
      setCurrentClientRequestId(id);
      setPinnedClientRequestId(id);
      setDemoStatus(`Following ${id.slice(0, 8)}…`);
    } catch (err: any) {
      setDemoStatus(`Error: ${err.message}`);
    } finally {
      setDemoLoading(false);
    }
  }

  async function handleProofTowerLoop() {
    setProofLoading(true);
    setDemoStatus(null);
    try {
      const res = await fetch("/api/proof/tower-loop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded ${res.status}`);
      }
      const data = await res.json();
      const id = data.clientRequestId;
      if (!id) throw new Error("No clientRequestId in response");
      setCurrentClientRequestId(id);
      setPinnedClientRequestId(id);
      setDemoStatus(`Proof run: ${id.slice(0, 8)}…`);
    } catch (err: any) {
      setDemoStatus(`Error: ${err.message}`);
    } finally {
      setProofLoading(false);
    }
  }

  // Mock data - these would come from real API calls
  const activitySummary = {
    leadsFound: 0,
    emailsSent: 0,
    meetingsBooked: 0,
    successRate: 0,
  };


  return (
    <div className={cn("flex flex-col flex-1 min-h-0 h-full", className)}>
      {/* Header */}
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
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRunSupervisorDemo}
              disabled={demoLoading}
            >
              <Play className="w-3 h-3 mr-1" />
              {demoLoading ? "Starting…" : "Run Supervisor Demo"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleProofTowerLoop}
              disabled={proofLoading}
              className="border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300"
            >
              <Play className="w-3 h-3 mr-1" />
              {proofLoading ? "Starting…" : "Proof: Tower Loop"}
            </Button>
            <Badge variant="secondary" className="text-xs">
              <Zap className="w-3 h-3 mr-1" />
              24/7 Active
            </Badge>
          </div>
        </div>
        {demoStatus && (
          <p className="text-xs text-muted-foreground mt-2">{demoStatus}</p>
        )}
      </div>

      {/* Live Activity Panel - fills available height, scrolls internally */}
      <div className="flex-1 min-h-0 flex flex-col p-6 pb-3">
        {(() => {
          const resolvedId = pinnedClientRequestId ?? currentClientRequestId ?? lastCompletedClientRequestId;
          return <LiveActivityPanel key={resolvedId ?? 'none'} activeClientRequestId={resolvedId} />;
        })()}
      </div>

      {/* Activity Metrics - fixed height footer section */}
      <div className="flex-shrink-0 overflow-x-auto px-6 pb-6">
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
      </div>
    </div>
  );
}

export default AgentWorkspace;


