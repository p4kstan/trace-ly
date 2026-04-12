import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// ─── Internal event types ───
type InternalEvent =
  | "checkout_created" | "checkout_started" | "checkout_abandoned"
  | "order_created" | "order_pending" | "order_waiting_payment"
  | "order_paid" | "order_approved" | "order_refused" | "order_canceled"
  | "order_expired" | "order_refunded" | "order_partially_refunded" | "order_chargeback"
  | "payment_created" | "payment_pending" | "payment_authorized" | "payment_paid"
  | "payment_failed" | "payment_refunded"
  | "pix_generated" | "pix_paid" | "boleto_generated" | "boleto_paid"
  | "subscription_started" | "subscription_renewed" | "subscription_past_due" | "subscription_canceled"
  | "lead_captured";

// ─── Default internal → Meta mapping ───
const INTERNAL_TO_META: Record<string, string> = {
  checkout_created: "InitiateCheckout",
  checkout_started: "InitiateCheckout",
  payment_created: "AddPaymentInfo",
  payment_authorized: "AddPaymentInfo",
  order_paid: "Purchase",
  order_approved: "Purchase",
  payment_paid: "Purchase",
  pix_paid: "Purchase",
  boleto_paid: "Purchase",
  subscription_started: "Subscribe",
  lead_captured: "Lead",
};

const META_EVENTS = new Set([
  "PageView","ViewContent","AddToCart","InitiateCheckout","AddPaymentInfo",
  "Purchase","Lead","CompleteRegistration","Search","AddToWishlist",
  "Contact","Subscribe","StartTrial","SubmitApplication","CustomizeProduct",
  "Schedule","Donate","FindLocation",
]);

// ─── Normalized structures ───
interface NormalizedCustomer {
  name?: string;
  email?: string;
  phone?: string;
  document?: string;
}

interface NormalizedOrder {
  gateway: string;
  external_order_id: string;
  external_payment_id?: string;
  external_checkout_id?: string;
  external_subscription_id?: string;
  customer: NormalizedCustomer;
  status: string;
  total_value?: number;
  currency?: string;
  payment_method?: string;
  installments?: number;
  items?: Array<{ product_id?: string; product_name?: string; category?: string; quantity: number; unit_price?: number; total_price?: number }>;
  raw_payload: unknown;
}

// ─── Per-gateway: event type extraction + normalization ───

// Helper to safely get nested values
function dig(obj: any, ...keys: string[]): any {
  let cur = obj;
  for (const k of keys) {
    if (cur == null) return undefined;
    cur = cur[k];
  }
  return cur;
}

function str(v: any): string { return v != null ? String(v) : ""; }
function num(v: any): number { const n = Number(v); return isNaN(n) ? 0 : n; }

// ─── STRIPE ───
function stripeEventType(p: any): string { return str(p.type); }
function stripeInternalEvent(evtType: string): InternalEvent {
  const m: Record<string, InternalEvent> = {
    "checkout.session.completed": "order_paid",
    "payment_intent.succeeded": "payment_paid",
    "payment_intent.created": "payment_created",
    "charge.succeeded": "payment_paid",
    "charge.refunded": "payment_refunded",
    "charge.dispute.created": "order_chargeback",
    "customer.subscription.created": "subscription_started",
    "customer.subscription.updated": "subscription_renewed",
    "customer.subscription.deleted": "subscription_canceled",
    "invoice.paid": "payment_paid",
  };
  return m[evtType] || "order_created";
}
function normalizeStripe(p: any): NormalizedOrder {
  const obj = dig(p, "data", "object") || {};
  const cust = obj.customer_details || obj.customer || {};
  return {
    gateway: "stripe",
    external_order_id: str(obj.id || obj.payment_intent),
    external_payment_id: str(obj.payment_intent || obj.id),
    customer: { email: str(cust.email || obj.receipt_email), name: str(cust.name) },
    status: str(obj.status || obj.payment_status),
    total_value: num(obj.amount_total || obj.amount) / 100,
    currency: str(obj.currency || "usd").toUpperCase(),
    payment_method: str(dig(obj, "payment_method_types", 0) || "card"),
    raw_payload: p,
  };
}

