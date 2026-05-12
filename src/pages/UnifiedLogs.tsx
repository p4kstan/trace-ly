import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { Activity, Webhook, Send, Sparkles, ShieldCheck, RotateCcw } from "lucide-react";

const EventLogs = lazy(() => import("@/pages/EventLogs"));
const WebhookLogs = lazy(() => import("@/pages/WebhookLogs"));
const IntegrationLogs = lazy(() => import("@/pages/IntegrationLogs"));
const AIActionsLog = lazy(() => import("@/pages/AIActionsLog"));
const AuditLogViewer = lazy(() => import("@/pages/AuditLogViewer"));
const RetryObservability = lazy(() => import("@/pages/RetryObservability"));

const TABS = [
  { id: "events", label: "Events", icon: Activity, Component: EventLogs },
  { id: "webhooks", label: "Webhooks", icon: Webhook, Component: WebhookLogs },
  { id: "dispatch", label: "Dispatch", icon: Send, Component: IntegrationLogs },
  { id: "ai", label: "AI", icon: Sparkles, Component: AIActionsLog },
  { id: "audit", label: "Audit", icon: ShieldCheck, Component: AuditLogViewer },
  { id: "retry", label: "Retry", icon: RotateCcw, Component: RetryObservability },
] as const;

export default function UnifiedLogs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const active = searchParams.get("tab") || "events";

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Logs & Observabilidade</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tudo que acontece no pipeline em um só lugar.
        </p>
      </div>

      <Tabs
        value={active}
        onValueChange={(v) => {
          const next = new URLSearchParams(searchParams);
          next.set("tab", v);
          setSearchParams(next, { replace: true });
        }}
      >
        <TabsList className="flex flex-wrap h-auto p-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <TabsTrigger key={id} value={id} className="gap-1.5">
              <Icon className="w-3.5 h-3.5" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map(({ id, Component }) => (
          <TabsContent key={id} value={id} className="mt-6">
            <Suspense fallback={<LoadingSpinner />}>
              <Component />
            </Suspense>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
