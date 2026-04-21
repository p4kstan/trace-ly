/**
 * Small inline button to duplicate an ad or keyword.
 * The duplicate is created as PAUSED so the user can review before activating.
 */
import { Button } from "@/components/ui/button";
import { Copy, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function DuplicateButton({
  pending, onClick, label = "Duplicar (cria pausado)",
}: { pending: boolean; onClick: () => void; label?: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={pending} onClick={onClick}>
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
