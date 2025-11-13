/**
 * User Goal Helper
 * 
 * Clean API for accessing user goals across the codebase.
 * Goals are stored per-session and used by tools for context and planning.
 */

import { storage } from "./storage";

/**
 * Get the user's high-level sales/lead goal for a given session.
 * @param sessionId - The session ID to look up
 * @returns The user's goal text, or null if not set
 */
export async function getUserGoal(sessionId: string): Promise<string | null> {
  return storage.getUserGoal(sessionId);
}

/**
 * Set the user's goal for a session.
 * @param sessionId - The session ID
 * @param goalText - The user's goal description
 */
export async function setUserGoal(sessionId: string, goalText: string): Promise<void> {
  return storage.setUserGoal(sessionId, goalText);
}

/**
 * Check if a goal has been set for a session.
 * @param sessionId - The session ID to check
 * @returns true if a goal exists, false otherwise
 */
export async function hasUserGoal(sessionId: string): Promise<boolean> {
  return storage.hasUserGoal(sessionId);
}
