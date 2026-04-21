/**
 * Inline forms to create new keywords and ad groups inside the campaign.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus } from "lucide-react";
import type { CampaignEdits } from "@/hooks/api/use-campaign-edits";

type MatchType = "EXACT" | "PHRASE" | "BROAD";

export function CreateKeywordForm({
  edits, adGroups,
}: { edits: CampaignEdits; adGroups: Array<{ id: string; name: string }> }) {
  const [text, setText] = useState("");
  const [matchType, setMatchType] = useState<MatchType>("PHRASE");
  const [agId, setAgId] = useState<string>(adGroups[0]?.id || "");
  const [cpc, setCpc] = useState("");

  const submit = () => {
    if (!text.trim() || !agId) return;
    edits.createKeyword.mutate(
      {
        ad_group_id: agId,
        keyword_text: text.trim(),
        match_type: matchType,
        cpc_brl: cpc ? Number(cpc) : undefined,
      },
      { onSuccess: () => { setText(""); setCpc(""); } },
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 border-b border-border/40 bg-muted/10">
      <Input
        value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder='Nova palavra-chave (ex: "marmita fitness sp")'
        className="flex-1 min-w-[200px] h-8 text-xs"
      />
      <Select value={matchType} onValueChange={(v) => setMatchType(v as MatchType)}>
        <SelectTrigger className="w-[110px] h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="BROAD">Ampla</SelectItem>
          <SelectItem value="PHRASE">Frase</SelectItem>
          <SelectItem value="EXACT">Exata</SelectItem>
        </SelectContent>
      </Select>
      <Select value={agId} onValueChange={setAgId}>
        <SelectTrigger className="w-[200px] h-8 text-xs"><SelectValue placeholder="Grupo" /></SelectTrigger>
        <SelectContent>
          {adGroups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Input
        type="number" step="0.01" min="0" value={cpc} onChange={(e) => setCpc(e.target.value)}
        placeholder="CPC (R$, opcional)"
        className="w-[140px] h-8 text-xs"
      />
      <Button size="sm" className="h-8" onClick={submit} disabled={edits.createKeyword.isPending || !text.trim() || !agId}>
        {edits.createKeyword.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
        Criar palavra-chave
      </Button>
    </div>
  );
}

export function CreateAdGroupForm({ edits }: { edits: CampaignEdits }) {
  const [name, setName] = useState("");
  const [cpc, setCpc] = useState("");

  const submit = () => {
    if (!name.trim()) return;
    edits.createAdGroup.mutate(
      { new_name: name.trim(), cpc_brl: cpc ? Number(cpc) : undefined },
      { onSuccess: () => { setName(""); setCpc(""); } },
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 border-b border-border/40 bg-muted/10">
      <Input
        value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Nome do novo grupo de anúncios"
        className="flex-1 min-w-[200px] h-8 text-xs"
      />
      <Input
        type="number" step="0.01" min="0" value={cpc} onChange={(e) => setCpc(e.target.value)}
        placeholder="CPC padrão (R$, opcional)"
        className="w-[180px] h-8 text-xs"
      />
      <Button size="sm" className="h-8" onClick={submit} disabled={edits.createAdGroup.isPending || !name.trim()}>
        {edits.createAdGroup.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
        Criar grupo
      </Button>
    </div>
  );
}
