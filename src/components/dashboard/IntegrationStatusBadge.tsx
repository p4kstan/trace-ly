/**
 * Status badge for gateway integrations (active, inactive, error, pending).
 * Uses semantic tokens from the design system.
 */
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";

const STATUS_MAP = {
  active: { label: "Ativo", class: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
  inactive: { label: "Inativo", class: "bg-muted text-muted-foreground border-border", icon: Clock },
  error: { label: "Erro", class: "bg-destructive/15 text-destructive border-destructive/30", icon: XCircle },
  pending: { label: "Pendente", class: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: AlertTriangle },
} as const;

export function IntegrationStatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status as keyof typeof STATUS_MAP] || STATUS_MAP.pending;
  const Icon = s.icon;
  return (
    <Badge variant="outline" className={`${s.class} gap-1`}>
      <Icon className="w-3 h-3" />
      {s.label}
    </Badge>
  );
}
