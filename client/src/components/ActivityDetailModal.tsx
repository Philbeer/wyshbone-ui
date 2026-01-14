/**
 * ActivityDetailModal Component
 * Modal dialog for viewing full activity details
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Sparkles,
  Calendar,
  Timer,
  Hash,
  FileJson,
} from "lucide-react";

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

interface ActivityDetailModalProps {
  activity: AgentActivity;
  open: boolean;
  onClose: () => void;
}

export function ActivityDetailModal({
  activity,
  open,
  onClose,
}: ActivityDetailModalProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "failed":
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      case "pending":
        return <Clock className="h-5 w-5 text-yellow-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
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
      <Badge variant={variants[status] || "outline"}>
        {status.toUpperCase()}
      </Badge>
    );
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const formatDuration = (durationMs: number | null) => {
    if (!durationMs) return "N/A";
    if (durationMs < 1000) return `${durationMs}ms`;
    if (durationMs < 60000) return `${(durationMs / 1000).toFixed(2)}s`;
    return `${(durationMs / 60000).toFixed(2)}m`;
  };

  const renderJson = (data: any, title: string) => {
    if (!data) return null;

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <FileJson className="h-4 w-4 text-muted-foreground" />
          <h4 className="font-medium text-sm">{title}</h4>
        </div>
        <pre className="bg-gray-50 p-3 rounded-md text-xs overflow-x-auto font-mono">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getStatusIcon(activity.status)}
            Activity Details
            {activity.interestingFlag === 1 && (
              <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                <Sparkles className="h-3 w-3 mr-1" />
                Interesting
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Full details for activity {activity.id.substring(0, 12)}...
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-150px)]">
          <div className="space-y-6 pr-4">
            {/* Status */}
            <div className="space-y-2">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                Status
              </h3>
              <div className="flex items-center gap-2">
                {getStatusBadge(activity.status)}
              </div>
            </div>

            <Separator />

            {/* Task Generated */}
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">Task Generated</h3>
              <p className="text-sm text-gray-700">{activity.taskGenerated}</p>
            </div>

            <Separator />

            {/* Action Taken */}
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">Action Taken</h3>
              <code className="bg-gray-100 px-3 py-1 rounded text-sm font-mono">
                {activity.actionTaken}
              </code>
            </div>

            <Separator />

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>Timestamp</span>
                </div>
                <p className="text-sm font-medium">
                  {formatTimestamp(activity.timestamp)}
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Timer className="h-4 w-4" />
                  <span>Duration</span>
                </div>
                <p className="text-sm font-medium">
                  {formatDuration(activity.durationMs)}
                </p>
              </div>

              {activity.conversationId && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Hash className="h-4 w-4" />
                    <span>Conversation ID</span>
                  </div>
                  <p className="text-xs font-mono text-gray-600">
                    {activity.conversationId}
                  </p>
                </div>
              )}

              {activity.runId && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Hash className="h-4 w-4" />
                    <span>Run ID</span>
                  </div>
                  <p className="text-xs font-mono text-gray-600">
                    {activity.runId}
                  </p>
                </div>
              )}
            </div>

            <Separator />

            {/* Action Parameters */}
            {activity.actionParams && renderJson(activity.actionParams, "Action Parameters")}

            {activity.actionParams && (activity.results || activity.errorMessage) && <Separator />}

            {/* Results or Error */}
            {activity.status === "success" && activity.results && (
              renderJson(activity.results, "Results")
            )}

            {activity.status === "failed" && activity.errorMessage && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <h4 className="font-medium text-sm text-red-700">Error Message</h4>
                </div>
                <div className="bg-red-50 border border-red-200 p-3 rounded-md text-sm text-red-700">
                  {activity.errorMessage}
                </div>
              </div>
            )}

            {/* Metadata */}
            {activity.metadata && (
              <>
                <Separator />
                {renderJson(activity.metadata, "Additional Metadata")}
              </>
            )}

            {/* Full Activity ID */}
            <Separator />
            <div className="space-y-2">
              <h4 className="font-medium text-sm text-muted-foreground">Activity ID</h4>
              <p className="text-xs font-mono text-gray-600 break-all">
                {activity.id}
              </p>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
