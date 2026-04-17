import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Megaphone, BarChart2, Trash2, Plus, CheckCircle2, AlertCircle, Target } from "lucide-react";

interface Props {
  workspaceId: string;
}

export function MarketingDestinationsManager({ workspaceId }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  // Meta Pixels
  const { data: pixels = [] } = useQuery({
    queryKey: ["meta-pixels", workspaceId],
    queryFn: async () => {
      const { data } = await supabase
        .from("meta_pixels")
        .select("id, pixel_id, name, is_active, test_event_code, created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  // Integration destinations (GA4, Google Ads, TikTok)
  const { data: destinations = [] } = useQuery({
    queryKey: ["integration-destinations", workspaceId],
    queryFn: async () => {
      const { data } = await supabase
        .from("integration_destinations")
        .select("id, provider, destination_id, display_name, is_active, events_sent_count, last_event_at, created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const ga4 = destinations.filter(d => d.provider === "ga4");
  const googleAds = destinations.filter(d => d.provider === "google_ads");

  const togglePixel = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("meta_pixels").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meta-pixels", workspaceId] });
      toast.success("Pixel atualizado");
    },
    onError: e => toast.error("Erro: " + (e as Error).message),
  });

  const toggleDest = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("integration_destinations").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["integration-destinations", workspaceId] });
      toast.success("Destino atualizado");
    },
    onError: e => toast.error("Erro: " + (e as Error).message),
  });

  const removePixel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("meta_pixels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meta-pixels", workspaceId] });
      toast.success("Pixel removido");
    },
  });

  const removeDest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("integration_destinations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["integration-destinations", workspaceId] });
      toast.success("Destino removido");
    },
  });

  const totalActive =
    pixels.filter(p => p.is_active).length +
    destinations.filter(d => d.is_active).length;

  return (
    <Card className="glass-card border-primary/30">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            Destinos de Marketing
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Para onde o evento <Badge variant="outline" className="text-[10px] mx-1">Purchase</Badge> do seu gateway será enviado
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            {totalActive} ativo{totalActive !== 1 ? "s" : ""}
          </Badge>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8">
                <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar destino
              </Button>
            </DialogTrigger>
            <AddDestinationDialog
              workspaceId={workspaceId}
              onSuccess={() => {
                setOpen(false);
                qc.invalidateQueries({ queryKey: ["meta-pixels", workspaceId] });
                qc.invalidateQueries({ queryKey: ["integration-destinations", workspaceId] });
              }}
            />
          </Dialog>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {/* Meta Pixels */}
        {pixels.map(p => (
          <DestinationRow
            key={p.id}
            icon={<Megaphone className="w-4 h-4 text-primary" />}
            label="Meta CAPI"
            id={p.pixel_id}
            name={p.name}
            active={p.is_active}
            extra={p.test_event_code ? `test: ${p.test_event_code}` : undefined}
            onToggle={v => togglePixel.mutate({ id: p.id, is_active: v })}
            onRemove={() => removePixel.mutate(p.id)}
          />
        ))}

        {ga4.map(d => (
          <DestinationRow
            key={d.id}
            icon={<BarChart2 className="w-4 h-4 text-primary" />}
            label="GA4"
            id={d.destination_id}
            name={d.display_name}
            active={d.is_active}
            extra={d.events_sent_count > 0 ? `${d.events_sent_count} eventos` : undefined}
            onToggle={v => toggleDest.mutate({ id: d.id, is_active: v })}
            onRemove={() => removeDest.mutate(d.id)}
          />
        ))}

        {googleAds.map(d => (
          <DestinationRow
            key={d.id}
            icon={<Target className="w-4 h-4 text-primary" />}
            label="Google Ads"
            id={d.destination_id}
            name={d.display_name}
            active={d.is_active}
            extra={d.events_sent_count > 0 ? `${d.events_sent_count} eventos` : "OAuth conectado"}
            onToggle={v => toggleDest.mutate({ id: d.id, is_active: v })}
            onRemove={() => removeDest.mutate(d.id)}
          />
        ))}

        {pixels.length === 0 && destinations.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
            Nenhum destino configurado.<br />
            Adicione Meta Pixel, GA4 ou Google Ads para receber as compras.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DestinationRow({
  icon, label, id, name, active, extra, onToggle, onRemove,
}: {
  icon: React.ReactNode;
  label: string;
  id: string;
  name?: string | null;
  active: boolean;
  extra?: string;
  onToggle: (v: boolean) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg border border-border/30 bg-muted/10 hover:bg-muted/20 transition-colors">
      <div className="w-8 h-8 rounded-md bg-background flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{name || label}</span>
          <Badge variant="outline" className="text-[9px] h-4 px-1">{label}</Badge>
          {active ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
          <code className="font-mono">{id}</code>
          {extra && <><span>•</span><span>{extra}</span></>}
        </div>
      </div>
      <Switch checked={active} onCheckedChange={onToggle} />
      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={onRemove}>
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

function AddDestinationDialog({
  workspaceId, onSuccess,
}: { workspaceId: string; onSuccess: () => void }) {
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Adicionar Destino de Marketing</DialogTitle>
        <DialogDescription>
          Configure para onde os eventos <strong>Purchase</strong> serão enviados quando seu gateway confirmar uma compra.
        </DialogDescription>
      </DialogHeader>

      <Tabs defaultValue="meta">
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="meta"><Megaphone className="w-3.5 h-3.5 mr-1.5" />Meta Pixel</TabsTrigger>
          <TabsTrigger value="ga4"><BarChart2 className="w-3.5 h-3.5 mr-1.5" />GA4</TabsTrigger>
        </TabsList>

        <TabsContent value="meta" className="mt-4">
          <MetaPixelForm workspaceId={workspaceId} onSuccess={onSuccess} />
        </TabsContent>

        <TabsContent value="ga4" className="mt-4">
          <GA4Form workspaceId={workspaceId} onSuccess={onSuccess} />
        </TabsContent>
      </Tabs>
    </DialogContent>
  );
}

function MetaPixelForm({ workspaceId, onSuccess }: { workspaceId: string; onSuccess: () => void }) {
  const [pixelId, setPixelId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [name, setName] = useState("Meta Pixel");
  const [testCode, setTestCode] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!pixelId.trim() || !accessToken.trim()) {
      toast.error("Pixel ID e Access Token são obrigatórios");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("meta_pixels").insert({
      workspace_id: workspaceId,
      pixel_id: pixelId.trim(),
      access_token_encrypted: accessToken.trim(),
      name: name.trim() || "Meta Pixel",
      test_event_code: testCode.trim() || null,
      is_active: true,
      allow_all_domains: true,
    });
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }
    toast.success("Pixel adicionado! Próximo Purchase será enviado para a Meta CAPI.");
    onSuccess();
  }

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Pixel ID *</Label>
        <Input value={pixelId} onChange={e => setPixelId(e.target.value)} placeholder="123456789012345" className="font-mono" />
      </div>
      <div>
        <Label className="text-xs">Access Token (CAPI) *</Label>
        <Input type="password" value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder="EAAxxxxxxxxxxxxxxx" className="font-mono text-xs" />
        <p className="text-[10px] text-muted-foreground mt-1">
          Gere em: Eventos Manager → Configurações → Gerar token de acesso
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Nome (opcional)</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Meu Pixel" />
        </div>
        <div>
          <Label className="text-xs">Test Event Code (opcional)</Label>
          <Input value={testCode} onChange={e => setTestCode(e.target.value)} placeholder="TEST12345" className="font-mono text-xs" />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? "Salvando..." : "Adicionar Meta Pixel"}
        </Button>
      </DialogFooter>
    </div>
  );
}

function GA4Form({ workspaceId, onSuccess }: { workspaceId: string; onSuccess: () => void }) {
  const [measurementId, setMeasurementId] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [name, setName] = useState("GA4");
  const [debugMode, setDebugMode] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!/^G-[A-Z0-9]+$/i.test(measurementId.trim())) {
      toast.error("Measurement ID inválido. Formato: G-XXXXXXXXXX");
      return;
    }
    if (!apiSecret.trim()) {
      toast.error("API Secret é obrigatório");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("integration_destinations").insert({
      workspace_id: workspaceId,
      provider: "ga4",
      destination_id: measurementId.trim().toUpperCase(),
      access_token_encrypted: apiSecret.trim(),
      display_name: name.trim() || "GA4",
      config_json: { debug_mode: debugMode },
      is_active: true,
    });
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }
    toast.success("GA4 adicionado! Próximo Purchase será enviado para o Analytics.");
    onSuccess();
  }

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Measurement ID *</Label>
        <Input value={measurementId} onChange={e => setMeasurementId(e.target.value)} placeholder="G-XXXXXXXXXX" className="font-mono" />
      </div>
      <div>
        <Label className="text-xs">API Secret *</Label>
        <Input type="password" value={apiSecret} onChange={e => setApiSecret(e.target.value)} placeholder="abcdef..." className="font-mono text-xs" />
        <p className="text-[10px] text-muted-foreground mt-1">
          Em GA4: Admin → Data Streams → Sua stream → Measurement Protocol API secrets → Create
        </p>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs">Nome</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="GA4 Produção" className="mt-1" />
        </div>
        <div className="flex items-center gap-2 mt-5">
          <Switch checked={debugMode} onCheckedChange={setDebugMode} id="debug" />
          <Label htmlFor="debug" className="text-xs cursor-pointer">Modo debug</Label>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? "Salvando..." : "Adicionar GA4"}
        </Button>
      </DialogFooter>
    </div>
  );
}