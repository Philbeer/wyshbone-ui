import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
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

// Helper to get session ID from localStorage
function getSessionId(): string | null {
  try {
    const sessionId = localStorage.getItem('wyshbone_sid');
    return sessionId || null;
  } catch (e) {
    console.error('Failed to get session ID from localStorage:', e);
    return null;
  }
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
  // Prefer session ID header over URL params
  const sessionId = getSessionId();
  const headers: Record<string, string> = {};
  
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  
  // Add session header if available (production-ready approach)
  if (sessionId) {
    headers["x-session-id"] = sessionId;
  }
  
  // Fallback to URL params in development mode only if no session
  const authedUrl = sessionId ? url : addDevAuthParams(url);
  
  const res = await fetch(authedUrl, {
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
    // Prefer session ID header over URL params
    const sessionId = getSessionId();
    const headers: Record<string, string> = {};
    
    // Add session header if available (production-ready approach)
    if (sessionId) {
      headers["x-session-id"] = sessionId;
    }
    
    // Fallback to URL params in development mode only if no session
    const url = sessionId ? queryKey.join("/") : addDevAuthParams(queryKey.join("/") as string);
    
    const res = await fetch(url, {
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
