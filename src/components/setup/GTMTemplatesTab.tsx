import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Sparkles, Server, Globe, FileJson, RefreshCw, Save, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { GTM_TEMPLATES, GtmTemplateId, downloadGtmTemplate } from "@/lib/gtm-templates";
import { downloadDynamicGtmContainer } from "@/lib/gtm-dynamic-generator";
import { BUSINESS_PROFILES, type BusinessType } from "@/lib/prompt-templates";

type SelectionId = GtmTemplateId | `dynamic:${BusinessType}`;

interface Props {
  publicKey: string;
  supabaseUrl: string;
}

export function GTMTemplatesTab({ publicKey, supabaseUrl }: Props) {
  const { data: workspace } = useWorkspace();
  const [templateId, setTemplateId] = useState<SelectionId>("yampi");

  const isDynamic = templateId.startsWith("dynamic:");
  const dynamicBusiness = isDynamic ? (templateId.split(":")[1] as BusinessType) : null;

  const [fbPixelId, setFbPixelId] = useState("");
  const [fbAccessToken, setFbAccessToken] = useState("");
  const [ga4Id, setGa4Id] = useState("");
  const [adsId, setAdsId] = useState("");
  const [transportUrl, setTransportUrl] = useState("");
  const [domain, setDomain] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);

  const saveDefaults = async () => {
    if (!workspace?.id) return;
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from("tracking_sources")
        .select("id, settings_json")
        .eq("workspace_id", workspace.id)
        .limit(1)
        .maybeSingle();

      const newSettings = {
        ...((existing?.settings_json as any) || {}),
        ga4_measurement_id: ga4Id.trim() || undefined,
        gtm_template_defaults: {
          fb_pixel_id: fbPixelId.trim() || undefined,
          fb_access_token: fbAccessToken.trim() || undefined,
          ga4_measurement_id: ga4Id.trim() || undefined,
          google_ads_id: adsId.trim() || undefined,
          transport_url: transportUrl.trim() || undefined,
          domain: domain.trim() || undefined,
          template_id: templateId,
          updated_at: new Date().toISOString(),
        },
      };

      if (existing?.id) {
        const updates: any = { settings_json: newSettings };
        if (domain.trim()) updates.primary_domain = domain.trim();
        await supabase.from("tracking_sources").update(updates).eq("id", existing.id);
      } else {
        await supabase.from("tracking_sources").insert({
          workspace_id: workspace.id,
          name: "Default",
          type: "web",
          primary_domain: domain.trim() || null,
          settings_json: newSettings,
        });
      }
      toast.success("Configurações salvas no workspace.");
    } catch (e: any) {
      toast.error("Erro ao salvar: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const sync = async (showToast = true) => {
    if (!workspace?.id) return;
    setSyncing(true);
    try {
      const [pixelsRes, adsRes, srcRes] = await Promise.all([
        supabase.from("meta_pixels")
          .select("pixel_id, access_token_encrypted")
          .eq("workspace_id", workspace.id).eq("is_active", true).limit(1),
        supabase.from("google_ads_credentials")
          .select("customer_id")
          .eq("workspace_id", workspace.id)
          .order("is_default", { ascending: false }).limit(1),
        supabase.from("tracking_sources")
          .select("primary_domain, settings_json")
          .eq("workspace_id", workspace.id).limit(1),
      ]);
      const filled: string[] = [];
      const px: any = pixelsRes.data?.[0];
      if (px?.pixel_id) { setFbPixelId((c) => c || px.pixel_id); filled.push("Pixel"); }
      if (px?.access_token_encrypted) { setFbAccessToken((c) => c || px.access_token_encrypted); filled.push("Token"); }
      const ads: any = adsRes.data?.[0];
      if (ads?.customer_id) {
        const cid = String(ads.customer_id).replace(/[^0-9]/g, "");
        setAdsId((c) => c || `AW-${cid}`); filled.push("Google Ads");
      }
      const src: any = srcRes.data?.[0];
      const ga4 = src?.settings_json?.ga4_measurement_id || src?.settings_json?.ga4 || "";
      if (ga4) { setGa4Id((c) => c || ga4); filled.push("GA4"); }
      if (src?.primary_domain) { setDomain((c) => c || src.primary_domain); filled.push("Domínio"); }
      // Saved template defaults override (user explicitly saved before)
      const saved = src?.settings_json?.gtm_template_defaults;
      if (saved) {
        if (saved.fb_pixel_id) setFbPixelId((c) => c || saved.fb_pixel_id);
        if (saved.fb_access_token) setFbAccessToken((c) => c || saved.fb_access_token);
        if (saved.google_ads_id) setAdsId((c) => c || saved.google_ads_id);
        if (saved.transport_url) setTransportUrl((c) => c || saved.transport_url);
        if (saved.domain) setDomain((c) => c || saved.domain);
        filled.push("Salvos");
      }
      if (showToast) {
        if (filled.length) toast.success(`Sincronizado: ${filled.join(", ")}`);
        else toast.info("Nada para sincronizar. Cadastre Pixel/Ads/GA4 nas configurações.");
      }
    } catch (e: any) {
      toast.error("Erro ao sincronizar: " + e.message);
    } finally {
      setSyncing(false);
    }
  };

  // auto-sync once on workspace load
  useEffect(() => { if (workspace?.id) sync(false); /* eslint-disable-next-line */ }, [workspace?.id]);

  // Synthetic meta for dynamic mode (so the rest of the form can render the right inputs)
  const dynamicMeta = dynamicBusiness && {
    id: templateId,
    name: `Dinâmico — ${BUSINESS_PROFILES[dynamicBusiness].label}`,
    platform: BUSINESS_PROFILES[dynamicBusiness].label,
    usageContext: "WEB" as const,
    description: `Container Web gerado dinamicamente para ${BUSINESS_PROFILES[dynamicBusiness].label}, com TODOS os eventos do funil: ${BUSINESS_PROFILES[dynamicBusiness].funnel.join(" → ")}.`,
    variableMap: {
      fbPixelId: "0.01 Facebook Pixel",
      ga4MeasurementId: "0.02 GA4 ID",
      googleAdsId: "0.03 Google Ads ID",
    } as Partial<{ fbPixelId: string; fbAccessToken: string; ga4MeasurementId: string; googleAdsId: string; transportUrl: string }>,
    domainPlaceholders: [] as string[],
  };
  const meta = isDynamic ? dynamicMeta! : GTM_TEMPLATES[templateId as GtmTemplateId].meta;

  const endpoint = useMemo(
    () =>
      meta.usageContext === "SERVER"
        ? `${supabaseUrl}/functions/v1/gtm-server-events`
        : `${supabaseUrl}/functions/v1/track`,
    [meta.usageContext, supabaseUrl]
  );

  const handleDownload = () => {
    if (!publicKey || publicKey.startsWith("pk_live_SUA")) {
      toast.error("Crie uma API Key primeiro em Configurações → API Keys.");
      return;
    }
    if (isDynamic && dynamicBusiness) {
      downloadDynamicGtmContainer({
        businessType: dynamicBusiness,
        publicKey,
        capitrackEndpoint: endpoint,
        fbPixelId: fbPixelId.trim() || undefined,
        fbAccessToken: fbAccessToken.trim() || undefined,
        ga4MeasurementId: ga4Id.trim() || undefined,
        googleAdsId: adsId.trim() || undefined,
        domain: domain.trim() || undefined,
      });
      toast.success(`Container dinâmico "${meta.name}" gerado com TODOS os eventos do funil!`);
      return;
    }
    downloadGtmTemplate(templateId as GtmTemplateId, {
      publicKey,
      capitrackEndpoint: endpoint,
      fbPixelId: fbPixelId.trim() || undefined,
      fbAccessToken: fbAccessToken.trim() || undefined,
      ga4MeasurementId: ga4Id.trim() || undefined,
      googleAdsId: adsId.trim() || undefined,
      transportUrl: transportUrl.trim() || undefined,
      domain: domain.trim() || undefined,
    });
    toast.success(`Template "${meta.name}" gerado! Importe via Mesclar no GTM.`);
  };

  return (
    <div className="space-y-4">
      <Card className="glass-card border-primary/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Templates GTM Pré-configurados
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Escolha o template</Label>
            <Select value={templateId} onValueChange={(v) => setTemplateId(v as SelectionId)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <div className="px-2 py-1 text-[10px] uppercase text-muted-foreground font-semibold">
                  🎯 Dinâmico (funil completo por tipo de negócio)
                </div>
                {Object.values(BUSINESS_PROFILES).map((p) => (
                  <SelectItem key={`dynamic:${p.id}`} value={`dynamic:${p.id}`}>
                    <div className="flex items-center gap-2">
                      <Wand2 className="w-3.5 h-3.5 text-primary" />
                      Dinâmico — {p.label}
                      <Badge variant="outline" className="text-[10px]">
                        {p.funnel.length} eventos
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
                <div className="px-2 py-1 mt-2 text-[10px] uppercase text-muted-foreground font-semibold border-t border-border/30">
                  📦 Templates fixos (plataformas específicas)
                </div>
                {Object.values(GTM_TEMPLATES).map((t) => (
                  <SelectItem key={t.meta.id} value={t.meta.id}>
                    <div className="flex items-center gap-2">
                      {t.meta.usageContext === "SERVER" ? (
                        <Server className="w-3.5 h-3.5" />
                      ) : (
                        <Globe className="w-3.5 h-3.5" />
                      )}
                      {t.meta.name}
                      <Badge variant="outline" className="text-[10px]">
                        {t.meta.platform}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{meta.description}</p>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Preencha manualmente ou sincronize do workspace.</p>
            <Button variant="outline" size="sm" onClick={() => sync(true)} disabled={syncing}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${syncing ? "animate-spin" : ""}`} />
              Sincronizar
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {meta.variableMap.fbPixelId && (
              <div className="space-y-1">
                <Label className="text-xs">Pixel do Facebook</Label>
                <Input
                  placeholder="123456789012345"
                  value={fbPixelId}
                  onChange={(e) => setFbPixelId(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Onde pegar: <b>Meta Events Manager</b> → <i>business.facebook.com/events_manager</i> → selecione o Pixel → o número de 15-16 dígitos no topo é o seu <b>Pixel ID</b>. (Sincronize para puxar do que já está cadastrado em <b>Configurações → Meta</b>.)
                </p>
              </div>
            )}
            {meta.variableMap.fbAccessToken && (
              <div className="space-y-1">
                <Label className="text-xs">Access Token (CAPI)</Label>
                <Input
                  placeholder="EAAG..."
                  value={fbAccessToken}
                  onChange={(e) => setFbAccessToken(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Onde pegar: <b>Events Manager</b> → seu Pixel → aba <b>Configurações</b> → role até <b>Conversions API</b> → <b>Generate access token</b>. Token longo começando com <code>EAAG…</code>. Guarde com segurança — ele dá acesso de envio CAPI.
                </p>
              </div>
            )}
            {meta.variableMap.ga4MeasurementId && (
              <div className="space-y-1">
                <Label className="text-xs">GA4 Measurement ID</Label>
                <Input
                  placeholder="G-XXXXXXX"
                  value={ga4Id}
                  onChange={(e) => setGa4Id(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Onde pegar: <b>Google Analytics 4</b> → <b>Admin</b> (engrenagem) → <b>Fluxos de dados</b> → clique no fluxo Web do seu site → copie o campo <b>ID DA MÉTRICA</b> (também chamado de <i>Measurement ID</i> / <i>ID de avaliação</i>) no formato <code>G-XXXXXXXXXX</code>. ⚠️ Não confunda com <b>Código do fluxo</b> (número longo) nem com <b>ID da propriedade</b> — o que vai aqui é só o que começa com <code>G-</code>.
                </p>
              </div>
            )}
            {meta.variableMap.googleAdsId && (
              <div className="space-y-1">
                <Label className="text-xs">Google Ads ID</Label>
                <Input
                  placeholder="AW-12345678"
                  value={adsId}
                  onChange={(e) => setAdsId(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Onde pegar: <b>Google Ads</b> → <b>Ferramentas</b> → <b>Conversões</b> → escolha a conversão → <b>Configuração da tag</b> → <b>Usar o Google Tag Manager</b>. Copie o <b>ID de conversão</b> e prefixe com <code>AW-</code> (ex.: <code>AW-123456789</code>).
                </p>
              </div>
            )}
            {meta.variableMap.transportUrl && (
              <div className="space-y-1">
                <Label className="text-xs">Transport URL (sGTM, opcional)</Label>
                <Input
                  placeholder="https://gtm.seudominio.com"
                  value={transportUrl}
                  onChange={(e) => setTransportUrl(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground leading-snug">
                  O que é: URL do seu <b>Server-Side GTM</b> (Stape, mmprod, Cloud Run). Se você ainda não tem sGTM próprio, <b>deixe em branco</b> — os eventos vão direto para o endpoint CapiTrack acima. Use somente se quiser passar pelo seu container server primeiro.
                </p>
              </div>
            )}
            {meta.domainPlaceholders.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs">Domínio principal</Label>
                <Input
                  placeholder="minhaloja.com.br"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground leading-snug">
                  É o domínio raiz do seu site, <b>sem https:// e sem www</b> (ex.: <code>minhaloja.com.br</code>). Usado para gravar cookies de identidade <b>1st-party</b> no domínio correto e melhorar o match quality (EMQ) do Meta.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-lg bg-muted/30 border border-border/30 p-3 text-xs space-y-1 font-mono">
            <div>
              <span className="text-muted-foreground">Endpoint:</span> {endpoint}
            </div>
            <div>
              <span className="text-muted-foreground">Public key:</span>{" "}
              {publicKey.slice(0, 18)}…
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button onClick={saveDefaults} variant="outline" size="lg" disabled={saving}>
              <Save className={`w-4 h-4 mr-2 ${saving ? "animate-pulse" : ""}`} />
              {saving ? "Salvando..." : "Salvar configurações"}
            </Button>
            <Button onClick={handleDownload} size="lg">
              <Download className="w-4 h-4 mr-2" />
              Gerar e baixar JSON
            </Button>
          </div>

          <div className="rounded-lg bg-accent/10 border border-accent/30 p-3 text-xs text-muted-foreground space-y-1">
            <div className="flex items-center gap-1 font-medium text-foreground">
              <FileJson className="w-3.5 h-3.5" /> Como importar
            </div>
            <div>1. GTM → Admin → Importar contêiner</div>
            <div>
              2. Selecione o JSON, escolha o workspace e marque <b>Mesclar</b> →{" "}
              <b>Substituir tags conflitantes</b>
            </div>
            <div>3. Publique. Pronto — IDs já vêm preenchidos.</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
