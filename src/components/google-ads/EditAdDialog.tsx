/**
 * Edit Responsive Search Ad — opens a dialog with editable headlines (3-15)
 * and descriptions (2-4) plus final URL + paths.
 *
 * Important: Google Ads API does NOT allow updating an existing ad's text.
 * Saving creates a new ad and removes the old one (handled in the edge fn).
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { CampaignEdits } from "@/hooks/api/use-campaign-edits";

interface AdSnapshot {
  id: string;
  ad_group_id: string;
  headlines?: string[];
  descriptions?: string[];
  final_urls?: string[];
  path1?: string;
  path2?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ad: AdSnapshot | null;
  edits: CampaignEdits;
}

export function EditAdDialog({ open, onOpenChange, ad, edits }: Props) {
  const [headlines, setHeadlines] = useState<string[]>([]);
  const [descriptions, setDescriptions] = useState<string[]>([]);
  const [finalUrl, setFinalUrl] = useState("");
  const [path1, setPath1] = useState("");
  const [path2, setPath2] = useState("");

  // Reset when ad changes
  const adKey = ad?.id || "";
  const [hydratedFor, setHydratedFor] = useState("");
  if (adKey && hydratedFor !== adKey) {
    setHeadlines((ad?.headlines && ad.headlines.length >= 3) ? [...ad.headlines] : ["", "", ""]);
    setDescriptions((ad?.descriptions && ad.descriptions.length >= 2) ? [...ad.descriptions] : ["", ""]);
    setFinalUrl(ad?.final_urls?.[0] || "");
    setPath1(ad?.path1 || "");
    setPath2(ad?.path2 || "");
    setHydratedFor(adKey);
  }

  const updateAt = (arr: string[], setArr: (v: string[]) => void, i: number, v: string) => {
    const next = [...arr]; next[i] = v; setArr(next);
  };

  const validHeadlines = headlines.map((h) => h.trim()).filter(Boolean);
  const validDescriptions = descriptions.map((d) => d.trim()).filter(Boolean);
  const canSave =
    validHeadlines.length >= 3 && validHeadlines.every((h) => h.length <= 30) &&
    validDescriptions.length >= 2 && validDescriptions.every((d) => d.length <= 90) &&
    finalUrl.trim().length > 0;

  const onSave = () => {
    if (!ad || !canSave) return;
    edits.editResponsiveSearchAd.mutate(
      {
        ad_id: ad.id,
        ad_group_id: ad.ad_group_id,
        headlines: validHeadlines,
        descriptions: validDescriptions,
        final_urls: [finalUrl.trim()],
        path1: path1.trim() || undefined,
        path2: path2.trim() || undefined,
      },
      { onSuccess: () => { onOpenChange(false); setHydratedFor(""); } },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar anúncio responsivo</DialogTitle>
          <DialogDescription>
            O Google Ads não permite alterar o texto de um anúncio existente — ao salvar, criamos um novo anúncio e removemos o antigo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs">URL final</Label>
            <Input value={finalUrl} onChange={(e) => setFinalUrl(e.target.value)} placeholder="https://exemplo.com/landing" className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Caminho 1 (opcional)</Label>
              <Input value={path1} onChange={(e) => setPath1(e.target.value)} maxLength={15} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Caminho 2 (opcional)</Label>
              <Input value={path2} onChange={(e) => setPath2(e.target.value)} maxLength={15} className="mt-1" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">Títulos ({validHeadlines.length}/15) — mínimo 3, máx. 30 chars cada</Label>
              <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={headlines.length >= 15} onClick={() => setHeadlines([...headlines, ""])}>
                <Plus className="w-3 h-3 mr-1" /> Adicionar
              </Button>
            </div>
            <div className="space-y-1.5">
              {headlines.map((h, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input value={h} maxLength={30} onChange={(e) => updateAt(headlines, setHeadlines, i, e.target.value)} placeholder={`Título ${i + 1}`} />
                  <span className="text-[10px] text-muted-foreground tabular-nums w-8">{h.length}/30</span>
                  <Button size="icon" variant="ghost" className="h-7 w-7" disabled={headlines.length <= 3} onClick={() => setHeadlines(headlines.filter((_, j) => j !== i))}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">Descrições ({validDescriptions.length}/4) — mínimo 2, máx. 90 chars cada</Label>
              <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={descriptions.length >= 4} onClick={() => setDescriptions([...descriptions, ""])}>
                <Plus className="w-3 h-3 mr-1" /> Adicionar
              </Button>
            </div>
            <div className="space-y-1.5">
              {descriptions.map((d, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <Textarea value={d} maxLength={90} rows={2} onChange={(e) => updateAt(descriptions, setDescriptions, i, e.target.value)} placeholder={`Descrição ${i + 1}`} />
                  <span className="text-[10px] text-muted-foreground tabular-nums w-8 mt-2">{d.length}/90</span>
                  <Button size="icon" variant="ghost" className="h-7 w-7 mt-1" disabled={descriptions.length <= 2} onClick={() => setDescriptions(descriptions.filter((_, j) => j !== i))}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={onSave} disabled={!canSave || edits.editResponsiveSearchAd.isPending}>
            {edits.editResponsiveSearchAd.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Salvar (cria novo, remove antigo)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
