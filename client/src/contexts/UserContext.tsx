import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export interface User {
  id: string;
  email: string;
}

interface UserContextType {
  user: User;
  setUser: (user: User) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get("user_id");
    const userEmail = urlParams.get("user_email");
    
    if (userId && userEmail) {
      console.log("🔐 User authenticated from URL:", { userId, userEmail });
      return { id: userId, email: userEmail };
    }
    
    console.log("⚠️ No user credentials in URL, using demo user");
    return { id: "demo-user", email: "demo@wyshbone.com" };
  });

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get("user_id");
    const userEmail = urlParams.get("user_email");
    
    if (userId && userEmail && (userId !== user.id || userEmail !== user.email)) {
      console.log("🔐 User credentials updated from URL:", { userId, userEmail });
      setUser({ id: userId, email: userEmail });
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
