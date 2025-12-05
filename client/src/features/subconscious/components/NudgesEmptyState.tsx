import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

/**
 * NudgesEmptyState - Displayed when there are no nudges to show.
 * 
 * Provides friendly, explanatory copy so users understand what nudges are
 * and that they'll appear automatically once the Subconscious Engine
 * identifies leads needing attention.
 */
export function NudgesEmptyState() {
  return (
    <Card data-testid="card-nudges-empty">
      <CardContent className="flex flex-col items-center justify-center py-12">
        <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No nudges yet</h3>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          Once Wyshbone's subconscious spots leads that need attention, 
          they'll appear here automatically. Check back soon!
        </p>
      </CardContent>
    </Card>
  );
}
