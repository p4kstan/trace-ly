import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string;
  change: number;
  icon: LucideIcon;
  prefix?: string;
}

export function MetricCard({ title, value, change, icon: Icon, prefix }: MetricCardProps) {
  const isPositive = change >= 0;

  return (
    <div className="surface-elevated p-4 hover-lift group">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground tracking-wide uppercase">{title}</span>
        <div className="w-8 h-8 rounded-lg bg-primary/8 border border-primary/10 flex items-center justify-center group-hover:bg-primary/12 transition-colors">
          <Icon className="w-3.5 h-3.5 text-primary" />
        </div>
      </div>
      <div className="text-xl font-bold text-foreground tabular-nums tracking-tight">
        {prefix}{value}
      </div>
      {change !== 0 && (
        <div className={`flex items-center gap-1 mt-2 text-xs ${isPositive ? "text-success" : "text-destructive"}`}>
          {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          <span className="font-medium">{isPositive ? "+" : ""}{change}%</span>
          <span className="text-muted-foreground ml-0.5">vs 7d</span>
        </div>
      )}
    </div>
  );
}
