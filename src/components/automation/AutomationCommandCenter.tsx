/**
 * AutomationCommandCenter — shows the most recent actions executed by AI agents
 * (via MCP) and the auto-feedback flow. Read-only surface that gives the user
 * full visibility of every automated change in the workspace.
 *
 * Granular filters (added 19/04/2026):
 *  - Ad platform (Google Ads, Meta, TikTok, GA4)
 *  - Payment gateway (extracted from metadata_json.provider)
 * Filters operate client-side on the in-memory action list to keep the realtime
 * subscription cheap; filter values are derived from data actually present.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bot, CheckCircle2, AlertCircle, Loader2, Sparkles, Filter } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AutomationAction {
  id: string;
  action: string;
  trigger: string;
  target_type: string | null;
  target_id: string | null;
  status: string;
  before_value: Record<string, unknown> | null;
  after_value: Record<string, unknown> | null;
  metadata_json: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
}

/** Human-readable one-liner per action. Returns null when generic JSON is enough. */
function describeAction(a: AutomationAction): string | null {
  const after = (a.after_value ?? {}) as Record<string, any>;
  const before = (a.before_value ?? {}) as Record<string, any>;
  const meta = (a.metadata_json ?? {}) as Record<string, any>;
  const reason = meta?.reason ? ` — ${meta.reason}` : "";

  switch (a.action) {
    case "keywords.update_bid": {
      const newBid = after?.cpc_bid;
      const pct = before?.cpc_bid && newBid
        ? Math.round(((newBid - before.cpc_bid) / before.cpc_bid) * 100)
        : null;
      return `CPC da keyword [${a.target_id}] → R$ ${typeof newBid === "number" ? newBid.toFixed(2) : newBid}${pct !== null ? ` (${pct >= 0 ? "+" : ""}${pct}%)` : ""}${reason}`;
    }
    case "keywords.set_status":
      return `Keyword [${a.target_id}] → ${after?.status}${reason}`;
    case "ad_groups.update_bid":
      return `CPC default do ad group [${a.target_id}] → R$ ${typeof after?.cpc_bid === "number" ? after.cpc_bid.toFixed(2) : after?.cpc_bid}${reason}`;
    case "negative_keywords.add":
      return `Negativada "${after?.keyword_text}" (${after?.match_type})${reason}`;
    case "campaigns.pause":
      return `Campanha [${a.target_id}] pausada${reason}`;
    case "campaigns.resume":
      return `Campanha [${a.target_id}] reativada${reason}`;
    case "campaigns.update_budget": {
      const beforeAmt = before?.daily_amount;
      const afterAmt = after?.daily_amount;
      const pct = beforeAmt && afterAmt ? Math.round(((afterAmt - beforeAmt) / beforeAmt) * 100) : null;
      return `Orçamento da campanha [${a.target_id}] → R$ ${afterAmt}${pct !== null ? ` (${pct >= 0 ? "+" : ""}${pct}%)` : ""}${reason}`;
    }
    case "notify_mcp":
      if (meta?.keyword) return `MCP notificado: venda → keyword "${meta.keyword}" (${meta.keyword_source})`;
      return null;
    default:
      return null;
  }
}

/** Infers the ad platform a given automation action belongs to. */
function inferAdPlatform(a: AutomationAction): string {
  const meta = (a.metadata_json ?? {}) as Record<string, any>;
  if (meta?.platform) return String(meta.platform);
  // Heuristic by action namespace
  if (
    a.action?.startsWith("keywords.") ||
    a.action?.startsWith("ad_groups.") ||
    a.action?.startsWith("campaigns.") ||
    a.action?.startsWith("negative_keywords.")
  ) return "google_ads";
  if (a.action?.includes("meta") || a.action?.includes("facebook")) return "meta";
  if (a.action?.includes("tiktok")) return "tiktok";
  return "other";
}

function inferGateway(a: AutomationAction): string | null {
  const meta = (a.metadata_json ?? {}) as Record<string, any>;
  return meta?.provider || meta?.gateway || null;
}

const PLATFORM_LABEL: Record<string, string> = {
  google_ads: "Google Ads",
  meta: "Facebook / Instagram",
  tiktok: "TikTok",
  ga4: "GA4",
  other: "Outros",
};

interface Props {
  workspaceId: string | undefined;
  /** Optional filter — when set, only shows actions whose target_id matches */
  targetId?: string;
  limit?: number;
  className?: string;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  success: "default",
  failed: "destructive",
  pending: "secondary",
  dry_run: "outline",
};

const TRIGGER_LABEL: Record<string, string> = {
  agent: "🤖 Agente IA",
  auto_feedback: "⚡ Auto-feedback",
  manual: "👤 Manual",
};

