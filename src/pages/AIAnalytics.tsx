import { Brain, Sparkles, Clock } from "lucide-react";

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

      <div className="glass-card p-8 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto">
          <Sparkles className="w-8 h-8 text-accent" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Em breve</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Estamos trabalhando nos insights com IA para analisar automaticamente suas campanhas, 
          identificar padrões e sugerir otimizações. Esta funcionalidade estará disponível em uma próxima atualização.
        </p>
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span>Previsão: próxima versão</span>
        </div>
      </div>
    </div>
  );
}