// ─── MERCADO PAGO ───
function mercadopagoEventType(p: any): string { return str(p.action || p.type); }
function mercadopagoInternalEvent(evtType: string): InternalEvent {
  const m: Record<string, InternalEvent> = {
    "payment.created": "payment_created",
    "payment.approved": "payment_paid",
    "payment.updated": "payment_pending",
    "payment.refunded": "payment_refunded",
    "payment.cancelled": "order_canceled",
    "payment.in_process": "payment_pending",
    "payment.rejected": "payment_failed",
    "payment.pending": "payment_pending",
    "chargebacks": "order_chargeback",
  };
  return m[evtType] || "order_created";
}
function normalizeMercadoPago(p: any): NormalizedOrder {
  const data = p.data || {};
  return {
    gateway: "mercadopago",
    external_order_id: str(data.id || p.id),
    external_payment_id: str(data.id),
    customer: { email: str(dig(data, "payer", "email")), name: str(dig(data, "payer", "first_name")) },
    status: str(p.action),
    total_value: num(data.transaction_amount),
    currency: str(data.currency_id || "BRL"),
    payment_method: str(dig(data, "payment_method", "type") || dig(data, "payment_type_id")),
    installments: num(data.installments) || undefined,
    raw_payload: p,
  };
}

// ─── PAGAR.ME ───
function pagarmeEventType(p: any): string { return str(p.type); }
function pagarmeInternalEvent(evtType: string): InternalEvent {
  const m: Record<string, InternalEvent> = {
    "order.created": "order_created",
    "order.paid": "order_paid",
    "order.canceled": "order_canceled",
    "charge.paid": "payment_paid",
    "charge.failed": "payment_failed",
    "charge.refunded": "payment_refunded",
    "subscription.created": "subscription_started",
    "subscription.canceled": "subscription_canceled",
    "subscription.charged": "subscription_renewed",
  };
  return m[evtType] || "order_created";
}
function normalizePagarme(p: any): NormalizedOrder {
  const data = p.data || {};
  const cust = data.customer || {};
  const charges = data.charges || [];
  const charge = charges[0] || {};
  return {
    gateway: "pagarme",
    external_order_id: str(data.id || data.code),
    external_payment_id: str(charge.id),
    customer: { email: str(cust.email), name: str(cust.name), phone: str(dig(cust, "phones", "mobile_phone", "number")), document: str(cust.document) },
    status: str(data.status),
    total_value: num(data.amount) / 100,
    currency: str(data.currency || "BRL"),
    payment_method: str(charge.payment_method),
    installments: num(charge.installments) || undefined,
    raw_payload: p,
  };
}

// ─── ASAAS ───
function asaasEventType(p: any): string { return str(p.event); }
function asaasInternalEvent(evtType: string): InternalEvent {
  const m: Record<string, InternalEvent> = {
    "PAYMENT_CREATED": "payment_created",
    "PAYMENT_UPDATED": "payment_pending",
    "PAYMENT_RECEIVED": "payment_paid",
    "PAYMENT_CONFIRMED": "payment_paid",
    "PAYMENT_OVERDUE": "payment_failed",
    "PAYMENT_DELETED": "order_canceled",
    "PAYMENT_REFUNDED": "payment_refunded",
    "PAYMENT_CHARGEBACK_REQUESTED": "order_chargeback",
    "PAYMENT_DUNNING_RECEIVED": "payment_paid",
  };
  return m[evtType] || "payment_pending";
}
function normalizeAsaas(p: any): NormalizedOrder {
  const payment = p.payment || {};
  return {
    gateway: "asaas",
    external_order_id: str(payment.id),
    external_payment_id: str(payment.id),
    customer: { name: str(payment.customerName), email: str(payment.customerEmail), phone: str(payment.customerPhone), document: str(payment.cpfCnpj) },
    status: str(payment.status),
    total_value: num(payment.value || payment.netValue),
    currency: "BRL",
    payment_method: str(payment.billingType),
    raw_payload: p,
  };
}

// ─── HOTMART ───
function hotmartEventType(p: any): string { return str(p.event || p.hottok && "PURCHASE"); }
function hotmartInternalEvent(evtType: string): InternalEvent {
  const m: Record<string, InternalEvent> = {
    "PURCHASE_COMPLETE": "order_paid",
    "PURCHASE_APPROVED": "order_paid",
    "PURCHASE_PROTEST": "order_chargeback",
    "PURCHASE_REFUNDED": "order_refunded",
    "PURCHASE_CHARGEBACK": "order_chargeback",
    "PURCHASE_CANCELED": "order_canceled",
    "PURCHASE_BILLET_PRINTED": "boleto_generated",
    "PURCHASE_DELAYED": "payment_pending",
    "SUBSCRIPTION_CANCELLATION": "subscription_canceled",
    "SWITCH_PLAN": "subscription_renewed",
  };
  return m[evtType] || "order_created";
}
function normalizeHotmart(p: any): NormalizedOrder {
  const data = p.data || p;
  const buyer = data.buyer || {};
  const purchase = data.purchase || {};
  const product = data.product || {};
  return {
    gateway: "hotmart",
    external_order_id: str(purchase.transaction || purchase.order_bump?.id),
    external_payment_id: str(purchase.transaction),
    customer: { email: str(buyer.email), name: str(buyer.name), phone: str(buyer.phone || buyer.cellphone), document: str(buyer.document) },
    status: str(purchase.status),
    total_value: num(purchase.price?.value || purchase.original_offer_price?.value),
    currency: str(purchase.price?.currency_value || "BRL"),
    payment_method: str(purchase.payment?.type),
    items: [{ product_name: str(product.name), product_id: str(product.id), quantity: 1, unit_price: num(purchase.price?.value) }],
    raw_payload: p,
  };
}

