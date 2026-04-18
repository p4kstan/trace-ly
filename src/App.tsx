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
const Usage = lazy(() => import("@/pages/Usage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const SystemDiagnostic = lazy(() => import("@/pages/SystemDiagnostic"));
const ApiKeys = lazy(() => import("@/pages/ApiKeys"));
const Credentials = lazy(() => import("@/pages/Credentials"));
const Auth = lazy(() => import("@/pages/Auth"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const Setup = lazy(() => import("@/pages/Setup"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const Orders = lazy(() => import("@/pages/Orders"));
const WebhookLogs = lazy(() => import("@/pages/WebhookLogs"));
const QueueMonitor = lazy(() => import("@/pages/QueueMonitor"));
const Tutorials = lazy(() => import("@/pages/Tutorials"));
const McpIntegration = lazy(() => import("@/pages/McpIntegration"));
const Enterprise = lazy(() => import("@/pages/Enterprise"));
const RealTimeAnalytics = lazy(() => import("@/pages/RealTimeAnalytics"));
const Predictions = lazy(() => import("@/pages/Predictions"));
const Optimization = lazy(() => import("@/pages/Optimization"));
const Funnels = lazy(() => import("@/pages/Funnels"));
const TrackingSources = lazy(() => import("@/pages/TrackingSources"));
const Destinations = lazy(() => import("@/pages/Destinations"));
const SDKSetup = lazy(() => import("@/pages/SDKSetup"));
const IntegrationLogs = lazy(() => import("@/pages/IntegrationLogs"));
const TrackingGuide = lazy(() => import("@/pages/TrackingGuide"));
const HowItWorks = lazy(() => import("@/pages/HowItWorks"));
const SetupFacebook = lazy(() => import("@/pages/SetupFacebook"));
const SetupGoogle = lazy(() => import("@/pages/SetupGoogle"));
const ConnectedAccounts = lazy(() => import("@/pages/ConnectedAccounts"));
const GoogleAdsAccountDetail = lazy(() => import("@/pages/GoogleAdsAccountDetail"));
const GoogleAdsCampaigns = lazy(() => import("@/pages/GoogleAdsCampaigns"));
const GoogleAdsCampaignDetail = lazy(() => import("@/pages/GoogleAdsCampaignDetail"));
const FacebookAdsCampaigns = lazy(() => import("@/pages/FacebookAdsCampaigns"));
const TikTokAdsCampaigns = lazy(() => import("@/pages/TikTokAdsCampaigns"));
const PromptGenerator = lazy(() => import("@/pages/PromptGenerator"));
const NativeCheckoutGuide = lazy(() => import("@/pages/NativeCheckoutGuide"));
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
          <Route path="/enterprise" element={<Enterprise />} />
          <Route path="/realtime" element={<RealTimeAnalytics />} />
          <Route path="/predictions" element={<Predictions />} />
          <Route path="/optimization" element={<Optimization />} />
          <Route path="/funnels" element={<Funnels />} />
          <Route path="/tracking-sources" element={<TrackingSources />} />
          <Route path="/destinations" element={<Destinations />} />
          <Route path="/sdk-setup" element={<SDKSetup />} />
          <Route path="/prompt-generator" element={<PromptGenerator />} />
          <Route path="/integration-logs" element={<IntegrationLogs />} />
          <Route path="/tracking-guide" element={<TrackingGuide />} />
          <Route path="/native-checkout-guide" element={<NativeCheckoutGuide />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/setup-facebook" element={<SetupFacebook />} />
          <Route path="/setup-google" element={<SetupGoogle />} />
          <Route path="/contas-conectadas" element={<ConnectedAccounts />} />
          <Route path="/contas-conectadas/google/:customerId" element={<GoogleAdsAccountDetail />} />
          <Route path="/google-ads-campaigns" element={<GoogleAdsCampaigns />} />
          <Route path="/google-ads-campaigns/:customerId/:campaignId" element={<GoogleAdsCampaignDetail />} />
          <Route path="/facebook-ads-campaigns" element={<FacebookAdsCampaigns />} />
          <Route path="/tiktok-ads-campaigns" element={<TikTokAdsCampaigns />} />
          <Route path="/plans" element={<Plans />} />
          <Route path="/usage" element={<Usage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/system-diagnostic" element={<SystemDiagnostic />} />
          <Route path="/api-keys" element={<ApiKeys />} />
          <Route path="/credentials" element={<Credentials />} />
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
