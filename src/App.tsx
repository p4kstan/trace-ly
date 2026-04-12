import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { LoadingSpinner, PageSkeleton } from "@/components/layout/LoadingSpinner";
import { useAuth } from "@/hooks/use-auth";

// Lazy-loaded pages
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Attribution = lazy(() => import("@/pages/Attribution"));
const Pixels = lazy(() => import("@/pages/Pixels"));
const EventLogs = lazy(() => import("@/pages/EventLogs"));
const Debugger = lazy(() => import("@/pages/Debugger"));
const AIAnalytics = lazy(() => import("@/pages/AIAnalytics"));
const Integrations = lazy(() => import("@/pages/Integrations"));
const Plans = lazy(() => import("@/pages/Plans"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const SystemDiagnostic = lazy(() => import("@/pages/SystemDiagnostic"));
const ApiKeys = lazy(() => import("@/pages/ApiKeys"));
const Auth = lazy(() => import("@/pages/Auth"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const Setup = lazy(() => import("@/pages/Setup"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const Orders = lazy(() => import("@/pages/Orders"));
const WebhookLogs = lazy(() => import("@/pages/WebhookLogs"));
const QueueMonitor = lazy(() => import("@/pages/QueueMonitor"));
const Tutorials = lazy(() => import("@/pages/Tutorials"));
const McpIntegration = lazy(() => import("@/pages/McpIntegration"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const queryClient = new QueryClient();

function ProtectedRoutes() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <DashboardLayout>
      <Suspense fallback={<PageSkeleton />}>
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
          <Route path="/mcp" element={<McpIntegration />} />
          <Route path="/plans" element={<Plans />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/system-diagnostic" element={<SystemDiagnostic />} />
          <Route path="/api-keys" element={<ApiKeys />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </DashboardLayout>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <ErrorBoundary>
        <BrowserRouter>
          <Suspense fallback={<LoadingSpinner />}>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/setup" element={<Setup />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/*" element={<ProtectedRoutes />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
