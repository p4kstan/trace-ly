/**
 * DestinationList — Meta CAPI summary card + per-destination cards with
 * delivery stats, toggle and delete actions.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Send, XCircle, Zap, BarChart3 } from "lucide-react";

interface DestinationRow {
  id: string;
  provider: string;
  destination_id: string;
  display_name: string | null;
  is_active: boolean;
  events_sent_count?: number | null;
}

interface MetaPixelRow {
  id: string;
  pixel_id: string;
  is_active: boolean;
}

interface ProviderDisplay {
  emoji: string;
  label: string;
}

type DeliveryStats = Map<string, { delivered: number; failed: number }> | undefined;

interface DestinationListProps {
  destinations: DestinationRow[];
  metaPixels: MetaPixelRow[];
  isLoading: boolean;
  deliveryStats: DeliveryStats;
  providers: Record<string, ProviderDisplay>;
  onAdd: () => void;
  onToggle: (id: string, isActive: boolean) => void;
  onDelete: (id: string) => void;
}

export function DestinationList({
  destinations,
  metaPixels,
  isLoading,
  deliveryStats,
  providers,
  onAdd,
  onToggle,
  onDelete,
}: DestinationListProps) {
  const activeMetaPixels = metaPixels.filter((p) => p.is_active);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">Destinos de Conversão</h2>
          <p className="text-xs text-muted-foreground/60 mt-0.5">
            Eventos são enviados automaticamente para todos os destinos ativos
          </p>
        </div>
        <Button onClick={onAdd} size="sm" className="gap-2">
          <Plus className="w-3.5 h-3.5" /> Adicionar Destino
        </Button>
      </div>

      {activeMetaPixels.length > 0 && (
        <Card className="glass-card border-primary/10">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📘</span>
                <div>
                  <p className="font-medium text-foreground text-sm">Meta Ads — CAPI</p>
                  <p className="text-xs text-muted-foreground">{activeMetaPixels.length} pixel(s) ativo(s)</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {deliveryStats && (() => {
                  let delivered = 0;
                  let failed = 0;
                  for (const p of activeMetaPixels) {
                    const s = deliveryStats.get(`meta::${p.pixel_id}`);
                    if (s) { delivered += s.delivered; failed += s.failed; }
                  }
                  return (
                    <div className="flex items-center gap-2 text-xs">
                      {delivered > 0 && (
                        <span className="text-emerald-400 flex items-center gap-1">
                          <Send className="w-3 h-3" />{delivered} enviados
                        </span>
                      )}
                      {failed > 0 && (
                        <span className="text-destructive flex items-center gap-1">
                          <XCircle className="w-3 h-3" />{failed} falhas
                        </span>
                      )}
                    </div>
                  );
                })()}
                <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                  Ativo
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Card key={i} className="glass-card">
              <CardContent className="p-4">
                <div className="h-12 animate-pulse bg-muted/20 rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : destinations.length === 0 && activeMetaPixels.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-8 text-center">
            <Send className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-foreground font-medium">Nenhum destino configurado</p>
            <p className="text-sm text-muted-foreground mt-1">
              Adicione destinos para enviar conversões automaticamente
            </p>
            <Button onClick={onAdd} className="mt-4 gap-2">
              <Plus className="w-4 h-4" /> Adicionar Destino
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {destinations.map((dest) => {
            const prov = providers[dest.provider];
            const statsKey = `${dest.provider}::${dest.destination_id}`;
            const stats = deliveryStats?.get(statsKey);

            return (
              <Card key={dest.id} className="glass-card hover-lift transition-all duration-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{prov?.emoji || "📡"}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground text-sm">
                            {dest.display_name || prov?.label}
                          </p>
                          <Badge
                            variant="outline"
                            className={
                              dest.is_active
                                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1"
                                : "gap-1"
                            }
                          >
                            {dest.is_active ? (<><Zap className="w-3 h-3" /> Ativo</>) : "Inativo"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {prov?.label} · <code className="font-mono">{dest.destination_id}</code>
                        </p>
                        {dest.events_sent_count != null && dest.events_sent_count > 0 && (
                          <p className="text-xs text-muted-foreground/60 mt-0.5 flex items-center gap-1">
                            <BarChart3 className="w-3 h-3" />
                            {dest.events_sent_count.toLocaleString("pt-BR")} eventos enviados
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {stats && (
                        <div className="flex items-center gap-2 text-xs mr-2">
                          {stats.delivered > 0 && (
                            <span className="text-emerald-400">
                              {stats.delivered} <span className="text-muted-foreground/60">24h</span>
                            </span>
                          )}
                          {stats.failed > 0 && (
                            <span className="text-destructive">{stats.failed} falhas</span>
                          )}
                        </div>
                      )}
                      <Switch
                        checked={dest.is_active}
                        onCheckedChange={() => onToggle(dest.id, dest.is_active)}
                      />
                      <Button variant="ghost" size="sm" onClick={() => onDelete(dest.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
