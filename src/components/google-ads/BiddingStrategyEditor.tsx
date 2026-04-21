/**
 * Bidding strategy editor — switches between MAXIMIZE_CONVERSIONS, TARGET_CPA,
 * TARGET_ROAS, MANUAL_CPC, MAXIMIZE_CLICKS, MAXIMIZE_CONVERSION_VALUE.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { BiddingStrategy, CampaignEdits } from "@/hooks/api/use-campaign-edits";

const OPTIONS: Array<{ value: BiddingStrategy; label: string; help: string }> = [
  { value: "MAXIMIZE_CONVERSIONS", label: "Maximizar conversões", help: "Google define os lances pra obter o máximo de conversões dentro do orçamento." },
  { value: "TARGET_CPA", label: "CPA alvo", help: "Google ajusta lances pra atingir um custo médio por conversão." },
  { value: "TARGET_ROAS", label: "ROAS alvo", help: "Google ajusta lances pra atingir o retorno sobre investimento (receita ÷ custo)." },
  { value: "MAXIMIZE_CONVERSION_VALUE", label: "Maximizar valor de conversões", help: "Maximiza receita atribuída dentro do orçamento." },
  { value: "MAXIMIZE_CLICKS", label: "Maximizar cliques", help: "Direciona o máximo de cliques possível com o orçamento." },
  { value: "MANUAL_CPC", label: "CPC manual", help: "Você define os lances manualmente em cada palavra-chave." },
];

interface Props {
  edits: CampaignEdits;
  currentStrategy?: string | null;
}

export function BiddingStrategyEditor({ edits, currentStrategy }: Props) {
  const [strategy, setStrategy] = useState<BiddingStrategy>((currentStrategy as BiddingStrategy) || "MAXIMIZE_CONVERSIONS");
  const [cpa, setCpa] = useState("");
  const [roas, setRoas] = useState("");

  const needsCpa = strategy === "TARGET_CPA";
  const needsRoas = strategy === "TARGET_ROAS";
  const help = OPTIONS.find((o) => o.value === strategy)?.help || "";

  const canSave = (!needsCpa || Number(cpa) > 0) && (!needsRoas || Number(roas) > 0);

  return (
    <Card className="glass-card">
      <CardHeader className="py-3">
        <CardTitle className="text-sm">Estratégia de lances</CardTitle>
        <p className="text-[11px] text-muted-foreground mt-1">
          Atual: <strong>{currentStrategy || "—"}</strong>. Mude com cuidado — afeta toda a campanha.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <Label className="text-xs">Nova estratégia</Label>
            <Select value={strategy} onValueChange={(v) => setStrategy(v as BiddingStrategy)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground mt-1">{help}</p>
          </div>
          {needsCpa && (
            <div>
              <Label className="text-xs">CPA alvo (R$)</Label>
              <Input type="number" step="0.01" min="0.01" value={cpa} onChange={(e) => setCpa(e.target.value)} placeholder="Ex: 25.00" className="mt-1" />
            </div>
          )}
          {needsRoas && (
            <div>
              <Label className="text-xs">ROAS alvo (ex: 3.0 = 300%)</Label>
              <Input type="number" step="0.1" min="0.1" value={roas} onChange={(e) => setRoas(e.target.value)} placeholder="Ex: 3.0" className="mt-1" />
            </div>
          )}
        </div>
        <Button
          size="sm" disabled={!canSave || edits.updateBiddingStrategy.isPending}
          onClick={() => edits.updateBiddingStrategy.mutate({
            strategy,
            target_cpa_brl: needsCpa ? Number(cpa) : undefined,
            target_roas: needsRoas ? Number(roas) : undefined,
          })}
        >
          {edits.updateBiddingStrategy.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
          Aplicar estratégia
        </Button>
      </CardContent>
    </Card>
  );
}
