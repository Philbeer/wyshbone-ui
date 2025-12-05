/**
 * Subconscious Nudge types for UI-10/11/12: Nudges Panel UI
 * 
 * These types define the UI-side shape for nudges from the Subconscious Engine.
 * The backend types (Supervisor SUP-10-13) may differ slightly; these are
 * designed for flexibility and easy adaptation.
 */

/**
 * Status of a nudge in the user's workflow
 */
export type NudgeStatus = "new" | "seen" | "handled" | "dismissed" | "snoozed";

/**
 * Type of nudge action suggested
 */
export type NudgeType = 
  | "follow_up"      // Lead needs follow-up
  | "stale_lead"     // Lead has gone cold
  | "engagement"     // Opportunity to engage
  | "reminder"       // User-created reminder
  | "insight";       // AI-generated insight

/**
 * SubconNudge represents a single nudge from the Subconscious Engine.
 */
export interface SubconNudge {
  /** Unique identifier for the nudge */
  id: string;
  
  /** Short, actionable title (e.g., "Follow up with Acme Corp") */
  title: string;
  
  /** Longer explanation of why this nudge was generated */
  summary: string;
  
  /** When the nudge was created */
  createdAt: string;
  
  /** Current status of the nudge */
  status: NudgeStatus;
  
  /** Type of nudge */
  type: NudgeType;
  
  /** 
   * Importance score from 0-100 (higher = more important)
   * Used for sorting/prioritization
   */
  importanceScore?: number;
  
  /** Associated lead ID, if this nudge relates to a specific lead */
  leadId?: string;
  
  /** Associated lead name for display (avoids extra lookup) */
  leadName?: string;
  
  /** When the user should be reminded (if snoozed) */
  remindAt?: string;
  
  /** Additional metadata from the Subconscious Engine */
  metadata?: Record<string, unknown>;
}

/**
 * Action handlers for nudge interactions (UI-12)
 */
export interface NudgeActions {
  /** Dismiss a nudge - removes it from active list */
  onDismiss: (nudgeId: string) => Promise<void>;
  /** Snooze a nudge - will reappear later (default 24h) */
  onSnooze: (nudgeId: string) => Promise<void>;
  /** Navigate to the lead associated with this nudge */
  onOpenLead: (nudge: SubconNudge) => void;
  /** Check if a mutation is pending for a specific nudge */
  isNudgePending: (nudgeId: string) => boolean;
}

/**
 * Props for the NudgesListShell component
 */
export interface NudgesListShellProps {
  nudges: SubconNudge[];
  isLoading: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** Action handlers - required for UI-12 action buttons */
  actions?: NudgeActions;
}
