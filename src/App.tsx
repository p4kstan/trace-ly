import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
// Legacy Toaster removed - unified on Sonner
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/use-auth";
import Dashboard from "@/pages/Dashboard";
import Attribution from "@/pages/Attribution";
import Pixels from "@/pages/Pixels";
import EventLogs from "@/pages/EventLogs";
import Debugger from "@/pages/Debugger";
import AIAnalytics from "@/pages/AIAnalytics";
import Integrations from "@/pages/Integrations";
import Plans from "@/pages/Plans";
import SettingsPage from "@/pages/SettingsPage";
import SystemDiagnostic from "@/pages/SystemDiagnostic";
import ApiKeys from "@/pages/ApiKeys";
import Auth from "@/pages/Auth";
import ResetPassword from "@/pages/ResetPassword";
import Setup from "@/pages/Setup";
import Orders from "@/pages/Orders";
import WebhookLogs from "@/pages/WebhookLogs";
import QueueMonitor from "@/pages/QueueMonitor";
import Tutorials from "@/pages/Tutorials";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  return (
    <DashboardLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/attribution" element={<Attribution />} />
        <Route path="/pixels" element={<Pixels />} />
        <Route path="/logs" element={<EventLogs />} />
        <Route path="/debugger" element={<Debugger />} />
        <Route path="/ai-analytics" element={<AIAnalytics />} />
        <Route path="/integrations" element={<Integrations />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/webhook-logs" element={<WebhookLogs />} />
        <Route path="/queue" element={<QueueMonitor />} />
        <Route path="/tutorials" element={<Tutorials />} />
        <Route path="/plans" element={<Plans />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/system-diagnostic" element={<SystemDiagnostic />} />
        <Route path="/api-keys" element={<ApiKeys />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </DashboardLayout>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      {/* Unified toast: Sonner only */}
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/*" element={<ProtectedRoutes />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
