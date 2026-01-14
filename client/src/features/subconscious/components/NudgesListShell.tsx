import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  AlertCircle, 
  RefreshCw, 
  Clock, 
  Bell, 
  Eye, 
  CheckCircle2, 
  XCircle,
  ExternalLink,
  X,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { NudgesEmptyState } from "./NudgesEmptyState";
import type { NudgesListShellProps, SubconNudge, NudgeStatus, NudgeType, NudgeActions } from "../types";

/**
 * NudgesListSkeleton - Loading state skeleton for the nudges list.
 * Shows placeholder cards while data is being fetched.
 */
function NudgesListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" data-testid="nudges-skeleton">
      {Array.from({ length: rows }).map((_, i) => (
        <Card key={i} className="p-4">
          <div className="space-y-3">
            <div className="flex items-start justify-between">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-28" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

/**
 * NudgesError - Error state component for the nudges list.
 */
function NudgesError({ 
  message, 
  onRetry 
}: { 
  message: string; 
  onRetry?: () => void;
}) {
  return (
    <Card 
      className="border-destructive/50 bg-destructive/5" 
      data-testid="card-nudges-error"
    >
      <div className="flex flex-col items-center justify-center py-8 px-4">
        <AlertCircle className="h-10 w-10 text-destructive mb-3" />
        <h3 className="text-lg font-semibold mb-1">Failed to load nudges</h3>
        <p className="text-sm text-muted-foreground text-center mb-4">
          {message}
        </p>
        {onRetry && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onRetry}
            data-testid="button-retry-nudges"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Try again
          </Button>
        )}
      </div>
    </Card>
  );
}

/**
 * Status badge configuration for nudge status display.
 */
const statusConfig: Record<NudgeStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon?: React.ReactNode }> = {
  new: { label: "New", variant: "default", icon: <Bell className="h-3 w-3" /> },
  seen: { label: "Seen", variant: "secondary", icon: <Eye className="h-3 w-3" /> },
  handled: { label: "Handled", variant: "outline", icon: <CheckCircle2 className="h-3 w-3" /> },
  dismissed: { label: "Dismissed", variant: "outline", icon: <XCircle className="h-3 w-3" /> },
  snoozed: { label: "Snoozed", variant: "secondary", icon: <Clock className="h-3 w-3" /> },
};

/**
 * Type badge configuration for nudge type display.
 */
const typeLabels: Record<NudgeType, string> = {
  follow_up: "Follow Up",
  stale_lead: "Stale Lead",
  engagement: "Engagement",
  reminder: "Reminder",
  insight: "Insight",
};

/**
 * Formats a date string to relative time (e.g., "2 hours ago").
 */
function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return dateString;
  }
}

/**
 * NudgeStatusBadge - Displays the status of a nudge with an icon.
 */
function NudgeStatusBadge({ status }: { status: NudgeStatus }) {
  const config = statusConfig[status];
  if (!config) return null;
  
  return (
    <Badge variant={config.variant} className="text-xs gap-1">
      {config.icon}
      {config.label}
    </Badge>
  );
}

/**
 * NudgeCardActions - Action buttons for a nudge card.
 * 
 * Provides:
 * - Open lead: Navigate to the associated lead (if leadId exists)
 * - Dismiss: Remove the nudge from active list
 * - Remind me later: Snooze the nudge for 24 hours
 */
