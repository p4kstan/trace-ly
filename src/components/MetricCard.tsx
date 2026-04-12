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
    <div className="surface-elevated p-4 hover-lift group relative overflow-hidden">
      {/* Subtle gradient glow on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 0%, hsl(199 89% 48% / 0.06) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-medium text-muted-foreground tracking-wider uppercase">{title}</span>
          <div className="w-8 h-8 rounded-lg bg-primary/8 border border-primary/10 flex items-center justify-center group-hover:bg-primary/15 group-hover:border-primary/20 transition-all duration-300">
            <Icon className="w-3.5 h-3.5 text-primary group-hover:drop-shadow-[0_0_6px_hsl(199_89%_48%/0.5)] transition-all duration-300" />
          </div>
        </div>
        <div className="text-2xl font-bold text-foreground tabular-nums tracking-tight">
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
    </div>
  );
}
