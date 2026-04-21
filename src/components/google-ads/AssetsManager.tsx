/**
 * AssetsManager — UI para criar e remover extensões (sitelinks, callouts,
 * structured snippets) de uma campanha Google Ads.
 *
 * Mostrado dentro da tab "Extensões". Substitui a tabela read-only anterior
 * por um editor completo: criar, listar e remover.
 *
 * STRUCTURED_SNIPPET headers válidos do Google Ads:
 *   Brands, Courses, Degree programs, Destinations, Featured hotels,
 *   Insurance coverage, Models, Neighborhoods, Service catalog, Shows,
 *   Styles, Types, Amenities, Service.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Plus, Trash2, Link2, Megaphone, ListChecks } from "lucide-react";
import { useCampaignAssets, type CampaignAssetRow } from "@/hooks/api/use-campaign-assets";

const SNIPPET_HEADERS = [
  "Brands", "Courses", "Degree programs", "Destinations", "Featured hotels",
  "Insurance coverage", "Models", "Neighborhoods", "Service catalog", "Shows",
  "Styles", "Types", "Amenities", "Service",
];

interface Props {
  workspaceId: string | undefined;
  customerId: string;
  campaignId: string;
}

export function AssetsManager({ workspaceId, customerId, campaignId }: Props) {
  const a = useCampaignAssets({ workspaceId, customerId, campaignId });
  const rows = a.list.data || [];

  const sitelinks = rows.filter((r) => r.field_type === "SITELINK");
  const callouts = rows.filter((r) => r.field_type === "CALLOUT");
  const snippets = rows.filter((r) => r.field_type === "STRUCTURED_SNIPPET");

  return (
    <div className="space-y-4">
      <Card className="glass-card">
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            Extensões da campanha
            {a.list.isLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
          </CardTitle>
          <p className="text-[11px] text-muted-foreground mt-1">
            Sitelinks, callouts e structured snippets são adicionados diretamente no Google Ads. Mudanças levam alguns minutos para aparecer nas métricas.
          </p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="sitelinks">
            <TabsList>
              <TabsTrigger value="sitelinks" className="text-xs">
                <Link2 className="w-3 h-3 mr-1" /> Sitelinks <Badge variant="secondary" className="ml-1.5 h-4 text-[10px]">{sitelinks.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="callouts" className="text-xs">
                <Megaphone className="w-3 h-3 mr-1" /> Callouts <Badge variant="secondary" className="ml-1.5 h-4 text-[10px]">{callouts.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="snippets" className="text-xs">
                <ListChecks className="w-3 h-3 mr-1" /> Snippets <Badge variant="secondary" className="ml-1.5 h-4 text-[10px]">{snippets.length}</Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="sitelinks" className="space-y-3 mt-3">
              <SitelinkForm a={a} />
              <AssetList rows={sitelinks} a={a} renderTitle={(r) => r.link_text || "—"}
                renderDetail={(r) => (
                  <>
                    {r.description1 && <p className="text-[11px] text-muted-foreground">{r.description1}</p>}
                    {r.description2 && <p className="text-[11px] text-muted-foreground">{r.description2}</p>}
                    {r.final_urls?.[0] && <p className="text-[10px] font-mono text-primary truncate">{r.final_urls[0]}</p>}
                  </>
                )} />
            </TabsContent>

            <TabsContent value="callouts" className="space-y-3 mt-3">
              <CalloutForm a={a} />
              <AssetList rows={callouts} a={a} renderTitle={(r) => r.callout_text || "—"} />
            </TabsContent>

            <TabsContent value="snippets" className="space-y-3 mt-3">
              <SnippetForm a={a} />
              <AssetList rows={snippets} a={a}
                renderTitle={(r) => r.snippet_header || "—"}
                renderDetail={(r) => (
                  <p className="text-[11px] text-muted-foreground">
                    {(r.snippet_values || []).join(" · ")}
                  </p>
                )} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function AssetList({ rows, a, renderTitle, renderDetail }: {
  rows: CampaignAssetRow[];
  a: ReturnType<typeof useCampaignAssets>;
  renderTitle: (r: CampaignAssetRow) => React.ReactNode;
  renderDetail?: (r: CampaignAssetRow) => React.ReactNode;
}) {
  if (a.list.isLoading) return <p className="text-xs text-muted-foreground py-3 text-center">Carregando…</p>;
  if (rows.length === 0) return <p className="text-xs text-muted-foreground py-3 text-center">Nenhuma extensão deste tipo. Crie uma acima.</p>;
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.campaign_asset_resource} className="border border-border/40 rounded p-2 flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{renderTitle(r)}</p>
            {renderDetail?.(r)}
          </div>
          <Badge variant="outline" className="text-[9px] uppercase shrink-0">{r.status}</Badge>
          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0"
            disabled={a.remove.isPending}
            onClick={() => { if (confirm("Remover esta extensão da campanha?")) a.remove.mutate(r.campaign_asset_resource); }}>
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
          </Button>
        </div>
      ))}
    </div>
  );
}

function SitelinkForm({ a }: { a: ReturnType<typeof useCampaignAssets> }) {
  const [linkText, setLinkText] = useState("");
  const [url, setUrl] = useState("");
  const [d1, setD1] = useState("");
  const [d2, setD2] = useState("");
  const valid = linkText.trim().length > 0 && linkText.length <= 25 && /^https?:\/\//.test(url);

  return (
    <div className="border border-border/40 rounded p-3 bg-muted/10 space-y-2">
      <p className="text-xs font-semibold flex items-center gap-1"><Plus className="w-3 h-3" /> Novo sitelink</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] uppercase">Texto do link (máx 25)</Label>
          <Input value={linkText} maxLength={25} onChange={(e) => setLinkText(e.target.value)} className="h-8 text-xs mt-1" placeholder="Ex: Planos premium" />
        </div>
        <div>
          <Label className="text-[10px] uppercase">URL final</Label>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} className="h-8 text-xs mt-1 font-mono" placeholder="https://..." />
        </div>
        <div>
          <Label className="text-[10px] uppercase">Descrição 1 (opcional, 35)</Label>
          <Input value={d1} maxLength={35} onChange={(e) => setD1(e.target.value)} className="h-8 text-xs mt-1" />
        </div>
        <div>
          <Label className="text-[10px] uppercase">Descrição 2 (opcional, 35)</Label>
          <Input value={d2} maxLength={35} onChange={(e) => setD2(e.target.value)} className="h-8 text-xs mt-1" />
        </div>
      </div>
      <div className="flex justify-end pt-1">
        <Button size="sm" disabled={!valid || a.createSitelink.isPending}
          onClick={() => a.createSitelink.mutate(
            { link_text: linkText.trim(), final_urls: [url.trim()], description1: d1.trim() || undefined, description2: d2.trim() || undefined },
            { onSuccess: () => { setLinkText(""); setUrl(""); setD1(""); setD2(""); } },
          )}>
          {a.createSitelink.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
          Adicionar
        </Button>
      </div>
    </div>
  );
}

function CalloutForm({ a }: { a: ReturnType<typeof useCampaignAssets> }) {
  const [text, setText] = useState("");
  const valid = text.trim().length > 0 && text.length <= 25;
  return (
    <div className="border border-border/40 rounded p-3 bg-muted/10 space-y-2">
      <p className="text-xs font-semibold flex items-center gap-1"><Plus className="w-3 h-3" /> Novo callout</p>
      <div>
        <Label className="text-[10px] uppercase">Texto (máx 25)</Label>
        <Input value={text} maxLength={25} onChange={(e) => setText(e.target.value)} className="h-8 text-xs mt-1" placeholder="Ex: Frete grátis Brasil" />
      </div>
      <div className="flex justify-end">
        <Button size="sm" disabled={!valid || a.createCallout.isPending}
          onClick={() => a.createCallout.mutate({ callout_text: text.trim() }, { onSuccess: () => setText("") })}>
          {a.createCallout.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
          Adicionar
        </Button>
      </div>
    </div>
  );
}

function SnippetForm({ a }: { a: ReturnType<typeof useCampaignAssets> }) {
  const [header, setHeader] = useState(SNIPPET_HEADERS[0]);
  const [raw, setRaw] = useState("");
  const values = raw.split(",").map((v) => v.trim()).filter(Boolean);
  const valid = values.length >= 3 && values.length <= 10;
  return (
    <div className="border border-border/40 rounded p-3 bg-muted/10 space-y-2">
      <p className="text-xs font-semibold flex items-center gap-1"><Plus className="w-3 h-3" /> Novo structured snippet</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div>
          <Label className="text-[10px] uppercase">Cabeçalho</Label>
          <Select value={header} onValueChange={setHeader}>
            <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>{SNIPPET_HEADERS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label className="text-[10px] uppercase">Valores (3 a 10, separados por vírgula)</Label>
          <Input value={raw} onChange={(e) => setRaw(e.target.value)} className="h-8 text-xs mt-1" placeholder="Item 1, Item 2, Item 3" />
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">{values.length} valor(es) {valid ? "✓" : "(mínimo 3)"}</p>
      <div className="flex justify-end">
        <Button size="sm" disabled={!valid || a.createSnippet.isPending}
          onClick={() => a.createSnippet.mutate({ header, values }, { onSuccess: () => setRaw("") })}>
          {a.createSnippet.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
          Adicionar
        </Button>
      </div>
    </div>
  );
}
