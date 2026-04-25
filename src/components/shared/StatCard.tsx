/**
 * Shared compact KPI/Stat card used by audit pages.
 *
 * Designed to never overflow on narrow viewports (320px+):
 *  - `min-w-0` on flex/grid children so long labels can wrap;
 *  - `.stat-label` (defined in index.css) wraps long uppercase labels with
 *    `overflow-wrap: anywhere` and hyphens;
 *  - `tabular-nums` on numeric value to keep alignment in grids;
 *  - optional tone applies semantic color tokens (ok/warn/danger).
 *
 * Use this wherever you'd previously write a small bordered card showing a
 * label + a single number. It replaces the ad-hoc `Stat` / `KpiCard` /
 * `DiagCard` / `StatBlock` components that lived inside individual pages.
 */
import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

export type StatTone = "neutral" | "ok" | "warn" | "danger";

interface Props {
  label: string;
  value: number | string;
  /** Optional small caption shown under the value. */
  hint?: string;
  /** Optional leading icon. */
  icon?: LucideIcon;
  tone?: StatTone;
  /** Use a smaller value font (xl) instead of the default 2xl. */
  compact?: boolean;
}

const TONE_CLASSES: Record<StatTone, { border: string; value: string }> = {
  neutral: { border: "border-border/50", value: "text-foreground" },
  ok: { border: "border-success/30", value: "text-success" },
  warn: { border: "border-warning/30", value: "text-warning" },
  danger: { border: "border-destructive/30", value: "text-destructive" },
};

export function StatCard({ label, value, hint, icon: Icon, tone = "neutral", compact }: Props) {
  const t = TONE_CLASSES[tone];
  const valueSize = compact ? "text-xl" : "text-2xl";
  return (
    <Card className={`border ${t.border} bg-background min-w-0`}>
      <CardContent className="p-3 min-w-0">
        <div className="flex items-start gap-2 min-w-0">
          {Icon && <Icon className="w-4 h-4 shrink-0 mt-1 text-muted-foreground" />}
          <div className="min-w-0 flex-1">
            <div className={`${valueSize} font-semibold tabular-nums leading-tight ${t.value}`}>
              {value}
            </div>
            <div className="stat-label mt-0.5">{label}</div>
            {hint && (
              <div className="text-[10px] text-muted-foreground/80 mt-0.5 break-anywhere leading-snug">
                {hint}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
