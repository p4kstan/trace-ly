/**
 * CampaignHeader — title, status badge, period selector, pause/play and
 * budget edit triggers for the Google Ads Campaign Detail page.
 */
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Pause, Play, Edit3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CampaignStatusBadge as StatusBadge } from "@/components/dashboard/CampaignStatusBadge";
import { PERIOD_LABELS, type Period } from "@/hooks/api/use-campaign-metrics";

interface CampaignSummary {
  name?: string | null;
  status?: string | null;
  channel_type?: string | null;
}

interface CampaignHeaderProps {
  campaign: CampaignSummary | undefined;
  campaignId: string;
  customerId: string;
  isLoadingHeader: boolean;
  period: Period;
  onPeriodChange: (p: Period) => void;
  onTogglePause: () => void;
  onToggleResume: () => void;
  toggleStatusPending: boolean;
  onOpenBudget: () => void;
}

export function CampaignHeader({
  campaign,
  campaignId,
  customerId,
  isLoadingHeader,
  period,
  onPeriodChange,
  onTogglePause,
  onToggleResume,
  toggleStatusPending,
  onOpenBudget,
}: CampaignHeaderProps) {
  const navigate = useNavigate();
  const status = campaign?.status ?? null;

  return (
    <div className="flex items-start justify-between flex-wrap gap-3">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/google-ads-campaigns")}>
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Voltar
        </Button>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            {campaign?.name || (isLoadingHeader ? "Carregando…" : "Campanha")}
            {campaign?.status && <StatusBadge status={campaign.status} />}
          </h1>
          <p className="text-xs text-muted-foreground mt-1 font-mono">
            ID {campaignId} · {customerId} · {campaign?.channel_type || ""}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={period} onValueChange={(v) => onPeriodChange(v as Period)}>
          <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <SelectItem key={p} value={p}>{PERIOD_LABELS[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {status === "ENABLED" ? (
          <Button size="sm" variant="outline" onClick={onTogglePause} disabled={toggleStatusPending}>
            {toggleStatusPending
              ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              : <Pause className="w-3.5 h-3.5 mr-1.5" />} Pausar
          </Button>
        ) : status === "PAUSED" ? (
          <Button size="sm" variant="outline" onClick={onToggleResume} disabled={toggleStatusPending}>
            {toggleStatusPending
              ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              : <Play className="w-3.5 h-3.5 mr-1.5" />} Ativar
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={onOpenBudget}>
          <Edit3 className="w-3.5 h-3.5 mr-1.5" /> Orçamento
        </Button>
      </div>
    </div>
  );
}
