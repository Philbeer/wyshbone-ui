import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  variant?: "default" | "minimal";
  className?: string;
}

/**
 * EmptyState Component
 *
 * Displays an empty state with optional icon, title, description, and action buttons.
 * Supports two variants:
 * - "default": Rich card with icon, prominent styling, and CTAs
 * - "minimal": Simple centered text for table contexts
 *
 * @example
 * ```tsx
 * <EmptyState
 *   icon={<User className="h-8 w-8" />}
 *   title="No customers yet"
 *   description="Add your first customer to start tracking sales"
 *   actionLabel="Add Customer"
 *   onAction={() => setDialogOpen(true)}
 *   secondaryActionLabel="Load Sample Data"
 *   onSecondaryAction={loadSamples}
 * />
 * ```
 */
export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  variant = "default",
  className,
}: EmptyStateProps) {
  // Minimal variant for table contexts
  if (variant === "minimal") {
    return (
      <div className={cn("py-8 text-center", className)}>
        <p className="text-muted-foreground">{title}</p>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
        {(actionLabel || secondaryActionLabel) && (
          <div className="flex items-center justify-center gap-3 mt-4">
            {actionLabel && onAction && (
              <Button onClick={onAction} size="sm">
                {actionLabel}
              </Button>
            )}
            {secondaryActionLabel && onSecondaryAction && (
              <Button onClick={onSecondaryAction} variant="outline" size="sm">
                {secondaryActionLabel}
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  // Default variant - rich card with prominent styling
  return (
    <Card className={cn("border-dashed", className)}>
      <CardContent className="flex flex-col items-center justify-center py-12 px-6 text-center">
        {icon && (
          <div className="rounded-full bg-muted p-4 mb-4">
            <div className="text-muted-foreground">{icon}</div>
          </div>
        )}

        <h3 className="text-lg font-semibold mb-2">{title}</h3>

        <p className="text-sm text-muted-foreground mb-6 max-w-sm">
          {description}
        </p>

        {(actionLabel || secondaryActionLabel) && (
          <div className="flex items-center gap-3">
            {actionLabel && onAction && (
              <Button onClick={onAction} size="lg">
                {actionLabel}
              </Button>
            )}
            {secondaryActionLabel && onSecondaryAction && (
              <Button onClick={onSecondaryAction} variant="outline" size="lg">
                {secondaryActionLabel}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
