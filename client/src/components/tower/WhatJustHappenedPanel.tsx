/**
 * UI-18: "What just happened?" Tower Log Viewer
 * 
 * A drawer/panel that shows recent Tower runs so the user can see
 * what Wyshbone did behind the scenes after asking it to do something.
 */

import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, ExternalLink, RefreshCw, Clock, AlertCircle, CheckCircle2, Play, XCircle } from 'lucide-react';
import { fetchRecentTowerRuns, fetchRecentTowerRunsForConversation, type TowerRunSummary } from '@/api/towerClient';

interface WhatJustHappenedPanelProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId?: string;
}

/**
 * Format a timestamp for display
 */
function formatTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  
  if (isToday) {
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  
  return date.toLocaleDateString('en-GB', { 
    day: 'numeric', 
    month: 'short',
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

/**
 * Get badge variant and icon for status
 */
function getStatusDisplay(status: string): { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode; label: string } {
  switch (status.toLowerCase()) {
    case 'success':
    case 'completed':
      return { 
        variant: 'default', 
        icon: <CheckCircle2 className="h-3 w-3" />,
        label: 'Success'
      };
    case 'error':
    case 'failed':
      return { 
        variant: 'destructive', 
        icon: <XCircle className="h-3 w-3" />,
        label: 'Error'
      };
    case 'running':
    case 'started':
    case 'in_progress':
      return { 
        variant: 'secondary', 
        icon: <Play className="h-3 w-3" />,
        label: 'Running'
      };
    case 'timeout':
      return { 
        variant: 'destructive', 
        icon: <Clock className="h-3 w-3" />,
        label: 'Timeout'
      };
    default:
      return { 
        variant: 'outline', 
        icon: null,
        label: status
      };
  }
}

/**
 * Get badge color for source
 */
function getSourceBadge(source: string): { label: string; className: string } {
  switch (source.toLowerCase()) {
    case 'live_user':
      return { label: 'Chat', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' };
    case 'subconscious':
      return { label: 'Subcon', className: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' };
    case 'supervisor':
      return { label: 'Supervisor', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' };
    case 'plan_executor':
      return { label: 'Plan', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' };
    default:
      return { label: source, className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' };
  }
}

/**
 * Single run item in the list
 */
function RunItem({ run }: { run: TowerRunSummary }) {
  const statusDisplay = getStatusDisplay(run.status);
  const sourceBadge = getSourceBadge(run.source);
  const towerUrl = process.env.TOWER_URL || '';
  
  const openInTower = () => {
    // Open Tower dashboard in new tab
    const dashboardUrl = towerUrl ? `${towerUrl}/dashboard` : '/api/tower/dashboard';
    window.open(dashboardUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <Card className="mb-2">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatTime(run.createdAt)}
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${sourceBadge.className}`}>
              {sourceBadge.label}
            </span>
            <Badge variant={statusDisplay.variant} className="text-[10px] gap-1 h-5">
              {statusDisplay.icon}
              {statusDisplay.label}
            </Badge>
          </div>
          {towerUrl && (
            <Button
              variant="ghost"
              size="sm"
              onClick={openInTower}
              className="h-6 px-2 text-xs"
              title="Open in Tower"
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
          )}
        </div>
        
        {run.summary && (
          <p className="text-sm text-foreground leading-relaxed mb-1">
            {run.summary}
          </p>
        )}
        
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {run.userEmail && (
            <span title="User">{run.userEmail}</span>
          )}
          {run.durationMs && (
            <span title="Duration">{(run.durationMs / 1000).toFixed(1)}s</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function WhatJustHappenedPanel({ isOpen, onClose, conversationId }: WhatJustHappenedPanelProps) {
  const [runs, setRuns] = useState<TowerRunSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRuns = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      let fetchedRuns: TowerRunSummary[];
      
      if (conversationId) {
        // Try to fetch runs for this conversation
        fetchedRuns = await fetchRecentTowerRunsForConversation(conversationId, 10);
        
        // If no runs for this conversation, fall back to recent runs
        if (fetchedRuns.length === 0) {
          fetchedRuns = await fetchRecentTowerRuns(10);
        }
      } else {
        fetchedRuns = await fetchRecentTowerRuns(10);
      }
      
      setRuns(fetchedRuns);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('[WhatJustHappened] Error loading runs:', errorMessage);
      setError("Couldn't load Tower logs. Please check Tower is running.");
    } finally {
      setIsLoading(false);
    }
  };

  // Load runs when panel opens
  useEffect(() => {
    if (isOpen) {
      loadRuns();
    }
  }, [isOpen, conversationId]);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[400px] sm:w-[450px]">
        <SheetHeader className="mb-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg">What just happened?</SheetTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadRuns}
              disabled={isLoading}
              className="h-8 px-2"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          <SheetDescription>
            Recent activity from Wyshbone's background processes
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto pr-1">
          {isLoading && runs.length === 0 && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading recent activity…
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertCircle className="h-8 w-8 text-destructive mb-2" />
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={loadRuns}
                className="mt-3"
              >
                Try again
              </Button>
            </div>
          )}

          {!isLoading && !error && runs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Clock className="h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">
                No recent runs yet.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Ask Wyshbone to do something and then check here again.
              </p>
            </div>
          )}

          {runs.length > 0 && (
            <div className="space-y-2">
              {runs.map((run) => (
                <RunItem key={run.id} run={run} />
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

