// Retry & Dead-letter Observability — read-only operational view.
// Companion to /canonical-audit. Focuses on the live state of the queue:
//   - aging of queued/retry items per provider+destination
//   - dead-letter grouped by reason (last_error)
//   - next_retry_at distribution to anticipate spikes
//   - NEVER renders PII (only ids, providers, destinations, error messages
//     produced by our own code — gateway/provider error bodies may contain
//     IDs but never raw email/phone/document).
//
// All actions are read-only. Re-enqueue / dead-letter purge are intentionally
// NOT exposed here to keep this surface safe for any operator role.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Clock, Inbox, RefreshCcw, Shield, Filter as FilterIcon } from "lucide-react";

type QueueRow = {
  id: string;
  event_id: string | null;
  provider: string;
  destination: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  last_error: string | null;
  next_retry_at: string;
  created_at: string;
  updated_at: string;
};

type DeadLetterRow = {
  id: string;
  provider: string | null;
  source_type: string;
  retry_count: number;
  error_message: string | null;
  created_at: string;
};

const PROVIDERS = ["all", "meta", "meta_capi", "google_ads", "ga4", "tiktok"] as const;
const STATUSES = ["queued", "retry", "processing", "dead_letter"] as const;

function ageMs(iso: string) {
  return Date.now() - new Date(iso).getTime();
}
function ageLabel(ms: number) {
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
function ageTone(ms: number): "ok" | "warn" | "danger" {
  if (ms < 30 * 60_000) return "ok";          // < 30 min
  if (ms < 4 * 60 * 60_000) return "warn";    // < 4 h
  return "danger";
}

function statusBadge(status: string) {
  const cls =
    status === "dead_letter"
      ? "bg-destructive/10 text-destructive border-destructive/30"
      : status === "retry"
      ? "bg-warning/10 text-warning border-warning/30"
      : status === "processing"
      ? "bg-primary/10 text-primary border-primary/30"
      : "bg-muted text-muted-foreground";
  return <Badge variant="outline" className={cls}>{status}</Badge>;
}

/** Truncate provider/gateway error messages for display.
 *  Intentionally cuts at 200 chars — gateway errors are technical and
 *  should never include PII produced by our code. */
function safeError(msg: string | null) {
  if (!msg) return "";
  return msg.length > 200 ? msg.slice(0, 200) + "…" : msg;
}

/** Group dead_letter rows by error class (first 60 chars of message). */
function groupByReason(rows: DeadLetterRow[]) {
  const map = new Map<string, { reason: string; count: number; providers: Set<string>; lastSeen: string }>();
  for (const r of rows) {
    const reason = (r.error_message || "(no message)").slice(0, 60);
    const e = map.get(reason) || { reason, count: 0, providers: new Set<string>(), lastSeen: r.created_at };
    e.count++;
    if (r.provider) e.providers.add(r.provider);
    if (r.created_at > e.lastSeen) e.lastSeen = r.created_at;
    map.set(reason, e);
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

export default function RetryObservability() {
  const { data: workspace } = useWorkspace();
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("retry");
  const [search, setSearch] = useState("");

  const { data: queue, isLoading: loadingQueue, refetch: refetchQueue } = useQuery({
    queryKey: ["retry-obs", "queue", workspace?.id, providerFilter, statusFilter],
    enabled: !!workspace?.id,
    refetchInterval: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("event_queue")
        .select("id, event_id, provider, destination, status, attempt_count, max_attempts, last_error, next_retry_at, created_at, updated_at")
        .eq("workspace_id", workspace!.id)
        .order("next_retry_at", { ascending: true })
        .limit(200);
      if (providerFilter !== "all") q = q.eq("provider", providerFilter);
      if (statusFilter) q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as QueueRow[];
    },
  });

  const { data: deadLetters, isLoading: loadingDL } = useQuery({
    queryKey: ["retry-obs", "dead-letters", workspace?.id, providerFilter],
    enabled: !!workspace?.id,
    refetchInterval: 60_000,
    queryFn: async () => {
      let q = supabase
        .from("dead_letter_events")
        .select("id, provider, source_type, retry_count, error_message, created_at")
        .eq("workspace_id", workspace!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (providerFilter !== "all") q = q.eq("provider", providerFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as DeadLetterRow[];
    },
  });

  const filteredQueue = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return queue || [];
    return (queue || []).filter(
      (q) =>
        (q.event_id || "").toLowerCase().includes(s) ||
        q.provider.toLowerCase().includes(s) ||
        q.destination.toLowerCase().includes(s),
    );
  }, [queue, search]);

  // KPIs
  const kpis = useMemo(() => {
    const q = queue || [];
    const dl = deadLetters || [];
    const stuck1h = q.filter((x) => (x.status === "queued" || x.status === "retry") && ageMs(x.updated_at) > 60 * 60_000).length;
    const retryCount = q.filter((x) => x.status === "retry").length;
    const dlCount = dl.length;
    const oldestStuck = q
      .filter((x) => x.status === "queued" || x.status === "retry")
      .reduce((max, x) => Math.max(max, ageMs(x.created_at)), 0);
    return { stuck1h, retryCount, dlCount, oldestStuck };
  }, [queue, deadLetters]);

  const dlByReason = useMemo(() => groupByReason(deadLetters || []), [deadLetters]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Observabilidade de Retries & Dead-letter</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Estado vivo da fila — aging, motivos de dead-letter, próximo retry.{" "}
            <Link to="/canonical-audit" className="text-primary hover:underline">Ver auditoria canônica →</Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1"><Shield className="w-3 h-3" /> Somente leitura</Badge>
          <button
            onClick={() => refetchQueue()}
            className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-border hover:bg-muted/40"
          >
            <RefreshCcw className="w-3 h-3" /> Atualizar
          </button>
        </div>
      </div>

      <QueueHealthBanner workspaceId={workspace?.id} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Em retry" value={kpis.retryCount} tone={kpis.retryCount > 0 ? "warn" : "ok"} />
        <KpiCard label="Parados > 1h" value={kpis.stuck1h} tone={kpis.stuck1h > 0 ? "danger" : "ok"} />
        <KpiCard label="Dead-letter" value={kpis.dlCount} tone={kpis.dlCount > 0 ? "danger" : "ok"} />
        <KpiCard
          label="Mais antigo na fila"
          value={kpis.oldestStuck > 0 ? ageLabel(kpis.oldestStuck) : "—"}
          tone={ageTone(kpis.oldestStuck)}
        />
      </div>

      <Card>
        <CardContent className="pt-4 flex flex-wrap items-center gap-3">
          <FilterIcon className="w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por event_id, provider, destination…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <Select value={providerFilter} onValueChange={setProviderFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PROVIDERS.map((p) => (
                <SelectItem key={p} value={p}>{p === "all" ? "Todos providers" : p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Fila — {statusFilter}</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loadingQueue ? (
            <div className="p-4 space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : !filteredQueue.length ? (
            <Empty label="Nenhum item nesta fila" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">event_id</th>
                    <th className="text-left px-3 py-2 font-medium">provider</th>
                    <th className="text-left px-3 py-2 font-medium">destination</th>
                    <th className="text-left px-3 py-2 font-medium">status</th>
                    <th className="text-right px-3 py-2 font-medium">attempt</th>
                    <th className="text-left px-3 py-2 font-medium">aging</th>
                    <th className="text-left px-3 py-2 font-medium">próximo retry</th>
                    <th className="text-left px-3 py-2 font-medium">last_error</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQueue.map((q) => {
                    const aging = ageMs(q.updated_at);
                    const tone = ageTone(aging);
                    return (
                      <tr key={q.id} className="border-t border-border/40 hover:bg-muted/20">
                        <td className="px-3 py-2 font-mono break-all max-w-[260px]">{q.event_id || "—"}</td>
                        <td className="px-3 py-2">{q.provider}</td>
                        <td className="px-3 py-2 font-mono break-all max-w-[160px]">{q.destination}</td>
                        <td className="px-3 py-2">{statusBadge(q.status)}</td>
                        <td className="px-3 py-2 text-right">{q.attempt_count}/{q.max_attempts}</td>
                        <td className={`px-3 py-2 ${tone === "danger" ? "text-destructive" : tone === "warn" ? "text-warning" : ""}`}>
                          {ageLabel(aging)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{new Date(q.next_retry_at).toLocaleString()}</td>
                        <td className="px-3 py-2 text-destructive truncate max-w-[260px]" title={q.last_error || ""}>
                          {safeError(q.last_error)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive" /> Dead-letter por motivo
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loadingDL ? (
            <div className="p-4 space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : !dlByReason.length ? (
            <Empty label="Sem dead-letters 🎉" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">motivo</th>
                    <th className="text-right px-3 py-2 font-medium">qtd</th>
                    <th className="text-left px-3 py-2 font-medium">providers</th>
                    <th className="text-left px-3 py-2 font-medium">último visto</th>
                  </tr>
                </thead>
                <tbody>
                  {dlByReason.map((r) => (
                    <tr key={r.reason} className="border-t border-border/40">
                      <td className="px-3 py-2 font-mono text-destructive max-w-[420px] truncate" title={r.reason}>
                        {r.reason}
                      </td>
                      <td className="px-3 py-2 text-right font-bold">{r.count}</td>
                      <td className="px-3 py-2">{Array.from(r.providers).join(", ") || "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{new Date(r.lastSeen).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: number | string; tone: "ok" | "warn" | "danger" }) {
  const cls =
    tone === "danger" ? "border-destructive/40 text-destructive"
    : tone === "warn" ? "border-warning/40 text-warning"
    : "border-success/40 text-success";
  return (
    <Card className={`border ${cls}`}>
      <CardContent className="pt-4 flex items-center gap-3">
        <Clock className="w-5 h-5 shrink-0" />
        <div>
          <div className="text-xl font-bold leading-tight">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm">
      <Inbox className="w-8 h-8 mb-2 opacity-50" />
      {label}
    </div>
  );
}

/** Calls the queue-health Edge Function and renders a single status banner.
 *  Read-only — never exposes PII; only counters and aging metrics. */
function QueueHealthBanner({ workspaceId }: { workspaceId: string | undefined }) {
  const { data } = useQuery({
    queryKey: ["queue-health", workspaceId],
    enabled: !!workspaceId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("queue-health", {
        body: { workspace_id: workspaceId },
      });
      if (error) throw error;
      return data as {
        status: "ok" | "warn" | "critical";
        totals: {
          dead_letter_count: number;
          retry_total: number;
          retry_age_max_ms: number;
          queued_age_max_ms: number;
        };
      };
    },
  });

  if (!data) return null;
  const tone =
    data.status === "critical" ? "border-destructive/40 text-destructive bg-destructive/5"
    : data.status === "warn" ? "border-warning/40 text-warning bg-warning/5"
    : "border-success/40 text-success bg-success/5";

  return (
    <div className={`border rounded-lg px-4 py-3 text-xs flex flex-wrap items-center gap-4 ${tone}`}>
      <span className="font-semibold uppercase tracking-wide">queue health: {data.status}</span>
      <span>dead-letter: <b>{data.totals.dead_letter_count}</b></span>
      <span>em retry: <b>{data.totals.retry_total}</b></span>
      <span>retry mais antigo: <b>{data.totals.retry_age_max_ms > 0 ? ageLabel(data.totals.retry_age_max_ms) : "—"}</b></span>
      <span>queued mais antigo: <b>{data.totals.queued_age_max_ms > 0 ? ageLabel(data.totals.queued_age_max_ms) : "—"}</b></span>
    </div>
  );
}

