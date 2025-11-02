import { createContext, useContext, useState, useEffect, ReactNode } from "react";

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
      // Check for session ID in URL (priority 1: Bubble iframe with ?sid=)
      const urlParams = new URLSearchParams(window.location.search);
      const sessionId = urlParams.get("sid");
      
      if (sessionId) {
        try {
          console.log("🔐 Validating session ID from URL...");
          const response = await fetch(`/api/validate-session/${sessionId}`);
          
          if (response.ok) {
            const sessionData = await response.json();
            const userName = sessionData.userEmail.split("@")[0];
            const sessionUser = {
              id: sessionData.userId,
              email: sessionData.userEmail,
              name: userName.charAt(0).toUpperCase() + userName.slice(1)
            };
            console.log(`✅ Session validated for user: ${sessionData.userEmail}`);
            localStorage.setItem("wyshbone_user", JSON.stringify(sessionUser));
            
            // Store default country if provided
            if (sessionData.defaultCountry) {
              console.log(`🌍 Setting default country from session: ${sessionData.defaultCountry}`);
              localStorage.setItem("defaultCountry", sessionData.defaultCountry);
            }
            
            setUserInternal(sessionUser);
            setIsValidatingSession(false);
            return;
          } else {
            console.warn("⚠️ Session validation failed, falling back to other auth methods");
          }
        } catch (error) {
          console.error("❌ Session validation error:", error);
        }
      }
      
      // Check for direct URL parameters (priority 2: ?user_id= and ?user_email=)
      const userId = urlParams.get("user_id");
      const userEmail = urlParams.get("user_email");
      
      if (userId && userEmail) {
        const userName = userEmail.split("@")[0];
        const urlUser = {
          id: userId,
          email: userEmail,
          name: userName.charAt(0).toUpperCase() + userName.slice(1)
        };
        console.log("🔐 User authenticated from URL parameters:", { userId, userEmail });
        localStorage.setItem("wyshbone_user", JSON.stringify(urlUser));
        setUserInternal(urlUser);
        setIsValidatingSession(false);
        return;
      }
      
      // Check localStorage (priority 3: manual login)
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
