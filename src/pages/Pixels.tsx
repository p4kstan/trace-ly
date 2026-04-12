import { MonitorDot, Plus, MoreVertical, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const pixels = [
  { id: 1, name: "Meta Pixel - Main", platform: "Meta Ads", pixelId: "847291038274", status: "active", events: 12480 },
  { id: 2, name: "Google Ads - Conversion", platform: "Google Ads", pixelId: "AW-123456789", status: "active", events: 8930 },
  { id: 3, name: "TikTok Pixel", platform: "TikTok Ads", pixelId: "C5H8F92KL1", status: "inactive", events: 0 },
  { id: 4, name: "GA4 Property", platform: "Google Analytics", pixelId: "G-ABC123DEF", status: "active", events: 34200 },
  { id: 5, name: "Meta Pixel - Retargeting", platform: "Meta Ads", pixelId: "938472619384", status: "active", events: 5670 },
];

const platformColors: Record<string, string> = {
  "Meta Ads": "bg-primary/10 text-primary",
  "Google Ads": "bg-warning/10 text-warning",
  "TikTok Ads": "bg-accent/10 text-accent",
  "Google Analytics": "bg-success/10 text-success",
};

export default function Pixels() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pixel Manager</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your tracking pixels</p>
        </div>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90 glow-primary">
          <Plus className="w-4 h-4 mr-2" />
          Add Pixel
        </Button>
      </div>

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
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${platformColors[pixel.platform] || "bg-muted text-muted-foreground"}`}>
                    {pixel.platform}
                  </span>
                  <span className="text-xs text-muted-foreground">ID: {pixel.pixelId}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-sm font-medium text-foreground">{pixel.events.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">events</p>
              </div>
              <div className="flex items-center gap-1.5">
                {pixel.status === "active" ? (
                  <CheckCircle className="w-4 h-4 text-success" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-muted-foreground" />
                )}
                <span className={`text-xs font-medium ${pixel.status === "active" ? "text-success" : "text-muted-foreground"}`}>
                  {pixel.status}
                </span>
              </div>
              <button className="text-muted-foreground hover:text-foreground transition-colors">
                <MoreVertical className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
