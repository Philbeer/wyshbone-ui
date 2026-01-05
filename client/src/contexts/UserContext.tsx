import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { queryClient, buildApiUrl } from "@/lib/queryClient";

export interface User {
  id: string;
  email: string;
  name: string;
}

interface UserContextType {
  user: User;
  setUser: (user: User) => void;
  isValidatingSession: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUserInternal] = useState<User>(() => {
    // Synchronous initialization - check localStorage first
    const stored = localStorage.getItem("wyshbone_user");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        console.log(`⚡ Initializing with stored user: ${parsed.email}`);
        return parsed;
      } catch (e) {
        console.error("Failed to parse stored user", e);
      }
    }

    // Fallback to temporary demo user (will be replaced by auth flow)
    console.log("⚠️ No stored user - initializing with temporary demo placeholder");
    return {
      id: "temp-demo-user",
      email: "demo@wyshbone.com",
      name: "Demo User"
    };
  });
  
  const [isValidatingSession, setIsValidatingSession] = useState(true);

  useEffect(() => {
    async function initializeAuth() {
      const urlParams = new URLSearchParams(window.location.search);
      
      // Priority 1: Check if session was already validated in bootstrap (main.tsx)
      // This happens when Bubble passes ?sid=SESSION_ID
      const sessionId = urlParams.get("sid");
      const storedSessionId = localStorage.getItem("wyshbone_sid");
      
      if (sessionId && sessionId === storedSessionId) {
        // Session was already validated in main.tsx before React rendered
        const stored = localStorage.getItem("wyshbone_user");
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            console.log(`✅ Using pre-validated session for: ${parsed.email}`);
            
            // Check if this is a different user than the current state
            // This handles cases where user switches accounts in Bubble
            if (user.id !== parsed.id && user.id !== "temp-demo-user") {
              console.log("🧹 Clearing React Query cache - user changed from session validation");
              queryClient.clear();
            }
            
            setUserInternal(parsed);
            setIsValidatingSession(false);
            return;
          } catch (e) {
            console.error("Failed to parse pre-validated user", e);
          }
        }
      }
      
      // Priority 2: Check for direct URL parameters (?user_id= and ?user_email=)
      // Create a session for URL-authenticated users so they can open in new tabs
      const userId = urlParams.get("user_id");
      const userEmail = urlParams.get("user_email");
      
      if (userId && userEmail) {
        // Check if this is a different user than what's in localStorage
        const storedUserJson = localStorage.getItem("wyshbone_user");
        let isDifferentUser = true;
        if (storedUserJson) {
          try {
            const storedUser = JSON.parse(storedUserJson);
            isDifferentUser = storedUser.id !== userId;
          } catch (e) {
            // If parsing fails, treat as different user
          }
        }
        
        console.log("🔐 User authenticated from URL parameters, creating session...", { userId, userEmail });
        
        try {
          // Request a session ID from the backend
          const response = await fetch(buildApiUrl("/api/auth/url-session"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId, user_email: userEmail })
          });
          
          if (response.ok) {
            const data = await response.json();
            const urlUser = {
              id: data.user.id,
              email: data.user.email,
              name: data.user.name
            };
            
            // Store session ID and user data
            localStorage.setItem("wyshbone_sid", data.sessionId);
            localStorage.setItem("wyshbone_user", JSON.stringify(urlUser));
            
            console.log(`✅ Created session for URL user: ${urlUser.email}`);
            
            // Clear React Query cache if switching to a different user
            if (isDifferentUser) {
              console.log("🧹 Clearing React Query cache for new user");
              queryClient.clear();
            }
            
            setUserInternal(urlUser);
            setIsValidatingSession(false);
            return;
          } else {
            console.error("Failed to create session for URL user");
            // Fall through to next priority
          }
        } catch (error) {
          console.error("Session creation error for URL user:", error);
          // Fall through to next priority
        }
      }
      
      // Priority 3: Check localStorage (for returning users or manual login)
      const stored = localStorage.getItem("wyshbone_user");
      const storedSid = localStorage.getItem("wyshbone_sid");
      
      if (stored && storedSid) {
        try {
          const parsed = JSON.parse(stored);
          console.log(`✅ Loaded user from storage: ${parsed.email}`);
          setUserInternal(parsed);
          setIsValidatingSession(false);
          return;
        } catch (e) {
          console.error("Failed to parse stored user", e);
        }
      }
      
      // Priority 4: No auth found - auto-create a unique demo user
      console.log("🎭 No authentication found, creating demo user...");
      try {
        const response = await fetch(buildApiUrl("/api/auth/demo"), {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });
        
        if (response.ok) {
          const data = await response.json();
          const demoUser = {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name
          };
          
          // Store demo session ID for later transfer on signup
          localStorage.setItem("wyshbone_sid", data.sessionId);
          localStorage.setItem("wyshbone_user", JSON.stringify(demoUser));
          
          console.log(`✅ Created demo user: ${demoUser.email}`);
          setUserInternal(demoUser);
        } else {
          console.error("Failed to create demo user, falling back to static demo");
        }
      } catch (error) {
        console.error("Demo user creation error:", error);
      }
      
      setIsValidatingSession(false);
    }
    
    initializeAuth();
  }, []);

  const setUser = (newUser: User) => {
    setUserInternal(newUser);
    localStorage.setItem("wyshbone_user", JSON.stringify(newUser));
    
    // Clear conversation state when switching users
    localStorage.removeItem("currentConversationId");
    sessionStorage.removeItem(`labelsRegenerated_${newUser.id}`);
    
    console.log(`👤 Switched to user: ${newUser.email} (${newUser.id})`);
    
    // Reload the page to reset all state
    window.location.reload();
  };

  return (
    <UserContext.Provider value={{ user, setUser, isValidatingSession }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within UserProvider");
  }
  return context;
}
