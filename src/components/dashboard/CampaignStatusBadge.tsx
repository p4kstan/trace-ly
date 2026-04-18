/**
 * Status badge for Google Ads campaign-level entities (ENABLED / PAUSED / REMOVED).
 */
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function CampaignStatusBadge({ status }: { status?: string | null }) {
  if (!status) return null;
  const cls =
    status === "ENABLED"
      ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
      : status === "PAUSED"
      ? "border-amber-500/30 text-amber-400 bg-amber-500/10"
      : "border-rose-500/30 text-rose-400 bg-rose-500/10";
  const label = status === "ENABLED" ? "Ativada" : status === "PAUSED" ? "Pausada" : "Removida";
  return <Badge variant="outline" className={cn("text-[10px]", cls)}>{label}</Badge>;
}
