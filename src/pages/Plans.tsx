import { Check, Zap, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const plans = [
  {
    name: "Free",
    price: "R$ 0",
    period: "/mês",
    events: "10.000 eventos",
    current: true,
    features: ["1 Pixel", "Dashboard básico", "7 dias de retenção", "Suporte por email"],
  },
  {
    name: "Pro",
    price: "R$ 297",
    period: "/mês",
    events: "1.000.000 eventos",
    current: false,
    popular: true,
    features: ["Pixels ilimitados", "Atribuição multi-touch", "Análise IA", "90 dias de retenção", "Todas integrações", "Suporte prioritário"],
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    events: "Eventos ilimitados",
    current: false,
    features: ["Tudo do Pro", "Infra dedicada", "SLA customizado", "Acesso API ilimitado", "Onboarding dedicado", "Suporte via Slack"],
  },
];

export default function Plans() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground">Planos e Preços</h1>
        <p className="text-muted-foreground text-sm mt-1">Escale seu rastreamento conforme você cresce</p>
        <Badge variant="secondary" className="mt-3">
          <Clock className="w-3 h-3 mr-1" />
          Billing em breve — planos são apenas informativos
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`glass-card p-6 flex flex-col relative ${plan.popular ? "ring-1 ring-primary glow-primary" : ""}`}
          >
            {plan.popular && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-primary text-primary-foreground text-xs font-bold rounded-full">
                Popular
              </span>
            )}
            <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
            <div className="mt-3">
              <span className="text-3xl font-extrabold text-foreground">{plan.price}</span>
              <span className="text-muted-foreground text-sm">{plan.period}</span>
            </div>
            <p className="text-sm text-primary font-medium mt-1">{plan.events}</p>

            <ul className="mt-6 space-y-3 flex-1">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Check className="w-4 h-4 text-success flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>

            <div className="mt-6 w-full text-center py-2 rounded-lg bg-muted text-muted-foreground text-sm font-medium">
              {plan.current ? "Plano atual" : "Em breve"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
