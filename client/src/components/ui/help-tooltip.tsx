import React from "react";
import { HelpCircle, ExternalLink } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface HelpTooltipProps {
  content: string;
  learnMoreUrl?: string;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}

/**
 * HelpTooltip Component
 *
 * Displays a small "?" icon that shows contextual help on hover/click.
 * Optionally includes a "Learn more" link to documentation.
 *
 * @example
 * ```tsx
 * <div className="flex items-center gap-2">
 *   <h1>Customers</h1>
 *   <HelpTooltip content="Manage your customer relationships and track purchase history" />
 * </div>
 * ```
 *
 * @example
 * ```tsx
 * <HelpTooltip
 *   content="Payment terms define when payment is due after invoice"
 *   learnMoreUrl="https://docs.wyshbone.com/payment-terms"
 *   side="right"
 * />
 * ```
 */
export function HelpTooltip({
  content,
  learnMoreUrl,
  side = "top",
  className,
}: HelpTooltipProps) {
  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center justify-center rounded-full",
              "text-muted-foreground hover:text-foreground",
              "transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
              "h-4 w-4",
              className
            )}
            aria-label="Help"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-xs">
          <div className="space-y-2">
            <p className="text-sm">{content}</p>
            {learnMoreUrl && (
              <a
                href={learnMoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Learn more
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
