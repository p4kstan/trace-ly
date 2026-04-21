/**
 * Small inline badge that shows a % variation vs a previous period.
 * Color-coded: green when "good", red when "bad", muted when neutral/unknown.
 *
 * For most metrics, higher is better. For CPA/CPC, lower is better — pass
 * `inverted` to flip the color logic.
 */
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  delta: number | null;
  inverted?: boolean;
  size?: "xs" | "sm";
}

export function DeltaBadge({ delta, inverted = false, size = "xs" }: Props) {
  if (delta == null) {
    return <span className="text-[10px] text-muted-foreground/60">—</span>;
  }
  const rounded = Math.round(delta * 10) / 10;
  if (Math.abs(rounded) < 0.1) {
    return (
      <span className={cn("inline-flex items-center gap-0.5 text-muted-foreground", size === "xs" ? "text-[10px]" : "text-xs")}>
        <Minus className="w-2.5 h-2.5" /> 0%
      </span>
    );
  }
  const positive = rounded > 0;
  const isGood = inverted ? !positive : positive;
  const colorClass = isGood ? "text-emerald-400" : "text-rose-400";
  const Icon = positive ? ArrowUp : ArrowDown;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-semibold tabular-nums", colorClass, size === "xs" ? "text-[10px]" : "text-xs")}>
      <Icon className="w-2.5 h-2.5" />
      {positive ? "+" : ""}{rounded.toFixed(1)}%
    </span>
  );
}
