import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardLayout } from "@/components/DashboardLayout";
import Dashboard from "@/pages/Dashboard";
import Attribution from "@/pages/Attribution";
import Pixels from "@/pages/Pixels";
import EventLogs from "@/pages/EventLogs";
import Debugger from "@/pages/Debugger";
import AIAnalytics from "@/pages/AIAnalytics";
import Integrations from "@/pages/Integrations";
import Plans from "@/pages/Plans";
import SettingsPage from "@/pages/SettingsPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="*" element={
            <DashboardLayout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/attribution" element={<Attribution />} />
                <Route path="/pixels" element={<Pixels />} />
                <Route path="/logs" element={<EventLogs />} />
                <Route path="/debugger" element={<Debugger />} />
                <Route path="/ai-analytics" element={<AIAnalytics />} />
                <Route path="/integrations" element={<Integrations />} />
                <Route path="/plans" element={<Plans />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </DashboardLayout>
          } />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
