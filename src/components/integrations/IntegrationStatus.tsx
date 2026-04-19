/**
 * IntegrationStatus — small summary chips (totals: gateways, destinations,
 * active) shown above the lists.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Webhook, Send, Zap } from "lucide-react";

interface IntegrationStatusProps {
  gatewayCount: number;
  destinationCount: number;
  activeCount: number;
}

export function IntegrationStatus({ gatewayCount, destinationCount, activeCount }: IntegrationStatusProps) {
  const items = [
    { icon: Webhook, label: "Gateways", value: gatewayCount },
    { icon: Send, label: "Destinos", value: destinationCount },
    { icon: Zap, label: "Ativos", value: activeCount },
  ];
  return (
    <div className="grid grid-cols-3 gap-3">
      {items.map((it) => (
        <Card key={it.label} className="glass-card">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="rounded-md bg-primary/10 p-2 text-primary">
              <it.icon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{it.label}</p>
              <p className="text-base font-bold tabular-nums">{it.value}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
