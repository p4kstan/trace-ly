import { Card, CardContent } from "@/components/ui/card";
import { Megaphone, Construction } from "lucide-react";

export default function FacebookAdsCampaigns() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gradient-primary flex items-center gap-2">
          <Megaphone className="w-6 h-6 text-primary" /> Campanhas Facebook Ads
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Visualize campanhas, conjuntos de anúncios e anúncios da Meta Ads em tempo real
        </p>
      </div>

      <Card className="glass-card">
        <CardContent className="p-12 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <Construction className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-lg font-semibold">Em breve</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            O dashboard de campanhas do Facebook Ads está em desenvolvimento. Em breve você
            poderá visualizar campanhas, conjuntos, anúncios, ROAS e métricas da Meta direto aqui.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
