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
    // Try to read from localStorage first (for manual login)
    const stored = localStorage.getItem("wyshbone_user");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        console.log(`✅ Loaded user from storage: ${parsed.email}`);
        return parsed;
      } catch (e) {
        console.error("Failed to parse stored user", e);
      }
    }

    // Try to read from URL parameters (for Bubble integration)
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get("user_id");
    const userEmail = urlParams.get("user_email");
    
    if (userId && userEmail) {
      const userName = userEmail.split("@")[0];
      const urlUser = {
        id: userId,
        email: userEmail,
        name: userName.charAt(0).toUpperCase() + userName.slice(1)
      };
      console.log("🔐 User authenticated from URL:", { userId, userEmail });
      localStorage.setItem("wyshbone_user", JSON.stringify(urlUser));
      return urlUser;
    }
    
    console.log("⚠️ No user credentials in URL, using demo user");
    return { 
      id: "demo-user", 
      email: "demo@wyshbone.com",
      name: "Demo User"
    };
  });

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

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get("user_id");
    const userEmail = urlParams.get("user_email");
    
    if (userId && userEmail && (userId !== user.id || userEmail !== user.email)) {
      const userName = userEmail.split("@")[0];
      const urlUser = {
        id: userId,
        email: userEmail,
        name: userName.charAt(0).toUpperCase() + userName.slice(1)
      };
      console.log("🔐 User credentials updated from URL:", { userId, userEmail });
      setUserInternal(urlUser);
      localStorage.setItem("wyshbone_user", JSON.stringify(urlUser));
    }
  }, []);

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
