import { useQuery } from "@tanstack/react-query";
import { Mail, Phone, FileText, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { supabase } from "@/integrations/supabase/client";

type ConvRow = {
  id: string;
  created_at: string;
  status: string;
  destination: string | null;
  error_message: string | null;
  request_json: unknown;
  response_json: unknown;
};

type Enhanced = {
  id: string;
  created_at: string;
  status: string;
  has_email: boolean;
  has_phone: boolean;
  has_document: boolean;
  has_gclid: boolean;
  match_status: "matched" | "rejected" | "pending" | "unknown";
  error?: string | null;
};

function analyze(row: ConvRow): Enhanced {
  const req = (row.request_json ?? {}) as Record<string, unknown>;
  const conv = Array.isArray((req as { conversions?: unknown[] }).conversions)
    ? ((req as { conversions: Record<string, unknown>[] }).conversions[0] ?? {})
    : (req as Record<string, unknown>);
  const ui = (conv.user_identifiers ?? conv.userIdentifiers) as
    | Record<string, unknown>[]
    | undefined;
  const identTypes = new Set((ui ?? []).map((u) => Object.keys(u).join(",")));
  const has_email = [...identTypes].some((k) => k.toLowerCase().includes("email"));
  const has_phone = [...identTypes].some((k) => k.toLowerCase().includes("phone"));
  const has_document = [...identTypes].some(
    (k) => k.toLowerCase().includes("address") || k.toLowerCase().includes("document"),
  );
  const has_gclid = !!conv.gclid;

  let match_status: Enhanced["match_status"] = "unknown";
  if (row.status === "delivered") {
    const resp = (row.response_json ?? {}) as Record<string, unknown>;
    const results = (resp.results ?? resp.partialFailureError) as unknown;
    if (resp.partialFailureError) match_status = "rejected";
    else if (Array.isArray(results) && results.length) match_status = "matched";
    else match_status = "matched";
  } else if (row.status === "failed") {
    match_status = "rejected";
  } else {
    match_status = "pending";
  }

  return {
    id: row.id,
    created_at: row.created_at,
    status: row.status,
    has_email,
    has_phone,
    has_document,
    has_gclid,
    match_status,
    error: row.error_message,
  };
}

export function EnhancedConversionsPanel() {
  const { data: workspace } = useWorkspace();
  const { data, isLoading } = useQuery({
    queryKey: ["enhanced-conversions", workspace?.id],
    enabled: !!workspace?.id,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("event_deliveries")
        .select("id, created_at, status, destination, error_message, request_json, response_json")
        .eq("workspace_id", workspace!.id)
        .eq("provider", "google_ads")
        .order("created_at", { ascending: false })
        .limit(25);
      return (rows || []).map(analyze);
    },
  });

  if (isLoading) {
    return <Skeleton className="h-64 rounded-xl" />;
  }

  const rows = data ?? [];
  const totals = rows.reduce(
    (a, r) => {
      a.total++;
      if (r.has_email) a.email++;
      if (r.has_phone) a.phone++;
      if (r.has_document) a.document++;
      if (r.has_gclid) a.gclid++;
      if (r.match_status === "matched") a.matched++;
      if (r.match_status === "rejected") a.rejected++;
      return a;
    },
    { total: 0, email: 0, phone: 0, document: 0, gclid: 0, matched: 0, rejected: 0 },
  );

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold">Enhanced Conversions — Google Ads</h2>
          <p className="text-xs text-muted-foreground">
            Últimas {totals.total} conversões enviadas via QuantumPay/CAPI
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Badge variant="outline"><Mail className="w-3 h-3 mr-1" />{totals.email}</Badge>
          <Badge variant="outline"><Phone className="w-3 h-3 mr-1" />{totals.phone}</Badge>
          <Badge variant="outline"><FileText className="w-3 h-3 mr-1" />{totals.document}</Badge>
          <Badge variant="outline">gclid {totals.gclid}</Badge>
          <Badge className="bg-success/10 text-success border-success/20">✓ {totals.matched}</Badge>
          <Badge className="bg-destructive/10 text-destructive border-destructive/20">✗ {totals.rejected}</Badge>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="text-center text-muted-foreground py-8 text-sm">
          Nenhuma conversão enviada para o Google Ads ainda.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground border-b">
              <tr>
                <th className="text-left py-2 px-2">Quando</th>
                <th className="text-center py-2 px-2">Email</th>
                <th className="text-center py-2 px-2">Phone</th>
                <th className="text-center py-2 px-2">Doc</th>
                <th className="text-center py-2 px-2">gclid</th>
                <th className="text-left py-2 px-2">Match</th>
                <th className="text-left py-2 px-2">Erro</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/40">
                  <td className="py-2 px-2 whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="text-center py-2 px-2">{r.has_email ? "✓" : "—"}</td>
                  <td className="text-center py-2 px-2">{r.has_phone ? "✓" : "—"}</td>
                  <td className="text-center py-2 px-2">{r.has_document ? "✓" : "—"}</td>
                  <td className="text-center py-2 px-2">{r.has_gclid ? "✓" : "—"}</td>
                  <td className="py-2 px-2">
                    {r.match_status === "matched" ? (
                      <span className="inline-flex items-center gap-1 text-success">
                        <CheckCircle2 className="w-3 h-3" />matched
                      </span>
                    ) : r.match_status === "rejected" ? (
                      <span className="inline-flex items-center gap-1 text-destructive">
                        <XCircle className="w-3 h-3" />rejected
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <AlertCircle className="w-3 h-3" />{r.match_status}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-destructive max-w-xs truncate" title={r.error ?? ""}>
                    {r.error ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
