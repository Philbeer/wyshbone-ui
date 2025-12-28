/**
 * Database utilities for graceful handling of DB failures
 */

// Track consecutive DB failures for backoff
let consecutiveDbFailures = 0;
let lastDbFailureTime = 0;
const BACKOFF_THRESHOLD = 3; // After 3 failures, start backing off
const BACKOFF_DURATION = 30000; // 30 seconds backoff

/**
 * Execute a promise with a timeout.
 * If the promise doesn't resolve within the timeout, reject with a timeout error.
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
 * Check if we should skip DB operations due to recent failures (backoff mode)
 */
export function shouldSkipDbOperation(): boolean {
  if (consecutiveDbFailures < BACKOFF_THRESHOLD) {
    return false;
  }
  
  const timeSinceLastFailure = Date.now() - lastDbFailureTime;
  if (timeSinceLastFailure > BACKOFF_DURATION) {
    // Backoff period expired, reset and try again
    console.log('🔄 DB backoff period expired, resuming operations');
    consecutiveDbFailures = 0;
    return false;
  }
  
  return true;
}

/**
 * Record a DB failure for backoff tracking
 */
export function recordDbFailure(): void {
  consecutiveDbFailures++;
  lastDbFailureTime = Date.now();
  
  if (consecutiveDbFailures === BACKOFF_THRESHOLD) {
    console.warn(`⚠️ DB failures reached threshold (${BACKOFF_THRESHOLD}), entering backoff mode for ${BACKOFF_DURATION / 1000}s`);
  }
}

/**
 * Record a DB success, resetting the failure counter
 */
export function recordDbSuccess(): void {
  if (consecutiveDbFailures > 0) {
    console.log('✅ DB operation succeeded, resetting failure counter');
    consecutiveDbFailures = 0;
  }
}

/**
 * Get current DB health status
 */
export function getDbHealthStatus(): { failures: number; inBackoff: boolean; backoffRemaining: number } {
  const inBackoff = shouldSkipDbOperation();
  const backoffRemaining = inBackoff ? Math.max(0, BACKOFF_DURATION - (Date.now() - lastDbFailureTime)) : 0;
  
  return {
    failures: consecutiveDbFailures,
    inBackoff,
    backoffRemaining,
  };
}

