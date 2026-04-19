/**
 * AutomationCommandCenter — shows the most recent actions executed by AI agents
 * (via MCP) and the auto-feedback flow. Read-only surface that gives the user
 * full visibility of every automated change in the workspace.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, CheckCircle2, AlertCircle, Loader2, Sparkles } from "lucide-react";
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

  useEffect(() => {
    if (!workspaceId) return;
    let mounted = true;
    const load = async () => {
      let q = supabase
        .from("automation_actions")
        .select("id, action, trigger, target_type, target_id, status, before_value, after_value, metadata_json, error_message, created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(limit);
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
          setActions((prev) => [row, ...prev].slice(0, limit));
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [workspaceId, targetId, limit]);

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
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
            <Loader2 className="w-3 h-3 animate-spin" /> Carregando…
          </div>
        ) : actions.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4 text-center">
            Nenhuma ação automatizada ainda. Conecte um agente via MCP ou aguarde a próxima venda.
          </div>
        ) : (
          actions.map((a) => (
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
          ))
        )}
      </CardContent>
    </Card>
  );
}
