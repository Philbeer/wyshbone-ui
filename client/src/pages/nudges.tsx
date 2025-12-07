import { useCallback } from "react";
import { NudgesListShell, useNudges } from "@/features/subconscious";
import type { SubconNudge, NudgeActions } from "@/features/subconscious";

/**
 * NudgesPage - The main Nudges panel page.
 * 
 * This page displays nudges from Wyshbone's Subconscious Engine,
 * which identifies leads that need attention (stale leads, follow-ups, etc.)
 * 
 * UI-10: Panel shell with layout, empty state
 * UI-11: Real data fetching from Supervisor API with sorting
 * UI-12: Nudge actions (Open lead, Dismiss, Remind me later)
 */
export default function NudgesPage() {
  const { 
    nudges, 
    isLoading, 
    isError, 
    error, 
    refetch,
    dismissNudge,
    snoozeNudge,
    isNudgePending,
  } = useNudges();
  
  // Convert Error object to string message for display
  const errorMessage = isError ? (error?.message ?? "An unexpected error occurred") : null;

  /**
   * Navigate to the lead associated with a nudge.
   * 
   * Current behavior: Navigate to /leads page.
   * 
   * Limitation: There's no dedicated lead detail page (/leads/:id) yet.
   * When one is added, this should navigate directly to that lead's detail view.
   * 
   * TODO: When a lead detail page is implemented, update this to navigate
   * to `/leads/${nudge.leadId}` instead of just `/leads`.
   */
  const handleOpenLead = useCallback((nudge: SubconNudge) => {
    if (!nudge.leadId) {
      console.warn("[NudgesPage] Cannot open lead - nudge has no leadId:", nudge.id);
      return;
    }
    
    // Navigate to leads page
    // Future enhancement: Navigate to /leads/:leadId when detail page exists
    // For now, we navigate to /leads and the user can find the lead there
    window.location.href = `/leads`;
    
    // Alternative: Use react-router's navigate for SPA navigation
    // const navigate = useNavigate();
    // navigate(`/leads`);
  }, []);

  /**
   * Action handlers to pass to NudgesListShell
   */
  const actions: NudgeActions = {
    onDismiss: dismissNudge,
    onSnooze: snoozeNudge,
    onOpenLead: handleOpenLead,
    isNudgePending,
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold mb-2">Nudges</h1>
          <p className="text-muted-foreground">
            Wyshbone keeps track of your leads and suggests actions you might want to take — 
            like following up with contacts you haven't spoken to in a while.
          </p>
        </div>

        {/* Nudges List */}
        <NudgesListShell 
          nudges={nudges}
          isLoading={isLoading}
          error={errorMessage}
          onRetry={refetch}
          actions={actions}
        />
      </div>
    </div>
  );
}
