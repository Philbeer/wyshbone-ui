/**
 * Database utilities for graceful handling of DB failures
 * 
 * IMPORTANT: When DB DNS is failing, Drizzle queries take 20-30 seconds to timeout.
 * The solution is to SKIP Drizzle entirely when:
 * 1. Demo mode is enabled
 * 2. We're in backoff mode due to recent failures
 */

import { isDemoMode } from './demo-config';

// Track consecutive DB failures for backoff
let consecutiveDbFailures = 0;
let lastDbFailureTime = 0;
const BACKOFF_THRESHOLD = 1; // After 1 failure, start backing off (DNS fails take too long)
const BACKOFF_DURATION = 60000; // 60 seconds backoff (DNS issues are usually persistent)

// Flag to track if we've logged the demo skip message
let demoSkipLogged = false;
let backoffLogged = false;

/**
 * Execute a promise with a timeout.
 * If the promise doesn't resolve within the timeout, reject with a timeout error.
 * 
 * NOTE: This doesn't cancel the underlying promise, just rejects early.
 * For DB calls, prefer shouldSkipDrizzle() to avoid starting the query at all.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string = 'operation'
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Check if we should skip Drizzle/Postgres operations entirely.
 * Returns true if:
 * - Demo mode is enabled (always skip Postgres in demo)
 * - We're in backoff mode due to recent failures
 * 
 * This is the PRIMARY check - call this BEFORE attempting any Drizzle query.
 */
export function shouldSkipDrizzle(): boolean {
  // In demo mode, ALWAYS skip Drizzle to avoid DNS timeouts
  if (isDemoMode()) {
    if (!demoSkipLogged) {
      console.log('🎭 [DB] Demo mode: skipping Drizzle/Postgres, using REST API or memory fallback');
      demoSkipLogged = true;
    }
    return true;
  }
  
  // Check backoff
  if (consecutiveDbFailures >= BACKOFF_THRESHOLD) {
    const timeSinceLastFailure = Date.now() - lastDbFailureTime;
    if (timeSinceLastFailure <= BACKOFF_DURATION) {
      if (!backoffLogged) {
        console.log(`⏸️ [DB] In backoff mode (${Math.round((BACKOFF_DURATION - timeSinceLastFailure) / 1000)}s remaining)`);
        backoffLogged = true;
      }
      return true;
    }
    // Backoff expired
    console.log('🔄 [DB] Backoff period expired, will retry DB operations');
    consecutiveDbFailures = 0;
    backoffLogged = false;
  }
  
  return false;
}

/**
 * Legacy alias for shouldSkipDrizzle
 */
export function shouldSkipDbOperation(): boolean {
  return shouldSkipDrizzle();
}

/**
 * Record a DB failure for backoff tracking
 */
export function recordDbFailure(): void {
  consecutiveDbFailures++;
  lastDbFailureTime = Date.now();
  backoffLogged = false; // Reset so we log on next check
  
  if (consecutiveDbFailures === BACKOFF_THRESHOLD) {
    console.warn(`⚠️ [DB] Failure detected, entering ${BACKOFF_DURATION / 1000}s backoff to avoid DNS timeout spam`);
  }
}

/**
 * Record a DB success, resetting the failure counter
 */
export function recordDbSuccess(): void {
  if (consecutiveDbFailures > 0) {
    console.log('✅ [DB] Operation succeeded, resetting failure counter');
    consecutiveDbFailures = 0;
    backoffLogged = false;
  }
}

/**
 * Get current DB health status
 */
export function getDbHealthStatus(): { failures: number; inBackoff: boolean; backoffRemaining: number } {
  const inBackoff = consecutiveDbFailures >= BACKOFF_THRESHOLD && 
                    (Date.now() - lastDbFailureTime) <= BACKOFF_DURATION;
  const backoffRemaining = inBackoff ? Math.max(0, BACKOFF_DURATION - (Date.now() - lastDbFailureTime)) : 0;
  
  return {
    failures: consecutiveDbFailures,
    inBackoff,
    backoffRemaining,
  };
}