// ─── MONETIZZE ───
function monetizzeEventType(p: any): string { return str(p.tipoPostback?.cod || p.tipo_postback || p.event); }
function monetizzeInternalEvent(evtType: string): InternalEvent {
  const lower = evtType.toLowerCase();
  if (lower.includes("aprovad") || lower === "1") return "order_paid";
  if (lower.includes("aguardando") || lower === "2") return "payment_pending";
  if (lower.includes("cancelad") || lower === "3") return "order_canceled";
  if (lower.includes("devolvid") || lower.includes("reembolso") || lower === "6") return "order_refunded";
  if (lower.includes("chargeback") || lower === "7") return "order_chargeback";
  if (lower.includes("assinatura_ativ")) return "subscription_started";
  if (lower.includes("assinatura_renov")) return "subscription_renewed";
  if (lower.includes("assinatura_cancel")) return "subscription_canceled";
  return "order_created";
}
function normalizeMonetizze(p: any): NormalizedOrder {
  const venda = p.venda || p;
  const comprador = p.comprador || venda.comprador || {};
  const produto = p.produto || venda.produto || {};
  return {
    gateway: "monetizze",
    external_order_id: str(venda.codigo || venda.transacao || p.transacao),
    external_payment_id: str(venda.codigo || venda.transacao),
    customer: { email: str(comprador.email), name: str(comprador.nome), phone: str(comprador.telefone), document: str(comprador.cnpj_cpf) },
    status: str(venda.status || venda.statusDescricao),
    total_value: num(venda.valorLiquido || venda.valor || venda.preco),
    currency: "BRL",
    payment_method: str(venda.formaPagamento || venda.forma_pagamento),
    items: produto.nome ? [{ product_name: str(produto.nome), product_id: str(produto.codigo), quantity: 1 }] : undefined,
    raw_payload: p,
  };
}

// ─── EDUZZ ───
function eduzzEventType(p: any): string { return str(p.event_type || p.trans_status); }
function eduzzInternalEvent(evtType: string): InternalEvent {
  const m: Record<string, InternalEvent> = {
    "invoice_created": "order_created",
    "invoice_approved": "order_paid",
    "invoice_paid": "order_paid",
    "invoice_pending": "payment_pending",
    "invoice_canceled": "order_canceled",
    "invoice_refunded": "order_refunded",
    "contract_created": "subscription_started",
    "contract_renewed": "subscription_renewed",
    "contract_canceled": "subscription_canceled",
    "1": "payment_pending",
    "3": "order_paid",
    "4": "order_canceled",
    "6": "payment_pending",
    "7": "order_refunded",
  };
  return m[evtType] || "order_created";
}
function normalizeEduzz(p: any): NormalizedOrder {
  const sale = p.sale || p;
  const client = p.client || sale.client || {};
  const content = p.content || sale.content || {};
  return {
    gateway: "eduzz",
    external_order_id: str(sale.sale_id || sale.invoice_code || p.trans_cod),
    external_payment_id: str(sale.sale_id || p.trans_cod),
    customer: { email: str(client.email || p.cus_email), name: str(client.name || p.cus_name), phone: str(client.phone || p.cus_cel), document: str(client.document || p.cus_taxnumber) },
    status: str(sale.sale_status || p.trans_status),
    total_value: num(sale.sale_amount_win || sale.sale_net || p.trans_value),
    currency: "BRL",
    payment_method: str(sale.sale_payment_method || p.trans_paymentmethod),
    items: content.title ? [{ product_name: str(content.title), product_id: str(content.id), quantity: 1 }] : undefined,
    raw_payload: p,
  };
}

