import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Copy, Eye, EyeOff, KeyRound, ShieldCheck, ShieldAlert,
  ExternalLink, BarChart3, Share2, Search, Music2, ServerCog,
} from "lucide-react";
import { Link } from "react-router-dom";

type SecretRowProps = {
  label: string;
  value?: string | null;
  mono?: boolean;
  reveal?: boolean;
};

function mask(v: string) {
  if (!v) return "";
  if (v.length <= 10) return "•".repeat(v.length);
  return v.slice(0, 4) + "•".repeat(Math.max(8, v.length - 8)) + v.slice(-4);
}

function SecretRow({ label, value, mono = true, reveal = false }: SecretRowProps) {
  const [shown, setShown] = useState(false);
  const has = !!value;
  const display = !has ? "—" : reveal || shown ? value! : mask(value!);

  const copy = () => {
    if (!has) return;
    navigator.clipboard.writeText(value!);
    toast.success(`${label} copiado!`);
  };

  return (
    <div className="flex items-center gap-2 py-2 border-b border-border/30 last:border-0">
      <div className="w-44 shrink-0 text-xs text-muted-foreground">{label}</div>
      <div className={`flex-1 truncate text-sm ${mono ? "font-mono" : ""} ${has ? "text-foreground" : "text-muted-foreground/50"}`}>
        {display}
      </div>
      {has && !reveal && (
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setShown(s => !s)}>
          {shown ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </Button>
      )}
      {has && (
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={copy}>
          <Copy className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );
}

function PlatformCard({
  icon: Icon, title, color, status, children, manageHref, manageLabel,
}: {
  icon: any; title: string; color: string; status?: "ok" | "warn" | "off";
  children: React.ReactNode; manageHref?: string; manageLabel?: string;
}) {
  return (
    <Card className="glass-card overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ background: `${color}20` }}
          >
            <Icon className="w-5 h-5" style={{ color }} />
          </div>
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            {status && (
              <Badge variant={status === "ok" ? "default" : status === "warn" ? "secondary" : "outline"} className="mt-1">
                {status === "ok" ? <><ShieldCheck className="w-3 h-3 mr-1" />Conectado</> :
                 status === "warn" ? <><ShieldAlert className="w-3 h-3 mr-1" />Parcial</> :
                 "Não configurado"}
              </Badge>
            )}
          </div>
        </div>
        {manageHref && (
          <Button asChild variant="outline" size="sm">
            <Link to={manageHref}>
              <ExternalLink className="w-3.5 h-3.5 mr-1" />
              {manageLabel || "Gerenciar"}
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function Credentials() {
  const { data: workspace, isLoading: wsLoading } = useWorkspace();

  const ws = workspace?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["all-credentials", ws],
    enabled: !!ws,
    queryFn: async () => {
      const [apiKeys, googleAds, metaPixels, metaAccounts, gateways] = await Promise.all([
        supabase.from("api_keys").select("*").eq("workspace_id", ws!).order("created_at", { ascending: false }),
        supabase.from("google_ads_credentials").select("*").eq("workspace_id", ws!),
        supabase.from("meta_pixels").select("*").eq("workspace_id", ws!),
        supabase.from("meta_ad_accounts").select("*").eq("workspace_id", ws!),
        supabase.rpc("get_integration_metadata", { _workspace_id: ws! }),
      ]);
      return {
        apiKeys: apiKeys.data || [],
        googleAds: googleAds.data || [],
        metaPixels: metaPixels.data || [],
        metaAccounts: metaAccounts.data || [],
        gateways: (gateways.data as any[]) || [],
      };
    },
  });

  if (wsLoading || isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-56 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const ga4Destinations = (data?.gateways || []).filter(g => g.provider === "ga4");
  const tiktokDestinations = (data?.gateways || []).filter(g => g.provider === "tiktok");
  const otherGateways = (data?.gateways || []).filter(g =>
    !["ga4", "tiktok", "meta", "google_ads"].includes(g.provider)
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gradient-primary">Credenciais & APIs</h1>
        <p className="text-sm text-muted-foreground">
          Todas as chaves, tokens e IDs configurados, organizados por plataforma.
        </p>
      </div>

      <Tabs defaultValue="all">
        <TabsList className="bg-muted/30">
          <TabsTrigger value="all">Todas</TabsTrigger>
          <TabsTrigger value="capitrack"><KeyRound className="w-3.5 h-3.5 mr-1" />CapiTrack</TabsTrigger>
          <TabsTrigger value="google"><Search className="w-3.5 h-3.5 mr-1" />Google</TabsTrigger>
          <TabsTrigger value="meta"><Share2 className="w-3.5 h-3.5 mr-1" />Meta</TabsTrigger>
          <TabsTrigger value="tiktok"><Music2 className="w-3.5 h-3.5 mr-1" />TikTok</TabsTrigger>
          <TabsTrigger value="gateways"><ServerCog className="w-3.5 h-3.5 mr-1" />Gateways</TabsTrigger>
        </TabsList>

        {/* ALL — renders every section stacked */}
        <TabsContent value="all" className="space-y-6 mt-4">
          <CapiTrackSection apiKeys={data!.apiKeys} />
          <GoogleSection googleAds={data!.googleAds} ga4Destinations={ga4Destinations} />
          <MetaSection metaPixels={data!.metaPixels} metaAccounts={data!.metaAccounts} />
          <TikTokSection destinations={tiktokDestinations} />
          <GatewaySection gateways={otherGateways} />
        </TabsContent>

        <TabsContent value="capitrack" className="mt-4">
          <CapiTrackSection apiKeys={data!.apiKeys} />
        </TabsContent>
        <TabsContent value="google" className="mt-4 space-y-6">
          <GoogleSection googleAds={data!.googleAds} ga4Destinations={ga4Destinations} />
        </TabsContent>
        <TabsContent value="meta" className="mt-4">
          <MetaSection metaPixels={data!.metaPixels} metaAccounts={data!.metaAccounts} />
        </TabsContent>
        <TabsContent value="tiktok" className="mt-4">
          <TikTokSection destinations={tiktokDestinations} />
        </TabsContent>
        <TabsContent value="gateways" className="mt-4">
          <GatewaySection gateways={otherGateways} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ──────────────── Sections ──────────────── */

function CapiTrackSection({ apiKeys }: { apiKeys: any[] }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">CapiTrack SDK</h2>
      {apiKeys.length === 0 ? (
        <PlatformCard icon={KeyRound} title="API Keys" color="hsl(var(--primary))" status="off" manageHref="/api-keys" manageLabel="Criar key">
          <p className="text-sm text-muted-foreground">Nenhuma API key criada ainda.</p>
        </PlatformCard>
      ) : apiKeys.map(k => (
        <PlatformCard
          key={k.id}
          icon={KeyRound}
          title={k.name}
          color="hsl(var(--primary))"
          status={k.status === "active" ? "ok" : "off"}
          manageHref="/api-keys"
        >
          <SecretRow label="Public Key" value={k.public_key} reveal />
          <SecretRow label="Secret Key Hash" value={k.secret_key_hash} />
          <SecretRow label="Workspace ID" value={k.workspace_id} reveal />
          <SecretRow label="Status" value={k.status} mono={false} reveal />
          <SecretRow label="Último uso" value={k.last_used_at || "Nunca"} mono={false} reveal />
        </PlatformCard>
      ))}
    </div>
  );
}

function GoogleSection({ googleAds, ga4Destinations }: { googleAds: any[]; ga4Destinations: any[] }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Google</h2>

      {/* Google Ads */}
      {googleAds.length === 0 ? (
        <PlatformCard
          icon={Search} title="Google Ads" color="hsl(142 71% 45%)" status="off"
          manageHref="/setup-google" manageLabel="Conectar"
        >
          <p className="text-sm text-muted-foreground">Nenhuma conta Google Ads conectada.</p>
        </PlatformCard>
      ) : googleAds.map(g => (
        <PlatformCard
          key={g.id}
          icon={Search}
          title={`Google Ads ${g.account_label ? `— ${g.account_label}` : ""}`}
          color="hsl(142 71% 45%)"
          status={g.status === "connected" ? "ok" : g.status === "pending" ? "warn" : "off"}
          manageHref="/setup-google"
        >
          <SecretRow label="Customer ID" value={g.customer_id} reveal />
          <SecretRow label="Login Customer ID (MCC)" value={g.login_customer_id} reveal />
          <SecretRow label="Developer Token" value={g.developer_token} />
          <SecretRow label="Refresh Token" value={g.refresh_token} />
          <SecretRow label="Access Token" value={g.access_token} />
          <SecretRow label="Expira em" value={g.token_expires_at} mono={false} reveal />
          <SecretRow label="Roteamento" value={`${g.routing_mode}${g.routing_domains?.length ? ` (${g.routing_domains.join(", ")})` : ""}`} mono={false} reveal />
        </PlatformCard>
      ))}

      {/* GA4 */}
      {ga4Destinations.length === 0 ? (
        <PlatformCard
          icon={BarChart3} title="Google Analytics 4" color="hsl(36 100% 50%)" status="off"
          manageHref="/destinations" manageLabel="Configurar"
        >
          <p className="text-sm text-muted-foreground">Nenhum stream GA4 configurado.</p>
        </PlatformCard>
      ) : ga4Destinations.map(d => (
        <PlatformCard
          key={d.id}
          icon={BarChart3}
          title={d.name || "Google Analytics 4"}
          color="hsl(36 100% 50%)"
          status={d.status === "active" ? "ok" : "off"}
          manageHref="/destinations"
        >
          <SecretRow label="Measurement ID" value={d.public_config_json?.measurement_id} reveal />
          <SecretRow label="Stream" value={d.public_config_json?.stream_name} mono={false} reveal />
          <SecretRow label="API Secret" value={"••••••••••• (criptografado)"} reveal />
          <SecretRow label="Ambiente" value={d.environment} mono={false} reveal />
          <SecretRow label="Modo" value={d.settings_json?.send_from_gateway_only ? "Apenas webhooks de gateway" : "Todos os eventos"} mono={false} reveal />
        </PlatformCard>
      ))}
    </div>
  );
}

function MetaSection({ metaPixels, metaAccounts }: { metaPixels: any[]; metaAccounts: any[] }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Meta (Facebook & Instagram)</h2>

      {metaPixels.length === 0 && metaAccounts.length === 0 && (
        <PlatformCard
          icon={Share2} title="Meta CAPI" color="hsl(214 89% 52%)" status="off"
          manageHref="/setup-facebook" manageLabel="Conectar"
        >
          <p className="text-sm text-muted-foreground">Nenhum pixel ou conta de anúncios configurada.</p>
        </PlatformCard>
      )}

      {metaPixels.map(p => (
        <PlatformCard
          key={p.id}
          icon={Share2}
          title={`Pixel — ${p.name}`}
          color="hsl(214 89% 52%)"
          status={p.is_active ? "ok" : "off"}
          manageHref="/setup-facebook"
        >
          <SecretRow label="Pixel ID" value={p.pixel_id} reveal />
          <SecretRow label="Access Token (CAPI)" value={p.access_token_encrypted} />
          <SecretRow label="Test Event Code" value={p.test_event_code} reveal />
          <SecretRow label="Domínios" value={p.allow_all_domains ? "Todos permitidos" : "Apenas domínios cadastrados"} mono={false} reveal />
        </PlatformCard>
      ))}

      {metaAccounts.map(a => (
        <PlatformCard
          key={a.id}
          icon={Share2}
          title={`Ad Account ${a.account_label ? `— ${a.account_label}` : ""}`}
          color="hsl(214 89% 52%)"
          status={a.status === "connected" ? "ok" : "off"}
          manageHref="/connected-accounts"
        >
          <SecretRow label="Ad Account ID" value={a.ad_account_id} reveal />
          <SecretRow label="Pixel ID vinculado" value={a.pixel_id} reveal />
          <SecretRow label="Access Token" value={a.access_token} />
          <SecretRow label="Roteamento" value={`${a.routing_mode}${a.routing_domains?.length ? ` (${a.routing_domains.join(", ")})` : ""}`} mono={false} reveal />
          <SecretRow label="Padrão" value={a.is_default ? "Sim" : "Não"} mono={false} reveal />
        </PlatformCard>
      ))}
    </div>
  );
}

function TikTokSection({ destinations }: { destinations: any[] }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">TikTok</h2>
      {destinations.length === 0 ? (
        <PlatformCard
          icon={Music2} title="TikTok Events API" color="hsl(340 82% 52%)" status="off"
          manageHref="/destinations" manageLabel="Configurar"
        >
          <p className="text-sm text-muted-foreground">Nenhum pixel TikTok configurado.</p>
        </PlatformCard>
      ) : destinations.map(d => (
        <PlatformCard
          key={d.id}
          icon={Music2}
          title={d.name || "TikTok Events API"}
          color="hsl(340 82% 52%)"
          status={d.status === "active" ? "ok" : "off"}
          manageHref="/destinations"
        >
          <SecretRow label="Pixel ID" value={d.public_config_json?.pixel_id} reveal />
          <SecretRow label="Access Token" value={"••••••••••• (criptografado)"} reveal />
          <SecretRow label="Ambiente" value={d.environment} mono={false} reveal />
        </PlatformCard>
      ))}
    </div>
  );
}

function GatewaySection({ gateways }: { gateways: any[] }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Gateways de Pagamento & Outros</h2>
      {gateways.length === 0 ? (
        <PlatformCard
          icon={ServerCog} title="Nenhum gateway configurado" color="hsl(var(--muted-foreground))" status="off"
          manageHref="/integrations" manageLabel="Adicionar"
        >
          <p className="text-sm text-muted-foreground">Conecte Hotmart, Yampi, Kiwify, Stripe e outros em Integrações.</p>
        </PlatformCard>
      ) : gateways.map(g => (
        <PlatformCard
          key={g.id}
          icon={ServerCog}
          title={g.name || g.provider}
          color="hsl(var(--primary))"
          status={g.status === "active" ? "ok" : "off"}
          manageHref="/integrations"
        >
          <SecretRow label="Provider" value={g.provider} mono={false} reveal />
          <SecretRow label="Ambiente" value={g.environment} mono={false} reveal />
          <SecretRow label="API Base URL" value={g.api_base_url} reveal />
          <SecretRow label="Credenciais" value={"••••••••••• (criptografado)"} reveal />
          <SecretRow label="Webhook Secret" value={"••••••••••• (criptografado)"} reveal />
          <SecretRow label="Última sync" value={g.last_sync_at || "Nunca"} mono={false} reveal />
        </PlatformCard>
      ))}
    </div>
  );
}
