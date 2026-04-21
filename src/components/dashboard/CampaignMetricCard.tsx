/**
 * Compact KPI card used on the Google Ads campaign detail page.
 * Displays icon, label, primary value (tabular-nums) and optional hint.
 * Optionally shows a delta badge (vs previous period).
 */
import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  delta?: ReactNode;
}

export function CampaignMetricCard({ icon: Icon, label, value, hint, delta }: Props) {
  return (
    <Card className="glass-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">{label}</p>
          <Icon className="w-3.5 h-3.5 text-primary/70" />
        </div>
        <div className="flex items-baseline justify-between gap-2 mt-2">
          <p className="text-xl font-bold tabular-nums text-foreground">{value}</p>
          {delta}
        </div>
        {hint && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{hint}</p>}
      </CardContent>
    </Card>
  );
}
