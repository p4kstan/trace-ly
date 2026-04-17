import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Sparkles, Server, Globe, FileJson, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { GTM_TEMPLATES, GtmTemplateId, downloadGtmTemplate } from "@/lib/gtm-templates";

interface Props {
  publicKey: string;
  supabaseUrl: string;
}

export function GTMTemplatesTab({ publicKey, supabaseUrl }: Props) {
  const { data: workspace } = useWorkspace();
  const [templateId, setTemplateId] = useState<GtmTemplateId>("yampi");

  const [fbPixelId, setFbPixelId] = useState("");
  const [fbAccessToken, setFbAccessToken] = useState("");
  const [ga4Id, setGa4Id] = useState("");
  const [adsId, setAdsId] = useState("");
  const [transportUrl, setTransportUrl] = useState("");
  const [domain, setDomain] = useState("");
  const [syncing, setSyncing] = useState(false);

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

  const meta = GTM_TEMPLATES[templateId].meta;

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
    downloadGtmTemplate(templateId, {
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
            <Select value={templateId} onValueChange={(v) => setTemplateId(v as GtmTemplateId)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
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

          <div className="grid gap-3 md:grid-cols-2">
            {meta.variableMap.fbPixelId && (
              <div className="space-y-1">
                <Label className="text-xs">Pixel do Facebook</Label>
                <Input
                  placeholder="123456789012345"
                  value={fbPixelId}
                  onChange={(e) => setFbPixelId(e.target.value)}
                />
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

          <Button onClick={handleDownload} className="w-full" size="lg">
            <Download className="w-4 h-4 mr-2" />
            Baixar JSON ({meta.name})
          </Button>

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
