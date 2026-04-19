import { useState } from "react";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { useIntegrationManager } from "@/hooks/api/use-integration-manager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Webhook, TrendingUp } from "lucide-react";
import { IntegrationDialog } from "@/components/integrations/IntegrationDialog";
import { IntegrationSearch } from "@/components/integrations/IntegrationSearch";
import { IntegrationStatus } from "@/components/integrations/IntegrationStatus";
import { GatewayGrid } from "@/components/integrations/GatewayGrid";
import { DestinationList } from "@/components/integrations/DestinationList";
import { DestinationDialog } from "@/components/integrations/DestinationDialog";
import { AD_PROVIDERS } from "@/components/integrations/ad-providers";
import { AutomationCommandCenter } from "@/components/automation/AutomationCommandCenter";

export default function Integrations() {
  const { data: workspace } = useWorkspace();
  const [gatewayDialogOpen, setGatewayDialogOpen] = useState(false);
  const [destinationDialogOpen, setDestinationDialogOpen] = useState(false);

  const m = useIntegrationManager(workspace?.id);

  const activeCount =
    m.integrations.filter((i) => i.status === "active").length +
    m.destinations.filter((d) => d.is_active).length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Integrações</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gateways de pagamento e plataformas de conversão
        </p>
      </div>

      <IntegrationStatus
        gatewayCount={m.integrations.length}
        destinationCount={m.destinations.length}
        activeCount={activeCount}
      />

      <AutomationCommandCenter workspaceId={workspace?.id} limit={6} />

      <IntegrationSearch value={m.search} onChange={m.setSearch} />

      <Tabs defaultValue="destinations" className="w-full">
        <TabsList className="glass-card">
          <TabsTrigger value="destinations" className="gap-2">
            <TrendingUp className="w-4 h-4" /> Destinos de Conversão
          </TabsTrigger>
          <TabsTrigger value="gateways" className="gap-2">
            <Webhook className="w-4 h-4" /> Gateways de Pagamento
          </TabsTrigger>
        </TabsList>

        <TabsContent value="destinations" className="mt-4">
          {workspace?.id && (
            <DestinationList
              destinations={m.destinations}
              metaPixels={m.metaPixels}
              isLoading={m.destinationsLoading}
              deliveryStats={m.deliveryStats}
              providers={AD_PROVIDERS}
              onAdd={() => setDestinationDialogOpen(true)}
              onToggle={(id, isActive) => m.toggleDestination.mutate({ id, isActive })}
              onDelete={(id) => m.deleteDestination.mutate(id)}
            />
          )}
        </TabsContent>

        <TabsContent value="gateways" className="mt-4">
          <GatewayGrid
            integrations={m.integrations}
            isLoading={m.integrationsLoading}
            onAdd={() => setGatewayDialogOpen(true)}
            onToggle={(id, status) => m.toggleMutation.mutate({ id, status })}
            onDelete={(id) => m.deleteMutation.mutate(id)}
            onTest={m.testWebhook}
            onCopyUrl={m.copyWebhookUrl}
            getWebhookUrl={m.getWebhookUrl}
            testingId={m.testingId}
          />
        </TabsContent>
      </Tabs>

      <IntegrationDialog
        open={gatewayDialogOpen}
        onOpenChange={setGatewayDialogOpen}
        onSubmit={(form) => m.createGateway(form, () => setGatewayDialogOpen(false))}
        isPending={m.createMutation.isPending}
        supabaseUrl={m.supabaseUrl}
        workspaceId={workspace?.id || ""}
      />

      {workspace?.id && (
        <DestinationDialog
          open={destinationDialogOpen}
          onOpenChange={setDestinationDialogOpen}
          workspaceId={workspace.id}
        />
      )}
    </div>
  );
}
