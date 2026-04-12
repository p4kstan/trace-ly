import { Check, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

const plans = [
  {
    name: "Free",
    price: "R$ 0",
    period: "/mês",
    events: "10.000 eventos",
    current: true,
    features: ["1 Pixel", "Dashboard básico", "7 dias de retenção", "Email support"],
  },
  {
    name: "Pro",
    price: "R$ 297",
    period: "/mês",
    events: "1.000.000 eventos",
    current: false,
    popular: true,
    features: ["Pixels ilimitados", "Attribution multi-touch", "AI Analytics", "90 dias de retenção", "All integrations", "Priority support"],
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    events: "Eventos ilimitados",
    current: false,
    features: ["Tudo do Pro", "Dedicated infra", "Custom SLA", "API access ilimitado", "Onboarding dedicado", "Slack support"],
  },
];

export default function Plans() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground">Plans & Pricing</h1>
        <p className="text-muted-foreground text-sm mt-1">Scale your tracking as you grow</p>
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

            <Button
              className={`mt-6 w-full ${
                plan.current
                  ? "bg-secondary text-secondary-foreground"
                  : plan.popular
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 glow-primary"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
              disabled={plan.current}
            >
              {plan.current ? "Current Plan" : plan.name === "Enterprise" ? "Contact Sales" : "Upgrade"}
              {plan.popular && !plan.current && <Zap className="w-4 h-4 ml-1" />}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
