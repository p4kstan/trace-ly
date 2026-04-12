import { DollarSign, Target, TrendingUp, Users } from "lucide-react";
import { MetricCard } from "@/components/MetricCard";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

const revenueData = [
  { date: "Mar 1", revenue: 4200, conversions: 32 },
  { date: "Mar 5", revenue: 5800, conversions: 41 },
  { date: "Mar 10", revenue: 3900, conversions: 28 },
  { date: "Mar 15", revenue: 7200, conversions: 55 },
  { date: "Mar 20", revenue: 6100, conversions: 48 },
  { date: "Mar 25", revenue: 8400, conversions: 62 },
  { date: "Mar 30", revenue: 9100, conversions: 71 },
];

const channelData = [
  { channel: "Meta Ads", conversions: 234, revenue: 18700 },
  { channel: "Google Ads", conversions: 189, revenue: 15200 },
  { channel: "TikTok", conversions: 98, revenue: 7800 },
  { channel: "Organic", conversions: 156, revenue: 12400 },
  { channel: "Direct", conversions: 67, revenue: 5300 },
];

const recentEvents = [
  { event: "Purchase", source: "Meta Ads", value: "R$ 297,00", time: "2 min ago", status: "synced" },
  { event: "Lead", source: "Google Ads", value: "—", time: "5 min ago", status: "synced" },
  { event: "AddToCart", source: "TikTok", value: "R$ 149,00", time: "8 min ago", status: "pending" },
  { event: "PageView", source: "Organic", value: "—", time: "12 min ago", status: "synced" },
  { event: "Purchase", source: "Meta Ads", value: "R$ 497,00", time: "15 min ago", status: "synced" },
];

export default function Dashboard() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Overview of your tracking performance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Revenue" value="59,400" change={12.5} icon={DollarSign} prefix="R$ " />
        <MetricCard title="ROAS" value="4.2x" change={8.3} icon={TrendingUp} />
        <MetricCard title="CPA" value="42,80" change={-5.2} icon={Target} prefix="R$ " />
        <MetricCard title="Conversions" value="744" change={15.1} icon={Users} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 glass-card p-5">
          <h3 className="text-sm font-medium text-foreground mb-4">Revenue & Conversions</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={revenueData}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(199, 89%, 48%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(199, 89%, 48%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
              <XAxis dataKey="date" stroke="hsl(215, 15%, 55%)" fontSize={12} />
              <YAxis stroke="hsl(215, 15%, 55%)" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(220, 18%, 10%)",
                  border: "1px solid hsl(220, 14%, 18%)",
                  borderRadius: "8px",
                  color: "hsl(210, 20%, 95%)",
                }}
              />
              <Area type="monotone" dataKey="revenue" stroke="hsl(199, 89%, 48%)" fill="url(#colorRevenue)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card p-5">
          <h3 className="text-sm font-medium text-foreground mb-4">By Channel</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={channelData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
              <XAxis type="number" stroke="hsl(215, 15%, 55%)" fontSize={12} />
              <YAxis type="category" dataKey="channel" stroke="hsl(215, 15%, 55%)" fontSize={11} width={80} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(220, 18%, 10%)",
                  border: "1px solid hsl(220, 14%, 18%)",
                  borderRadius: "8px",
                  color: "hsl(210, 20%, 95%)",
                }}
              />
              <Bar dataKey="conversions" fill="hsl(199, 89%, 48%)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="glass-card p-5">
        <h3 className="text-sm font-medium text-foreground mb-4">Recent Events</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b border-border">
                <th className="text-left py-2 font-medium">Event</th>
                <th className="text-left py-2 font-medium">Source</th>
                <th className="text-left py-2 font-medium">Value</th>
                <th className="text-left py-2 font-medium">Time</th>
                <th className="text-left py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentEvents.map((e, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="py-3 font-medium text-foreground">{e.event}</td>
                  <td className="py-3 text-muted-foreground">{e.source}</td>
                  <td className="py-3 text-foreground">{e.value}</td>
                  <td className="py-3 text-muted-foreground">{e.time}</td>
                  <td className="py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      e.status === "synced" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                    }`}>
                      {e.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
