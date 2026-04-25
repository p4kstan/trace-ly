import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Shield, ShieldOff, Brain, Search, FileText } from "lucide-react";

export default function TrafficAgent() {
  const { data: workspace } = useWorkspace();
  const wid = workspace?.id;
  const [recs, setRecs] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [guardrails, setGuardrails] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [docTitle, setDocTitle] = useState("");
  const [docContent, setDocContent] = useState("");

  useEffect(() => { if (wid) refresh(); }, [wid]);

  async function refresh() {
    if (!wid) return;
    const [{ data: r }, { data: rs }, { data: d }, { data: l }, { data: g }] = await Promise.all([
      supabase.rpc("list_traffic_agent_recommendations" as any, { _workspace_id: wid, _limit: 50 }),
      supabase.from("traffic_agent_runs" as any).select("*").eq("workspace_id", wid).order("started_at", { ascending: false }).limit(10),
      supabase.from("traffic_agent_knowledge_documents" as any).select("*").eq("workspace_id", wid).order("created_at", { ascending: false }).limit(20),
      supabase.from("traffic_agent_action_logs" as any).select("*").eq("workspace_id", wid).order("created_at", { ascending: false }).limit(20),
      supabase.rpc("get_or_create_traffic_agent_guardrails" as any, { _workspace_id: wid }),
    ]);
    setRecs((r as any[]) ?? []); setRuns((rs as any[]) ?? []);
    setDocs((d as any[]) ?? []); setLogs((l as any[]) ?? []);
    setGuardrails(g);
  }

  async function runEvaluate() {
    if (!wid) return; setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("traffic-agent-evaluate", {
        body: { workspace_id: wid, window_days: 7, mode: "recommendation" },
      });
      if (error) throw error;
      toast.success(`Run concluído: ${data?.recommendations ?? 0} recomendações`);
      await refresh();
    } catch (e: any) { toast.error(e.message ?? "Falha ao avaliar"); }
    finally { setLoading(false); }
  }

  async function simulate(recId: string) {
    const { data, error } = await supabase.functions.invoke("traffic-agent-simulate", {
      body: { workspace_id: wid, recommendation_id: recId },
    });
    if (error) { toast.error(error.message); return; }
    const decision = data?.guardrail_decision;
    toast(decision?.allowed ? "Permitido (mas dry-run)" : "Bloqueado por guardrails", {
      description: (decision?.reasons ?? []).map((r: any) => r.code).join(", "),
    });
  }

  async function execute(recId: string) {
    const { data, error } = await supabase.functions.invoke("traffic-agent-execute", {
      body: { workspace_id: wid, recommendation_id: recId },
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Action registrado (dry-run, sem mutação externa)");
    await refresh();
  }

  async function indexDoc() {
    if (!wid || !docTitle || docContent.length < 10) { toast.error("Preencha título e conteúdo"); return; }
    const { error } = await supabase.functions.invoke("traffic-agent-rag-index", {
      body: { workspace_id: wid, title: docTitle, source_type: "manual", content: docContent },
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Documento indexado");
    setDocTitle(""); setDocContent(""); await refresh();
  }

  async function searchKnowledge() {
    if (!wid || search.trim().length < 2) return;
    const { data, error } = await supabase.functions.invoke("traffic-agent-rag-search", {
      body: { workspace_id: wid, query: search, limit: 5 },
    });
    if (error) { toast.error(error.message); return; }
    setResults((data as any)?.results ?? []);
  }

  return (
    <div className="container mx-auto p-4 space-y-4 max-w-full min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold flex items-center gap-2 break-words"><Brain className="h-6 w-6" /> Agente de Tráfego MCP + RAG</h1>
          <p className="text-sm text-muted-foreground break-words">Modo seguro: dry-run, sem mutação externa real.</p>
        </div>
        <Button onClick={runEvaluate} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Avaliar agora
        </Button>
      </div>

      {guardrails && (
        <Card>
          <CardContent className="p-4 flex flex-wrap gap-2 items-center min-w-0">
            <Badge variant={guardrails.allow_live_mutations ? "destructive" : "secondary"} className="break-words">
              {guardrails.allow_live_mutations ? <Shield className="h-3 w-3 mr-1" /> : <ShieldOff className="h-3 w-3 mr-1" />}
              live mutations: {String(guardrails.allow_live_mutations)}
            </Badge>
            <Badge variant="outline">mode: {guardrails.mode}</Badge>
            <Badge variant="outline">approval: {String(guardrails.human_approval_required)}</Badge>
            <Badge variant="outline">max budget Δ: {guardrails.max_budget_change_percent}%</Badge>
            <Badge variant="outline">cooldown: {guardrails.cooldown_hours}h</Badge>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="recs" className="w-full min-w-0">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="recs">Recomendações</TabsTrigger>
          <TabsTrigger value="runs">Runs</TabsTrigger>
          <TabsTrigger value="rag">Conhecimento RAG</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="recs" className="space-y-2 min-w-0">
          {recs.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma recomendação. Clique em "Avaliar agora".</p>}
          {recs.map((r) => (
            <Card key={r.id} className="min-w-0">
              <CardHeader className="p-4 pb-2">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <Badge variant="outline">P{r.priority}</Badge>
                  <Badge variant="secondary" className="break-words">{r.provider}</Badge>
                  <CardTitle className="text-base break-words min-w-0">{r.action_type}</CardTitle>
                  <Badge variant="outline">conf {Math.round((r.confidence ?? 0) * 100)}%</Badge>
                  {r.status && <Badge>{r.status}</Badge>}
                </div>
                <CardDescription className="break-words">{r.rationale}</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-2">
                <pre className="text-xs bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap break-words max-w-full">
                  {JSON.stringify(r.evidence_json ?? {}, null, 2)}
                </pre>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => simulate(r.id)}>Simular</Button>
                  <Button size="sm" onClick={() => execute(r.id)}>Registrar dry-run</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="runs" className="space-y-2 min-w-0">
          {runs.map((r) => (
            <Card key={r.id}><CardContent className="p-3 text-sm break-words">
              <div className="flex flex-wrap gap-2 items-center"><Badge>{r.status}</Badge><span className="text-muted-foreground">{r.started_at}</span></div>
              <pre className="text-xs mt-2 overflow-x-auto whitespace-pre-wrap break-words">{JSON.stringify(r.summary ?? {}, null, 2)}</pre>
            </CardContent></Card>
          ))}
        </TabsContent>

        <TabsContent value="rag" className="space-y-3 min-w-0">
          <Card>
            <CardHeader className="p-4 pb-2"><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" />Indexar conhecimento</CardTitle></CardHeader>
            <CardContent className="p-4 pt-0 space-y-2">
              <Label>Título</Label>
              <Input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} />
              <Label>Conteúdo</Label>
              <Textarea rows={5} value={docContent} onChange={(e) => setDocContent(e.target.value)} />
              <Button onClick={indexDoc}>Indexar</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="p-4 pb-2"><CardTitle className="text-base flex items-center gap-2"><Search className="h-4 w-4" />Buscar</CardTitle></CardHeader>
            <CardContent className="p-4 pt-0 space-y-2">
              <div className="flex gap-2 flex-wrap">
                <Input value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-0 flex-1" />
                <Button onClick={searchKnowledge}>Buscar</Button>
              </div>
              {results.map((r) => (
                <div key={r.chunk_id} className="text-sm border-l-2 border-primary pl-3 break-words">{r.snippet}</div>
              ))}
            </CardContent>
          </Card>
          <div className="space-y-1">
            {docs.map((d) => (
              <div key={d.id} className="text-sm flex flex-wrap gap-2 items-center min-w-0">
                <Badge variant="outline">{d.source_type}</Badge><span className="break-words min-w-0">{d.title}</span>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="logs" className="space-y-1 min-w-0">
          {logs.map((l) => (
            <Card key={l.id}><CardContent className="p-3 text-sm break-words">
              <div className="flex gap-2 items-center flex-wrap"><Badge variant={l.level === "warn" ? "destructive" : "outline"}>{l.level}</Badge><span className="text-xs text-muted-foreground">{l.created_at}</span></div>
              <p className="mt-1 break-words">{l.message}</p>
            </CardContent></Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
