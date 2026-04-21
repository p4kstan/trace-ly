/**
 * Inline form to add a negative keyword at campaign or ad-group level.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus } from "lucide-react";
import type { CampaignEdits } from "@/hooks/api/use-campaign-edits";

interface Props {
  edits: CampaignEdits;
  /** Optional list of ad groups to enable ad-group-level negatives. */
  adGroups?: Array<{ id: string; name: string }>;
}

export function AddNegativeKeywordForm({ edits, adGroups }: Props) {
  const [text, setText] = useState("");
  const [matchType, setMatchType] = useState<"EXACT" | "PHRASE" | "BROAD">("PHRASE");
  const [scope, setScope] = useState<string>("campaign"); // "campaign" or ad_group_id

  const submit = () => {
    if (!text.trim()) return;
    const isCampaign = scope === "campaign";
    edits.addNegative.mutate(
      {
        keyword_text: text,
        match_type: matchType,
        level: isCampaign ? "campaign" : "ad_group",
        ad_group_id: isCampaign ? undefined : scope,
      },
      { onSuccess: () => setText("") },
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 border-b border-border/40 bg-muted/10">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder='Ex: "grátis", "barato", "tutorial"'
        className="flex-1 min-w-[200px] h-8 text-xs"
      />
      <Select value={matchType} onValueChange={(v) => setMatchType(v as typeof matchType)}>
        <SelectTrigger className="w-[110px] h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="BROAD">Ampla</SelectItem>
          <SelectItem value="PHRASE">Frase</SelectItem>
          <SelectItem value="EXACT">Exata</SelectItem>
        </SelectContent>
      </Select>
      {adGroups && adGroups.length > 0 && (
        <Select value={scope} onValueChange={setScope}>
          <SelectTrigger className="w-[200px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="campaign">Toda a campanha</SelectItem>
            {adGroups.map((g) => (
              <SelectItem key={g.id} value={g.id}>Grupo: {g.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Button size="sm" className="h-8" onClick={submit} disabled={edits.addNegative.isPending || !text.trim()}>
        {edits.addNegative.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
        Adicionar negativa
      </Button>
    </div>
  );
}
