/**
 * Inline form to add a campaign-level negative keyword.
 * Used directly inside the "Negativas" tab.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus } from "lucide-react";
import type { CampaignEdits } from "@/hooks/api/use-campaign-edits";

export function AddNegativeKeywordForm({ edits }: { edits: CampaignEdits }) {
  const [text, setText] = useState("");
  const [matchType, setMatchType] = useState<"EXACT" | "PHRASE" | "BROAD">("PHRASE");

  const submit = () => {
    if (!text.trim()) return;
    edits.addNegative.mutate(
      { keyword_text: text, match_type: matchType, level: "campaign" },
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
      <Button size="sm" className="h-8" onClick={submit} disabled={edits.addNegative.isPending || !text.trim()}>
        {edits.addNegative.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
        Adicionar negativa
      </Button>
    </div>
  );
}
