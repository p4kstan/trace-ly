import { useState } from "react";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { useAIActionsLog, useRollbackAction } from "@/hooks/api/use-google-ads-recommendations";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Undo2, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";

const statusVariant: Record<string, any> = {
  pending: "outline",
  approved: "secondary",
  applied: "default",
  failed: "destructive",
  rolled_back: "outline",
};

export default function AIActionsLog() {
  const { data: workspace } = useWorkspace();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: rows, isLoading } = useAIActionsLog(workspace?.id, statusFilter === "all" ? undefined : statusFilter);
  const rollback = useRollbackAction();

  const handleRollback = async (id: string) => {
    try {
      await rollback.mutateAsync(id);
      toast.success("Rollback aplicado");
    } catch (e: any) {
      toast.error(e.message || "Falha no rollback");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Histórico de Ações AI</h1>
          <p className="text-sm text-muted-foreground mt-1">Auditoria de todas as recomendações aplicadas pelo Co-Pilot.</p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="applied">Aplicado</SelectItem>
            <SelectItem value="failed">Falhou</SelectItem>
            <SelectItem value="rolled_back">Revertido</SelectItem>
            <SelectItem value="approved">Aprovado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : !rows || rows.length === 0 ? (
        <div className="surface-elevated p-8 text-center text-muted-foreground text-sm">
          Nenhuma ação registrada ainda.
        </div>
      ) : (
        <div className="surface-elevated divide-y divide-border/30">
          {rows.map((r: any) => {
            const isOpen = expanded === r.id;
            return (
              <div key={r.id} className="p-4">
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpanded(isOpen ? null : r.id)}>
                  <Badge variant={statusVariant[r.status] || "outline"} className="text-[10px]">{r.status}</Badge>
                  <Badge variant="outline" className="text-[10px]">{r.target_platform}</Badge>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {format(new Date(r.created_at), "dd/MM HH:mm")}
                  </span>
                  <span className="text-sm flex-1 truncate text-foreground">
                    <span className="font-medium">{r.action_type}</span>
                    {r.target_campaign_name && <span className="text-muted-foreground"> · {r.target_campaign_name}</span>}
                  </span>
                  {r.status === "applied" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => { e.stopPropagation(); handleRollback(r.id); }}
                      disabled={rollback.isPending}
                    >
                      <Undo2 className="w-3 h-3 mr-1" /> Rollback
                    </Button>
                  )}
                  {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
                {isOpen && (
                  <div className="mt-3 pl-4 space-y-3 text-xs">
                    {r.diagnosis && (
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground mb-1">Diagnóstico</p>
                        <p className="text-foreground">{r.diagnosis}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground mb-1">Mutation</p>
                      <pre className="bg-muted/40 rounded p-2 overflow-auto max-h-32 font-mono text-[11px]">
{JSON.stringify(r.mutation_payload, null, 2)}
                      </pre>
                    </div>
                    {r.mutation_response && (
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground mb-1">Resposta</p>
                        <pre className="bg-muted/40 rounded p-2 overflow-auto max-h-32 font-mono text-[11px]">
{JSON.stringify(r.mutation_response, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
