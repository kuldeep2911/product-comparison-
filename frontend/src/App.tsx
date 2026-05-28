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
import Layout from "./components/Layout";

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
            <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route path="/" element={<Index />} />
              <Route path="/scenario" element={<Scenario />} />
              <Route path="/scenario1" element={<Scenario1 />} />
              <Route path="/scenario2" element={<Scenario2 />} />
              <Route path="/scenario3" element={<Scenario3 />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
          <Toaster />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
