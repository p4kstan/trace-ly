import { useState } from "react";
import { CheckCircle, XCircle, Clock, ArrowRight } from "lucide-react";

const debugEvents = [
  {
    id: 1,
    event: "Purchase",
    timestamp: "14:32:01.234",
    request: { event_name: "Purchase", value: 297, currency: "BRL", email_hash: "a1b2c3..." },
    response: { status: 200, events_received: 1, fbtrace_id: "AbC123..." },
    destination: "Meta CAPI",
    status: "success",
    latency: "142ms",
  },
  {
    id: 2,
    event: "Lead",
    timestamp: "14:30:55.891",
    request: { event_name: "Lead", gclid: "CjwK...", email_hash: "d4e5f6..." },
    response: { status: 200, conversion_action: "accounts/123/conversionActions/456" },
    destination: "Google Ads",
    status: "success",
    latency: "198ms",
  },
  {
    id: 3,
    event: "Purchase",
    timestamp: "14:27:30.112",
    request: { event_name: "Purchase", value: 97, currency: "BRL" },
    response: { status: 429, message: "Rate limit exceeded" },
    destination: "TikTok CAPI",
    status: "error",
    latency: "89ms",
  },
];

export default function Debugger() {
  const [selected, setSelected] = useState(debugEvents[0]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Event Debugger</h1>
        <p className="text-muted-foreground text-sm mt-1">Inspect event payloads and API responses</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="space-y-2">
          {debugEvents.map((evt) => (
            <button
              key={evt.id}
              onClick={() => setSelected(evt)}
              className={`w-full text-left glass-card p-4 transition-all ${
                selected.id === evt.id ? "ring-1 ring-primary glow-primary" : "hover:bg-muted/30"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground text-sm">{evt.event}</span>
                {evt.status === "success" ? (
                  <CheckCircle className="w-4 h-4 text-success" />
                ) : (
                  <XCircle className="w-4 h-4 text-destructive" />
                )}
              </div>
              <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                <span>{evt.destination}</span>
                <span>•</span>
                <span>{evt.timestamp}</span>
                <span>•</span>
                <Clock className="w-3 h-3" />
                <span>{evt.latency}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="glass-card p-4">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs font-medium text-muted-foreground uppercase">Request</span>
              <ArrowRight className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs font-medium text-primary">{selected.destination}</span>
            </div>
            <pre className="bg-muted/50 rounded-lg p-4 text-xs font-mono text-foreground overflow-auto max-h-64">
              {JSON.stringify(selected.request, null, 2)}
            </pre>
          </div>

          <div className="glass-card p-4">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs font-medium text-muted-foreground uppercase">Response</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                selected.status === "success" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
              }`}>
                {selected.response.status}
              </span>
            </div>
            <pre className="bg-muted/50 rounded-lg p-4 text-xs font-mono text-foreground overflow-auto max-h-64">
              {JSON.stringify(selected.response, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
