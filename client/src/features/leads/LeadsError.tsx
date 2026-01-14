import { AlertCircle, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface LeadsErrorProps {
  /** Error message to display */
  message?: string;
  /** Callback when retry button is clicked */
  onRetry?: () => void;
}

/**
 * Error state component for the leads area.
 * Displays an error message with optional retry button.
 */
export function LeadsError({
  message = "We couldn't load your leads",
  onRetry,
}: LeadsErrorProps) {
  return (
    <Alert variant="destructive" data-testid="leads-error">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Error</AlertTitle>
      <AlertDescription className="flex items-center justify-between gap-4">
        <span>{message}</span>
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="shrink-0 border-destructive/50 hover:bg-destructive/10"
            data-testid="btn-retry-leads"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

