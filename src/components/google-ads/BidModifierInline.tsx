/**
 * Inline bid-modifier editor for segment rows (device, age, gender).
 * Value 1.0 = baseline; 1.2 = +20%; 0.8 = -20%.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, Percent } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  pending: boolean;
  current?: number;
  onSave: (bidModifier: number) => void;
}

export function BidModifierInline({ pending, current, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const baseline = ((current ?? 1) - 1) * 100;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setVal(baseline.toFixed(0)); }}>
      <PopoverTrigger asChild>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7">
                <Percent className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Ajustar lance (%)</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="end">
        <p className="text-xs font-semibold mb-2">Modificador de lance (%)</p>
        <div className="flex gap-2">
          <Input
            type="number" step="1" min="-90" max="900"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder="Ex: 20 ou -50"
            className="h-8 text-xs"
            autoFocus
          />
          <Button
            size="sm" className="h-8"
            disabled={pending || val === ""}
            onClick={() => {
              const pct = Number(val);
              const factor = 1 + pct / 100;
              if (factor < 0.1 || factor > 10) return;
              onSave(factor);
              setOpen(false);
            }}
          >
            {pending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}OK
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">+20 aumenta o lance em 20% pra esse segmento. -50 reduz pela metade. 0 = sem ajuste.</p>
      </PopoverContent>
    </Popover>
  );
}
