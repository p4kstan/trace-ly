import { Card, CardContent } from "@/components/ui/card";
import { Music2, Construction } from "lucide-react";

export default function TikTokAdsCampaigns() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gradient-primary flex items-center gap-2">
          <Music2 className="w-6 h-6 text-primary" /> Campanhas TikTok Ads
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Visualize campanhas, ad groups e ads do TikTok Ads em tempo real
        </p>
      </div>

      <Card className="glass-card">
        <CardContent className="p-12 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <Construction className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-lg font-semibold">Em breve</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            O dashboard de campanhas do TikTok Ads está em desenvolvimento. Em breve você
            poderá acompanhar campanhas, criativos, CPA e ROAS da TikTok Marketing API direto aqui.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
