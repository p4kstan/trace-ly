import { useState } from "react";
import { Search, Filter, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const logs = [
  { id: "evt_01", event: "Purchase", source: "Meta CAPI", ip: "189.34.xxx.xx", status: 200, time: "2025-04-12 14:32:01", value: "R$ 297,00", dedup: true },
  { id: "evt_02", event: "Lead", source: "Google CAPI", ip: "177.12.xxx.xx", status: 200, time: "2025-04-12 14:30:55", value: "—", dedup: false },
  { id: "evt_03", event: "PageView", source: "Client SDK", ip: "200.98.xxx.xx", status: 200, time: "2025-04-12 14:29:12", value: "—", dedup: false },
  { id: "evt_04", event: "AddToCart", source: "Meta CAPI", ip: "189.34.xxx.xx", status: 200, time: "2025-04-12 14:28:44", value: "R$ 149,00", dedup: true },
  { id: "evt_05", event: "Purchase", source: "TikTok CAPI", ip: "177.45.xxx.xx", status: 429, time: "2025-04-12 14:27:30", value: "R$ 97,00", dedup: false },
  { id: "evt_06", event: "ViewContent", source: "Client SDK", ip: "200.12.xxx.xx", status: 200, time: "2025-04-12 14:25:10", value: "—", dedup: false },
  { id: "evt_07", event: "Purchase", source: "Meta CAPI", ip: "189.78.xxx.xx", status: 200, time: "2025-04-12 14:23:44", value: "R$ 497,00", dedup: true },
  { id: "evt_08", event: "Lead", source: "Google CAPI", ip: "177.88.xxx.xx", status: 500, time: "2025-04-12 14:22:01", value: "—", dedup: false },
];

export default function EventLogs() {
  const [search, setSearch] = useState("");

  const filtered = logs.filter(
    (l) => l.event.toLowerCase().includes(search.toLowerCase()) || l.source.toLowerCase().includes(search.toLowerCase())
  );

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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b border-border bg-muted/30">
                <th className="text-left py-3 px-4 font-medium">ID</th>
                <th className="text-left py-3 px-4 font-medium">Event</th>
                <th className="text-left py-3 px-4 font-medium">Source</th>
                <th className="text-left py-3 px-4 font-medium">IP</th>
                <th className="text-left py-3 px-4 font-medium">Status</th>
                <th className="text-left py-3 px-4 font-medium">Value</th>
                <th className="text-left py-3 px-4 font-medium">Dedup</th>
                <th className="text-left py-3 px-4 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log) => (
                <tr key={log.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer">
                  <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{log.id}</td>
                  <td className="py-3 px-4 font-medium text-foreground">{log.event}</td>
                  <td className="py-3 px-4 text-muted-foreground">{log.source}</td>
                  <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{log.ip}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      log.status === 200 ? "bg-success/10 text-success" :
                      log.status === 429 ? "bg-warning/10 text-warning" :
                      "bg-destructive/10 text-destructive"
                    }`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-foreground">{log.value}</td>
                  <td className="py-3 px-4">
                    {log.dedup && <span className="px-2 py-0.5 rounded-full text-xs bg-accent/10 text-accent font-medium">dedup</span>}
                  </td>
                  <td className="py-3 px-4 text-xs text-muted-foreground">{log.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
