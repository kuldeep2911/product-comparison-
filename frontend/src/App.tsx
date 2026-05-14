import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";

import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Scenario from "./pages/Scenario";
import Scenario1 from "./pages/Scenario1";
import Scenario2 from "./pages/Scenario2";
import Scenario3 from "./pages/Scenario3";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public route – no auth needed */}
            <Route path="/auth" element={<Auth />} />

            {/* All other routes require login */}
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/scenario1" element={<ProtectedRoute><Scenario1 /></ProtectedRoute>} />
            <Route path="/scenario2" element={<ProtectedRoute><Scenario2 /></ProtectedRoute>} />
            <Route path="/scenario3" element={<ProtectedRoute><Scenario3 /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          <Toaster />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
