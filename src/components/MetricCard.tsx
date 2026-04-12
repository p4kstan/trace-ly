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
    <div className="glass-card p-5 animate-slide-up hover:glow-primary transition-shadow duration-300">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-muted-foreground">{title}</span>
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="w-4 h-4 text-primary" />
        </div>
      </div>
      <div className="text-2xl font-bold text-foreground">
        {prefix}{value}
      </div>
      <div className={`flex items-center gap-1 mt-2 text-sm ${isPositive ? "text-success" : "text-destructive"}`}>
        {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        <span>{isPositive ? "+" : ""}{change}%</span>
        <span className="text-muted-foreground ml-1">vs last 7d</span>
      </div>
    </div>
  );
}
