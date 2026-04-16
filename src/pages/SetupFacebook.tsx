import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Workflow, Monitor, Cloud, Database, Send, ArrowRight, Server } from "lucide-react";
import PlatformWizard from "@/components/how-it-works/PlatformWizard";
import ServerSelector from "@/components/how-it-works/ServerSelector";
import { FACEBOOK_STEPS } from "@/components/how-it-works/facebook-steps";

const SERVER_DONE_KEY = "wizard:facebook:serverDone";

export default function SetupFacebook() {
  const [serverDone, setServerDone] = useState(() => {
    try { return localStorage.getItem(SERVER_DONE_KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(SERVER_DONE_KEY, serverDone ? "1" : "0"); } catch { /* ignore */ }
  }, [serverDone]);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gradient-primary">Setup Facebook / Meta CAPI</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure o rastreamento server-side completo para Facebook e Meta Ads passo a passo
        </p>
      </div>

      {/* Architecture overview */}
      <Card className="glass-card overflow-hidden">
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Workflow className="w-4 h-4 text-primary" /> Arquitetura — Facebook / Meta
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
            {[
              { icon: Monitor, label: "Seu Site", sub: "SDK captura eventos" },
              { icon: Cloud, label: "CapiTrack", sub: "Servidor (Edge Functions)" },
              { icon: Database, label: "Banco de Dados", sub: "Eventos persistidos" },
              { icon: Send, label: "Meta CAPI", sub: "Conversions API" },
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

      {/* Step 2: Facebook/Meta */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${serverDone ? "bg-primary/10 text-primary ring-1 ring-primary/20" : "bg-muted/30 text-muted-foreground"}`}>
            2
          </div>
          <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
            <Send className="w-4 h-4 text-primary" /> Configurar Facebook / Meta CAPI
          </h2>
        </div>

        <div className={!serverDone ? "opacity-50 pointer-events-none" : ""}>
          <PlatformWizard
            steps={FACEBOOK_STEPS}
            platformColor="text-blue-400"
            platformBg="bg-blue-500/10"
            platformBorder="border-blue-500/20"
            storageKey="facebook"
          />
        </div>
      </div>
    </div>
  );
}
