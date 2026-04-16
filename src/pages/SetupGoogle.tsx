import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Workflow, Monitor, Cloud, Database, Send, ArrowRight, Server, BarChart3, Loader2 } from "lucide-react";
import PlatformWizard from "@/components/how-it-works/PlatformWizard";
import ServerSelector from "@/components/how-it-works/ServerSelector";
import { GOOGLE_STEPS } from "@/components/how-it-works/google-steps";
import GoogleAdsConnect from "@/components/setup/GoogleAdsConnect";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { supabase } from "@/integrations/supabase/client";

const SERVER_DONE_KEY = "wizard:google:serverDone";
const WIZARD_STORAGE_KEY = "wizard:google";

type WizardSnapshot = {
  current: number;
  completed: number[];
  inputValues: Record<string, string>;
};

function loadWizardSnapshot(): WizardSnapshot | null {
  try {
    const raw = localStorage.getItem(WIZARD_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WizardSnapshot;
  } catch {
    return null;
  }
}

function formatCustomerId(customerId?: string | null) {
  const cleaned = String(customerId || "").replace(/\D/g, "");
  if (cleaned.length !== 10) return customerId || "";
  return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
}

function normalizeSiteUrl(domain?: string | null) {
  if (!domain) return "";
  return /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
}

export default function SetupGoogle() {
  const { data: workspace, isLoading: workspaceLoading } = useWorkspace();
  const [serverDone, setServerDone] = useState(() => {
    try { return localStorage.getItem(SERVER_DONE_KEY) === "1"; } catch { return false; }
  });
  const [wizardReady, setWizardReady] = useState(false);
  const [wizardKey, setWizardKey] = useState(0);

  useEffect(() => {
    try { localStorage.setItem(SERVER_DONE_KEY, serverDone ? "1" : "0"); } catch { /* ignore */ }
  }, [serverDone]);

  useEffect(() => {
    let cancelled = false;

    const hydrateWizard = async () => {
      if (workspaceLoading) return;
      if (!workspace?.id) {
        if (!cancelled) setWizardReady(true);
        return;
      }

      try {
        const [destinationsRes, credentialsRes, sourcesRes] = await Promise.all([
          supabase
            .from("integration_destinations")
            .select("provider, destination_id, created_at, is_active")
            .eq("workspace_id", workspace.id)
            .in("provider", ["ga4", "google_ads"])
            .order("is_active", { ascending: false })
            .order("created_at", { ascending: false }),
          supabase
            .from("google_ads_credentials")
            .select("customer_id")
            .eq("workspace_id", workspace.id)
            .order("is_default", { ascending: false })
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("tracking_sources")
            .select("primary_domain")
            .eq("workspace_id", workspace.id)
            .order("created_at", { ascending: true })
            .limit(5),
        ]);

        const destinations = destinationsRes.data || [];
        const ga4Destination = destinations.find((destination) => destination.provider === "ga4");
        const googleAdsDestination = destinations.find((destination) => destination.provider === "google_ads");
        const primaryDomain = sourcesRes.data?.find((source) => source.primary_domain)?.primary_domain || sourcesRes.data?.[0]?.primary_domain || null;

        const seededInputValues: Record<string, string> = {};
        if (ga4Destination?.destination_id) seededInputValues.ga4_measurement_id = ga4Destination.destination_id;
        if (credentialsRes.data?.customer_id) seededInputValues.gads_customer_id = formatCustomerId(credentialsRes.data.customer_id);
        if (primaryDomain) seededInputValues.ga4_site_url = normalizeSiteUrl(primaryDomain);

        const completedFromBackend = new Set<number>();
        if (ga4Destination?.destination_id) {
          completedFromBackend.add(0);
          completedFromBackend.add(1);
          completedFromBackend.add(2);
        }
        if (credentialsRes.data?.customer_id) completedFromBackend.add(4);
        if (googleAdsDestination?.destination_id) completedFromBackend.add(5);
        if (primaryDomain) completedFromBackend.add(6);

        const existingSnapshot = loadWizardSnapshot();
        const mergedInputValues = { ...seededInputValues };

        for (const [key, value] of Object.entries(existingSnapshot?.inputValues || {})) {
          if (value.trim()) {
            mergedInputValues[key] = value;
          } else if (!mergedInputValues[key]) {
            mergedInputValues[key] = value;
          }
        }

        const nextSnapshot: WizardSnapshot = {
          current: existingSnapshot?.current ?? 0,
          completed: Array.from(new Set([...(existingSnapshot?.completed || []), ...completedFromBackend])),
          inputValues: mergedInputValues,
        };

        localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(nextSnapshot));

        if (!serverDone && (primaryDomain || ga4Destination || credentialsRes.data?.customer_id)) {
          setServerDone(true);
        }
      } catch {
        // ignore hydration errors and keep current local state
      } finally {
        if (!cancelled) {
          setWizardKey((currentKey) => currentKey + 1);
          setWizardReady(true);
        }
      }
    };

    hydrateWizard();

    return () => {
      cancelled = true;
    };
  }, [workspace?.id, workspaceLoading, serverDone]);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gradient-primary">Setup Google (GA4 + Ads)</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure o rastreamento server-side completo para Google Analytics 4 e Google Ads passo a passo
        </p>
      </div>

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
          {!wizardReady ? (
            <div className="flex items-center justify-center rounded-lg border border-border/30 bg-card/40 p-10">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : (
            <PlatformWizard
              key={`google-${workspace?.id || "anon"}-${wizardKey}`}
              steps={GOOGLE_STEPS}
              platformColor="text-amber-400"
              platformBg="bg-amber-500/10"
              platformBorder="border-amber-500/20"
              storageKey="google"
            />
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${serverDone ? "bg-primary/10 text-primary ring-1 ring-primary/20" : "bg-muted/30 text-muted-foreground"}`}>
            3
          </div>
          <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4 text-primary" /> Conectar Google Ads (leitura de campanhas)
          </h2>
        </div>
        <p className="text-xs text-muted-foreground pl-9">
          Autorize o CapiTrack a ler suas campanhas via OAuth. Dados de gasto, ROAS, conversões e CTR aparecem aqui após sincronizar.
        </p>
        <div className={!serverDone ? "opacity-50 pointer-events-none" : ""}>
          <GoogleAdsConnect />
        </div>
      </div>
    </div>
  );
}
