import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Search, Filter, Download, Inbox, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useWorkspace, useEvents } from "@/hooks/use-tracking-data";
import { EmptyState } from "@/components/shared/EmptyState";
import { ROWS_PER_PAGE } from "@/lib/constants";

type StatusFilter = "all" | "delivered" | "pending" | "failed" | "skipped";
type SourceFilter = string;
type EventFilter = string;

export default function EventLogs() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [eventFilter, setEventFilter] = useState<EventFilter>("all");
  const [dedupOnly, setDedupOnly] = useState<"all" | "yes" | "no">("all");

  const { data: workspace } = useWorkspace();
  const { data: events, isLoading } = useEvents(workspace?.id, 500);

  // Distinct values for selects
  const { sources, eventNames } = useMemo(() => {
    const s = new Set<string>();
    const n = new Set<string>();
    (events || []).forEach((e) => {
      if (e.source) s.add(e.source);
      if (e.event_name) n.add(e.event_name);
    });
    return { sources: Array.from(s).sort(), eventNames: Array.from(n).sort() };
  }, [events]);

  const filtered = useMemo(() => {
    return (events || []).filter((e) => {
      // search
      const term = search.toLowerCase();
      if (
        term &&
        !e.event_name.toLowerCase().includes(term) &&
        !(e.source || "").toLowerCase().includes(term) &&
        !e.id.toLowerCase().includes(term)
      ) {
        return false;
      }
      if (statusFilter !== "all" && e.processing_status !== statusFilter) return false;
      if (sourceFilter !== "all" && (e.source || "") !== sourceFilter) return false;
      if (eventFilter !== "all" && e.event_name !== eventFilter) return false;
      if (dedupOnly === "yes" && !e.deduplication_key) return false;
      if (dedupOnly === "no" && e.deduplication_key) return false;
      return true;
    });
  }, [events, search, statusFilter, sourceFilter, eventFilter, dedupOnly]);

  const totalPages = Math.ceil(filtered.length / ROWS_PER_PAGE);
  const paginatedEvents = filtered.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);

  const activeFilters = [
    statusFilter !== "all" && { key: "status", label: `Status: ${statusFilter}`, clear: () => setStatusFilter("all") },
    sourceFilter !== "all" && { key: "source", label: `Source: ${sourceFilter}`, clear: () => setSourceFilter("all") },
    eventFilter !== "all" && { key: "event", label: `Evento: ${eventFilter}`, clear: () => setEventFilter("all") },
    dedupOnly !== "all" && { key: "dedup", label: `Dedup: ${dedupOnly === "yes" ? "sim" : "não"}`, clear: () => setDedupOnly("all") },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  const clearAll = () => {
    setStatusFilter("all");
    setSourceFilter("all");
    setEventFilter("all");
    setDedupOnly("all");
    setPage(0);
  };

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
            placeholder="Buscar por evento, source ou ID..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-10 bg-card border-border text-foreground placeholder:text-muted-foreground"
            aria-label="Buscar eventos"
          />
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="border-border text-muted-foreground" aria-label="Filtros">
              <Filter className="w-4 h-4 mr-2" />
              Filtros
              {activeFilters.length > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">{activeFilters.length}</Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-4" align="end">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm text-foreground">Filtrar eventos</h4>
                {activeFilters.length > 0 && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearAll}>Limpar</Button>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select value={statusFilter} onValueChange={(v: StatusFilter) => { setStatusFilter(v); setPage(0); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="skipped">Skipped</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Source</Label>
                <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(0); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {sources.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Nome do evento</Label>
                <Select value={eventFilter} onValueChange={(v) => { setEventFilter(v); setPage(0); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value="all">Todos</SelectItem>
                    {eventNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Deduplicação</Label>
                <Select value={dedupOnly} onValueChange={(v: "all" | "yes" | "no") => { setDedupOnly(v); setPage(0); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="yes">Apenas com dedup</SelectItem>
                    <SelectItem value="no">Sem dedup</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {activeFilters.map((f) => (
            <Badge key={f.key} variant="secondary" className="gap-1.5 pl-2 pr-1 py-1">
              {f.label}
              <button
                onClick={f.clear}
                className="rounded-sm hover:bg-muted-foreground/20 p-0.5"
                aria-label={`Remover filtro ${f.label}`}
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="surface-elevated overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <Skeleton key={i} className="h-10 rounded" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={search || activeFilters.length > 0 ? "Nenhum evento encontrado" : "Nenhum evento registrado"}
            description={search || activeFilters.length > 0 ? "Tente ajustar os filtros ou termo de busca." : "Instale o SDK no seu site e os eventos aparecerão aqui."}
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
