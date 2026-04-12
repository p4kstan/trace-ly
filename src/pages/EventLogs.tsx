import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Search, Filter, Download, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkspace, useEvents } from "@/hooks/use-tracking-data";
import { Skeleton } from "@/components/ui/skeleton";

export default function EventLogs() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const { data: workspace } = useWorkspace();
  const { data: events, isLoading } = useEvents(workspace?.id, 500);

  const filtered = (events || []).filter(
    (e) =>
      e.event_name.toLowerCase().includes(search.toLowerCase()) ||
      (e.source || "").toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginatedEvents = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Event Logs</h1>
          <p className="text-muted-foreground text-sm mt-1">All tracked events with payload details</p>
        </div>
        <Button variant="outline" className="border-border text-muted-foreground hover:text-foreground">
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search events..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-card border-border text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <Button variant="outline" className="border-border text-muted-foreground">
          <Filter className="w-4 h-4 mr-2" />
          Filters
        </Button>
      </div>

      <div className="glass-card overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 rounded" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Inbox className="w-12 h-12 mb-3" />
            <p className="text-sm">{search ? "Nenhum evento encontrado para esta busca" : "Nenhum evento registrado ainda"}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b border-border bg-muted/30">
                  <th className="text-left py-3 px-4 font-medium">ID</th>
                  <th className="text-left py-3 px-4 font-medium">Event</th>
                  <th className="text-left py-3 px-4 font-medium">Source</th>
                  <th className="text-left py-3 px-4 font-medium">Status</th>
                  <th className="text-left py-3 px-4 font-medium">Value</th>
                  <th className="text-left py-3 px-4 font-medium">Dedup</th>
                  <th className="text-left py-3 px-4 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {paginatedEvents.map((evt) => {
                  const customData = evt.custom_data_json as Record<string, unknown> | null;
                  const value = customData?.value;
                  const hasDedupKey = !!evt.deduplication_key;
                  return (
                    <tr key={evt.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer">
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
                      <td className="py-3 px-4 text-foreground">
                        {typeof value === "number" ? `R$ ${Number(value).toLocaleString("pt-BR")}` : "—"}
                      </td>
                      <td className="py-3 px-4">
                        {hasDedupKey && <span className="px-2 py-0.5 rounded-full text-xs bg-accent/10 text-accent font-medium">dedup</span>}
                      </td>
                      <td className="py-3 px-4 text-xs text-muted-foreground">
                        {new Date(evt.created_at).toLocaleString("pt-BR")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
