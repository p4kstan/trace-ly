/**
 * Floating bar that appears when rows are selected in a table.
 * Provides bulk pause/enable / negate actions.
 */
import { Button } from "@/components/ui/button";
import { Loader2, Pause, Play, Ban, X } from "lucide-react";

interface Props {
  count: number;
  onClear: () => void;
  onPause?: () => void;
  onEnable?: () => void;
  onNegate?: () => void;
  pending?: boolean;
}

export function BulkActionBar({ count, onClear, onPause, onEnable, onNegate, pending }: Props) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-2 p-2 border-b border-border/40 bg-primary/5">
      <span className="text-xs font-semibold px-2">{count} selecionado(s)</span>
      {onPause && (
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onPause} disabled={pending}>
          {pending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Pause className="w-3 h-3 mr-1" />} Pausar
        </Button>
      )}
      {onEnable && (
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onEnable} disabled={pending}>
          {pending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Play className="w-3 h-3 mr-1" />} Ativar
        </Button>
      )}
      {onNegate && (
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onNegate} disabled={pending}>
          {pending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Ban className="w-3 h-3 mr-1" />} Negativar todos
        </Button>
      )}
      <Button size="icon" variant="ghost" className="h-7 w-7 ml-auto" onClick={onClear}>
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
