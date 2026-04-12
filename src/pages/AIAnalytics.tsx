import { Brain, TrendingUp, AlertTriangle, Lightbulb, Sparkles } from "lucide-react";

const insights = [
  {
    type: "success",
    icon: TrendingUp,
    title: "Campanha 'Meta - Lookalike 1%' com melhor ROI",
    description: "ROAS de 5.2x nos últimos 7 dias, 23% acima da média. Recomendamos aumentar o orçamento em 20%.",
    metric: "ROAS 5.2x",
  },
  {
    type: "warning",
    icon: AlertTriangle,
    title: "CPA crescendo em 'Google - Brand'",
    description: "O CPA aumentou 18% esta semana. Verifique a qualidade dos leads e considere ajustar os lances.",
    metric: "CPA +18%",
  },
  {
    type: "insight",
    icon: Lightbulb,
    title: "TikTok gera melhor awareness",
    description: "67% dos usuários que converteram tiveram primeiro contato via TikTok. Considere ampliar investimento em top-of-funnel.",
    metric: "67% first touch",
  },
  {
    type: "success",
    icon: Sparkles,
    title: "Deduplicação economizou R$ 4.200",
    description: "342 eventos duplicados foram identificados e removidos, evitando otimização incorreta nas plataformas.",
    metric: "342 dedup",
  },
];

const typeStyles = {
  success: "border-l-success bg-success/5",
  warning: "border-l-warning bg-warning/5",
  insight: "border-l-primary bg-primary/5",
};

export default function AIAnalytics() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
          <Brain className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI Analytics</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Insights automáticos sobre suas campanhas</p>
        </div>
      </div>

      <div className="glass-card p-5 glow-accent">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium text-accent">AI Summary</span>
        </div>
        <p className="text-foreground leading-relaxed">
          Nas últimas 24 horas, seu tracking processou <span className="font-bold text-primary">2.847 eventos</span> com
          taxa de deduplicação de <span className="font-bold text-success">12.3%</span>. A atribuição mostra que
          <span className="font-bold text-primary"> Meta Ads</span> continua sendo o principal canal de conversão,
          mas <span className="font-bold text-accent">TikTok</span> está crescendo como fonte de awareness.
        </p>
      </div>

      <div className="space-y-4">
        {insights.map((insight, i) => (
          <div
            key={i}
            className={`glass-card p-5 border-l-4 ${typeStyles[insight.type as keyof typeof typeStyles]} animate-slide-up`}
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <insight.icon className={`w-5 h-5 mt-0.5 ${
                  insight.type === "success" ? "text-success" :
                  insight.type === "warning" ? "text-warning" : "text-primary"
                }`} />
                <div>
                  <h3 className="font-medium text-foreground">{insight.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{insight.description}</p>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap ${
                insight.type === "success" ? "bg-success/10 text-success" :
                insight.type === "warning" ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary"
              }`}>
                {insight.metric}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