// ─── APPMAX ───
function appmaxEventType(p: any): string { return str(p.event || p.status); }
function appmaxInternalEvent(evtType: string): InternalEvent {
  const m: Record<string, InternalEvent> = {
    "order_created": "order_created",
    "order_approved": "order_paid",
    "order_paid": "order_paid",
    "order_canceled": "order_canceled",
    "order_refunded": "order_refunded",
    "subscription_created": "subscription_started",
    "subscription_renewed": "subscription_renewed",
    "subscription_canceled": "subscription_canceled",
    "approved": "order_paid",
    "canceled": "order_canceled",
    "refunded": "order_refunded",
  };
  return m[evtType] || "order_created";
}
function normalizeAppmax(p: any): NormalizedOrder {
  const order = p.data?.order || p.order || p;
  const customer = order.customer || p.customer || {};
  return {
    gateway: "appmax",
    external_order_id: str(order.id || order.order_id),
    external_payment_id: str(order.payment_id || order.id),
    customer: { email: str(customer.email), name: str(customer.name || customer.firstname), phone: str(customer.phone || customer.telephone), document: str(customer.cpf || customer.document) },
    status: str(order.status),
    total_value: num(order.total || order.amount),
    currency: "BRL",
    payment_method: str(order.payment_method || order.payment_type),
    raw_payload: p,
  };
}

// ─── CAKTO ───
function caktoEventType(p: any): string { return str(p.event || p.status); }
function caktoInternalEvent(evtType: string): InternalEvent {
  const lower = evtType.toLowerCase();
  if (lower.includes("lead")) return "lead_captured";
  if (lower.includes("checkout")) return "checkout_started";
  if (lower.includes("approved") || lower.includes("paid")) return "payment_paid";
  if (lower.includes("pending")) return "payment_pending";
  if (lower.includes("cancel")) return "order_canceled";
  if (lower.includes("refund")) return "payment_refunded";
  return "order_created";
}
function normalizeCakto(p: any): NormalizedOrder {
  const data = p.data || p;
  const customer = data.customer || data.buyer || {};
  return {
    gateway: "cakto",
    external_order_id: str(data.id || data.order_id || data.transaction_id),
    external_payment_id: str(data.payment_id || data.id),
    customer: { email: str(customer.email), name: str(customer.name), phone: str(customer.phone), document: str(customer.document) },
    status: str(data.status),
    total_value: num(data.amount || data.value || data.total),
    currency: "BRL",
    payment_method: str(data.payment_method),
    raw_payload: p,
  };
}

// ─── KIRVANO ───
function kirvanoEventType(p: any): string { return str(p.event || p.type || p.status); }
function kirvanoInternalEvent(evtType: string): InternalEvent {
  const lower = evtType.toLowerCase();
  if (lower.includes("checkout")) return "checkout_created";
  if (lower.includes("pix") && lower.includes("gen")) return "pix_generated";
  if (lower.includes("pix") && lower.includes("paid")) return "pix_paid";
  if (lower.includes("approved") || lower.includes("paid")) return "payment_paid";
  if (lower.includes("refused") || lower.includes("rejected")) return "payment_failed";
  if (lower.includes("subscription") && lower.includes("creat")) return "subscription_started";
  if (lower.includes("subscription") && lower.includes("renew")) return "subscription_renewed";
  return "order_created";
}
function normalizeKirvano(p: any): NormalizedOrder {
  const data = p.data || p;
  const customer = data.customer || data.buyer || {};
  return {
    gateway: "kirvano",
    external_order_id: str(data.id || data.order_id),
    external_payment_id: str(data.payment_id || data.charge_id || data.id),
    customer: { email: str(customer.email), name: str(customer.name), phone: str(customer.phone), document: str(customer.document || customer.cpf) },
    status: str(data.status),
    total_value: num(data.amount || data.value),
    currency: "BRL",
    payment_method: str(data.payment_method || data.payment_type),
    raw_payload: p,
  };
}

// ─── PAGSEGURO ───
function pagseguroEventType(p: any): string { return str(p.notificationType || p.event || p.type); }
function pagseguroInternalEvent(evtType: string): InternalEvent {
  const lower = evtType.toLowerCase();
  if (lower.includes("checkout")) return "checkout_created";
  if (lower === "transaction" || lower.includes("paid") || lower.includes("3")) return "payment_paid";
  if (lower.includes("pending") || lower.includes("1") || lower.includes("2")) return "payment_pending";
  if (lower.includes("cancel") || lower.includes("7")) return "order_canceled";
  if (lower.includes("refund") || lower.includes("5") || lower.includes("6")) return "payment_refunded";
  return "order_created";
}
function normalizePagseguro(p: any): NormalizedOrder {
  const data = p.transaction || p.charge || p.data || p;
  const sender = data.sender || data.customer || {};
  return {
    gateway: "pagseguro",
    external_order_id: str(data.code || data.id || data.reference),
    external_payment_id: str(data.code || data.id),
    customer: { email: str(sender.email || dig(sender, "email")), name: str(sender.name), phone: str(dig(sender, "phone", "number") || sender.phone) },
    status: str(data.status),
    total_value: num(data.grossAmount || data.amount?.value || data.amount),
    currency: "BRL",
    payment_method: str(dig(data, "paymentMethod", "type") || data.payment_method),
    raw_payload: p,
  };
}

