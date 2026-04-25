// Canonical Event Audit — observability for the multi-step purchase model.
//
// Shows recent tracked_events joined with event_queue status, plus orders that
// resolved into a canonical_event_id. Highlights:
//   - 🔴 paid orders without canonical_event_id (canonical derivation missed)
//   - 🟠 collisions: same canonical id resolving to >1 root_order_code
//   - 🟠 queue items in queued/retry > 1h (stuck)
//   - ⚪ events without root_order_code
//
// NEVER renders PII (no email/phone/document/name). Only ids + hashes.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, Clock, Inbox, Filter as FilterIcon } from "lucide-react";

type TrackedEventRow = {
  id: string;
  workspace_id: string;
  event_id: string;
  provider: string;
  destination: string;
  status: string;
  attempts: number | null;
  last_error: string | null;
  first_seen_at: string;
  last_seen_at: string;
};

type QueueRow = {
  id: string;
  event_id: string | null;
  provider: string;
  destination: string;
  status: string;
  attempt_count: number;
  last_error: string | null;
  next_retry_at: string;
  created_at: string;
  updated_at: string;
};

type OrderRow = {
  id: string;
  gateway: string;
  gateway_order_id: string | null;
  status: string;
  root_order_code: string | null;
  step_key: string | null;
  canonical_event_id: string | null;
  paid_at: string | null;
  created_at: string;
};

const PROVIDERS = ["all", "meta", "google_ads", "ga4", "tiktok"] as const;
const STATUSES = ["all", "delivered", "queued", "processing", "retry", "dead_letter", "failed"] as const;

function statusBadge(status: string) {
  const cls =
    status === "delivered"
      ? "bg-success/10 text-success"
      : status === "dead_letter" || status === "failed"
      ? "bg-destructive/10 text-destructive"
      : status === "retry"
      ? "bg-warning/10 text-warning"
      : "bg-muted text-muted-foreground";
  return <Badge variant="outline" className={cls}>{status}</Badge>;
}

function isStale(iso: string) {
  return Date.now() - new Date(iso).getTime() > 60 * 60 * 1000; // > 1h
}

