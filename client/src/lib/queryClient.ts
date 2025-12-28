/**
 * V1-1.3: Unified API Client & Error Handling
 * ============================================
 * 
 * This module provides the canonical API helpers for all Supervisor-facing UI actions.
 * All API calls should go through these helpers for consistent behavior.
 * 
 * ## When to use each helper:
 * 
 * ### `apiRequest(method, url, data?)` - For mutations (POST/PUT/PATCH/DELETE)
 *   - Use for any action that modifies server state
 *   - Automatically sets Content-Type: application/json for requests with body
 *   - Throws on non-2xx responses with error message
 *   - Example: await apiRequest("POST", "/api/plan/approve", { planId })
 * 
 * ### `authedFetch(url, options?)` - For reads (GET) or custom requests
 *   - Use for GET requests, especially with react-query
 *   - Use when you need access to the raw Response object
 *   - Does NOT automatically throw on error - check response.ok yourself
 *   - Example: const response = await authedFetch("/api/goal")
 * 
 * ### `handleApiError(error, context)` - Unified error handler
 *   - Use in catch blocks for user-facing API actions
 *   - Logs error to console with context
 *   - Returns a user-friendly error message
 *   - Example: catch (err) { const msg = handleApiError(err, "approve plan"); toast({ title: msg }) }
 * 
 * ## Error handling pattern:
 * ```ts
 * try {
 *   await apiRequest("POST", "/api/some/endpoint", data);
 *   // Success handling...
 * } catch (error) {
 *   const message = handleApiError(error, "operation name");
 *   toast({ title: "Operation failed", description: message, variant: "destructive" });
 * }
 * ```
 * 
 * ## Base URL:
 * - Set VITE_API_BASE_URL for separate backend deployment
 * - If not set, uses same-origin (relative URLs)
 */

import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Get API base URL from environment (for separate backend deployment)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

// Debug: log what API base URL is being used
console.log("🌐 API_BASE_URL:", API_BASE_URL || "(empty - using same origin)");

// Helper to build full API URL (exported for use in components)
export function buildApiUrl(path: string): string {
  if (API_BASE_URL && path.startsWith("/api")) {
    return `${API_BASE_URL}${path}`;
  }
  return path;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let errorMessage = res.statusText;
    try {
      const text = await res.text();
      if (text) {
        // Try to parse JSON error response
        try {
          const json = JSON.parse(text);
          errorMessage = json.error || json.message || text;
        } catch {
          errorMessage = text;
        }
      }
    } catch {
      // Failed to read response body
    }
    throw new Error(`${res.status}: ${errorMessage}`);
  }
}

/**
 * Unified API error handler for user-facing actions.
 * 
 * Use this in catch blocks when calling apiRequest or authedFetch for
 * actions that should show feedback to the user.
 * 
 * @param error - The caught error (can be Error, string, or unknown)
 * @param context - Short description of the operation (e.g., "save goal", "approve plan")
 * @returns User-friendly error message string
 * 
 * @example
 * try {
 *   await apiRequest("POST", "/api/plan/approve", { planId });
 * } catch (error) {
 *   const message = handleApiError(error, "approve plan");
 *   toast({ title: "Failed to approve plan", description: message, variant: "destructive" });
 * }
 */
export function handleApiError(error: unknown, context: string): string {
  // Extract message from various error types
  let message: string;
  
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === "string") {
    message = error;
  } else {
    message = "An unexpected error occurred";
  }
  
  // Log with context for debugging
  console.error(`[API Error] ${context}:`, message);
  
  // Check for HTTP status code format: "500: error message"
  const statusMatch = message.match(/^(\d{3}):\s*(.*)$/);
  if (statusMatch) {
    const status = statusMatch[1];
    const serverMessage = statusMatch[2]?.trim();
    
    // If server provided a meaningful message, use it
    if (serverMessage && serverMessage !== 'Internal Server Error' && serverMessage !== 'OK') {
      return serverMessage;
    }
    
    // Otherwise show HTTP status
    return `HTTP ${status}`;
  }
  
  // Handle specific auth errors (without status prefix)
  if (message.includes("401") || message.toLowerCase().includes("unauthorized")) {
    return "You are not authenticated. Please log in again.";
  }
  if (message.includes("403") || message.toLowerCase().includes("forbidden")) {
    return "You don't have permission to perform this action.";
  }
  
  // Handle network errors (actual fetch failures, not CORS-blocked responses)
  // Note: CORS rejections that return 500 will have a status code and be handled above
  if (message.includes("Failed to fetch") || message.includes("NetworkError") || message.includes("net::")) {
    return "Network error. Please check your connection.";
  }
  
  return message;
}

// Helper to get current user from localStorage for development auth
function getUserFromStorage() {
  try {
    const userJson = localStorage.getItem('wyshbone_user');
    if (userJson) {
      return JSON.parse(userJson);
    }
  } catch (e) {
    console.error('Failed to parse user from localStorage:', e);
  }
  return null;
}

// Helper to get session ID from localStorage (exported for use in components)
export function getSessionId(): string | null {
  try {
    const sessionId = localStorage.getItem('wyshbone_sid');
    return sessionId || null;
  } catch (e) {
    console.error('Failed to get session ID from localStorage:', e);
    return null;
  }
}

// Helper for authenticated fetch with session header and proper URL building
export async function authedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const sessionId = getSessionId();
  const headers = new Headers(options.headers);
  
  if (sessionId) {
    headers.set("x-session-id", sessionId);
  }
  
  const authedUrl = addDevAuthParams(url);
  const fullUrl = buildApiUrl(authedUrl);
  
  return fetch(fullUrl, {
    ...options,
    headers,
    credentials: "include",
  });
}

// Helper to add development auth parameters to URL (exported for use in components)
export function addDevAuthParams(url: string): string {
  // Only add auth params in development mode
  if (import.meta.env.MODE !== 'development') {
    console.log('🔒 Production mode - not adding dev auth params');
    return url;
  }
  
  const user = getUserFromStorage();
  if (!user?.id || !user?.email) {
    console.warn('⚠️ No user in localStorage - cannot add auth params');
    return url;
  }
  
  const separator = url.includes('?') ? '&' : '?';
  const authedUrl = `${url}${separator}user_id=${encodeURIComponent(user.id)}&user_email=${encodeURIComponent(user.email)}`;
  console.log('✅ Added dev auth params:', authedUrl);
  return authedUrl;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  // Use session ID header if available (production-ready approach)
  const sessionId = getSessionId();
  const headers: Record<string, string> = {};
  
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  
  // Add session header if available
  if (sessionId) {
    headers["x-session-id"] = sessionId;
  }
  
  // In development, always add URL params as fallback (for compatibility)
  const authedUrl = addDevAuthParams(url);
  
  // Use full API URL for separate backend deployment
  const fullUrl = buildApiUrl(authedUrl);
  
  const res = await fetch(fullUrl, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Use session ID header if available (production-ready approach)
    const sessionId = getSessionId();
    const headers: Record<string, string> = {};
    
    // Add session header if available
    if (sessionId) {
      headers["x-session-id"] = sessionId;
    }
    
    // In development, always add URL params as fallback (for compatibility)
    const url = addDevAuthParams(queryKey.join("/") as string);
    
    // Use full API URL for separate backend deployment
    const fullUrl = buildApiUrl(url);
    
    const res = await fetch(fullUrl, {
      headers,
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
