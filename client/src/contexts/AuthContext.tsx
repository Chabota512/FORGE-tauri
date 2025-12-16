import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";
import { getApiUrl } from "@/lib/queryClient";

interface User {
  id: number;
  email: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    let retries = 0;
    const maxRetries = 3;
    
    while (retries < maxRetries) {
      try {
        const response = await fetch(getApiUrl("/api/auth/me"), {
          credentials: "include",
          signal: AbortSignal.timeout(5000),
        });
        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
        }
        // Success or error response received, exit retry loop
        break;
      } catch (error) {
        retries++;
        if (retries < maxRetries) {
          // Wait before retrying (500ms * retry count)
          await new Promise(resolve => setTimeout(resolve, 500 * retries));
        } else {
          console.error("Auth check failed after retries:", error);
        }
      }
    }
    
    setIsLoading(false);
  }

  async function login(email: string, password: string) {
    let retries = 0;
    const maxRetries = 3;
    
    while (retries < maxRetries) {
      try {
        const response = await fetch(getApiUrl("/api/auth/login"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email, password }),
          signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Login failed");
        }

        const userData = await response.json();
        setUser(userData);
        setLocation("/dashboard");
        return;
      } catch (error) {
        retries++;
        if (retries < maxRetries) {
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 500 * retries));
        } else {
          throw error;
        }
      }
    }
  }

  async function signup(email: string, password: string, name: string) {
    let retries = 0;
    const maxRetries = 3;
    
    while (retries < maxRetries) {
      try {
        const response = await fetch(getApiUrl("/api/auth/signup"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email, password, name }),
          signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Signup failed");
        }

        const userData = await response.json();
        setUser(userData);
        setLocation("/home");
        return;
      } catch (error) {
        retries++;
        if (retries < maxRetries) {
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 500 * retries));
        } else {
          throw error;
        }
      }
    }
  }

  async function logout() {
    try {
      const response = await fetch(getApiUrl("/api/auth/logout"), {
        method: "POST",
        credentials: "include",
      });
      if (response.ok) {
        setUser(null);
        setLocation("/landing");
      }
    } catch (error) {
      console.error("Logout failed:", error);
      setUser(null);
      setLocation("/landing");
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        signup,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
