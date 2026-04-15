import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy } from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const { data: workspace, isLoading } = useWorkspace();

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado!");
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in max-w-2xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-muted-foreground text-sm mt-1">Configurações do workspace</p>
      </div>

      <div className="glass-card p-6 space-y-5">
        <h3 className="font-medium text-foreground">Workspace</h3>
        <div className="space-y-3">
          <div>
            <Label className="text-muted-foreground text-sm">Nome do Workspace</Label>
            <Input
              value={workspace?.name || ""}
              readOnly
              className="mt-1 bg-muted border-border text-foreground"
            />
          </div>
          <div>
            <Label className="text-muted-foreground text-sm">Slug</Label>
            <Input
              value={workspace?.slug || ""}
              readOnly
              className="mt-1 bg-muted border-border text-foreground font-mono text-xs"
            />
          </div>
          <div>
            <Label className="text-muted-foreground text-sm">Plano</Label>
            <Input
              value={workspace?.plan || "free"}
              readOnly
              className="mt-1 bg-muted border-border text-foreground"
            />
          </div>
          <div>
            <Label className="text-muted-foreground text-sm">Workspace ID</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                value={workspace?.id || ""}
                readOnly
                className="bg-muted border-border text-foreground font-mono text-xs"
              />
              <button
                onClick={() => workspace?.id && copyToClipboard(workspace.id)}
                className="p-2 hover:bg-muted rounded-lg"
              >
                <Copy className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card p-6 space-y-4">
        <h3 className="font-medium text-foreground">Instalação do SDK</h3>
        <p className="text-sm text-muted-foreground">
          Vá em <strong>API Keys</strong> para gerar uma chave e copiar o snippet de instalação completo.
        </p>
      </div>
    </div>
  );
}
