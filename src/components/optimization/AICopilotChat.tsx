import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAICopilotChat, type RecPeriod } from "@/hooks/api/use-google-ads-recommendations";
import { toast } from "sonner";

interface Msg { role: "user" | "assistant"; content: string }

export function AICopilotChat({ workspaceId, period }: { workspaceId: string; period: RecPeriod }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Oi! Pergunte sobre suas campanhas Google Ads. Ex.: \"qual conta está com pior ROAS?\" ou \"e se eu pausar a campanha X?\"" },
  ]);
  const chat = useAICopilotChat();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || chat.isPending) return;
    setInput("");
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    try {
      const res = await chat.mutateAsync({ workspaceId, messages: next, period });
      setMessages((m) => [...m, { role: "assistant", content: res.content || "(sem resposta)" }]);
    } catch (e: any) {
      toast.error(e.message || "Erro no chat");
      setMessages((m) => [...m, { role: "assistant", content: `Erro: ${e.message}` }]);
    }
  };

  return (
    <div className="surface-elevated p-4 flex flex-col h-[600px]">
      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border/40">
        <Bot className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Co-Pilot AI</h3>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-1">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : ""}`}>
            {m.role === "assistant" && <Bot className="w-4 h-4 mt-0.5 text-primary shrink-0" />}
            <div className={`text-xs leading-relaxed rounded-lg px-3 py-2 max-w-[85%] whitespace-pre-wrap ${
              m.role === "user" ? "bg-primary/15 text-foreground" : "bg-muted/30 text-foreground"
            }`}>
              {m.content}
            </div>
            {m.role === "user" && <User className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />}
          </div>
        ))}
        {chat.isPending && (
          <div className="flex gap-2 items-center text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" /> pensando…
          </div>
        )}
      </div>
      <div className="flex gap-2 mt-3 pt-3 border-t border-border/40">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Pergunte algo…"
          disabled={chat.isPending}
          className="text-xs"
        />
        <Button size="sm" onClick={send} disabled={chat.isPending || !input.trim()}>
          <Send className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}
