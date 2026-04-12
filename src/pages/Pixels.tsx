import { MonitorDot, Plus, MoreVertical, CheckCircle, AlertCircle, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace, useMetaPixels } from "@/hooks/use-tracking-data";
import { Skeleton } from "@/components/ui/skeleton";

const platformColors: Record<string, string> = {
  "Meta Ads": "bg-primary/10 text-primary",
  "Google Ads": "bg-warning/10 text-warning",
  "TikTok Ads": "bg-accent/10 text-accent",
  "Google Analytics": "bg-success/10 text-success",
};

export default function Pixels() {
  const { data: workspace } = useWorkspace();
  const { data: pixels, isLoading } = useMetaPixels(workspace?.id);

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

      {isLoading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : !pixels?.length ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Inbox className="w-16 h-16 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-1">Nenhum pixel configurado</h3>
          <p className="text-sm text-center max-w-sm">
            Adicione um pixel Meta, Google ou TikTok para começar a enviar eventos server-side.
          </p>
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
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${platformColors["Meta Ads"]}`}>
                      Meta Ads
                    </span>
                    <span className="text-xs text-muted-foreground">ID: {pixel.pixel_id}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-1.5">
                  {pixel.is_active ? (
                    <CheckCircle className="w-4 h-4 text-success" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span className={`text-xs font-medium ${pixel.is_active ? "text-success" : "text-muted-foreground"}`}>
                    {pixel.is_active ? "active" : "inactive"}
                  </span>
                </div>
                {pixel.test_event_code && (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-warning/10 text-warning font-medium">
                    Test Mode
                  </span>
                )}
                <button className="text-muted-foreground hover:text-foreground transition-colors">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
