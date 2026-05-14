import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ReactNode } from "react";

/**
 * Wraps any route that requires authentication.
 * If the user is not logged in, they are redirected to /auth
 * and after login they bounce back to where they were trying to go.
 */
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  // While we're checking localStorage / validating token, show nothing
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0d1b3e]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
          <span className="text-white/60 text-sm">Loading…</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Save where they were going so we can redirect back after login
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
