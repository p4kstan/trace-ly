import { useState } from "react";
import { ChevronLeft, ChevronRight, Search, Filter, Download, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace, useEvents } from "@/hooks/use-tracking-data";
import { EmptyState } from "@/components/shared/EmptyState";
import { ROWS_PER_PAGE } from "@/lib/constants";

export default function EventLogs() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const { data: workspace } = useWorkspace();
  const { data: events, isLoading } = useEvents(workspace?.id, 500);

  const filtered = (events || []).filter(
    (e) =>
      e.event_name.toLowerCase().includes(search.toLowerCase()) ||
      (e.source || "").toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(filtered.length / ROWS_PER_PAGE);
  const paginatedEvents = filtered.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Logs de Eventos</h1>
          <p className="text-muted-foreground text-sm mt-1">Todos os eventos rastreados com detalhes de payload</p>
        </div>
        <Button variant="outline" className="border-border text-muted-foreground hover:text-foreground" aria-label="Exportar eventos">
          <Download className="w-4 h-4 mr-2" />
          Exportar
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Buscar eventos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-card border-border text-foreground placeholder:text-muted-foreground"
            aria-label="Buscar eventos"
          />
        </div>
        <Button variant="outline" className="border-border text-muted-foreground" aria-label="Filtros">
          <Filter className="w-4 h-4 mr-2" />
          Filtros
        </Button>
      </div>

      <div className="surface-elevated overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <Skeleton key={i} className="h-10 rounded" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={search ? "Nenhum evento encontrado" : "Nenhum evento registrado"}
            description={search ? "Tente buscar com outro termo." : "Instale o SDK no seu site e os eventos aparecerão aqui."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b border-border bg-muted/30">
                  <th className="text-left py-3 px-4 font-medium text-[11px] uppercase tracking-wider">ID</th>
                  <th className="text-left py-3 px-4 font-medium text-[11px] uppercase tracking-wider">Evento</th>
                  <th className="text-left py-3 px-4 font-medium text-[11px] uppercase tracking-wider">Source</th>
                  <th className="text-left py-3 px-4 font-medium text-[11px] uppercase tracking-wider">Status</th>
                  <th className="text-left py-3 px-4 font-medium text-[11px] uppercase tracking-wider hidden md:table-cell">Valor</th>
                  <th className="text-left py-3 px-4 font-medium text-[11px] uppercase tracking-wider hidden lg:table-cell">Dedup</th>
                  <th className="text-left py-3 px-4 font-medium text-[11px] uppercase tracking-wider">Tempo</th>
                </tr>
              </thead>
              <tbody>
                {paginatedEvents.map((evt) => {
                  const customData = evt.custom_data_json as Record<string, unknown> | null;
                  const value = customData?.value;
                  const hasDedupKey = !!evt.deduplication_key;
                  return (
                    <tr key={evt.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{evt.id.substring(0, 8)}</td>
                      <td className="py-3 px-4 font-medium text-foreground">{evt.event_name}</td>
                      <td className="py-3 px-4 text-muted-foreground">{evt.source || "SDK"}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          evt.processing_status === "delivered" ? "bg-success/10 text-success" :
                          evt.processing_status === "pending" ? "bg-warning/10 text-warning" :
                          evt.processing_status === "failed" ? "bg-destructive/10 text-destructive" :
                          "bg-muted/10 text-muted-foreground"
                        }`}>
                          {evt.processing_status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-foreground tabular-nums hidden md:table-cell">
                        {typeof value === "number" ? `R$ ${Number(value).toLocaleString("pt-BR")}` : "—"}
                      </td>
                      <td className="py-3 px-4 hidden lg:table-cell">
                        {hasDedupKey && <span className="px-2 py-0.5 rounded-full text-xs bg-accent/10 text-accent font-medium">dedup</span>}
                      </td>
                      <td className="py-3 px-4 text-xs text-muted-foreground tabular-nums">
                        {new Date(evt.created_at).toLocaleString("pt-BR")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <span className="text-xs text-muted-foreground tabular-nums">{filtered.length} eventos • Página {page + 1} de {totalPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} aria-label="Página anterior">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} aria-label="Próxima página">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
