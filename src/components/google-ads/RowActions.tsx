/**
 * Small inline action controls for table rows:
 * - StatusToggle: pause/enable an ad or keyword
 * - BidEditor: popover to edit a CPC bid (keyword OR ad group)
 * - QuickNegativeButton: button to immediately exclude a search term
 * - RenameButton: popover to rename campaign / ad group
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, Pause, Play, Pencil, Ban, Type } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { CampaignEdits } from "@/hooks/api/use-campaign-edits";

export function StatusToggle({
  status, pending, onToggle,
}: { status?: string | null; pending: boolean; onToggle: (next: "ENABLED" | "PAUSED") => void }) {
  const isActive = status === "ENABLED";
  if (status === "REMOVED") return null;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={pending}
            onClick={() => onToggle(isActive ? "PAUSED" : "ENABLED")}
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : isActive ? <Pause className="w-3.5 h-3.5 text-amber-400" />
              : <Play className="w-3.5 h-3.5 text-emerald-400" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{isActive ? "Pausar" : "Ativar"}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function BidEditor({
  pending, onSave, label = "CPC máximo (R$)",
}: { pending: boolean; onSave: (cpc: number) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" className="h-7 w-7">
          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <p className="text-xs font-semibold mb-2">{label}</p>
        <div className="flex gap-2">
          <Input
            type="number" step="0.01" min="0"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder="Ex: 1.50"
            className="h-8 text-xs"
            autoFocus
          />
          <Button
            size="sm"
            className="h-8"
            disabled={pending || !val || Number(val) <= 0}
            onClick={() => {
              onSave(Number(val));
              setOpen(false);
              setVal("");
            }}
          >
            {pending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}OK
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">Define o lance máximo por clique.</p>
      </PopoverContent>
    </Popover>
  );
}

export function RenameButton({
  pending, currentName, onSave,
}: { pending: boolean; currentName?: string | null; onSave: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(currentName ?? "");
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setVal(currentName ?? ""); }}>
      <PopoverTrigger asChild>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7">
                <Type className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Renomear</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="end">
        <p className="text-xs font-semibold mb-2">Novo nome</p>
        <div className="flex gap-2">
          <Input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            className="h-8 text-xs"
            autoFocus
          />
          <Button
            size="sm" className="h-8"
            disabled={pending || !val.trim() || val.trim() === currentName}
            onClick={() => { onSave(val.trim()); setOpen(false); }}
          >
            {pending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}OK
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function QuickNegativeButton({
  edits, term,
}: { edits: CampaignEdits; term: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon" variant="ghost" className="h-7 w-7"
            disabled={edits.addNegative.isPending}
            onClick={() => edits.addNegative.mutate({
              keyword_text: term, match_type: "PHRASE", level: "campaign",
            })}
          >
            {edits.addNegative.isPending
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Ban className="w-3.5 h-3.5 text-rose-400" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Adicionar como negativa (frase) na campanha</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
