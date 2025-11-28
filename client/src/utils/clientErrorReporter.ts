/**
 * Client-side error reporting utility
 * Captures browser errors and sends them to the backend for logging
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
 * Send error payload to backend - never throws
 */
function sendErrorToBackend(payload: ClientErrorPayload): void {
  try {
    const jsonPayload = JSON.stringify(payload);
    const url = buildApiUrl("/api/client-error");
    
    // Prefer sendBeacon for reliability (works even during page unload)
    if (navigator.sendBeacon) {
      const blob = new Blob([jsonPayload], { type: "application/json" });
      navigator.sendBeacon(url, blob);
    } else {
      // Fallback to fetch with keepalive
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonPayload,
        keepalive: true,
      }).catch(() => {
        // Silently ignore - don't cause error loops
      });
    }
  } catch {
    // Silently ignore any errors in the reporting itself
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
}

