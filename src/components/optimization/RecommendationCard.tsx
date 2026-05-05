import { useState } from "react";
import { AlertTriangle, TrendingUp, TrendingDown, Pause, Plus, Eye, Loader2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Link } from "react-router-dom";
import type { Recommendation } from "@/hooks/api/use-google-ads-recommendations";

const severityStyle: Record<string, string> = {
  critical: "border-l-4 border-l-destructive bg-destructive/5",
  high: "border-l-4 border-l-warning bg-warning/5",
  medium: "border-l-4 border-l-primary bg-primary/5",
  low: "border-l-4 border-l-muted-foreground bg-muted/30",
};
const severityVariant: Record<string, "destructive" | "default" | "secondary" | "outline"> = {
  critical: "destructive",
  high: "default",
  medium: "secondary",
  low: "outline",
};
const typeIcon: Record<string, any> = {
  pause: Pause,
  scale_up: TrendingUp,
  scale_down: TrendingDown,
  budget_change: TrendingUp,
  bid_change: TrendingUp,
  negative_keyword: Plus,
  review: Eye,
};

interface Props {
  rec: Recommendation;
  onApply: () => void;
  onReject: () => void;
  isApplying?: boolean;
}

export function RecommendationCard({ rec, onApply, onReject, isApplying }: Props) {
  const [showConfirm, setShowConfirm] = useState(false);
  const Icon = typeIcon[rec.type] || AlertTriangle;
  const isReview = rec.type === "review";

  return (
    <>
      <div className={`rounded-lg p-4 ${severityStyle[rec.severity]} hover-lift transition-all`}>
        <div className="flex items-start gap-3">
          <Icon className="w-5 h-5 mt-0.5 shrink-0 text-foreground" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={severityVariant[rec.severity]} className="text-[10px] uppercase">
                {rec.severity}
              </Badge>
              <Badge variant="outline" className="text-[10px]">{rec.type}</Badge>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                conf. {(rec.confidence * 100).toFixed(0)}%
              </span>
            </div>
            <h4 className="text-sm font-semibold text-foreground leading-snug">{rec.action.description}</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">{rec.diagnosis}</p>
            {rec.target.campaign_name && (
              <p className="text-[11px] text-muted-foreground/80">
                <span className="font-mono">{rec.target.account_id}</span> · {rec.target.campaign_name}
              </p>
            )}
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="capitalize">
                Impacto {rec.impact_estimate.direction === "increase" ? "↑" : "↓"} {rec.impact_estimate.metric} ({rec.impact_estimate.magnitude})
              </span>
            </div>
            <div className="flex items-center gap-2 pt-1">
              {isReview ? (
                <Button size="sm" asChild>
                  <Link to={`/contas-conectadas/google/${rec.target.account_id}`}>
                    <Link2 className="w-3 h-3 mr-1" /> Corrigir conta
                  </Link>
                </Button>
              ) : (
                <Button size="sm" onClick={() => setShowConfirm(true)} disabled={isApplying}>
                  {isApplying ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  Aplicar
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={onReject}>Ignorar</Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar ação</DialogTitle>
            <DialogDescription>{rec.action.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Diagnóstico</p>
              <p className="text-foreground">{rec.diagnosis}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Mutation payload</p>
              <pre className="bg-muted/40 rounded p-2 text-[11px] overflow-auto max-h-40 font-mono">
{JSON.stringify(rec.action.mutation, null, 2)}
              </pre>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>Cancelar</Button>
            <Button onClick={() => { setShowConfirm(false); onApply(); }} disabled={isApplying}>
              Confirmar e aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