function NudgeCardActions({ 
  nudge, 
  actions,
  isPending,
}: { 
  nudge: SubconNudge; 
  actions: NudgeActions;
  isPending: boolean;
}) {
  const { toast } = useToast();
  const [actionInProgress, setActionInProgress] = useState<"dismiss" | "snooze" | null>(null);
  
  const handleOpenLead = () => {
    actions.onOpenLead(nudge);
  };
  
  const handleDismiss = async () => {
    setActionInProgress("dismiss");
    try {
      await actions.onDismiss(nudge.id);
      toast({
        title: "Nudge dismissed",
        description: "This nudge has been removed from your list.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to dismiss nudge";
      toast({
        title: "Dismiss failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setActionInProgress(null);
    }
  };
  
  const handleSnooze = async () => {
    setActionInProgress("snooze");
    try {
      await actions.onSnooze(nudge.id);
      toast({
        title: "Reminder set",
        description: "We'll remind you about this lead in 24 hours.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to snooze nudge";
      toast({
        title: "Snooze failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setActionInProgress(null);
    }
  };
  
  const isDisabled = isPending || actionInProgress !== null;
  
  return (
    <div className="flex flex-wrap gap-2 pt-3 border-t border-border/50">
      {/* Open lead button - only shown if nudge has an associated lead */}
      {nudge.leadId ? (
        <Button
          variant="default"
          size="sm"
          onClick={handleOpenLead}
          disabled={isDisabled}
          data-testid={`nudge-open-lead-${nudge.id}`}
        >
          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
          Open lead
        </Button>
      ) : (
        // If no leadId, show disabled button with explanation
        // Design decision: Show disabled button rather than hide it, so users understand nudges can link to leads
        <Button
          variant="outline"
          size="sm"
          disabled
          title="This nudge is not linked to a specific lead"
          data-testid={`nudge-open-lead-${nudge.id}`}
        >
          <ExternalLink className="h-3.5 w-3.5 mr-1.5 opacity-50" />
          No linked lead
        </Button>
      )}
      
      {/* Dismiss button */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleDismiss}
        disabled={isDisabled}
        data-testid={`nudge-dismiss-${nudge.id}`}
      >
        {actionInProgress === "dismiss" ? (
          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
        ) : (
          <X className="h-3.5 w-3.5 mr-1.5" />
        )}
        Dismiss
      </Button>
      
      {/* Snooze / Remind me later button */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleSnooze}
        disabled={isDisabled}
        data-testid={`nudge-snooze-${nudge.id}`}
      >
        {actionInProgress === "snooze" ? (
          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
        ) : (
          <Clock className="h-3.5 w-3.5 mr-1.5" />
        )}
        Remind me later
      </Button>
    </div>
  );
}

/**
 * NudgeCard - A single nudge card displaying its details and actions.
 * 
 * Shows:
 * - Title
 * - Summary
 * - Status badge
 * - Type label
 * - Importance score (if present)
 * - Related lead name (if present)
 * - Relative creation time
 * - Action buttons: Open lead, Dismiss, Remind me later
 */
function NudgeCard({ 
  nudge, 
  actions 
}: { 
  nudge: SubconNudge; 
  actions?: NudgeActions;
}) {
  const typeLabel = typeLabels[nudge.type] ?? nudge.type;
  const isPending = actions?.isNudgePending(nudge.id) ?? false;
  
  return (
    <Card 
      className="p-4 hover:border-primary/50 transition-colors"
      data-testid={`nudge-card-${nudge.id}`}
    >
      <div className="space-y-3">
        {/* Header: Title + Importance Score */}
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-medium text-sm leading-snug flex-1">{nudge.title}</h4>
          {nudge.importanceScore !== undefined && (
            <span 
              className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary flex-shrink-0 font-medium"
              title="Importance score"
            >
              {nudge.importanceScore}%
            </span>
          )}
        </div>
        
        {/* Summary */}
        <p className="text-sm text-muted-foreground line-clamp-2">
          {nudge.summary}
        </p>
        
        {/* Metadata row: Type, Status, Lead, Time */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {/* Type label */}
          <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground">
            {typeLabel}
          </span>
          
          {/* Status badge */}
          <NudgeStatusBadge status={nudge.status} />
          
          {/* Lead name */}
          {nudge.leadName && (
            <span className="flex items-center gap-1">
              <span className="text-muted-foreground">•</span>
              <span>Lead: <span className="font-medium text-foreground">{nudge.leadName}</span></span>
            </span>
          )}
          
          {/* Relative time */}
          <span className="flex items-center gap-1 ml-auto">
            <Clock className="h-3 w-3" />
            {formatRelativeTime(nudge.createdAt)}
          </span>
        </div>
        
        {/* Snoozed reminder info */}
        {nudge.status === "snoozed" && nudge.remindAt && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Bell className="h-3 w-3" />
            Reminder: {formatRelativeTime(nudge.remindAt)}
          </p>
        )}
        
        {/* Action buttons - only shown if actions are provided */}
        {actions && (
          <NudgeCardActions 
            nudge={nudge} 
            actions={actions} 
            isPending={isPending}
          />
        )}
      </div>
    </Card>
  );
}

/**
 * NudgesListShell - The main container for the nudges list.
 * 
 * Handles loading, error, empty, and populated states.
 * 
 * @param nudges - Array of nudges to display (should be pre-sorted by useNudges hook)
 * @param isLoading - Whether data is currently being fetched
 * @param error - Error message if fetch failed
 * @param onRetry - Callback to retry failed fetch
 * @param actions - Action handlers for nudge interactions (dismiss, snooze, open lead)
 */
export function NudgesListShell({ 
  nudges, 
  isLoading, 
  error,
  onRetry,
  actions,
}: NudgesListShellProps) {
  // Loading state
  if (isLoading) {
    return <NudgesListSkeleton rows={3} />;
  }

  // Error state
  if (error) {
    return <NudgesError message={error} onRetry={onRetry} />;
  }

  // Empty state
  if (nudges.length === 0) {
    return <NudgesEmptyState />;
  }

  // Populated state - nudges are already sorted by the useNudges hook
  return (
    <div className="space-y-3" data-testid="nudges-list">
      {nudges.map((nudge) => (
        <NudgeCard key={nudge.id} nudge={nudge} actions={actions} />
      ))}
    </div>
  );
}
