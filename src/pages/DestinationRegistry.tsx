/**
 * Destination Registry Admin — Passo S.
 *
 * Read+write UI for `ad_conversion_destinations`. Owner/admin-only writes,
 * read for any workspace member. Credentials are NEVER displayed — only the
 * `credential_ref` pointer (masked). Filling the registry is what lets the
 * dispatch layer leave the legacy heuristic fallback.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { useWorkspaceRole } from "@/hooks/use-workspace-role";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Send, ShieldAlert, KeyRound, Trash2, Pencil, Info, FlaskConical, History, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { maskCredentialRef, type RegistryDispatchRow } from "@/lib/destination-dispatch-gate";

const PROVIDER_OPTIONS = [
  { value: "google_ads", label: "Google Ads" },
  { value: "meta",       label: "Meta (Facebook/Instagram)" },
  { value: "tiktok",     label: "TikTok Ads" },
  { value: "ga4",        label: "GA4" },
  { value: "microsoft",  label: "Microsoft / Bing Ads" },
  { value: "other",      label: "Outro" },
];

interface FormState {
  id?: string;
  provider: string;
  destination_id: string;
  display_name: string;
  account_id: string;
  conversion_action_id: string;
  event_name: string;
  pixel_id: string;
  credential_ref: string;
  status: string;
  consent_gate_required: boolean;
  send_enabled: boolean;
  test_mode_default: boolean;
  notes: string;
}

const EMPTY_FORM: FormState = {
  provider: "google_ads",
  destination_id: "",
  display_name: "",
  account_id: "",
  conversion_action_id: "",
  event_name: "purchase",
  pixel_id: "",
  credential_ref: "",
  status: "active",
  consent_gate_required: true,
  send_enabled: true,
  test_mode_default: false,
  notes: "",
};

interface RegistryFullRow extends RegistryDispatchRow {
  display_name?: string | null;
  pixel_id?: string | null;
  notes?: string | null;
  last_success_at?: string | null;
  last_error_at?: string | null;
}

export default function DestinationRegistry() {
  const { data: workspace } = useWorkspace();
  const workspaceId = workspace?.id;
  const { data: role } = useWorkspaceRole(workspaceId);
  const canWrite = role === "owner" || role === "admin";
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const listQuery = useQuery({
    queryKey: ["destination-registry", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<RegistryFullRow[]> => {
      const { data, error } = await supabase
        .from("ad_conversion_destinations")
        .select("id,provider,destination_id,display_name,account_id,conversion_action_id,event_name,pixel_id,credential_ref,status,consent_gate_required,send_enabled,test_mode_default,notes,last_success_at,last_error_at")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RegistryFullRow[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (state: FormState) => {
      if (!workspaceId) throw new Error("workspace missing");
      const payload = {
        workspace_id: workspaceId,
        provider: state.provider,
        destination_id: state.destination_id.trim(),
        display_name: state.display_name.trim() || state.destination_id.trim(),
        account_id: state.account_id.trim() || null,
        conversion_action_id: state.conversion_action_id.trim() || null,
        event_name: state.event_name.trim() || null,
        pixel_id: state.pixel_id.trim() || null,
        credential_ref: state.credential_ref.trim() || null,
        status: state.status,
        consent_gate_required: state.consent_gate_required,
        send_enabled: state.send_enabled,
        test_mode_default: state.test_mode_default,
        notes: state.notes.trim() || null,
      };
      if (state.id) {
        const { error } = await supabase
          .from("ad_conversion_destinations")
          .update(payload)
          .eq("id", state.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("ad_conversion_destinations")
          .insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Destino salvo");
      qc.invalidateQueries({ queryKey: ["destination-registry"] });
      setOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: (e: Error) => toast.error(`Falha ao salvar: ${e.message}`),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("ad_conversion_destinations")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Destino removido");
      qc.invalidateQueries({ queryKey: ["destination-registry"] });
    },
    onError: (e: Error) => toast.error(`Falha ao remover: ${e.message}`),
  });

  const rows = listQuery.data ?? [];
  const hasRows = rows.length > 0;

  const summary = useMemo(() => {
    const out = { active: 0, paused: 0, send_off: 0, no_credential: 0, test_only: 0 };
    for (const r of rows) {
      if (r.status === "active") out.active++;
      if (r.status === "paused") out.paused++;
      if (r.send_enabled === false) out.send_off++;
      if (!r.credential_ref) out.no_credential++;
      if (r.test_mode_default === true) out.test_only++;
    }
    return out;
  }, [rows]);

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Send className="h-6 w-6 text-primary" />
            Registry de destinos de conversão
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Lista normalizada por <code>provider + destination_id + account/conversion action</code>.
            Esta página NUNCA mostra segredos — apenas o ponteiro <code>credential_ref</code>{" "}
            (mascarado). Preencher o registry é o que tira o dispatch do fallback heurístico
            e ativa <strong>send_enabled</strong>, <strong>consent gate</strong> e{" "}
            <strong>test_mode</strong> por destino.
          </p>
        </div>
        {canWrite && (
          <Button
            onClick={() => { setForm(EMPTY_FORM); setOpen(true); }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" /> Novo destino
          </Button>
        )}
      </div>

      {!canWrite && (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="pt-4 text-sm flex items-start gap-2">
            <ShieldAlert className="h-4 w-4 text-warning mt-0.5" />
            Você está em modo somente leitura. Apenas <strong>owner/admin</strong> da workspace
            pode criar, editar ou remover destinos. RLS garante isso no banco também.
          </CardContent>
        </Card>
      )}

      <Card className="bg-muted/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Resumo</CardTitle>
          <CardDescription>
            Sem registry, o dispatcher cai no fallback heurístico (gateway_integrations_safe).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
            <Stat label="Ativos" value={summary.active} />
            <Stat label="Pausados" value={summary.paused} />
            <Stat label="Send off" value={summary.send_off} />
            <Stat label="Sem credential_ref" value={summary.no_credential} tone="warn" />
            <Stat label="Apenas test_mode" value={summary.test_only} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Destinos cadastrados</CardTitle>
          <CardDescription>
            Cada linha = um par <code>provider + destination_id</code>. Fluxo de dispatch
            respeita <code>send_enabled</code>, <code>status</code>, <code>consent_gate_required</code>{" "}
            e <code>test_mode_default</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasRows ? (
            <div className="text-sm text-muted-foreground rounded-md border border-dashed p-6 text-center space-y-2">
              <Info className="h-4 w-4 mx-auto text-muted-foreground" />
              <div>
                Nenhum destino cadastrado ainda — o dispatch atual usa o fallback
                heurístico baseado em <code>gateway_integrations_safe</code>.
              </div>
              {canWrite && (
                <div>
                  <Button variant="outline" onClick={() => { setForm(EMPTY_FORM); setOpen(true); }}>
                    Cadastrar primeiro destino
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Account / Action</TableHead>
                    <TableHead>Credential</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Flags</TableHead>
                    {canWrite && <TableHead className="text-right">Ações</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id ?? r.destination_id}>
                      <TableCell className="font-mono text-xs">{r.provider}</TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium">{r.display_name || r.destination_id}</div>
                        <div className="text-muted-foreground font-mono">{r.destination_id}</div>
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        <div>acct: {r.account_id ?? "—"}</div>
                        <div>action: {r.conversion_action_id ?? "—"}</div>
                        <div>event: {r.event_name ?? "—"}</div>
                      </TableCell>
                      <TableCell className="text-xs font-mono flex items-center gap-1">
                        <KeyRound className="h-3 w-3 text-muted-foreground" />
                        {maskCredentialRef(r.credential_ref ?? null)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.status === "active" ? "default" : "outline"} className="text-[10px]">
                          {r.status ?? "unknown"}
                        </Badge>
                      </TableCell>
                      <TableCell className="space-y-1">
                        <div className="flex flex-wrap gap-1">
                          <Badge variant={r.send_enabled ? "default" : "outline"} className="text-[10px]">
                            send {r.send_enabled ? "on" : "off"}
                          </Badge>
                          <Badge variant={r.consent_gate_required ? "secondary" : "outline"} className="text-[10px]">
                            consent {r.consent_gate_required ? "required" : "off"}
                          </Badge>
                          {r.test_mode_default && (
                            <Badge variant="outline" className="text-[10px]">test_mode</Badge>
                          )}
                        </div>
                      </TableCell>
                      {canWrite && (
                        <TableCell className="text-right space-x-1">
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => {
                              setForm({
                                id: r.id,
                                provider: r.provider,
                                destination_id: r.destination_id,
                                display_name: r.display_name ?? "",
                                account_id: r.account_id ?? "",
                                conversion_action_id: r.conversion_action_id ?? "",
                                event_name: r.event_name ?? "purchase",
                                pixel_id: r.pixel_id ?? "",
                                credential_ref: r.credential_ref ?? "",
                                status: r.status ?? "active",
                                consent_gate_required: r.consent_gate_required !== false,
                                send_enabled: r.send_enabled !== false,
                                test_mode_default: r.test_mode_default === true,
                                notes: r.notes ?? "",
                              });
                              setOpen(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => {
                              if (r.id && confirm(`Remover destino ${r.destination_id}?`)) {
                                remove.mutate(r.id);
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Passo T — Test Dispatch (read-only simulator) */}
      <TestDispatchPanel workspaceId={workspaceId} rows={rows} />

      {/* Passo T — Decision audit (no PII / no secrets) */}
      <DecisionAuditPanel workspaceId={workspaceId} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar destino" : "Novo destino"}</DialogTitle>
            <DialogDescription>
              Não cole segredos aqui. <code>credential_ref</code> é apenas um ponteiro
              (ex.: <code>vault:google:111</code>) que o backend usa para localizar a
              credencial real fora deste banco.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Field label="Provider">
              <Select value={form.provider} onValueChange={(v) => setForm((f) => ({ ...f, provider: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROVIDER_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">active</SelectItem>
                  <SelectItem value="paused">paused</SelectItem>
                  <SelectItem value="failing">failing</SelectItem>
                  <SelectItem value="unknown">unknown</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Destination ID *">
              <Input value={form.destination_id} onChange={(e) => setForm((f) => ({ ...f, destination_id: e.target.value }))} placeholder="google_ads:111:abc" />
            </Field>
            <Field label="Display name">
              <Input value={form.display_name} onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))} placeholder="Google BR — main" />
            </Field>
            <Field label="Account / Customer ID">
              <Input value={form.account_id} onChange={(e) => setForm((f) => ({ ...f, account_id: e.target.value }))} placeholder="111-222-3333" />
            </Field>
            <Field label="Conversion action ID">
              <Input value={form.conversion_action_id} onChange={(e) => setForm((f) => ({ ...f, conversion_action_id: e.target.value }))} placeholder="customers/.../conversionActions/..." />
            </Field>
            <Field label="Event name">
              <Input value={form.event_name} onChange={(e) => setForm((f) => ({ ...f, event_name: e.target.value }))} placeholder="purchase" />
            </Field>
            <Field label="Pixel ID">
              <Input value={form.pixel_id} onChange={(e) => setForm((f) => ({ ...f, pixel_id: e.target.value }))} placeholder="(Meta/TikTok)" />
            </Field>
            <Field label="credential_ref (ponteiro)" full>
              <Input value={form.credential_ref} onChange={(e) => setForm((f) => ({ ...f, credential_ref: e.target.value }))} placeholder="vault:google:111 ou cred:meta:my-pixel" />
            </Field>
            <Field label="Notas internas" full>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Sem PII. Use para contexto operacional." />
            </Field>
            <SwitchField
              label="send_enabled"
              checked={form.send_enabled}
              onChange={(v) => setForm((f) => ({ ...f, send_enabled: v }))}
              hint="Off ⇒ backend não dispara nada para este destino."
            />
            <SwitchField
              label="consent_gate_required"
              checked={form.consent_gate_required}
              onChange={(v) => setForm((f) => ({ ...f, consent_gate_required: v }))}
              hint="On ⇒ exige ads_consent_granted=true. Recomendado."
            />
            <SwitchField
              label="test_mode_default"
              checked={form.test_mode_default}
              onChange={(v) => setForm((f) => ({ ...f, test_mode_default: v }))}
              hint="On ⇒ destino só aceita callers em test_mode."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (!form.destination_id.trim()) {
                  toast.error("destination_id é obrigatório");
                  return;
                }
                upsert.mutate(form);
              }}
              disabled={upsert.isPending || !canWrite}
            >
              {form.id ? "Salvar" : "Criar destino"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  const cls = tone === "warn" ? "text-warning" : "text-foreground";
  return (
    <div className="rounded-md border border-border/50 bg-background p-3">
      <div className={`text-xl font-semibold ${cls}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "col-span-2 space-y-1" : "space-y-1"}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function SwitchField({
  label, checked, onChange, hint,
}: { label: string; checked: boolean; onChange: (v: boolean) => void; hint: string }) {
  return (
    <div className="col-span-2 rounded-md border border-border/50 p-3 flex items-start justify-between gap-3">
      <div>
        <Label className="text-xs">{label}</Label>
        <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Passo T — Test Dispatch panel (read-only). Calls dispatch-test
// edge function which NEVER sends events to providers.
// ════════════════════════════════════════════════════════════════
function TestDispatchPanel({ workspaceId, rows }: { workspaceId?: string; rows: RegistryFullRow[] }) {
  const [provider, setProvider] = useState("google_ads");
  const [destinationId, setDestinationId] = useState<string>("");
  const [eventName, setEventName] = useState("purchase");
  const [consent, setConsent] = useState(true);
  const [testMode, setTestMode] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const providerRows = rows.filter((r) => r.provider === provider);

  async function run() {
    if (!workspaceId) return;
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("dispatch-test", {
        body: {
          workspace_id: workspaceId,
          provider,
          destination_id: destinationId || undefined,
          event_name: eventName || undefined,
          consent_granted: consent,
          test_mode: testMode,
        },
      });
      if (error) throw error;
      setResult(data);
    } catch (e: any) {
      toast.error(`Falha: ${e.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-primary" /> Testar dispatch (dry-run)
        </CardTitle>
        <CardDescription>
          Simula a decisão do <code>destination-dispatch-gate</code> sem enviar nada para Google/Meta/TikTok/GA4.
          Credenciais nunca aparecem.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="space-y-1">
            <Label className="text-xs">Provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="google_ads">google_ads</SelectItem>
                <SelectItem value="meta">meta</SelectItem>
                <SelectItem value="tiktok">tiktok</SelectItem>
                <SelectItem value="ga4">ga4</SelectItem>
                <SelectItem value="microsoft">microsoft</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Destination (opcional)</Label>
            <Select value={destinationId || "all"} onValueChange={(v) => setDestinationId(v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">— todos —</SelectItem>
                {providerRows.map((r) => (
                  <SelectItem key={r.destination_id} value={r.destination_id}>{r.destination_id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Event name</Label>
            <Input value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="purchase" />
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={consent} onCheckedChange={setConsent} /> consent_granted
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={testMode} onCheckedChange={setTestMode} /> test_mode
            </label>
          </div>
        </div>
        <Button onClick={run} disabled={loading || !workspaceId} size="sm" className="gap-2">
          <FlaskConical className="h-3.5 w-3.5" /> {loading ? "Avaliando…" : "Simular dispatch"}
        </Button>
        {result?.decision && (
          <div className="rounded-md border bg-muted/20 p-3 text-xs space-y-2">
            <div className="flex items-center gap-2">
              {result.decision.fallback ? (
                <Badge variant="outline">fallback (registry vazio)</Badge>
              ) : result.decision.targets.length > 0 ? (
                <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> {result.decision.targets.length} permitido(s)</Badge>
              ) : (
                <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> bloqueado</Badge>
              )}
              <span className="text-muted-foreground">linhas avaliadas: {result.decision.matched_registry_rows}</span>
              <span className="text-muted-foreground">— dispatched: {String(result.dispatched)}</span>
            </div>
            {result.decision.targets.length > 0 && (
              <div>
                <div className="font-semibold">Targets:</div>
                {result.decision.targets.map((t: any) => (
                  <div key={t.destination_id} className="font-mono">
                    ✓ {t.destination_id} — credential: {t.credential_ref} {t.test_mode && <Badge variant="outline" className="text-[9px] ml-1">test_mode</Badge>}
                  </div>
                ))}
              </div>
            )}
            {result.decision.skipped.length > 0 && (
              <div>
                <div className="font-semibold">Bloqueados:</div>
                {result.decision.skipped.map((s: any) => (
                  <div key={s.destination_id} className="font-mono">
                    ✗ {s.destination_id} — {s.reasons.join(", ")}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════
// Passo T — Decision audit (event_deliveries with dispatch_decision).
// Lists last 20 gate decisions (no PII, no credentials).
// ════════════════════════════════════════════════════════════════
function DecisionAuditPanel({ workspaceId }: { workspaceId?: string }) {
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [decisionFilter, setDecisionFilter] = useState<string>("all");
  const [destinationFilter, setDestinationFilter] = useState<string>("");

  const auditQuery = useQuery({
    queryKey: ["dispatch-audit", workspaceId, providerFilter, decisionFilter, destinationFilter],
    enabled: !!workspaceId,
    queryFn: async () => {
      // Passo U — prefer dedicated dispatch_decision_log via RPC (filters,
      // pagination cap, no PII). Fallback to legacy event_deliveries scan
      // when the RPC is unavailable on older deployments.
      try {
        const { data, error } = await supabase.rpc("list_dispatch_decisions" as never, {
          _workspace_id: workspaceId!,
          _provider: providerFilter === "all" ? null : providerFilter,
          _destination_id: destinationFilter ? destinationFilter : null,
          _decision: decisionFilter === "all" ? null : decisionFilter,
          _limit: 50,
        } as never);
        if (!error && Array.isArray(data)) {
          return (data as Array<Record<string, unknown>>).map((r) => ({
            id: r.id as string,
            event_id: (r.event_id as string) ?? null,
            provider: r.provider as string,
            destination: (r.destination_id as string) ?? "—",
            decision: r.decision as string,
            reasons: Array.isArray(r.reasons) ? (r.reasons as string[]) : [],
            test_mode: r.test_mode === true,
            last_attempt_at: r.created_at as string,
            status: r.decision as string,
            request_json: { reasons: r.reasons },
          }));
        }
      } catch { /* fall through */ }
      const { data } = await supabase
        .from("event_deliveries")
        .select("id,event_id,provider,destination,status,last_attempt_at,request_json,error_message")
        .eq("workspace_id", workspaceId!)
        .eq("status", "skipped")
        .order("last_attempt_at", { ascending: false })
        .limit(20);
      return (data ?? []).map((row: Record<string, unknown>) => ({
        ...row,
        reasons: Array.isArray((row.request_json as { reasons?: unknown })?.reasons)
          ? ((row.request_json as { reasons: string[] }).reasons)
          : [],
        decision: (row.request_json as { dispatch_decision?: string })?.dispatch_decision ?? row.status,
        test_mode: false,
      }));
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4 text-primary" /> Auditoria de decisões de dispatch
        </CardTitle>
        <CardDescription>
          Últimas 50 decisões (Passo U). Sem PII, sem credenciais. Filtros por provider, destination e decision.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={providerFilter} onValueChange={setProviderFilter}>
            <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os providers</SelectItem>
              {PROVIDER_OPTIONS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={decisionFilter} onValueChange={setDecisionFilter}>
            <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as decisões</SelectItem>
              <SelectItem value="allow">allow</SelectItem>
              <SelectItem value="block">block</SelectItem>
              <SelectItem value="dry_run">dry_run</SelectItem>
              <SelectItem value="test_mode">test_mode</SelectItem>
              <SelectItem value="fallback">fallback</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={destinationFilter}
            onChange={(e) => setDestinationFilter(e.target.value)}
            placeholder="destination_id (opcional)"
            className="h-8 w-[220px] text-xs"
          />
        </div>
        {!auditQuery.data?.length ? (
          <div className="text-xs text-muted-foreground">Nenhuma decisão recente para os filtros selecionados.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Quando</TableHead>
                  <TableHead className="text-xs">Provider</TableHead>
                  <TableHead className="text-xs">Destination</TableHead>
                  <TableHead className="text-xs">Decision</TableHead>
                  <TableHead className="text-xs">Motivos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditQuery.data.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-[10px] font-mono">{(row.last_attempt_at ?? "").slice(0, 19)}</TableCell>
                    <TableCell className="text-xs font-mono">{row.provider}</TableCell>
                    <TableCell className="text-xs font-mono">{row.destination}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {row.decision}{row.test_mode ? " · test" : ""}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{(row.reasons ?? []).join(", ") || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
