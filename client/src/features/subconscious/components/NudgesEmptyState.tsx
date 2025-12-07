import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, MessageSquare } from "lucide-react";

/**
 * NudgesEmptyState - Displayed when there are no nudges to show.
 * 
 * Provides friendly, explanatory copy so users understand what nudges are
 * and that they'll appear automatically once the Subconscious Engine
 * identifies leads needing attention.
 * 
 * UI-19: Added navigation back to chat for better flow.
 */
export function NudgesEmptyState() {
  return (
    <Card data-testid="card-nudges-empty">
      <CardContent className="flex flex-col items-center justify-center py-12">
        <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">All caught up!</h3>
        <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
          No suggestions right now. When Wyshbone notices leads that need 
          attention — like stale contacts or follow-up opportunities — 
          they'll appear here.
        </p>
        <Button asChild variant="outline">
          <Link href="/">
            <MessageSquare className="h-4 w-4 mr-2" />
            Back to Chat
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