export function AutomationCommandCenter({ workspaceId, targetId, limit = 10, className }: Props) {
  const [actions, setActions] = useState<AutomationAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [gatewayFilter, setGatewayFilter] = useState<string>("all");

  useEffect(() => {
    if (!workspaceId) return;
    let mounted = true;
    const load = async () => {
      // Pull a wider window so client-side filters have material to work with.
      const fetchLimit = Math.max(limit * 5, 50);
      let q = supabase
        .from("automation_actions")
        .select("id, action, trigger, target_type, target_id, status, before_value, after_value, metadata_json, error_message, created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(fetchLimit);
      if (targetId) q = q.eq("target_id", targetId);
      const { data } = await q;
      if (mounted) {
        setActions((data ?? []) as AutomationAction[]);
        setLoading(false);
      }
    };
    void load();

    const channel = supabase
      .channel(`automation-${workspaceId}-${targetId ?? "all"}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "automation_actions", filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const row = payload.new as AutomationAction;
          if (targetId && row.target_id !== targetId) return;
          setActions((prev) => [row, ...prev].slice(0, Math.max(limit * 5, 50)));
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [workspaceId, targetId, limit]);

  // Derive filter option universes from the actual data so we never offer empty options.
  const availablePlatforms = useMemo(() => {
    const set = new Set<string>();
    actions.forEach((a) => set.add(inferAdPlatform(a)));
    return Array.from(set);
  }, [actions]);

  const availableGateways = useMemo(() => {
    const set = new Set<string>();
    actions.forEach((a) => {
      const g = inferGateway(a);
      if (g) set.add(g);
    });
    return Array.from(set);
  }, [actions]);

  const filteredActions = useMemo(() => {
    return actions
      .filter((a) => platformFilter === "all" || inferAdPlatform(a) === platformFilter)
      .filter((a) => gatewayFilter === "all" || inferGateway(a) === gatewayFilter)
      .slice(0, limit);
  }, [actions, platformFilter, gatewayFilter, limit]);

  return (
    <Card className={`glass-card ${className ?? ""}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="w-4 h-4 text-primary" />
          Centro de Comando — Automação
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Ações executadas por agentes IA via MCP e pelo auto-feedback de conversão.
        </p>

        {/* Granular filters — Plataforma + Gateway */}
        <div className="flex items-center gap-2 pt-2 flex-wrap">
          <Filter className="w-3 h-3 text-muted-foreground" />
          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="h-7 w-[170px] text-xs">
              <SelectValue placeholder="Plataforma" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as plataformas</SelectItem>
              {availablePlatforms.map((p) => (
                <SelectItem key={p} value={p}>{PLATFORM_LABEL[p] ?? p}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={gatewayFilter} onValueChange={setGatewayFilter}>
            <SelectTrigger className="h-7 w-[170px] text-xs">
              <SelectValue placeholder="Gateway" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os gateways</SelectItem>
              {availableGateways.map((g) => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(platformFilter !== "all" || gatewayFilter !== "all") && (
            <Badge variant="outline" className="text-[10px]">
              {filteredActions.length} de {actions.length}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
            <Loader2 className="w-3 h-3 animate-spin" /> Carregando…
          </div>
        ) : filteredActions.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4 text-center">
            {actions.length === 0
              ? "Nenhuma ação automatizada ainda. Conecte um agente via MCP ou aguarde a próxima venda."
              : "Nenhuma ação corresponde aos filtros selecionados."}
          </div>
        ) : (
          filteredActions.map((a) => {
            const platform = inferAdPlatform(a);
            const gateway = inferGateway(a);
            return (
              <div
                key={a.id}
                className="flex items-start gap-3 p-3 rounded-md border border-border/50 bg-background/30"
              >
                <div className="mt-0.5">
                  {a.status === "success" ? (
                    <CheckCircle2 className="w-4 h-4 text-success" />
                  ) : a.status === "failed" ? (
                    <AlertCircle className="w-4 h-4 text-destructive" />
                  ) : (
                    <Bot className="w-4 h-4 text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{a.action}</span>
                    <Badge variant={STATUS_VARIANT[a.status] ?? "secondary"} className="text-[10px] py-0">
                      {a.status}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{TRIGGER_LABEL[a.trigger] ?? a.trigger}</span>
                    <Badge variant="outline" className="text-[10px] py-0">{PLATFORM_LABEL[platform] ?? platform}</Badge>
                    {gateway && (
                      <Badge variant="secondary" className="text-[10px] py-0">{gateway}</Badge>
                    )}
                  </div>
                  {a.target_id && (
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {a.target_type}: {a.target_id}
                    </p>
                  )}
                  {a.error_message && (
                    <p className="text-[11px] text-destructive mt-0.5 truncate">{a.error_message}</p>
                  )}
                  {(() => {
                    const desc = describeAction(a);
                    if (desc) return <p className="text-[11px] text-foreground/80 mt-0.5 line-clamp-2">→ {desc}</p>;
                    if (a.after_value && Object.keys(a.after_value).length > 0) {
                      return (
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          → {JSON.stringify(a.after_value)}
                        </p>
                      );
                    }
                    return null;
                  })()}
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ptBR })}
                </span>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
