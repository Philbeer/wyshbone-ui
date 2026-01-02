/**
 * Xero Connection Status Badge
 * 
 * Shows the current Xero connection status in the header.
 * Clickable to navigate to integrations settings.
 */

import { useXeroStatus } from "@/features/xero/useXero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "wouter";
import { Check, X, Loader2 } from "lucide-react";

// Xero "X" logo as SVG
function XeroIcon({ className }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      fill="currentColor" 
      className={className}
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.5 13.5L13.59 12l2.91-3.5-1.5-1.25L12 10.59 8.91 7.25 7.41 8.5 10.41 12l-3 3.5 1.5 1.25L12 13.41l3.09 3.34 1.41-1.25z"/>
    </svg>
  );
}

interface XeroStatusBadgeProps {
  className?: string;
}

export function XeroStatusBadge({ className }: XeroStatusBadgeProps) {
  const { data: status, isLoading, error } = useXeroStatus();

  if (isLoading) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm" 
              className={`h-8 px-2 gap-1.5 ${className}`}
              disabled
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground hidden sm:inline">Xero</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Checking Xero connection...</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (error) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link href="/auth/crm/settings">
              <Button 
                variant="ghost" 
                size="sm" 
                className={`h-8 px-2 gap-1.5 text-muted-foreground hover:text-foreground ${className}`}
              >
                <XeroIcon className="h-3.5 w-3.5" />
                <span className="text-xs hidden sm:inline">Xero</span>
              </Button>
            </Link>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Unable to check Xero status</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const isConnected = status?.connected;
  const tenantName = status?.tenantName;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link href="/auth/crm/settings">
            <Button 
              variant="ghost" 
              size="sm" 
              className={`h-8 px-2 gap-1.5 ${className}`}
            >
              {isConnected ? (
                <>
                  <div className="relative">
                    <XeroIcon className="h-3.5 w-3.5 text-[#13B5EA]" />
                    <Check className="h-2 w-2 text-green-500 absolute -bottom-0.5 -right-0.5 bg-background rounded-full" />
                  </div>
                  <span className="text-xs text-green-600 dark:text-green-400 hidden sm:inline">
                    Connected
                  </span>
                </>
              ) : (
                <>
                  <div className="relative">
                    <XeroIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <X className="h-2 w-2 text-amber-500 absolute -bottom-0.5 -right-0.5 bg-background rounded-full" />
                  </div>
                  <span className="text-xs text-amber-600 dark:text-amber-400 hidden sm:inline">
                    Not Connected
                  </span>
                </>
              )}
            </Button>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {isConnected ? (
            <div className="text-center">
              <p className="font-medium text-green-600">✓ Xero Connected</p>
              {tenantName && <p className="text-xs text-muted-foreground">{tenantName}</p>}
              <p className="text-xs text-muted-foreground mt-1">Click to manage</p>
            </div>
          ) : (
            <div className="text-center">
              <p className="font-medium text-amber-600">Xero Not Connected</p>
              <p className="text-xs text-muted-foreground mt-1">Click to connect</p>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

