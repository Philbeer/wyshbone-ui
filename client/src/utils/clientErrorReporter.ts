/**
 * Client-side error reporting utility
 * Captures browser errors and sends them to the backend for logging
 * 
 * Uses fetch (not sendBeacon) for reliability and debuggability
 */

import { buildApiUrl } from "@/lib/queryClient";

export interface ClientErrorPayload {
  message: string;
  stack?: string;
  url?: string;
  line?: number;
  column?: number;
  href: string;
  userAgent: string;
  type: "error" | "unhandledrejection";
  timestamp: string;
}

/**
 * Send error payload to backend using fetch
 * Logs debug info so we can see what's happening
 */
async function sendErrorToBackend(payload: ClientErrorPayload): Promise<void> {
  const endpoint = buildApiUrl("/api/client-error");
  const jsonPayload = JSON.stringify(payload);
  
  // Debug: log what we're about to send
  console.debug(
    `📤 [ClientErrorReporter] Sending ${payload.type} to ${endpoint}:`,
    payload.message
  );
  
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: jsonPayload,
      keepalive: true,
    });
    
    if (!response.ok) {
      console.warn(
        `⚠️ [ClientErrorReporter] Backend returned ${response.status} ${response.statusText}`
      );
    } else {
      console.debug(`✅ [ClientErrorReporter] Error reported successfully`);
    }
  } catch (err) {
    // Log the failure but don't throw - we don't want error reporting to cause more errors
    console.warn(
      `⚠️ [ClientErrorReporter] Failed to send error to backend:`,
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Initialize client error reporting
 * Call this once at app startup
 */
export function initClientErrorReporting(): void {
  // Only run in browser
  if (typeof window === "undefined") return;
  
  // Prevent double-initialization
  if ((window as any).__clientErrorReportingInitialized) return;
  (window as any).__clientErrorReportingInitialized = true;
  
  console.log("🔍 Client error reporting initialized");
  
  // Handle general runtime errors
  window.addEventListener("error", (event: ErrorEvent) => {
    const payload: ClientErrorPayload = {
      message: event.message || "Unknown error",
      stack: event.error?.stack,
      url: event.filename,
      line: event.lineno,
      column: event.colno,
      href: window.location.href,
      userAgent: navigator.userAgent,
      type: "error",
      timestamp: new Date().toISOString(),
    };
    
    sendErrorToBackend(payload);
  });
  
  // Handle unhandled promise rejections
  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message = reason instanceof Error 
      ? reason.message 
      : typeof reason === "string" 
        ? reason 
        : "Unhandled promise rejection";
    const stack = reason instanceof Error ? reason.stack : undefined;
    
    const payload: ClientErrorPayload = {
      message,
      stack,
      href: window.location.href,
      userAgent: navigator.userAgent,
      type: "unhandledrejection",
      timestamp: new Date().toISOString(),
    };
    
    sendErrorToBackend(payload);
  });
  
  // Expose manual test hook for debugging
  (window as any).testClientErrorReport = () => {
    console.log("🧪 Sending manual test error report...");
    sendErrorToBackend({
      message: "Manual test client error",
      href: window.location.href,
      userAgent: navigator.userAgent,
      type: "error",
      timestamp: new Date().toISOString(),
    });
  };
  
  console.log("💡 Tip: Run window.testClientErrorReport() to test error reporting");
}
