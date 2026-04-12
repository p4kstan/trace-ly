import { CheckCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

const integrations = [
  { name: "Meta Ads", description: "Conversions API (CAPI) para eventos server-side", connected: true, logo: "📘" },
  { name: "Google Ads", description: "Offline Conversion Import via API", connected: true, logo: "🔍" },
  { name: "TikTok Ads", description: "Events API para tracking server-side", connected: false, logo: "🎵" },
  { name: "Google Analytics 4", description: "Measurement Protocol para eventos server-side", connected: true, logo: "📊" },
  { name: "Shopify", description: "Webhooks para orders, checkouts e customers", connected: false, logo: "🛒" },
  { name: "WooCommerce", description: "Plugin WordPress para tracking automático", connected: false, logo: "🔌" },
];

export default function Integrations() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Integrations</h1>
        <p className="text-muted-foreground text-sm mt-1">Connect your ad platforms and e-commerce tools</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {integrations.map((int) => (
          <div key={int.name} className="glass-card p-5 flex items-center justify-between hover:glow-primary transition-shadow duration-300">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-2xl">
                {int.logo}
              </div>
              <div>
                <h3 className="font-medium text-foreground">{int.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{int.description}</p>
              </div>
            </div>
            {int.connected ? (
              <div className="flex items-center gap-2 text-success">
                <CheckCircle className="w-4 h-4" />
                <span className="text-xs font-medium">Connected</span>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="border-border text-muted-foreground hover:text-foreground hover:border-primary">
                Connect
                <ExternalLink className="w-3 h-3 ml-1.5" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
