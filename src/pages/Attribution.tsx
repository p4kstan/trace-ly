import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const models = ["First Click", "Last Click", "Linear", "Time Decay", "Data Driven"] as const;

const attributionData = [
  { campaign: "Meta - Lookalike 1%", firstClick: 89, lastClick: 45, linear: 67, revenue: 12400 },
  { campaign: "Google - Brand", firstClick: 34, lastClick: 78, linear: 56, revenue: 9800 },
  { campaign: "TikTok - UGC", firstClick: 56, lastClick: 32, linear: 44, revenue: 6200 },
  { campaign: "Meta - Retargeting", firstClick: 12, lastClick: 95, linear: 54, revenue: 15600 },
  { campaign: "Google - Shopping", firstClick: 67, lastClick: 52, linear: 60, revenue: 8900 },
];

const channelPie = [
  { name: "Meta Ads", value: 42, color: "hsl(199, 89%, 48%)" },
  { name: "Google Ads", value: 28, color: "hsl(265, 80%, 60%)" },
  { name: "TikTok", value: 15, color: "hsl(142, 71%, 45%)" },
  { name: "Organic", value: 10, color: "hsl(38, 92%, 50%)" },
  { name: "Direct", value: 5, color: "hsl(0, 72%, 51%)" },
];

export default function Attribution() {
  const [selectedModel, setSelectedModel] = useState<string>("Last Click");

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
    </div>
  );
}
