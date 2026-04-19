/**
 * DestinationDialog — modal to create a new conversion destination
 * (Google Ads / TikTok / GA4 / Firebase). Provider field metadata moved
 * to a constants module so it can be shared with other components.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useCreateDestination } from "@/hooks/api/use-integrations";
import { AD_PROVIDERS } from "./ad-providers";

interface DestinationDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  workspaceId: string;
}

export function DestinationDialog({ open, onOpenChange, workspaceId }: DestinationDialogProps) {
  const [provider, setProvider] = useState("google_ads");
  const [displayName, setDisplayName] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});

  const config = AD_PROVIDERS[provider];

  const mutation = useCreateDestination(workspaceId, () => {
    onOpenChange(false);
    setFields({});
    setDisplayName("");
    toast.success(`${config.label} adicionado com sucesso!`);
  });

  const handleSubmit = (): void => {
    const configJson: Record<string, string> = {};
    if (fields.customer_id) configJson.customer_id = fields.customer_id.replace(/-/g, "");
    if (fields.developer_token) configJson.developer_token = fields.developer_token;
    if (fields.debug_mode) configJson.debug_mode = fields.debug_mode;

    mutation.mutate({
      provider,
      destinationId: fields.destination_id,
      displayName: displayName || `${config.label} - ${fields.destination_id}`,
      accessToken: fields.access_token,
      testEventCode: fields.test_event_code,
      configJson,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-2xl flex-col overflow-hidden border-border/50 p-0">
        <DialogHeader className="shrink-0 px-4 pb-0 pt-4 sm:px-6 sm:pt-6">
          <DialogTitle className="text-foreground">Adicionar Destino de Conversão</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="space-y-2">
            <Label>Plataforma</Label>
            <Select value={provider} onValueChange={(v) => { setProvider(v); setFields({}); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(AD_PROVIDERS).filter(([k]) => k !== "meta").map(([key, p]) => (
                  <SelectItem key={key} value={key}>
                    <span className="flex items-center gap-2">{p.emoji} {p.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Nome de exibição</Label>
            <Input
              placeholder={`Ex: ${config.label} Principal`}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          {config.fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label>{f.label}</Label>
              <Input
                type={f.secret ? "password" : "text"}
                placeholder={f.placeholder}
                value={fields[f.key] || ""}
                onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
              />
              {f.help && (
                <div className="text-[11px] text-muted-foreground leading-relaxed flex items-start gap-1.5">
                  <span className="text-primary mt-0.5 shrink-0">📍</span>
                  <span className="whitespace-pre-line">
                    {f.help}
                    {f.helpLink && (
                      <>
                        {" — "}
                        <a
                          href={f.helpLink.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline inline-flex items-center gap-0.5"
                        >
                          {f.helpLink.label} ↗
                        </a>
                      </>
                    )}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="shrink-0 border-t border-border bg-background px-4 py-4 sm:px-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending} className="gap-2">
            <Plus className="w-4 h-4" />
            {mutation.isPending ? "Salvando..." : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
