/**
 * GatewayGrid — list of payment gateway integrations with test/copy/delete
 * actions and expandable webhook logs. Receives all data + handlers via
 * props from useIntegrationManager.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, Copy, Trash2, Webhook, Play, ChevronDown, ChevronUp } from "lucide-react";
import { IntegrationStatusBadge as StatusBadge } from "@/components/dashboard/IntegrationStatusBadge";
import { IntegrationHealthIndicator as HealthIndicator } from "@/components/dashboard/IntegrationHealthIndicator";
import { WebhookLogsList as WebhookLogs } from "@/components/dashboard/WebhookLogsList";
import { PROVIDER_CONFIGS } from "@/lib/integration-help-config";
import { useState } from "react";

interface GatewayRow {
  id: string;
  name: string;
  provider: string;
  status: string;
  environment: string;
}

interface GatewayGridProps {
  integrations: GatewayRow[];
  isLoading: boolean;
  onAdd: () => void;
  onToggle: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onTest: (id: string, provider: string) => void;
  onCopyUrl: (id: string, provider: string) => void;
  getWebhookUrl: (id: string, provider: string) => string;
  testingId: string | null;
}

export function GatewayGrid({
  integrations,
  isLoading,
  onAdd,
  onToggle,
  onDelete,
  onTest,
  onCopyUrl,
  getWebhookUrl,
  testingId,
}: GatewayGridProps) {
  const [expandedLogs, setExpandedLogs] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          Gateways Conectados ({integrations.length})
        </h2>
        <Button onClick={onAdd} size="sm" className="gap-2">
          <Plus className="w-3.5 h-3.5" /> Adicionar Gateway
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : integrations.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-8 text-center">
            <Webhook className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-foreground font-medium">Nenhum gateway conectado</p>
            <p className="text-sm text-muted-foreground mt-1">
              Adicione um gateway para receber webhooks de pagamento
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {integrations.map((gi) => {
            const prov = PROVIDER_CONFIGS[gi.provider];
            const isExpanded = expandedLogs === gi.id;
            return (
              <Card key={gi.id} className="glass-card">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{prov?.emoji || "🔌"}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground text-sm">{gi.name}</p>
                          <StatusBadge status={gi.status} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {prov?.label || gi.provider} · {gi.environment}
                        </p>
                        <HealthIndicator integrationId={gi.id} />
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => onTest(gi.id, gi.provider)}
                        disabled={testingId === gi.id}
                      >
                        <Play className="w-3.5 h-3.5" />
                        {testingId === gi.id ? "Testando..." : "Testar"}
                      </Button>
                      <Switch
                        checked={gi.status === "active"}
                        onCheckedChange={() => onToggle(gi.id, gi.status)}
                      />
                      <Button variant="ghost" size="sm" onClick={() => onCopyUrl(gi.id, gi.provider)}>
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => onDelete(gi.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  <div className="bg-muted/30 rounded-lg p-2.5 flex items-center gap-2">
                    <Webhook className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <code className="text-xs text-muted-foreground truncate flex-1">
                      {getWebhookUrl(gi.id, gi.provider)}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2"
                      onClick={() => onCopyUrl(gi.id, gi.provider)}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>

                  <Collapsible
                    open={isExpanded}
                    onOpenChange={() => setExpandedLogs(isExpanded ? null : gi.id)}
                  >
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full mt-2 text-xs text-muted-foreground gap-1.5 justify-center"
                      >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        {isExpanded ? "Ocultar logs" : "Ver logs recentes"}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <WebhookLogs integrationId={gi.id} />
                    </CollapsibleContent>
                  </Collapsible>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
