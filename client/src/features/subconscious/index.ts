// Subconscious Engine feature - Nudges Panel (UI-10)
// 
// This module provides the UI components and hooks for displaying
// nudges from Wyshbone's Subconscious Engine.

// Components
export { NudgesEmptyState } from "./components/NudgesEmptyState";
export { NudgesListShell } from "./components/NudgesListShell";

// Hooks
export { useNudges } from "./useNudges";

// Types
export type { 
  SubconNudge, 
  NudgeStatus, 
  NudgeType,
  NudgesListShellProps,
  NudgeActions,
} from "./types";
