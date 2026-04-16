import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Workflow, Monitor, Cloud, Database, Send, ArrowRight, Server } from "lucide-react";
import PlatformWizard from "@/components/how-it-works/PlatformWizard";
import ServerSelector from "@/components/how-it-works/ServerSelector";
import { GOOGLE_STEPS } from "@/components/how-it-works/google-steps";

const SERVER_DONE_KEY = "wizard:google:serverDone";

export default function SetupGoogle() {
  const [serverDone, setServerDone] = useState(() => {
    try { return localStorage.getItem(SERVER_DONE_KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(SERVER_DONE_KEY, serverDone ? "1" : "0"); } catch { /* ignore */ }
  }, [serverDone]);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gradient-primary">Setup Google (GA4 + Ads)</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure o rastreamento server-side completo para Google Analytics 4 e Google Ads passo a passo
        </p>
      </div>

      {/* Architecture overview */}
      <Card className="glass-card overflow-hidden">
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Workflow className="w-4 h-4 text-primary" /> Arquitetura — Google (GA4 + Ads)
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
            {[
              { icon: Monitor, label: "Seu Site", sub: "SDK captura eventos" },
              { icon: Cloud, label: "CapiTrack", sub: "Servidor (Edge Functions)" },
              { icon: Database, label: "Banco de Dados", sub: "Eventos persistidos" },
              { icon: Send, label: "Google", sub: "GA4 + Ads CAPI" },
            ].map((item, i, arr) => (
              <div key={i} className="flex items-center gap-2">
                <div className="bg-muted/40 border border-border/30 rounded-lg px-4 py-3 text-center min-w-[100px]">
                  <item.icon className="w-4 h-4 text-primary mx-auto mb-1" />
                  <p className="font-medium text-foreground">{item.label}</p>
                  <p className="text-[10px] text-muted-foreground">{item.sub}</p>
                </div>
                {i < arr.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step 1: Server */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${serverDone ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30" : "bg-primary/10 text-primary ring-1 ring-primary/20"}`}>
            {serverDone ? "✓" : "1"}
          </div>
          <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
            <Server className="w-4 h-4 text-primary" /> Configurar Servidor
          </h2>
        </div>
        <ServerSelector onComplete={() => setServerDone(true)} completed={serverDone} />
      </div>

      {/* Step 2: Google */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${serverDone ? "bg-primary/10 text-primary ring-1 ring-primary/20" : "bg-muted/30 text-muted-foreground"}`}>
            2
          </div>
          <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
            <Send className="w-4 h-4 text-primary" /> Configurar Google (GA4 + Ads)
          </h2>
        </div>

        <div className={!serverDone ? "opacity-50 pointer-events-none" : ""}>
          <PlatformWizard
            steps={GOOGLE_STEPS}
            platformColor="text-amber-400"
            platformBg="bg-amber-500/10"
            platformBorder="border-amber-500/20"
            storageKey="google"
          />
        </div>
      </div>
    </div>
  );
}