// ─── GENERIC (fallback for future gateways) ───
function genericInternalEvent(evtType: string): InternalEvent {
  const lower = evtType.toLowerCase();
  if (lower.includes("paid") || lower.includes("approved") || lower.includes("confirmed")) return "payment_paid";
  if (lower.includes("refund")) return "payment_refunded";
  if (lower.includes("chargeback")) return "order_chargeback";
  if (lower.includes("cancel")) return "order_canceled";
  if (lower.includes("pending")) return "payment_pending";
  if (lower.includes("lead")) return "lead_captured";
  if (lower.includes("checkout")) return "checkout_started";
  if (lower.includes("subscription") && lower.includes("creat")) return "subscription_started";
  return "order_created";
}
function normalizeGeneric(provider: string, p: any): NormalizedOrder {
  const cust = p.customer || p.buyer || p.payer || {};
  return {
    gateway: provider,
    external_order_id: str(p.order_id || p.id || p.transaction_id || p.code),
    external_payment_id: str(p.payment_id || p.id),
    customer: { email: str(cust.email || p.email), name: str(cust.name || p.name), phone: str(cust.phone || p.phone), document: str(cust.document || p.document) },
    status: str(p.status || p.event),
    total_value: num(p.amount || p.value || p.total),
    currency: str(p.currency || "BRL"),
    payment_method: str(p.payment_method || p.method),
    raw_payload: p,
  };
}

// ─── Router ───
function extractEventType(provider: string, p: any): string {
  switch (provider) {
    case "stripe": return stripeEventType(p);
    case "mercadopago": return mercadopagoEventType(p);
    case "pagarme": return pagarmeEventType(p);
    case "asaas": return asaasEventType(p);
    case "hotmart": return hotmartEventType(p);
    case "monetizze": return monetizzeEventType(p);
    case "eduzz": return eduzzEventType(p);
    case "appmax": return appmaxEventType(p);
    case "cakto": return caktoEventType(p);
    case "kirvano": return kirvanoEventType(p);
    case "pagseguro": return pagseguroEventType(p);
    default: return str(p.event || p.type || p.action || "unknown");
  }
}

function resolveInternalEvent(provider: string, evtType: string): InternalEvent {
  switch (provider) {
    case "stripe": return stripeInternalEvent(evtType);
    case "mercadopago": return mercadopagoInternalEvent(evtType);
    case "pagarme": return pagarmeInternalEvent(evtType);
    case "asaas": return asaasInternalEvent(evtType);
    case "hotmart": return hotmartInternalEvent(evtType);
    case "monetizze": return monetizzeInternalEvent(evtType);
    case "eduzz": return eduzzInternalEvent(evtType);
    case "appmax": return appmaxInternalEvent(evtType);
    case "cakto": return caktoInternalEvent(evtType);
    case "kirvano": return kirvanoInternalEvent(evtType);
    case "pagseguro": return pagseguroInternalEvent(evtType);
    default: return genericInternalEvent(evtType);
  }
}

function normalizePayload(provider: string, p: any): NormalizedOrder {
  switch (provider) {
    case "stripe": return normalizeStripe(p);
    case "mercadopago": return normalizeMercadoPago(p);
    case "pagarme": return normalizePagarme(p);
    case "asaas": return normalizeAsaas(p);
    case "hotmart": return normalizeHotmart(p);
    case "monetizze": return normalizeMonetizze(p);
    case "eduzz": return normalizeEduzz(p);
    case "appmax": return normalizeAppmax(p);
    case "cakto": return normalizeCakto(p);
    case "kirvano": return normalizeKirvano(p);
    case "pagseguro": return normalizePagseguro(p);
    default: return normalizeGeneric(provider, p);
  }
}

// ─── Deduplication key ───
function buildDeduplicationKey(provider: string, eventType: string, externalId: string): string {
  return `${provider}:${eventType}:${externalId}`;
}

