/**
 * ActivityFeed Component
 * Displays recent autonomous agent activities with auto-refresh
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CheckCircle2, Clock, Sparkles } from "lucide-react";
import { ActivityDetailModal } from "./ActivityDetailModal";

interface AgentActivity {
  id: string;
  userId: string;
  timestamp: number;
  taskGenerated: string;
  actionTaken: string;
  actionParams: any;
  results: any;
  interestingFlag: number;
  status: string;
  errorMessage: string | null;
  durationMs: number | null;
  conversationId: string | null;
  runId: string | null;
  metadata: any;
  createdAt: number;
}

interface ActivityFeedProps {
  limit?: number;
  autoRefresh?: boolean;
  refreshInterval?: number; // in milliseconds
  interestingOnly?: boolean;
  className?: string;
}

export function ActivityFeed({
  limit = 10,
  autoRefresh = true,
  refreshInterval = 30000, // 30 seconds
  interestingOnly = false,
  className = "",
}: ActivityFeedProps) {
  const [activities, setActivities] = useState<AgentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<AgentActivity | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const fetchActivities = async () => {
    try {
      const queryParams = new URLSearchParams({
        limit: limit.toString(),
        interestingOnly: interestingOnly.toString(),
      });

      const response = await fetch(`/api/agent-activities?${queryParams}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch activities: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.ok) {
        setActivities(data.activities);
        setError(null);
      } else {
        throw new Error(data.error || "Unknown error");
      }
    } catch (err) {
      console.error("Error fetching agent activities:", err);
      setError(err instanceof Error ? err.message : "Failed to load activities");
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchActivities();
  }, [limit, interestingOnly]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchActivities();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, limit, interestingOnly]);

  const handleActivityClick = (activity: AgentActivity) => {
    setSelectedActivity(activity);
    setDetailModalOpen(true);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      success: "default",
      failed: "destructive",
      pending: "secondary",
      skipped: "outline",
    };

    return (
      <Badge variant={variants[status] || "outline"} className="text-xs">
        {status}
      </Badge>
    );
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  };

  const formatDuration = (durationMs: number | null) => {
    if (!durationMs) return null;
    if (durationMs < 1000) return `${durationMs}ms`;
    return `${(durationMs / 1000).toFixed(1)}s`;
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Agent Activity Feed</CardTitle>
          <CardDescription>Recent autonomous agent actions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex flex-col space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Agent Activity Feed</CardTitle>
          <CardDescription>Recent autonomous agent actions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-red-500">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (activities.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Agent Activity Feed</CardTitle>
          <CardDescription>Recent autonomous agent actions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <p>No agent activities yet</p>
            <p className="text-sm mt-2">Activities will appear here when the autonomous agent starts working</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Agent Activity Feed
            {autoRefresh && (
              <Badge variant="outline" className="text-xs font-normal">
                Auto-refresh: {refreshInterval / 1000}s
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Showing {activities.length} recent {interestingOnly ? "interesting " : ""}
            activities
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px] pr-4">
            <div className="space-y-4">
              {activities.map((activity) => (
                <div
                  key={activity.id}
                  onClick={() => handleActivityClick(activity)}
                  className={`
                    p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md
                    ${activity.interestingFlag === 1 ? "border-purple-300 bg-purple-50/50" : "border-gray-200"}
                  `}
                >
                  {/* Header: Status Icon, Interesting Flag, Timestamp */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(activity.status)}
                      {activity.interestingFlag === 1 && (
                        <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700">
                          <Sparkles className="h-3 w-3 mr-1" />
                          Interesting
                        </Badge>
                      )}
                      {getStatusBadge(activity.status)}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatTimestamp(activity.timestamp)}
                    </span>
                  </div>

                  {/* Task Description */}
                  <h4 className="font-medium text-sm mb-1">{activity.taskGenerated}</h4>

                  {/* Action Taken */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                    <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                      {activity.actionTaken}
                    </span>
                    {activity.durationMs && (
                      <span className="text-xs">
                        {formatDuration(activity.durationMs)}
                      </span>
                    )}
                  </div>

                  {/* Results Summary (if success) */}
                  {activity.status === "success" && activity.results && (
                    <div className="text-xs text-gray-600 line-clamp-2">
                      {typeof activity.results === "object"
                        ? Object.entries(activity.results)
                            .slice(0, 3)
                            .map(([key, value]) => `${key}: ${value}`)
                            .join(" • ")
                        : String(activity.results)}
                    </div>
                  )}

                  {/* Error Message (if failed) */}
                  {activity.status === "failed" && activity.errorMessage && (
                    <div className="text-xs text-red-600 line-clamp-2">
                      Error: {activity.errorMessage}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Detail Modal */}
      {selectedActivity && (
        <ActivityDetailModal
          activity={selectedActivity}
          open={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
        />
      )}
    </>
  );
}
