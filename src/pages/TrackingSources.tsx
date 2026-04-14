import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Globe, Webhook, ShoppingCart, Code, Radio, Trash2, Copy } from "lucide-react";

const SOURCE_TYPES = [
  { value: "website", label: "Website", icon: Globe },
  { value: "checkout", label: "Checkout", icon: ShoppingCart },
  { value: "landing_page", label: "Landing Page", icon: Radio },
  { value: "api", label: "API", icon: Code },
  { value: "webhook", label: "Webhook", icon: Webhook },
];

export default function TrackingSources() {
  const { data: workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", type: "website", primary_domain: "" });

  const { data: sources = [], isLoading } = useQuery({
    queryKey: ["tracking-sources", workspace?.id],
    enabled: !!workspace?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tracking_sources")
        .select("*, api_keys(public_key)")
        .eq("workspace_id", workspace!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: apiKeys = [] } = useQuery({
    queryKey: ["api-keys-list", workspace?.id],
    enabled: !!workspace?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("api_keys")
        .select("id, name, public_key, status")
        .eq("workspace_id", workspace!.id)
        .eq("status", "active");
      return data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const keyId = apiKeys.length > 0 ? apiKeys[0].id : null;
      const { error } = await supabase.from("tracking_sources").insert({
        workspace_id: workspace!.id,
        name: form.name,
        type: form.type,
        primary_domain: form.primary_domain || null,
        api_key_id: keyId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tracking-sources"] });
      setOpen(false);
      setForm({ name: "", type: "website", primary_domain: "" });
      toast.success("Tracking source criada!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tracking_sources").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tracking-sources"] });
      toast.success("Source removida");
    },
  });

  const getIcon = (type: string) => {
    const found = SOURCE_TYPES.find(s => s.value === type);
    return found ? found.icon : Globe;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gradient-primary">Tracking Sources</h1>
          <p className="text-sm text-muted-foreground">Gerencie as fontes de coleta de eventos do seu workspace</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Nova Source
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Card key={i} className="glass-card animate-pulse h-40" />
          ))}
        </div>
      ) : sources.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Radio className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhuma source configurada</h3>
            <p className="text-sm text-muted-foreground mb-4">Crie uma tracking source para começar a coletar eventos</p>
            <Button onClick={() => setOpen(true)} variant="outline" className="gap-2">
              <Plus className="w-4 h-4" /> Criar primeira source
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sources.map((source: any) => {
            const Icon = getIcon(source.type);
            const publicKey = source.api_keys?.public_key;
            return (
              <Card key={source.id} className="glass-card hover:border-primary/30 transition-colors">
                <CardHeader className="flex flex-row items-start justify-between pb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{source.name}</CardTitle>
                      <p className="text-xs text-muted-foreground capitalize">{source.type.replace("_", " ")}</p>
                    </div>
                  </div>
                  <Badge variant={source.status === "active" ? "default" : "secondary"}>
                    {source.status}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  {source.primary_domain && (
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium">Domínio:</span> {source.primary_domain}
                    </div>
                  )}
                  {publicKey && (
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-muted/50 px-2 py-1 rounded flex-1 truncate">{publicKey}</code>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => { navigator.clipboard.writeText(publicKey); toast.success("Key copiada!"); }}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                  <div className="flex justify-end">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => deleteMutation.mutate(source.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass-card max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Tracking Source</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input placeholder="Meu Site Principal" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCE_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Domínio principal</Label>
              <Input placeholder="meusite.com.br" value={form.primary_domain} onChange={e => setForm(p => ({ ...p, primary_domain: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!form.name || createMutation.isPending}>
              {createMutation.isPending ? "Criando..." : "Criar Source"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