// ─── Main handler ───
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const url = new URL(req.url);
    const provider = url.searchParams.get("provider") || "generic";
    const workspaceId = url.searchParams.get("workspace_id");
    const integrationId = url.searchParams.get("integration_id") || null;

    if (!workspaceId) {
      return new Response(JSON.stringify({ error: "workspace_id query param required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rawBody = await req.text();
    let payload: any;
    try { payload = JSON.parse(rawBody); } catch { payload = { raw: rawBody }; }

    const eventType = extractEventType(provider, payload);
    const internalEvent = resolveInternalEvent(provider, eventType);
    const order = normalizePayload(provider, payload);

    // Extract external event ID for idempotency
    const externalEventId = str(payload.id || payload.event_id || payload.notification_id || order.external_order_id);
    const dedupKey = buildDeduplicationKey(provider, eventType, externalEventId);

    // Save to gateway_webhook_logs
    const headers_json: Record<string, string> = {};
    req.headers.forEach((v, k) => { headers_json[k] = v; });

    const { data: webhookLog } = await supabase.from("gateway_webhook_logs").insert({
      workspace_id: workspaceId,
      gateway_integration_id: integrationId,
      provider,
      external_event_id: externalEventId,
      event_type: eventType,
      signature_valid: true,
      http_headers_json: headers_json,
      query_params_json: Object.fromEntries(url.searchParams.entries()),
      payload_json: payload,
      processing_status: "processing",
    }).select("id").single();

    // Also keep backward compat log in webhook_logs
    await supabase.from("webhook_logs").insert({
      workspace_id: workspaceId,
      gateway: provider,
      event_type: eventType,
      signature_valid: true,
      payload_json: payload,
      processing_status: "processing",
    }).select("id").single();

    // Idempotency check: skip if same external event already processed
    const { data: existingLog } = await supabase
      .from("gateway_webhook_logs")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("external_event_id", externalEventId)
      .eq("provider", provider)
      .eq("processing_status", "processed")
      .limit(1)
      .single();

    if (existingLog) {
      // Update current log as duplicate
      if (webhookLog?.id) {
        await supabase.from("gateway_webhook_logs").update({ processing_status: "duplicate" }).eq("id", webhookLog.id);
      }
      return new Response(JSON.stringify({ status: "duplicate", message: "Event already processed" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Upsert order
    const orderData: any = {
      workspace_id: workspaceId,
      gateway: order.gateway,
      gateway_order_id: order.external_order_id,
      gateway_integration_id: integrationId,
      customer_email: order.customer.email || null,
      customer_name: order.customer.name || null,
      customer_phone: order.customer.phone || null,
      customer_document: order.customer.document || null,
      status: internalEvent.includes("paid") || internalEvent.includes("approved") ? "paid" : internalEvent.includes("refund") ? "refunded" : internalEvent.includes("chargeback") ? "chargeback" : internalEvent.includes("cancel") ? "canceled" : "pending",
      financial_status: internalEvent,
      total_value: order.total_value,
      currency: order.currency,
      payment_method: order.payment_method,
      installments: order.installments,
      external_checkout_id: order.external_checkout_id,
      external_subscription_id: order.external_subscription_id,
    };

    if (internalEvent === "order_paid" || internalEvent === "payment_paid" || internalEvent === "pix_paid" || internalEvent === "boleto_paid") {
      orderData.paid_at = new Date().toISOString();
    }
    if (internalEvent === "order_refunded" || internalEvent === "payment_refunded") {
      orderData.refunded_at = new Date().toISOString();
    }
    if (internalEvent === "order_canceled") {
      orderData.canceled_at = new Date().toISOString();
    }

    const { data: savedOrder } = await supabase.from("orders").insert(orderData).select("id").single();

    // Insert payment record
    const paymentStatus = internalEvent.includes("paid") || internalEvent.includes("approved") ? "paid" : internalEvent.includes("refund") ? "refunded" : internalEvent.includes("chargeback") ? "chargeback" : internalEvent.includes("fail") || internalEvent.includes("refused") ? "failed" : "pending";

    await supabase.from("payments").insert({
      workspace_id: workspaceId,
      order_id: savedOrder?.id,
      gateway: order.gateway,
      gateway_integration_id: integrationId,
      gateway_payment_id: order.external_payment_id,
      payment_method: order.payment_method,
      status: paymentStatus,
      amount: order.total_value,
      currency: order.currency,
      installments: order.installments,
      paid_at: paymentStatus === "paid" ? new Date().toISOString() : null,
      refunded_at: paymentStatus === "refunded" ? new Date().toISOString() : null,
      chargeback_at: paymentStatus === "chargeback" ? new Date().toISOString() : null,
      raw_payload_json: payload,
    });

    // Insert order items if present
    if (order.items?.length && savedOrder?.id) {
      await supabase.from("order_items").insert(
        order.items.map(item => ({ order_id: savedOrder.id, workspace_id: workspaceId, ...item }))
      );
    }

    // ─── Enhanced Reconciliation Engine ───
    let sessionId: string | null = null;
    let identityId: string | null = null;
    let matchField: string | null = null;

    // Strategy 1: Match by email
    if (!identityId && order.customer.email) {
      const { data: identity } = await supabase
        .from("identities").select("id")
        .eq("workspace_id", workspaceId).eq("email", order.customer.email)
        .limit(1).single();
      if (identity) { identityId = identity.id; matchField = "email"; }
    }
    // Strategy 2: Match by phone
    if (!identityId && order.customer.phone) {
      const { data: identity } = await supabase
        .from("identities").select("id")
        .eq("workspace_id", workspaceId).eq("phone", order.customer.phone)
        .limit(1).single();
      if (identity) { identityId = identity.id; matchField = "phone"; }
    }
    // Strategy 3: Match by external_id / document
    if (!identityId && order.customer.document) {
      const { data: identity } = await supabase
        .from("identities").select("id")
        .eq("workspace_id", workspaceId).eq("external_id", order.customer.document)
        .limit(1).single();
      if (identity) { identityId = identity.id; matchField = "document"; }
    }
    // Strategy 4: Match via leads table (email or phone)
    if (!identityId && (order.customer.email || order.customer.phone)) {
      let leadQuery = supabase.from("leads").select("identity_id, session_id").eq("workspace_id", workspaceId);
      if (order.customer.email) leadQuery = leadQuery.eq("email", order.customer.email);
      else if (order.customer.phone) leadQuery = leadQuery.eq("phone", order.customer.phone);
      const { data: lead } = await leadQuery.order("created_at", { ascending: false }).limit(1).single();
      if (lead?.identity_id) { identityId = lead.identity_id; matchField = "lead_" + (order.customer.email ? "email" : "phone"); }
      if (lead?.session_id && !sessionId) sessionId = lead.session_id;
    }
    // Strategy 5: Match via gateway_customers
    if (!identityId && order.customer.email) {
      const { data: gc } = await supabase
        .from("gateway_customers").select("identity_id")
        .eq("workspace_id", workspaceId).eq("email", order.customer.email)
        .limit(1).single();
      if (gc?.identity_id) { identityId = gc.identity_id; matchField = "gateway_customer"; }
    }

    // Find latest session with UTMs for the matched identity
    let sessionData: any = null;
    if (identityId) {
      const { data: session } = await supabase
        .from("sessions")
        .select("id, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbp, fbc, fbclid, gclid, ttclid, landing_page, referrer, ip_hash, user_agent")
        .eq("workspace_id", workspaceId).eq("identity_id", identityId)
        .order("created_at", { ascending: false }).limit(1).single();

      if (session) {
        sessionId = session.id;
        sessionData = session;
        await supabase.from("orders").update({
          session_id: session.id, identity_id: identityId,
          utm_source: session.utm_source, utm_medium: session.utm_medium,
          utm_campaign: session.utm_campaign, utm_content: session.utm_content,
          utm_term: session.utm_term, fbp: session.fbp, fbc: session.fbc,
          fbclid: session.fbclid, gclid: session.gclid, ttclid: session.ttclid,
          landing_page: session.landing_page, referrer: session.referrer,
        }).eq("id", savedOrder?.id);
      }
    }

    // Upsert gateway_customer for future reconciliation
    if (order.customer.email || order.customer.phone) {
      await supabase.from("gateway_customers").upsert({
        workspace_id: workspaceId, provider, gateway_integration_id: integrationId,
        external_customer_id: order.external_order_id,
        identity_id: identityId, name: order.customer.name || null,
        email: order.customer.email || null, phone: order.customer.phone || null,
        document: order.customer.document || null,
      }, { onConflict: "workspace_id,provider,external_customer_id", ignoreDuplicates: true });
    }

    // Log reconciliation
    await supabase.from("reconciliation_logs").insert({
      workspace_id: workspaceId, provider, entity_type: "order",
      entity_id: savedOrder?.id, external_id: order.external_order_id,
      reconciliation_type: sessionId ? "session_matched" : identityId ? "identity_only" : "unmatched",
      status: sessionId ? "success" : identityId ? "partial" : "failed",
      details_json: { identity_id: identityId, session_id: sessionId, match_field: matchField, strategies_tried: ["email", "phone", "document", "lead", "gateway_customer"] },
    });

    // Map to marketing event
    const { data: customMapping } = await supabase
      .from("event_mappings")
      .select("marketing_event, external_event_name")
      .eq("workspace_id", workspaceId)
      .eq("gateway", provider)
      .eq("gateway_event", eventType)
      .eq("is_active", true)
      .limit(1).single();

    const marketingEvent = customMapping?.marketing_event || customMapping?.external_event_name || INTERNAL_TO_META[internalEvent] || null;

    let eventId: string | null = null;
    if (marketingEvent || internalEvent) {
      const evtName = marketingEvent || internalEvent;
      const { data: evt } = await supabase.from("events").insert({
        workspace_id: workspaceId,
        event_name: evtName,
        event_id: crypto.randomUUID(),
        event_time: new Date().toISOString(),
        action_source: "system",
        source: `webhook_${provider}`,
        session_id: sessionId,
        identity_id: identityId,
        processing_status: META_EVENTS.has(evtName) ? "pending" : "internal",
        custom_data_json: { value: order.total_value, currency: order.currency, order_id: order.external_order_id, payment_method: order.payment_method, internal_event: internalEvent },
        deduplication_key: dedupKey,
      }).select("id").single();
      eventId = evt?.id || null;

      // Record conversion with attributed source from reconciled session
      const attributedSource = sessionData?.utm_source || null;
      const attributedCampaign = sessionData?.utm_campaign || null;
      if (["Purchase", "Lead", "Subscribe"].includes(evtName) || internalEvent === "order_paid" || internalEvent === "payment_paid") {
        await supabase.from("conversions").insert({
          workspace_id: workspaceId,
          event_id: evt?.id || crypto.randomUUID(),
          session_id: sessionId, identity_id: identityId,
          conversion_type: evtName.toLowerCase(),
          value: order.total_value, currency: order.currency,
          attributed_source: attributedSource,
          attributed_campaign: attributedCampaign,
          attribution_model: "last_touch",
        });
      }

      // Send enriched event to Meta CAPI
      if (marketingEvent && META_EVENTS.has(marketingEvent)) {
        try {
          const { data: pixels } = await supabase.from("meta_pixels")
            .select("id, pixel_id, access_token_encrypted, test_event_code")
            .eq("workspace_id", workspaceId).eq("is_active", true);

          if (pixels?.length) {
            for (const pixel of pixels) {
              if (!pixel.access_token_encrypted) continue;

              // Build enriched user_data using reconciled session
              const userData: Record<string, unknown> = {};
              if (order.customer.email) userData.em = [await sha256(order.customer.email.toLowerCase().trim())];
              if (order.customer.phone) userData.ph = [await sha256(order.customer.phone.replace(/\D/g, ""))];
              if (order.customer.name) {
                const parts = order.customer.name.trim().split(/\s+/);
                userData.fn = [await sha256(parts[0].toLowerCase())];
                if (parts.length > 1) userData.ln = [await sha256(parts[parts.length - 1].toLowerCase())];
              }
              if (identityId) userData.external_id = [identityId];
              // Enrich with session data (fbp, fbc, IP, UA)
              if (sessionData?.fbp) userData.fbp = sessionData.fbp;
              if (sessionData?.fbc) userData.fbc = sessionData.fbc;
              if (sessionData?.ip_hash) userData.client_ip_address = sessionData.ip_hash;
              if (sessionData?.user_agent) userData.client_user_agent = sessionData.user_agent;

              const metaPayload = {
                data: [{
                  event_name: marketingEvent,
                  event_time: Math.floor(Date.now() / 1000),
                  event_id: evt?.id || crypto.randomUUID(),
                  action_source: "website",
                  event_source_url: sessionData?.landing_page || undefined,
                  user_data: userData,
                  custom_data: {
                    value: order.total_value,
                    currency: order.currency,
                    order_id: order.external_order_id,
                    content_type: "product",
                    num_items: order.items?.length || 1,
                    contents: order.items?.map(i => ({ id: i.product_id || i.product_name || "item", quantity: i.quantity })),
                    content_ids: order.items?.map(i => str(i.product_id || i.product_name)),
                  },
                }],
                ...(pixel.test_event_code ? { test_event_code: pixel.test_event_code } : {}),
              };

              const metaRes = await fetch(`https://graph.facebook.com/v21.0/${pixel.pixel_id}/events?access_token=${pixel.access_token_encrypted}`, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(metaPayload),
              });
              const metaData = await metaRes.json();

              await supabase.from("event_deliveries").insert({
                event_id: evt?.id || crypto.randomUUID(),
                workspace_id: workspaceId, provider: "meta",
                destination: pixel.pixel_id,
                status: metaRes.ok ? "delivered" : "failed",
                attempt_count: 1, last_attempt_at: new Date().toISOString(),
                request_json: metaPayload, response_json: metaData,
                error_message: metaRes.ok ? null : JSON.stringify(metaData),
              });

              // Update event status
              if (metaRes.ok && evt?.id) {
                await supabase.from("events").update({ processing_status: "delivered" }).eq("id", evt.id);
              }
            }
          }
        } catch (metaErr) {
          console.error("Meta send error:", metaErr);
        }
      }
    }

    // Update webhook log status
    if (webhookLog?.id) {
      await supabase.from("gateway_webhook_logs").update({
        processing_status: "processed", processed_at: new Date().toISOString(),
        processing_attempts: 1,
      }).eq("id", webhookLog.id);
    }

    return new Response(JSON.stringify({
      status: "ok",
      provider, internal_event: internalEvent,
      marketing_event: marketingEvent,
      order_id: savedOrder?.id, event_id: eventId,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("Gateway webhook error:", err);
    return new Response(JSON.stringify({ error: "Internal server error", details: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}
