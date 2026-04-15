import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useWorkspace, useAttributionTouches, useConversions } from "@/hooks/use-tracking-data";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Inbox, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const MODELS = [
  { key: "first_click", label: "First Click" },
  { key: "last_click", label: "Last Click" },
  { key: "linear", label: "Linear" },
  { key: "time_decay", label: "Time Decay" },
  { key: "position_based", label: "Position Based" },
] as const;

const CHANNEL_COLORS = [
  "hsl(199, 89%, 48%)", "hsl(265, 80%, 60%)", "hsl(142, 71%, 45%)",
  "hsl(38, 92%, 50%)", "hsl(0, 72%, 51%)", "hsl(180, 60%, 50%)",
  "hsl(320, 70%, 55%)", "hsl(50, 85%, 50%)",
];

export default function Attribution() {
  const [selectedModel, setSelectedModel] = useState("last_click");
  const { data: workspace } = useWorkspace();
  const { data: touches, isLoading: touchesLoading } = useAttributionTouches(workspace?.id);
  const { data: conversions, isLoading: convLoading } = useConversions(workspace?.id);

  // Fetch computed attribution results
  const { data: attrResults, isLoading: attrLoading, refetch: refetchAttr } = useQuery({
    queryKey: ["attribution-results", workspace?.id, selectedModel],
    enabled: !!workspace?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("attribution_results")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .eq("model", selectedModel)
        .order("attributed_value", { ascending: false })
        .limit(500);
      return data || [];
    },
  });

  const [computing, setComputing] = useState(false);
  const handleCompute = async () => {
    if (!workspace?.id || !conversions?.length) return;
    setComputing(true);
    let count = 0;
    for (const conv of conversions.slice(0, 100)) {
      if (!conv.identity_id) continue;
      const { error } = await supabase.rpc("compute_attribution", {
        _workspace_id: workspace.id,
        _identity_id: conv.identity_id,
        _conversion_id: conv.id,
        _conversion_value: conv.value || 0,
        _model: selectedModel,
      });
      if (!error) count++;
    }
    toast.success(`Atribuição computada para ${count} conversões`);
    refetchAttr();
    setComputing(false);
  };

  const isLoading = touchesLoading || convLoading || attrLoading;

  // Build campaign data from computed results or fallback to touches
  const campaignMap = new Map<string, { conversions: number; revenue: number; credit: number }>();

  if (attrResults?.length) {
    for (const r of attrResults) {
      const key = r.campaign || r.source || "Direct";
      const existing = campaignMap.get(key) || { conversions: 0, revenue: 0, credit: 0 };
      existing.credit += Number(r.credit || 0);
      existing.revenue += Number(r.attributed_value || 0);
      existing.conversions += Number(r.credit || 0) > 0 ? 1 : 0;
      campaignMap.set(key, existing);
    }
  } else if (touches?.length) {
    for (const touch of touches) {
      const campaign = touch.campaign || touch.source || "Direct";
      const existing = campaignMap.get(campaign) || { conversions: 0, revenue: 0, credit: 0 };
      existing.credit += 1;
      campaignMap.set(campaign, existing);
    }
    if (conversions?.length) {
      for (const conv of conversions) {
        const campaign = conv.attributed_campaign || conv.attributed_source || "Direct";
        const existing = campaignMap.get(campaign) || { conversions: 0, revenue: 0, credit: 0 };
        existing.revenue += conv.value || 0;
        existing.conversions += 1;
        campaignMap.set(campaign, existing);
      }
    }
  }

  const attributionData = Array.from(campaignMap.entries())
    .map(([campaign, data]) => ({ campaign, ...data }))
    .sort((a, b) => b.revenue - a.revenue || b.credit - a.credit);

  // Channel distribution
  const channelMap = new Map<string, number>();
  const sourceData = attrResults?.length ? attrResults : touches;
  if (sourceData?.length) {
    for (const item of sourceData) {
      const source = item.source || "Direct";
      channelMap.set(source, (channelMap.get(source) || 0) + 1);
    }
  }
  const total = Array.from(channelMap.values()).reduce((a, b) => a + b, 0) || 1;
  const channelPie = Array.from(channelMap.entries())
    .map(([name, count], i) => ({ name, value: Math.round((count / total) * 100), color: CHANNEL_COLORS[i % CHANNEL_COLORS.length] }))
    .sort((a, b) => b.value - a.value);

  // Summary metrics
  const totalRevenue = attributionData.reduce((a, b) => a + b.revenue, 0);
  const totalConversions = conversions?.length || 0;
  const topSource = attributionData[0]?.campaign || "—";

  const hasData = attributionData.length > 0 || channelPie.length > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Atribuição</h1>
          <p className="text-muted-foreground text-sm mt-1">Análise de atribuição multi-modelo</p>
        </div>
        {conversions?.length ? (
          <Button onClick={handleCompute} disabled={computing} variant="outline" size="sm">
            <RefreshCw className={`w-4 h-4 mr-2 ${computing ? "animate-spin" : ""}`} />
            {computing ? "Computando..." : "Computar Atribuição"}
          </Button>
        ) : null}
      </div>

      {/* Model selector */}
      <div className="flex gap-2 flex-wrap">
        {MODELS.map((model) => (
          <button
            key={model.key}
            onClick={() => setSelectedModel(model.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              selectedModel === model.key
                ? "bg-primary text-primary-foreground glow-primary"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {model.label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      {hasData && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: "Receita Atribuída", value: `R$ ${totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` },
            { label: "Conversões", value: String(totalConversions) },
            { label: "Fonte Principal", value: topSource },
          ].map(card => (
            <div key={card.label} className="surface-elevated p-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{card.label}</p>
              <p className="text-xl font-bold text-foreground mt-1 tabular-nums">{card.value}</p>
            </div>
          ))}
        </div>
      )}

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
            <div className="lg:col-span-2 surface-elevated p-5">
              <h3 className="text-sm font-medium text-foreground mb-4">
                Receita Atribuída por Campanha ({MODELS.find(m => m.key === selectedModel)?.label})
              </h3>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={attributionData.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="campaign" stroke="hsl(var(--muted-foreground))" fontSize={10} angle={-20} textAnchor="end" height={60} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                    formatter={(value: number) => [`R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, "Receita"]}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Receita" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="surface-elevated p-5">
              <h3 className="text-sm font-medium text-foreground mb-4">Distribuição por Canal</h3>
              {channelPie.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={channelPie} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" strokeWidth={0}>
                        {channelPie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
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
                <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">Sem dados de canal</div>
              )}
            </div>
          </div>

          {/* Attribution table */}
          <div className="surface-elevated p-5 overflow-x-auto">
            <h3 className="text-sm font-medium text-foreground mb-4">Tabela de Atribuição por Campanha</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b border-border">
                  <th className="text-left py-2 font-medium">Campanha</th>
                  <th className="text-right py-2 font-medium">Crédito</th>
                  <th className="text-right py-2 font-medium">Conversões</th>
                  <th className="text-right py-2 font-medium">Receita</th>
                </tr>
              </thead>
              <tbody>
                {attributionData.map((row, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="py-3 text-foreground font-medium">{row.campaign}</td>
                    <td className="py-3 text-right text-muted-foreground tabular-nums">{row.credit.toFixed(2)}</td>
                    <td className="py-3 text-right text-foreground tabular-nums">{row.conversions}</td>
                    <td className="py-3 text-right text-success font-medium tabular-nums">R$ {row.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
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
