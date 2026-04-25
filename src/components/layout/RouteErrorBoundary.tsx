import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /** Pathname; when it changes, the boundary resets so the new route can render. */
  routeKey?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/** Redact obvious PII / secrets from an error message before logging. */
function redactMessage(msg: string): string {
  if (!msg) return msg;
  return msg
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b\d{11,}\b/g, "[number]")
    .replace(/(authorization|bearer|token|api[_-]?key|secret|password)\s*[:=]\s*\S+/gi, "$1=[redacted]");
}

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Redacted log only — never include raw user/PII data.
    // eslint-disable-next-line no-console
    console.error("[RouteErrorBoundary]", redactMessage(error?.message ?? "unknown"), {
      stackPreview: redactMessage((error?.stack ?? "").split("\n").slice(0, 3).join(" | ")),
      componentStackPreview: (info.componentStack ?? "").split("\n").slice(0, 4).join(" | "),
    });
  }

  componentDidUpdate(prev: Props) {
    if (this.state.hasError && prev.routeKey !== this.props.routeKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleReset = () => this.setState({ hasError: false, error: null });

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    if (typeof window !== "undefined") window.location.assign("/");
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const isDev = typeof import.meta !== "undefined" && Boolean((import.meta as any).env?.DEV);
    const safeMsg = redactMessage(this.state.error?.message ?? "");

    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4 sm:p-6 min-w-0">
        <div className="surface-elevated p-6 sm:p-8 max-w-md w-full text-center space-y-4 animate-fade-in min-w-0">
          <div className="w-12 h-12 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold text-foreground break-words">
            Algo falhou ao renderizar esta tela
          </h2>
          <p className="text-sm text-muted-foreground break-words">
            Você pode tentar novamente ou voltar ao Painel.
          </p>
          {isDev && safeMsg && (
            <pre className="text-[10px] text-muted-foreground/70 bg-muted/30 rounded-lg p-3 overflow-auto max-h-32 text-left whitespace-pre-wrap break-all">
              {safeMsg}
            </pre>
          )}
          <div className="flex gap-2 justify-center flex-wrap">
            <Button variant="outline" size="sm" onClick={this.handleReset} className="gap-2">
              <RefreshCw className="w-3.5 h-3.5" />
              Tentar novamente
            </Button>
            <Button size="sm" onClick={this.handleGoHome} className="gap-2">
              <Home className="w-3.5 h-3.5" />
              Voltar ao Painel
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
