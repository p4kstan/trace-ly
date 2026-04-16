import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Layers, Info } from "lucide-react";
import { useWorkspace } from "@/hooks/use-tracking-data";
import GoogleAdsAccountsManager from "@/components/accounts/GoogleAdsAccountsManager";
import MetaAccountsManager from "@/components/accounts/MetaAccountsManager";

export default function ConnectedAccounts() {
  const { data: workspace } = useWorkspace();

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gradient-primary flex items-center gap-2">
          <Layers className="w-6 h-6 text-primary" /> Contas Conectadas
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie múltiplas contas de anúncio do Google Ads e Meta. Roteie eventos por domínio ou tag.
        </p>
      </div>

      <Card className="glass-card border-primary/20">
        <CardContent className="p-4 flex items-start gap-3">
          <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong className="text-foreground">Como funciona o roteamento:</strong></p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li><strong>Todos eventos:</strong> a conta recebe tudo (comportamento padrão).</li>
              <li><strong>Por domínio:</strong> só recebe eventos onde a URL bate com os domínios configurados.</li>
              <li><strong>Por tag:</strong> só recebe eventos com <code className="text-primary">account_tag</code> correspondente no payload do SDK.</li>
              <li>Se nenhuma conta bater, o evento vai pra conta marcada como <strong className="text-primary">Padrão</strong>.</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="google" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="google">Google Ads</TabsTrigger>
          <TabsTrigger value="meta">Meta / Facebook</TabsTrigger>
        </TabsList>
        <TabsContent value="google" className="mt-4">
          <GoogleAdsAccountsManager workspaceId={workspace?.id || null} />
        </TabsContent>
        <TabsContent value="meta" className="mt-4">
          <MetaAccountsManager workspaceId={workspace?.id || null} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
