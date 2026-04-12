import { useState } from "react";
import { Key, Plus, Copy, Trash2, CheckCircle, AlertCircle, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkspace, useApiKeys } from "@/hooks/use-tracking-data";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function generatePublicKey() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "pk_";
  for (let i = 0; i < 32; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

export default function ApiKeys() {
  const { data: workspace } = useWorkspace();
  const { data: keys, isLoading } = useApiKeys(workspace?.id);
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("Default Key");
  const [saving, setSaving] = useState(false);
  const [newKey, setNewKey] = useState("");

  const handleCreate = async () => {
    if (!workspace?.id || !name) return;
    setSaving(true);
    const pk = generatePublicKey();
    const { error } = await supabase.from("api_keys").insert({
      workspace_id: workspace.id,
      name,
      public_key: pk,
      secret_key_hash: "n/a",
      status: "active",
    });
    if (error) toast.error(error.message);
    else {
      setNewKey(pk);
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("API Key criada!");
    }
    setSaving(false);
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("Revogar esta chave?")) return;
    await supabase.from("api_keys").update({ status: "revoked" }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    toast.success("Chave revogada");
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success("Copiado!");
  };

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">API Keys</h1>
          <p className="text-muted-foreground text-sm mt-1">Gerencie suas chaves de autenticação do SDK</p>
        </div>
        <Button onClick={() => { setShowForm(true); setNewKey(""); }} className="bg-primary text-primary-foreground hover:bg-primary/90 glow-primary">
          <Plus className="w-4 h-4 mr-2" /> Nova Key
        </Button>
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle className="text-foreground">Gerar API Key</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label className="text-foreground">Nome</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
            {newKey ? (
              <div className="space-y-2">
                <p className="text-sm text-warning">⚠️ Copie esta chave agora. Ela não será exibida novamente.</p>
                <div className="bg-muted p-3 rounded-lg font-mono text-sm text-foreground break-all flex items-center gap-2">
                  <span className="flex-1">{newKey}</span>
                  <button onClick={() => copyKey(newKey)}><Copy className="w-4 h-4 text-muted-foreground hover:text-foreground" /></button>
                </div>
                <Button onClick={() => setShowForm(false)} className="w-full">Fechar</Button>
              </div>
            ) : (
              <Button onClick={handleCreate} disabled={saving} className="w-full bg-primary text-primary-foreground">
                {saving ? "Gerando..." : "Gerar Key"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Snippet section */}
      {keys && keys.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-medium text-foreground mb-3">📋 Snippet de Instalação</h3>
          <div className="bg-muted p-4 rounded-lg relative">
            <pre className="text-xs text-foreground overflow-x-auto whitespace-pre-wrap font-mono">{`<script>
  (function(){
    var ct=window.capitrack=function(){ct.q.push(arguments)};ct.q=[];
    ct("init","${keys.find(k => k.status === "active")?.public_key || "pk_xxxxx"}",{endpoint:"${supabaseUrl}/functions/v1/track"});
    ct("page");
    var s=document.createElement("script");
    s.src="${window.location.origin}/sdk.js";
    s.async=true;
    document.head.appendChild(s);
  })();
</script>`}</pre>
            <button onClick={() => { navigator.clipboard.writeText("copied"); toast.success("Snippet copiado!"); }} className="absolute top-2 right-2 p-1.5 bg-card rounded hover:bg-accent">
              <Copy className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">{[1, 2].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : !keys?.length ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Inbox className="w-16 h-16 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-1">Nenhuma API Key</h3>
          <p className="text-sm">Crie uma chave para autenticar o SDK.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {keys.map((key) => (
            <div key={key.id} className="glass-card p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Key className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-medium text-foreground text-sm">{key.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <code className="text-xs text-muted-foreground">{key.public_key.substring(0, 12)}...{key.public_key.substring(key.public_key.length - 4)}</code>
                    <button onClick={() => copyKey(key.public_key)}><Copy className="w-3 h-3 text-muted-foreground hover:text-foreground" /></button>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {key.last_used_at && <span className="text-xs text-muted-foreground">Usado: {new Date(key.last_used_at).toLocaleDateString()}</span>}
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${key.status === "active" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                  {key.status}
                </span>
                {key.status === "active" && (
                  <button onClick={() => handleRevoke(key.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
