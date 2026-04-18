/**
 * Compact KPI card used on the Google Ads campaign detail page.
 * Displays icon, label, primary value (tabular-nums) and optional hint.
 */
import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

interface Props {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
}

export function CampaignMetricCard({ icon: Icon, label, value, hint }: Props) {
  return (
    <Card className="glass-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">{label}</p>
          <Icon className="w-3.5 h-3.5 text-primary/70" />
        </div>
        <p className="text-xl font-bold tabular-nums text-foreground mt-2">{value}</p>
        {hint && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{hint}</p>}
      </CardContent>
    </Card>
  );
}
