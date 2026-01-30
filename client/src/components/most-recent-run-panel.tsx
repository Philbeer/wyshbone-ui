import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Clock, CheckCircle2, XCircle, Loader2, AlertTriangle } from "lucide-react";
import type { Run, RunBundle } from "@/types/afr";
import { cn } from "@/lib/utils";

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
}

function StatusBadge({ status }: { status: Run["status"] }) {
  const config = {
    pending: { icon: Clock, label: "Pending", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200" },
    running: { icon: Loader2, label: "Running", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200" },
    completed: { icon: CheckCircle2, label: "Completed", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200" },
    failed: { icon: XCircle, label: "Failed", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200" },
    stopped: { icon: AlertTriangle, label: "Stopped", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200" },
  };

  const { icon: Icon, label, className } = config[status] || config.pending;
  
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", className)}>
      <Icon className={cn("h-3 w-3", status === "running" && "animate-spin")} />
      {label}
    </span>
  );
}

export function MostRecentRunPanel() {
  const [latestRun, setLatestRun] = useState<Run | null>(null);
  const [bundle, setBundle] = useState<RunBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchLatestRun = useCallback(async () => {
    try {
      const runsResponse = await fetch("/api/afr/runs?limit=1");
      if (!runsResponse.ok) {
        throw new Error("Failed to fetch runs");
      }
      
      const runs: Run[] = await runsResponse.json();
      
      if (runs.length === 0) {
        setLatestRun(null);
        setBundle(null);
        setError(null);
        setLoading(false);
        setLastFetch(new Date());
        return;
      }

      const run = runs[0];
      setLatestRun(run);

      const bundleResponse = await fetch(`/api/afr/runs/${run.id}`);
      if (bundleResponse.ok) {
        const bundleData: RunBundle = await bundleResponse.json();
        setBundle(bundleData);
      } else {
        setBundle(null);
      }

      setError(null);
      setLastFetch(new Date());
    } catch (err: any) {
      console.error("[MostRecentRunPanel] Fetch error:", err);
      setError("Could not load latest run.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLatestRun();
  }, [fetchLatestRun]);

  useEffect(() => {
    const isRunning = latestRun?.status === "running" || latestRun?.status === "pending";
    const intervalMs = isRunning ? 3000 : 15000;

    const interval = setInterval(() => {
      fetchLatestRun();
    }, intervalMs);

    return () => clearInterval(interval);
  }, [latestRun?.status, fetchLatestRun]);

  useEffect(() => {
    const handleFocus = () => {
      fetchLatestRun();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchLatestRun]);

  if (loading) {
    return (
      <Card className="h-auto">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Most Recent Run
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="h-auto">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Most Recent Run</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-sm text-muted-foreground">{error}</div>
          <Button variant="outline" size="sm" onClick={fetchLatestRun}>
            <RefreshCw className="h-3 w-3 mr-1" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!latestRun) {
    return (
      <Card className="h-auto">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Most Recent Run</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            No runs yet. Start by typing a request in chat.
          </div>
        </CardContent>
      </Card>
    );
  }

  const stopConditions = bundle?.stop_conditions || [];
  const decisions = bundle?.decisions || [];
  const recentDecisions = decisions.slice(-6);
  const outcome = bundle?.outcome;
  const goalWorth = bundle?.goal_worth;

  return (
    <Card className="h-auto">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Most Recent Run</CardTitle>
          {lastFetch && (
            <span className="text-[10px] text-muted-foreground">
              Updated {formatRelativeTime(lastFetch.toISOString())}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium leading-tight flex-1">
              {latestRun.goal_summary}
            </p>
            <StatusBadge status={latestRun.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            {formatRelativeTime(latestRun.created_at)}
          </p>
        </div>

        {(goalWorth || stopConditions.length > 0) && (
          <div className="space-y-1">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Worth / Constraints
            </h4>
            {goalWorth && (
              <p className="text-xs">
                <span className="font-medium">Golden worth:</span> {typeof goalWorth === 'string' ? goalWorth : JSON.stringify(goalWorth)}
              </p>
            )}
            {stopConditions.length > 0 && (
              <ul className="text-xs space-y-0.5 list-disc list-inside text-muted-foreground">
                {stopConditions.slice(0, 3).map((sc, i) => (
                  <li key={sc.id || i}>{sc.condition}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="space-y-1">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Decision Trail
          </h4>
          {recentDecisions.length > 0 ? (
            <ul className="text-xs space-y-1">
              {recentDecisions.map((d, i) => (
                <li key={d.id || i} className="flex items-start gap-1.5">
                  <span className="text-muted-foreground shrink-0">#{d.index || i + 1}</span>
                  <span className="font-medium">{d.title}:</span>
                  <span className="text-muted-foreground">{d.choice}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No decisions logged for this run yet.
            </p>
          )}
        </div>

        {(outcome || latestRun.status === "completed" || latestRun.status === "failed") && (
          <div className="space-y-1">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Outcome
            </h4>
            {bundle?.verdict && (
              <p className="text-xs">
                <span className="font-medium">Verdict:</span> {bundle.verdict}
              </p>
            )}
            {bundle?.score !== null && bundle?.score !== undefined && (
              <p className="text-xs">
                <span className="font-medium">Score:</span> {bundle.score}
              </p>
            )}
            {outcome?.outcome_summary ? (
              <p className="text-xs text-muted-foreground">
                {outcome.outcome_summary.slice(0, 200)}
                {outcome.outcome_summary.length > 200 && "..."}
              </p>
            ) : latestRun.status === "failed" ? (
              <p className="text-xs text-red-600 dark:text-red-400">
                Run failed. Check logs for details.
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
