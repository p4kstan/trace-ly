import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useWorkspace, useAttributionTouches, useConversions } from "@/hooks/use-tracking-data";
import { Skeleton } from "@/components/ui/skeleton";
import { Inbox } from "lucide-react";

const models = ["First Click", "Last Click", "Linear", "Time Decay", "Data Driven"] as const;

const CHANNEL_COLORS = [
  "hsl(199, 89%, 48%)", "hsl(265, 80%, 60%)", "hsl(142, 71%, 45%)",
  "hsl(38, 92%, 50%)", "hsl(0, 72%, 51%)", "hsl(180, 60%, 50%)",
];

export default function Attribution() {
  const [selectedModel, setSelectedModel] = useState<string>("Last Click");
  const { data: workspace } = useWorkspace();
  const { data: touches, isLoading: touchesLoading } = useAttributionTouches(workspace?.id);
  const { data: conversions, isLoading: convLoading } = useConversions(workspace?.id);

  const isLoading = touchesLoading || convLoading;

  // Build attribution data from real touches
  const campaignMap = new Map<string, { firstClick: number; lastClick: number; linear: number; revenue: number }>();
  if (touches?.length) {
    for (const touch of touches) {
      const campaign = touch.campaign || touch.source || "Direct";
      const existing = campaignMap.get(campaign) || { firstClick: 0, lastClick: 0, linear: 0, revenue: 0 };
      existing.linear += 1;
      if (touch.touch_type === "first") existing.firstClick += 1;
      else existing.lastClick += 1;
      campaignMap.set(campaign, existing);
    }
  }

  // Add revenue from conversions
  if (conversions?.length) {
    for (const conv of conversions) {
      const campaign = conv.attributed_campaign || conv.attributed_source || "Direct";
      const existing = campaignMap.get(campaign) || { firstClick: 0, lastClick: 0, linear: 0, revenue: 0 };
      existing.revenue += conv.value || 0;
      campaignMap.set(campaign, existing);
    }
  }

  const attributionData = Array.from(campaignMap.entries())
    .map(([campaign, data]) => ({ campaign, ...data }))
    .sort((a, b) => b.revenue - a.revenue);

  // Channel distribution for pie chart
  const channelMap = new Map<string, number>();
  if (touches?.length) {
    for (const touch of touches) {
      const source = touch.source || "Direct";
      channelMap.set(source, (channelMap.get(source) || 0) + 1);
    }
  }
  const total = Array.from(channelMap.values()).reduce((a, b) => a + b, 0) || 1;
  const channelPie = Array.from(channelMap.entries())
    .map(([name, count], i) => ({
      name,
      value: Math.round((count / total) * 100),
      color: CHANNEL_COLORS[i % CHANNEL_COLORS.length],
    }))
    .sort((a, b) => b.value - a.value);

  const hasData = attributionData.length > 0 || channelPie.length > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Attribution</h1>
        <p className="text-muted-foreground text-sm mt-1">Multi-touch attribution analysis</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {models.map((model) => (
          <button
            key={model}
            onClick={() => setSelectedModel(model)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              selectedModel === model
                ? "bg-primary text-primary-foreground glow-primary"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {model}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="lg:col-span-2 h-[380px] rounded-xl" />
          <Skeleton className="h-[380px] rounded-xl" />
        </div>
      ) : !hasData ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Inbox className="w-16 h-16 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-1">Nenhum dado de atribuição</h3>
          <p className="text-sm text-center max-w-sm">
            Envie eventos com UTMs para ver a análise de atribuição multi-touch.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 glass-card p-5">
              <h3 className="text-sm font-medium text-foreground mb-4">Conversions by Campaign ({selectedModel})</h3>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={attributionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
                  <XAxis dataKey="campaign" stroke="hsl(215, 15%, 55%)" fontSize={10} angle={-20} textAnchor="end" height={60} />
                  <YAxis stroke="hsl(215, 15%, 55%)" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(220, 18%, 10%)",
                      border: "1px solid hsl(220, 14%, 18%)",
                      borderRadius: "8px",
                      color: "hsl(210, 20%, 95%)",
                    }}
                  />
                  <Bar dataKey="lastClick" fill="hsl(199, 89%, 48%)" radius={[4, 4, 0, 0]} name="Conversions" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="glass-card p-5">
              <h3 className="text-sm font-medium text-foreground mb-4">Channel Distribution</h3>
              {channelPie.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={channelPie} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" strokeWidth={0}>
                        {channelPie.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(220, 18%, 10%)",
                          border: "1px solid hsl(220, 14%, 18%)",
                          borderRadius: "8px",
                          color: "hsl(210, 20%, 95%)",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 mt-2">
                    {channelPie.map((ch) => (
                      <div key={ch.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ch.color }} />
                          <span className="text-muted-foreground">{ch.name}</span>
                        </div>
                        <span className="text-foreground font-medium">{ch.value}%</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                  Sem dados de canal
                </div>
              )}
            </div>
          </div>

          <div className="glass-card p-5">
            <h3 className="text-sm font-medium text-foreground mb-4">Campaign Attribution Table</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b border-border">
                  <th className="text-left py-2 font-medium">Campaign</th>
                  <th className="text-right py-2 font-medium">First Click</th>
                  <th className="text-right py-2 font-medium">Last Click</th>
                  <th className="text-right py-2 font-medium">Linear</th>
                  <th className="text-right py-2 font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {attributionData.map((row, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="py-3 text-foreground font-medium">{row.campaign}</td>
                    <td className="py-3 text-right text-muted-foreground">{row.firstClick}</td>
                    <td className="py-3 text-right text-foreground font-medium">{row.lastClick}</td>
                    <td className="py-3 text-right text-muted-foreground">{row.linear}</td>
                    <td className="py-3 text-right text-success font-medium">R$ {row.revenue.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
