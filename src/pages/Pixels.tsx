import { useState } from "react";
import { MonitorDot, Plus, CheckCircle, AlertCircle, Inbox, Pencil, Trash2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useWorkspace, useMetaPixels } from "@/hooks/use-tracking-data";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InlineHelp } from "@/components/InlineHelp";

export default function Pixels() {
  const { data: workspace } = useWorkspace();
  const { data: pixels, isLoading } = useMetaPixels(workspace?.id);
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", pixel_id: "", access_token: "", test_event_code: "", domain: "" });
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setForm({ name: "", pixel_id: "", access_token: "", test_event_code: "", domain: "" });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSave = async () => {
    if (!workspace?.id || !form.pixel_id || !form.name) {
      toast.error("Preencha nome e Pixel ID");
      return;
    }
    setSaving(true);

    if (editingId) {
      const updatePayload: { name: string; pixel_id: string; test_event_code: string | null; access_token_encrypted?: string } = {
        name: form.name,
        pixel_id: form.pixel_id,
        test_event_code: form.test_event_code || null,
      };
      if (form.access_token) updatePayload.access_token_encrypted = form.access_token;

      const { error } = await supabase.from("meta_pixels").update(updatePayload).eq("id", editingId);
      if (error) toast.error(error.message);
      else toast.success("Pixel atualizado!");
    } else {
      const { data, error } = await supabase.from("meta_pixels").insert({
        workspace_id: workspace.id,
        name: form.name,
        pixel_id: form.pixel_id,
        access_token_encrypted: form.access_token || null,
        test_event_code: form.test_event_code || null,
        is_active: true,
        allow_all_domains: false,
      }).select("id").single();

      if (error) toast.error(error.message);
      else {
        if (form.domain && data) {
          await supabase.from("allowed_domains").insert({
            meta_pixel_id: data.id,
            domain: form.domain.replace(/^https?:\/\//, "").replace(/\/$/, ""),
          });
        }
        toast.success("Pixel criado!");
      }
    }

    queryClient.invalidateQueries({ queryKey: ["meta-pixels"] });
    resetForm();
    setSaving(false);
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    await supabase.from("meta_pixels").update({ is_active: !isActive }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["meta-pixels"] });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este pixel?")) return;
    await supabase.from("allowed_domains").delete().eq("meta_pixel_id", id);
    await supabase.from("meta_pixels").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["meta-pixels"] });
    toast.success("Pixel excluído");
  };

  const startEdit = (pixel: NonNullable<typeof pixels>[0]) => {
    setForm({ name: pixel.name, pixel_id: pixel.pixel_id, access_token: "", test_event_code: pixel.test_event_code || "", domain: "" });
    setEditingId(pixel.id);
    setShowForm(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pixel Manager</h1>
          <p className="text-muted-foreground text-sm mt-1">Gerencie seus pixels de tracking</p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true); }} className="bg-primary text-primary-foreground hover:bg-primary/90 glow-primary">
          <Plus className="w-4 h-4 mr-2" /> Novo Pixel
        </Button>
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="bg-card border-border max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">{editingId ? "Editar" : "Novo"} Pixel</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-foreground">Nome</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="My Meta Pixel" />
            </div>

            <div>
              <Label className="text-foreground">Pixel ID</Label>
              <Input value={form.pixel_id} onChange={e => setForm(f => ({ ...f, pixel_id: e.target.value }))} placeholder="123456789012345" />
              <InlineHelp
                label="Como encontrar o Pixel ID?"
                steps={[
                  { text: "Acesse o Meta Business Manager" },
                  { text: "Vá para Gerenciador de Eventos (Events Manager)" },
                  { text: "Selecione seu Pixel na lista" },
                  { text: "Copie o Pixel ID exibido no topo da página" },
                ]}
                link={{ url: "https://business.facebook.com/events_manager2", label: "Abrir Meta Business Manager" }}
              />
            </div>

            <div>
              <Label className="text-foreground">Access Token {editingId && "(deixe vazio para manter)"}</Label>
              <Input value={form.access_token} onChange={e => setForm(f => ({ ...f, access_token: e.target.value }))} type="password" placeholder="EAAxxxxxxx..." />
              <InlineHelp
                label="Como obter o Access Token?"
                steps={[
                  { text: "No Meta Business Manager, abra o Gerenciador de Eventos" },
                  { text: "Clique em Configurações (Settings)" },
                  { text: "Role até API de Conversões (Conversions API)" },
                  { text: "Clique em Gerar Token (Generate Access Token)" },
                  { text: "Copie o token gerado — ele só aparece uma vez" },
                ]}
                note="O Access Token é usado para enviar eventos server-side via Conversions API. Guarde-o com segurança."
                link={{ url: "https://business.facebook.com/events_manager2", label: "Abrir Events Manager" }}
              />
            </div>

            <div>
              <Label className="text-foreground">Test Event Code (opcional)</Label>
              <Input value={form.test_event_code} onChange={e => setForm(f => ({ ...f, test_event_code: e.target.value }))} placeholder="TEST12345" />
              <InlineHelp
                label="Onde encontrar o Test Event Code?"
                steps={[
                  { text: "No Events Manager, vá até Test Events" },
                  { text: "O código de teste aparece no topo da seção" },
                  { text: "Copie e cole aqui para testar sem afetar dados reais" },
                ]}
                note="Use o Test Event Code para validar seu tracking antes de ir para produção. Ele expira após algumas horas."
              />
            </div>

            {!editingId && (
              <div>
                <Label className="text-foreground">Domínio (opcional)</Label>
                <Input value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))} placeholder="meusite.com.br" />
                <InlineHelp
                  label="O que é o domínio?"
                  note="O domínio é o endereço do seu site onde o pixel será instalado. Exemplo: meusite.com.br — sem https:// ou www."
                />
              </div>
            )}

            <Button onClick={handleSave} disabled={saving} className="w-full bg-primary text-primary-foreground">
              {saving ? "Salvando..." : editingId ? "Atualizar" : "Criar Pixel"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : !pixels?.length ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Inbox className="w-16 h-16 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-1">Nenhum pixel configurado</h3>
          <p className="text-sm text-center max-w-sm">Adicione um pixel Meta para começar a enviar eventos server-side.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {pixels.map((pixel) => (
            <div key={pixel.id} className="glass-card p-5 flex items-center justify-between hover:glow-primary transition-shadow duration-300">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <MonitorDot className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium text-foreground">{pixel.name}</h3>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">Meta Ads</span>
                    <span className="text-xs text-muted-foreground">ID: {pixel.pixel_id}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  {pixel.is_active ? <CheckCircle className="w-4 h-4 text-success" /> : <AlertCircle className="w-4 h-4 text-muted-foreground" />}
                  <span className={`text-xs font-medium ${pixel.is_active ? "text-success" : "text-muted-foreground"}`}>
                    {pixel.is_active ? "ativo" : "inativo"}
                  </span>
                </div>
                {pixel.test_event_code && <span className="px-2 py-0.5 rounded-full text-xs bg-warning/10 text-warning font-medium">Modo Teste</span>}
                <Switch checked={pixel.is_active} onCheckedChange={() => handleToggle(pixel.id, pixel.is_active)} />
                <button onClick={() => startEdit(pixel)} className="text-muted-foreground hover:text-foreground"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => handleDelete(pixel.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