export default function CanonicalAudit() {
  const { data: workspace } = useWorkspace();
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: tracked, isLoading: loadingTracked } = useQuery({
    queryKey: ["canonical-audit", "tracked", workspace?.id, providerFilter, statusFilter],
    enabled: !!workspace?.id,
    queryFn: async () => {
      let q = supabase
        .from("tracked_events")
        .select("id, workspace_id, event_id, provider, destination, status, attempts, last_error, first_seen_at, last_seen_at")
        .eq("workspace_id", workspace!.id)
        .order("last_seen_at", { ascending: false })
        .limit(100);
      if (providerFilter !== "all") q = q.eq("provider", providerFilter);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as TrackedEventRow[];
    },
  });

  const { data: queue, isLoading: loadingQueue } = useQuery({
    queryKey: ["canonical-audit", "queue", workspace?.id, providerFilter, statusFilter],
    enabled: !!workspace?.id,
    queryFn: async () => {
      let q = supabase
        .from("event_queue")
        .select("id, event_id, provider, destination, status, attempt_count, last_error, next_retry_at, created_at, updated_at")
        .eq("workspace_id", workspace!.id)
        .order("updated_at", { ascending: false })
        .limit(100);
      if (providerFilter !== "all") q = q.eq("provider", providerFilter);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as QueueRow[];
    },
  });

  const { data: orders, isLoading: loadingOrders } = useQuery({
    queryKey: ["canonical-audit", "orders", workspace?.id],
    enabled: !!workspace?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, gateway, gateway_order_id, status, root_order_code, step_key, canonical_event_id, paid_at, created_at")
        .eq("workspace_id", workspace!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as OrderRow[];
    },
  });

  // Diagnostics
  const diagnostics = useMemo(() => {
    const o = orders || [];
    const t = tracked || [];
    const q = queue || [];
    const paidWithoutCanonical = o.filter(
      (x) => x.status === "paid" && !x.canonical_event_id,
    ).length;
    const eventsWithoutRoot = o.filter((x) => !x.root_order_code).length;

    // Collisions: same canonical_event_id pointing to >1 distinct root_order_code
    const byCanonical = new Map<string, Set<string>>();
    for (const ord of o) {
      if (!ord.canonical_event_id || !ord.root_order_code) continue;
      const set = byCanonical.get(ord.canonical_event_id) || new Set<string>();
      set.add(ord.root_order_code);
      byCanonical.set(ord.canonical_event_id, set);
    }
    const collisions = Array.from(byCanonical.entries()).filter(([, s]) => s.size > 1);

    const stuckQueue = q.filter(
      (item) => (item.status === "queued" || item.status === "retry") && isStale(item.updated_at),
    ).length;

    const deadLettered = t.filter((x) => x.status === "dead_letter").length;

    return { paidWithoutCanonical, eventsWithoutRoot, collisions, stuckQueue, deadLettered };
  }, [orders, tracked, queue]);

  // Filter tracked events by search
  const filteredTracked = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tracked || [];
    return (tracked || []).filter(
      (t) =>
        t.event_id.toLowerCase().includes(q) ||
        t.provider.toLowerCase().includes(q) ||
        t.destination.toLowerCase().includes(q),
    );
  }, [tracked, search]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders || [];
    return (orders || []).filter(
      (o) =>
        (o.canonical_event_id || "").toLowerCase().includes(q) ||
        (o.root_order_code || "").toLowerCase().includes(q) ||
        (o.gateway_order_id || "").toLowerCase().includes(q) ||
        o.gateway.toLowerCase().includes(q),
    );
  }, [orders, search]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Auditoria de Eventos Canônicos</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Diagnóstico do <code className="text-xs">purchase:&lt;root&gt;[:step:&lt;step_key&gt;]</code> — sem PII.
        </p>
      </div>

      {/* Diagnostics summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <DiagCard
          label="Pagos sem canonical"
          value={diagnostics.paidWithoutCanonical}
          icon={AlertTriangle}
          tone={diagnostics.paidWithoutCanonical > 0 ? "danger" : "ok"}
        />
        <DiagCard
          label="Sem root_order_code"
          value={diagnostics.eventsWithoutRoot}
          icon={AlertTriangle}
          tone={diagnostics.eventsWithoutRoot > 0 ? "warn" : "ok"}
        />
        <DiagCard
          label="Colisões canonical"
          value={diagnostics.collisions.length}
          icon={AlertTriangle}
          tone={diagnostics.collisions.length > 0 ? "danger" : "ok"}
        />
        <DiagCard
          label="Fila parada > 1h"
          value={diagnostics.stuckQueue}
          icon={Clock}
          tone={diagnostics.stuckQueue > 0 ? "warn" : "ok"}
        />
        <DiagCard
          label="Dead-lettered"
          value={diagnostics.deadLettered}
          icon={AlertTriangle}
          tone={diagnostics.deadLettered > 0 ? "danger" : "ok"}
        />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 flex flex-wrap items-center gap-3">
          <FilterIcon className="w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por event_id, root_order_code, provider…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <Select value={providerFilter} onValueChange={setProviderFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
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
                <SelectItem key={s} value={s}>{s === "all" ? "Todos status" : s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Collisions banner */}
      {diagnostics.collisions.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-destructive flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Colisões detectadas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs font-mono">
            {diagnostics.collisions.slice(0, 10).map(([canonical, roots]) => (
              <div key={canonical} className="break-all">
                <span className="text-destructive">{canonical}</span> → {Array.from(roots).join(", ")}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tracked events table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">tracked_events (idempotência por destino)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loadingTracked ? (
            <div className="p-4 space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12" />)}</div>
          ) : !filteredTracked.length ? (
            <EmptyRow label="Nenhum tracked_event" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">event_id</th>
                    <th className="text-left px-3 py-2 font-medium">provider</th>
                    <th className="text-left px-3 py-2 font-medium">destination</th>
                    <th className="text-left px-3 py-2 font-medium">status</th>
                    <th className="text-right px-3 py-2 font-medium">attempts</th>
                    <th className="text-left px-3 py-2 font-medium">último visto</th>
                    <th className="text-left px-3 py-2 font-medium">erro</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTracked.map((t) => (
                    <tr key={t.id} className="border-t border-border/40 hover:bg-muted/20">
                      <td className="px-3 py-2 font-mono break-all max-w-[280px]">{t.event_id}</td>
                      <td className="px-3 py-2">{t.provider}</td>
                      <td className="px-3 py-2 font-mono break-all max-w-[180px]">{t.destination}</td>
                      <td className="px-3 py-2">{statusBadge(t.status)}</td>
                      <td className="px-3 py-2 text-right">{t.attempts ?? 0}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{new Date(t.last_seen_at).toLocaleString()}</td>
                      <td className="px-3 py-2 text-destructive truncate max-w-[200px]">{t.last_error || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Queue snapshot */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">event_queue (snapshot)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loadingQueue ? (
            <div className="p-4 space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12" />)}</div>
          ) : !queue?.length ? (
            <EmptyRow label="Fila vazia" />
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
                    <th className="text-left px-3 py-2 font-medium">próximo retry</th>
                    <th className="text-left px-3 py-2 font-medium">last_error</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((q) => {
                    const stale = (q.status === "queued" || q.status === "retry") && isStale(q.updated_at);
                    return (
                      <tr
                        key={q.id}
                        className={`border-t border-border/40 hover:bg-muted/20 ${
                          stale ? "bg-warning/5" : ""
                        }`}
                      >
                        <td className="px-3 py-2 font-mono break-all max-w-[280px]">{q.event_id || "—"}</td>
                        <td className="px-3 py-2">{q.provider}</td>
                        <td className="px-3 py-2 font-mono break-all max-w-[180px]">{q.destination}</td>
                        <td className="px-3 py-2">{statusBadge(q.status)}</td>
                        <td className="px-3 py-2 text-right">{q.attempt_count}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{new Date(q.next_retry_at).toLocaleString()}</td>
                        <td className="px-3 py-2 text-destructive truncate max-w-[200px]">{q.last_error || ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Orders with canonical mapping */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Orders → canonical event_id</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loadingOrders ? (
            <div className="p-4 space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12" />)}</div>
          ) : !filteredOrders.length ? (
            <EmptyRow label="Nenhum pedido" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">gateway</th>
                    <th className="text-left px-3 py-2 font-medium">gateway_order_id</th>
                    <th className="text-left px-3 py-2 font-medium">status</th>
                    <th className="text-left px-3 py-2 font-medium">root_order_code</th>
                    <th className="text-left px-3 py-2 font-medium">step_key</th>
                    <th className="text-left px-3 py-2 font-medium">canonical_event_id</th>
                    <th className="text-left px-3 py-2 font-medium">criado em</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((o) => {
                    const paidNoCanonical = o.status === "paid" && !o.canonical_event_id;
                    const noRoot = !o.root_order_code;
                    return (
                      <tr
                        key={o.id}
                        className={`border-t border-border/40 hover:bg-muted/20 ${
                          paidNoCanonical ? "bg-destructive/5" : noRoot ? "bg-warning/5" : ""
                        }`}
                      >
                        <td className="px-3 py-2">{o.gateway}</td>
                        <td className="px-3 py-2 font-mono break-all max-w-[160px]">{o.gateway_order_id || "—"}</td>
                        <td className="px-3 py-2">{statusBadge(o.status)}</td>
                        <td className="px-3 py-2 font-mono break-all max-w-[160px]">
                          {o.root_order_code ?? <span className="text-warning">—</span>}
                        </td>
                        <td className="px-3 py-2 font-mono">{o.step_key ?? "—"}</td>
                        <td className="px-3 py-2 font-mono break-all max-w-[280px]">
                          {o.canonical_event_id ?? (
                            paidNoCanonical ? <span className="text-destructive">faltando</span> : "—"
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{new Date(o.created_at).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DiagCard({
  label, value, icon: Icon, tone,
}: {
  label: string;
  value: number;
  icon: typeof CheckCircle2;
  tone: "ok" | "warn" | "danger";
}) {
  const cls =
    tone === "danger"
      ? "border-destructive/40 text-destructive"
      : tone === "warn"
      ? "border-warning/40 text-warning"
      : "border-success/40 text-success";
  const ToneIcon = value === 0 ? CheckCircle2 : Icon;
  return (
    <Card className={`border ${cls}`}>
      <CardContent className="pt-4 flex items-center gap-3">
        <ToneIcon className="w-5 h-5 shrink-0" />
        <div>
          <div className="text-xl font-bold leading-tight">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm">
      <Inbox className="w-8 h-8 mb-2 opacity-50" />
      {label}
    </div>
  );
}
