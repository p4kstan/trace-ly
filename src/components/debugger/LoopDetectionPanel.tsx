import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Activity, ScrollText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Painel de blindagem anti-loop (apenas leitura, roda no preview do dashboard).
 * - Loop Detection: monitora window.dataLayer.length em janelas de 5s.
 * - Script Injection Monitor: MutationObserver em <head> contando scripts
 *   adicionados que apontem para googletagmanager.com ou googleadservices.com.
 */
export function LoopDetectionPanel() {
  const [dlSize, setDlSize] = useState(0);
  const [dlGrowth5s, setDlGrowth5s] = useState(0);
  const [scriptCount, setScriptCount] = useState(0);
  const [scriptPerMin, setScriptPerMin] = useState(0);
  const [alerts, setAlerts] = useState<string[]>([]);

  const historyRef = useRef<{ ts: number; size: number }[]>([]);
  const scriptHistoryRef = useRef<number[]>([]);
  const observerRef = useRef<MutationObserver | null>(null);

  const reset = () => {
    historyRef.current = [];
    scriptHistoryRef.current = [];
    setScriptCount(0);
    setScriptPerMin(0);
    setDlGrowth5s(0);
    setAlerts([]);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Loop detection — sample dataLayer length each second
    const interval = window.setInterval(() => {
      const dl = (window as any).dataLayer as unknown[] | undefined;
      const size = Array.isArray(dl) ? dl.length : 0;
      const now = Date.now();
      historyRef.current.push({ ts: now, size });
      historyRef.current = historyRef.current.filter((h) => now - h.ts <= 5000);
      const oldest = historyRef.current[0];
      const growth = oldest ? size - oldest.size : 0;
      setDlSize(size);
      setDlGrowth5s(growth);
      if (growth > 50) {
        setAlerts((prev) => {
          const msg = `⚠️ dataLayer cresceu ${growth} entradas em 5s — possível loop`;
          if (prev[0] === msg) return prev;
          return [msg, ...prev].slice(0, 8);
        });
      }
    }, 1000);

    // Script Injection Monitor — observe <head> for new <script> nodes
    const head = document.head;
    const observer = new MutationObserver((mutations) => {
      let added = 0;
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (node.nodeName !== "SCRIPT") return;
          const src = (node as HTMLScriptElement).src || "";
          if (
            /googletagmanager\.com/i.test(src) ||
            /googleadservices\.com/i.test(src) ||
            /connect\.facebook\.net/i.test(src)
          ) {
            added++;
          }
        });
      }
      if (added === 0) return;
      const now = Date.now();
      for (let i = 0; i < added; i++) scriptHistoryRef.current.push(now);
      scriptHistoryRef.current = scriptHistoryRef.current.filter(
        (ts) => now - ts <= 60_000,
      );
      setScriptCount((c) => c + added);
      setScriptPerMin(scriptHistoryRef.current.length);
      if (scriptHistoryRef.current.length > 20) {
        setAlerts((prev) => {
          const msg = `🚨 ${scriptHistoryRef.current.length} scripts injetados/min — loop detectado`;
          if (prev[0] === msg) return prev;
          return [msg, ...prev].slice(0, 8);
        });
      }
    });
    observer.observe(head, { childList: true });
    observerRef.current = observer;

    return () => {
      window.clearInterval(interval);
      observer.disconnect();
    };
  }, []);

  const dlAlert = dlGrowth5s > 50;
  const scriptAlert = scriptPerMin > 20;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div
        className={`glass-card p-4 ${
          dlAlert ? "ring-1 ring-destructive" : ""
        }`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity
              className={`w-4 h-4 ${
                dlAlert ? "text-destructive" : "text-primary"
              }`}
            />
            <span className="text-sm font-medium text-foreground">
              Loop Detection
            </span>
          </div>
          {dlAlert && (
            <AlertTriangle className="w-4 h-4 text-destructive animate-pulse" />
          )}
        </div>
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">dataLayer.length</span>
            <span className="font-mono text-foreground">{dlSize}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">crescimento (5s)</span>
            <span
              className={`font-mono ${
                dlAlert ? "text-destructive" : "text-foreground"
              }`}
            >
              +{dlGrowth5s}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">limite</span>
            <span className="font-mono text-muted-foreground">50/5s</span>
          </div>
        </div>
      </div>

      <div
        className={`glass-card p-4 ${
          scriptAlert ? "ring-1 ring-destructive" : ""
        }`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ScrollText
              className={`w-4 h-4 ${
                scriptAlert ? "text-destructive" : "text-primary"
              }`}
            />
            <span className="text-sm font-medium text-foreground">
              Script Injection Monitor
            </span>
          </div>
          {scriptAlert && (
            <AlertTriangle className="w-4 h-4 text-destructive animate-pulse" />
          )}
        </div>
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">total observado</span>
            <span className="font-mono text-foreground">{scriptCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">scripts/min</span>
            <span
              className={`font-mono ${
                scriptAlert ? "text-destructive" : "text-foreground"
              }`}
            >
              {scriptPerMin}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">limite</span>
            <span className="font-mono text-muted-foreground">20/min</span>
          </div>
        </div>
      </div>

      <div className="md:col-span-2 glass-card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase">
            Alertas recentes
          </span>
          <Button size="sm" variant="ghost" onClick={reset} className="h-7">
            <RefreshCw className="w-3 h-3 mr-1.5" />
            Reset counters
          </Button>
        </div>
        {alerts.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhuma anomalia detectada nesta sessão.
          </p>
        ) : (
          <ul className="space-y-1 text-xs font-mono">
            {alerts.map((a, i) => (
              <li key={i} className="text-destructive">
                {a}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
