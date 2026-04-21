/**
 * automation-rule-notify
 *
 * Dispara notificações configuradas (Slack/Email/Webhook) para uma regra de
 * automação que acabou de ser avaliada. Chamada internamente pelo
 * `automation-rule-evaluate` (com SERVICE_ROLE) ou diretamente da UI para
 * testar um canal.
 *
 * Body:
 *   { rule_id, payload: { matched, executed, items: [...] }, test?: boolean, alert_id?: string }
 *
 * Ordem de entrega: por valor de impacto (executados > matched > skipped),
 * mas como já recebemos o resultado pronto, apenas iteramos canais habilitados.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface Alert {
  id: string;
  channel: "slack" | "email" | "webhook";
  target: string;
  enabled: boolean;
  only_on_action: boolean;
}

interface Payload {
  matched: number;
  executed: number;
  skipped?: number;
  items?: Array<{ id: string; name?: string; value?: number; executed?: string; error?: string }>;
}

const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function buildSummary(ruleName: string, ruleDesc: string | null, payload: Payload) {
  const top = (payload.items || []).slice(0, 5).map((it) =>
    `• ${it.name || it.id}${typeof it.value === "number" ? ` — valor: ${it.value}` : ""}${it.executed ? ` ✅ ${it.executed}` : ""}${it.error ? ` ❌ ${it.error}` : ""}`,
  ).join("\n");
  return {
    title: `🤖 Regra acionada: ${ruleName}`,
    body: [
      ruleDesc ? `_${ruleDesc}_` : "",
      `*Itens que bateram a condição:* ${payload.matched}`,
      `*Ações executadas:* ${payload.executed}`,
      payload.skipped ? `*Puladas:* ${payload.skipped}` : "",
      "",
      top ? `*Top 5:*\n${top}` : "",
    ].filter(Boolean).join("\n"),
  };
}

async function sendSlack(webhookUrl: string, ruleName: string, ruleDesc: string | null, payload: Payload) {
  const { title, body } = buildSummary(ruleName, ruleDesc, payload);
  const r = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: title,
      blocks: [
        { type: "header", text: { type: "plain_text", text: title.replace(/[*_]/g, "") } },
        { type: "section", text: { type: "mrkdwn", text: body } },
      ],
    }),
  });
  if (!r.ok) throw new Error(`slack ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

async function sendWebhook(url: string, ruleId: string, ruleName: string, payload: Payload) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "automation_rule.triggered",
      rule_id: ruleId,
      rule_name: ruleName,
      ...payload,
      sent_at: new Date().toISOString(),
    }),
  });
  if (!r.ok) throw new Error(`webhook ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

async function sendEmail(to: string, ruleName: string, ruleDesc: string | null, payload: Payload) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!RESEND_API_KEY || !LOVABLE_API_KEY) {
    throw new Error("Email não configurado (faltam RESEND_API_KEY/LOVABLE_API_KEY). Use Slack ou Webhook por enquanto.");
  }
  const { title, body } = buildSummary(ruleName, ruleDesc, payload);
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px">
    <h2 style="color:#111">${title}</h2>
    <pre style="background:#f4f4f5;padding:12px;border-radius:6px;white-space:pre-wrap;font-family:inherit">${body}</pre>
  </div>`;
  const r = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": RESEND_API_KEY,
    },
    body: JSON.stringify({
      from: "Lovable Alerts <onboarding@resend.dev>",
      to: [to],
      subject: title,
      html,
    }),
  });
  if (!r.ok) throw new Error(`email ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const ruleId: string = body.rule_id;
    const payload: Payload = body.payload || { matched: 0, executed: 0 };
    const test: boolean = !!body.test;
    const alertIdFilter: string | undefined = body.alert_id;

    if (!ruleId) return json({ error: "rule_id required" }, 400);

    const { data: rule } = await service.from("automation_rules")
      .select("id, name, description, workspace_id").eq("id", ruleId).single();
    if (!rule) return json({ error: "rule not found" }, 404);

    let q = service.from("automation_rule_alerts").select("*").eq("rule_id", ruleId).eq("enabled", true);
    if (alertIdFilter) q = q.eq("id", alertIdFilter);
    const { data: alerts } = await q;
    const list = (alerts || []) as Alert[];

    const results: Array<{ id: string; channel: string; ok: boolean; error?: string }> = [];

    // Ordena por valor: webhook (síncrono pra app), depois slack (chat), depois email
    const order = { webhook: 0, slack: 1, email: 2 } as const;
    list.sort((a, b) => order[a.channel] - order[b.channel]);

    for (const a of list) {
      // Skip se a regra não fez nada e o canal pediu pra notificar só quando há ação
      if (!test && a.only_on_action && payload.executed === 0) {
        results.push({ id: a.id, channel: a.channel, ok: true, error: "skipped (no action)" });
        continue;
      }
      try {
        if (a.channel === "slack") await sendSlack(a.target, rule.name, rule.description, payload);
        else if (a.channel === "webhook") await sendWebhook(a.target, rule.id, rule.name, payload);
        else if (a.channel === "email") await sendEmail(a.target, rule.name, rule.description, payload);
        await service.from("automation_rule_alerts").update({
          last_sent_at: new Date().toISOString(), last_status: "ok", last_error: null,
        }).eq("id", a.id);
        results.push({ id: a.id, channel: a.channel, ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await service.from("automation_rule_alerts").update({
          last_sent_at: new Date().toISOString(), last_status: "error", last_error: msg.slice(0, 500),
        }).eq("id", a.id);
        results.push({ id: a.id, channel: a.channel, ok: false, error: msg });
      }
    }

    return json({ sent: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results });
  } catch (e) {
    console.error("notify error", e);
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
