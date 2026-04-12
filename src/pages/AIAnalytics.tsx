import { useState, useRef, useEffect, useCallback } from "react";
import { Brain, Sparkles, Send, TrendingUp, TrendingDown, AlertTriangle, Lightbulb, Target, RefreshCw, Bot, User, Zap, ShieldAlert, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";

type Insight = {
  type: "insight" | "alert" | "optimization" | "prediction";
  severity: "info" | "warning" | "critical" | "success";
  title: string;
  description: string;
  action: string;
  channel?: string;
  metric?: string;
  value_change?: number;
};

type InsightsData = {
  insights: Insight[];
  data: {
    events24h: number;
    events7d: number;
    recentRevenue: number;
    olderRevenue: number;
    revenueChange: number;
    conversions7d: number;
    activeAnomalies: number;
    queueFailed: number;
    dlqCount: number;
  };
  generated_at: string;
};

type ChatMsg = { role: "user" | "assistant"; content: string };

const COPILOT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-copilot`;

export default function AIAnalytics() {
  const { data: workspace } = useWorkspace();
  const [insightsData, setInsightsData] = useState<InsightsData | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(scrollToBottom, [messages]);

  const fetchInsights = useCallback(async () => {
    if (!workspace?.id) return;
    setLoadingInsights(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-insights", {
        body: { workspace_id: workspace.id },
      });
      if (error) throw error;
      setInsightsData(data);
    } catch (err: any) {
      toast.error("Erro ao gerar insights: " + (err.message || "Tente novamente"));
    } finally {
      setLoadingInsights(false);
    }
  }, [workspace?.id]);

  useEffect(() => {
    if (workspace?.id) fetchInsights();
  }, [workspace?.id, fetchInsights]);

  const sendMessage = async () => {
    if (!input.trim() || streaming || !workspace?.id) return;
    const userMsg: ChatMsg = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);

    let assistantSoFar = "";

    try {
      const resp = await fetch(COPILOT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: newMessages, workspace_id: workspace.id }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${resp.status}`);
      }

      if (!resp.body) throw new Error("No stream body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantSoFar += content;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
                }
                return [...prev, { role: "assistant", content: assistantSoFar }];
              });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Erro no AI Copilot");
      if (!assistantSoFar) {
        setMessages(prev => [...prev, { role: "assistant", content: "Desculpe, ocorreu um erro. Tente novamente." }]);
      }
    } finally {
      setStreaming(false);
    }
  };

  const severityIcon = (s: string) => {
    switch (s) {
      case "critical": return <ShieldAlert className="w-4 h-4 text-destructive" />;
      case "warning": return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case "success": return <TrendingUp className="w-4 h-4 text-green-500" />;
      default: return <Lightbulb className="w-4 h-4 text-primary" />;
    }
  };

  const typeIcon = (t: string) => {
    switch (t) {
      case "alert": return <AlertTriangle className="w-4 h-4" />;
      case "optimization": return <Target className="w-4 h-4" />;
      case "prediction": return <TrendingUp className="w-4 h-4" />;
      default: return <Lightbulb className="w-4 h-4" />;
    }
  };

  const severityColor = (s: string) => {
    switch (s) {
      case "critical": return "border-destructive/30 bg-destructive/5";
      case "warning": return "border-yellow-500/30 bg-yellow-500/5";
      case "success": return "border-green-500/30 bg-green-500/5";
      default: return "border-primary/30 bg-primary/5";
    }
  };

  const d = insightsData?.data;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <Brain className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">AI Analytics v5.0</h1>
            <p className="text-muted-foreground text-sm">Insights, predições e copilot com IA</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchInsights} disabled={loadingInsights}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loadingInsights ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* KPI Cards */}
      {d && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="glass-card">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Eventos 24h</p>
              <p className="text-2xl font-bold tabular-nums">{d.events24h.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Receita 7d</p>
              <p className="text-2xl font-bold tabular-nums">R${d.recentRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
              <div className={`text-xs flex items-center gap-1 mt-1 ${d.revenueChange >= 0 ? "text-green-500" : "text-destructive"}`}>
                {d.revenueChange >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {d.revenueChange > 0 ? "+" : ""}{d.revenueChange}%
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Conversões 7d</p>
              <p className="text-2xl font-bold tabular-nums">{d.conversions7d}</p>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Alertas Ativos</p>
              <p className="text-2xl font-bold tabular-nums">{d.activeAnomalies}</p>
              {(d.queueFailed + d.dlqCount) > 0 && (
                <p className="text-xs text-yellow-500 mt-1">{d.queueFailed + d.dlqCount} pipeline issues</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="insights" className="space-y-4">
        <TabsList className="glass-card">
          <TabsTrigger value="insights" className="gap-2"><Sparkles className="w-4 h-4" /> Insights AI</TabsTrigger>
          <TabsTrigger value="copilot" className="gap-2"><Bot className="w-4 h-4" /> AI Copilot</TabsTrigger>
        </TabsList>

        {/* INSIGHTS TAB */}
        <TabsContent value="insights" className="space-y-4">
          {loadingInsights && (
            <div className="text-center py-12">
              <RefreshCw className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
              <p className="text-muted-foreground">Analisando dados com IA...</p>
            </div>
          )}

          {!loadingInsights && insightsData?.insights && (
            <div className="grid gap-3">
              {insightsData.insights.map((insight, i) => (
          <Card key={i} className={`border ${severityColor(insight.severity)} transition-all hover:shadow-md`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 shrink-0">{severityIcon(insight.severity)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="font-semibold text-sm text-foreground">{insight.title}</h3>
                          <Badge variant="outline" className="text-[10px] gap-1">
                            {typeIcon(insight.type)}
                            {insight.type}
                          </Badge>
                          {insight.channel && (
                            <Badge variant="secondary" className="text-[10px]">{insight.channel}</Badge>
                          )}
                          {insight.value_change != null && (
                            <Badge variant={insight.value_change >= 0 ? "default" : "destructive"} className="text-[10px]">
                              {insight.value_change > 0 ? "+" : ""}{insight.value_change.toFixed(0)}%
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{insight.description}</p>
                        <div className="flex items-center gap-2 text-xs text-primary">
                          <Zap className="w-3 h-3" />
                          <span className="font-medium">{insight.action}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!loadingInsights && (!insightsData?.insights || insightsData.insights.length === 0) && (
            <Card className="glass-card">
              <CardContent className="p-8 text-center">
                <BarChart3 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">Sem dados suficientes para gerar insights. Configure integrações e aguarde eventos.</p>
              </CardContent>
            </Card>
          )}

          {insightsData?.generated_at && (
            <p className="text-xs text-muted-foreground text-right">
              Gerado em {new Date(insightsData.generated_at).toLocaleString("pt-BR")}
            </p>
          )}
        </TabsContent>

        {/* COPILOT TAB */}
        <TabsContent value="copilot">
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Bot className="w-5 h-5 text-primary" />
                CapiTrack AI Copilot
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Pergunte sobre seus dados, canais, ROAS, LTV, anomalias ou peça recomendações de budget.
              </p>
            </CardHeader>
            <CardContent>
              {/* Chat messages */}
              <div className="h-[400px] overflow-y-auto rounded-lg border border-border/30 bg-muted/10 p-4 mb-4 space-y-4">
                {messages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center gap-3">
                    <Brain className="w-10 h-10 text-muted-foreground/30" />
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Exemplos de perguntas:</p>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {["Qual canal tem melhor ROAS?", "Minha receita vai cair?", "Onde devo investir mais?", "Resuma meu desempenho"].map(q => (
                          <button
                            key={q}
                            onClick={() => { setInput(q); }}
                            className="text-xs px-3 py-1.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {messages.map((msg, i) => (
                  <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    {msg.role === "assistant" && (
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Bot className="w-4 h-4 text-primary" />
                      </div>
                    )}
                    <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/50 border border-border/30"
                    }`}>
                      {msg.role === "assistant" ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-li:my-0.5">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <p>{msg.content}</p>
                      )}
                    </div>
                    {msg.role === "user" && (
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                        <User className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                ))}

                {streaming && messages[messages.length - 1]?.role !== "assistant" && (
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Bot className="w-4 h-4 text-primary animate-pulse" />
                    </div>
                    <div className="bg-muted/50 border border-border/30 rounded-xl px-4 py-2.5">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div className="flex gap-2">
                <Textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Pergunte sobre seus dados..."
                  className="min-h-[44px] max-h-[100px] resize-none"
                  disabled={streaming}
                />
                <Button onClick={sendMessage} disabled={streaming || !input.trim()} size="icon" className="shrink-0 h-[44px] w-[44px]">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
