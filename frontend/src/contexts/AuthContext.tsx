import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useNavigate } from "react-router-dom";

// In Vite, you can export API_BASE from your api.ts and use it here.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

interface AuthUser {
  user_id: number;
  username: string;
  access_token: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (token: string, userId: number, username: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On first load, restore session from localStorage
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    const userId = localStorage.getItem("user_id");
    const username = localStorage.getItem("username");

    if (token && userId && username) {
      // Validate the token is still good by calling /me
      fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (res.ok) {
            setUser({ access_token: token, user_id: parseInt(userId), username });
          } else {
            // Token expired or invalid — clear storage
            localStorage.removeItem("access_token");
            localStorage.removeItem("user_id");
            localStorage.removeItem("username");
          }
        })
        .catch(() => {
          /* network error – keep trying */
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = (token: string, userId: number, username: string) => {
    localStorage.setItem("access_token", token);
    localStorage.setItem("user_id", String(userId));
    localStorage.setItem("username", username);
    setUser({ access_token: token, user_id: userId, username });
  };

  const logout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user_id");
    localStorage.removeItem("username");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
