import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { queryClient } from "@/lib/queryClient";

export interface User {
  id: string;
  email: string;
  name: string;
}

interface UserContextType {
  user: User;
  setUser: (user: User) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUserInternal] = useState<User>(() => {
    // Synchronous initialization - return demo user first
    console.log("⚠️ Initializing with demo user, will validate session if available");
    return { 
      id: "demo-user", 
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
            if (user.id !== parsed.id && user.id !== "demo-user") {
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
      // This is used for dev mode when not using session IDs
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
        
        const userName = userEmail.split("@")[0];
        const urlUser = {
          id: userId,
          email: userEmail,
          name: userName.charAt(0).toUpperCase() + userName.slice(1)
        };
        console.log("🔐 User authenticated from URL parameters:", { userId, userEmail });
        localStorage.setItem("wyshbone_user", JSON.stringify(urlUser));
        
        // Clear React Query cache if switching to a different user
        if (isDifferentUser) {
          console.log("🧹 Clearing React Query cache for new user");
          queryClient.clear();
        }
        
        setUserInternal(urlUser);
        setIsValidatingSession(false);
        return;
      }
      
      // Priority 3: Check localStorage (for returning users or manual login)
      const stored = localStorage.getItem("wyshbone_user");
      if (stored) {
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
      
      // No auth found - keep demo user
      console.log("⚠️ No authentication found, using demo user");
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
    <UserContext.Provider value={{ user, setUser }}>
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
