import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-test-mode",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// ════════════════════════════════════════════════════════════
// SECTION 1 — Shared types & helpers
// ════════════════════════════════════════════════════════════

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

interface NormalizedCustomer {
  name?: string; email?: string; phone?: string; document?: string;
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

const INTERNAL_TO_META: Record<string, string> = {
  checkout_created: "InitiateCheckout", checkout_started: "InitiateCheckout",
  payment_created: "AddPaymentInfo", payment_authorized: "AddPaymentInfo",
  order_paid: "Purchase", order_approved: "Purchase", payment_paid: "Purchase",
  pix_paid: "Purchase", boleto_paid: "Purchase",
  subscription_started: "Subscribe", lead_captured: "Lead",
};

const META_EVENTS = new Set([
  "PageView","ViewContent","AddToCart","InitiateCheckout","AddPaymentInfo",
  "Purchase","Lead","CompleteRegistration","Search","AddToWishlist",
  "Contact","Subscribe","StartTrial","SubmitApplication","CustomizeProduct",
  "Schedule","Donate","FindLocation",
]);

function str(v: any): string { return v != null ? String(v) : ""; }
function num(v: any): number { const n = Number(v); return isNaN(n) ? 0 : n; }
function dig(obj: any, ...keys: string[]): any {
  let cur = obj;
  for (const k of keys) { if (cur == null) return undefined; cur = cur[k]; }
  return cur;
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ════════════════════════════════════════════════════════════
// SECTION 2 — Gateway Handlers (Registry Pattern)
// Each handler provides: extractEventType, resolveInternalEvent, normalize
// ════════════════════════════════════════════════════════════

interface GatewayHandler {
  extractEventType(p: any): string;
  resolveInternalEvent(evtType: string): InternalEvent;
  normalize(p: any): NormalizedOrder;
}

// ── Stripe ──
const stripeHandler: GatewayHandler = {
  extractEventType: (p) => str(p.type),
  resolveInternalEvent: (e) => ({
    "checkout.session.completed": "order_paid", "payment_intent.succeeded": "payment_paid",
    "payment_intent.created": "payment_created", "charge.succeeded": "payment_paid",
    "charge.refunded": "payment_refunded", "charge.dispute.created": "order_chargeback",
    "customer.subscription.created": "subscription_started",
    "customer.subscription.updated": "subscription_renewed",
    "customer.subscription.deleted": "subscription_canceled", "invoice.paid": "payment_paid",
  } as Record<string, InternalEvent>)[e] || "order_created",
  normalize: (p) => {
    const obj = dig(p, "data", "object") || {};
    const cust = obj.customer_details || obj.customer || {};
    return {
      gateway: "stripe", external_order_id: str(obj.id || obj.payment_intent),
      external_payment_id: str(obj.payment_intent || obj.id),
      customer: { email: str(cust.email || obj.receipt_email), name: str(cust.name) },
      status: str(obj.status || obj.payment_status),
      total_value: num(obj.amount_total || obj.amount) / 100,
      currency: str(obj.currency || "usd").toUpperCase(),
      payment_method: str(dig(obj, "payment_method_types", 0) || "card"),
      raw_payload: p,
    };
  },
};

// ── Mercado Pago ──
const mercadopagoHandler: GatewayHandler = {
  extractEventType: (p) => str(p.action || p.type),
  resolveInternalEvent: (e) => ({
    "payment.created": "payment_created", "payment.approved": "payment_paid",
    "payment.updated": "payment_pending", "payment.refunded": "payment_refunded",
    "payment.cancelled": "order_canceled", "payment.in_process": "payment_pending",
    "payment.rejected": "payment_failed", "payment.pending": "payment_pending",
    "chargebacks": "order_chargeback",
  } as Record<string, InternalEvent>)[e] || "order_created",
  normalize: (p) => {
    const data = p.data || {};
    return {
      gateway: "mercadopago", external_order_id: str(data.id || p.id),
      external_payment_id: str(data.id),
      customer: { email: str(dig(data, "payer", "email")), name: str(dig(data, "payer", "first_name")) },
      status: str(p.action), total_value: num(data.transaction_amount),
      currency: str(data.currency_id || "BRL"),
      payment_method: str(dig(data, "payment_method", "type") || dig(data, "payment_type_id")),
      installments: num(data.installments) || undefined, raw_payload: p,
    };
  },
};

// ── Pagar.me ──
const pagarmeHandler: GatewayHandler = {
  extractEventType: (p) => str(p.type),
  resolveInternalEvent: (e) => ({
    "order.created": "order_created", "order.paid": "order_paid", "order.canceled": "order_canceled",
    "charge.paid": "payment_paid", "charge.failed": "payment_failed", "charge.refunded": "payment_refunded",
    "subscription.created": "subscription_started", "subscription.canceled": "subscription_canceled",
    "subscription.charged": "subscription_renewed",
  } as Record<string, InternalEvent>)[e] || "order_created",
  normalize: (p) => {
    const data = p.data || {}; const cust = data.customer || {};
    const charge = (data.charges || [])[0] || {};
    return {
      gateway: "pagarme", external_order_id: str(data.id || data.code),
      external_payment_id: str(charge.id),
      customer: { email: str(cust.email), name: str(cust.name), phone: str(dig(cust, "phones", "mobile_phone", "number")), document: str(cust.document) },
      status: str(data.status), total_value: num(data.amount) / 100,
      currency: str(data.currency || "BRL"), payment_method: str(charge.payment_method),
      installments: num(charge.installments) || undefined, raw_payload: p,
    };
  },
};

// ── Asaas ──
const asaasHandler: GatewayHandler = {
  extractEventType: (p) => str(p.event),
  resolveInternalEvent: (e) => ({
    "PAYMENT_CREATED": "payment_created", "PAYMENT_UPDATED": "payment_pending",
    "PAYMENT_RECEIVED": "payment_paid", "PAYMENT_CONFIRMED": "payment_paid",
    "PAYMENT_OVERDUE": "payment_failed", "PAYMENT_DELETED": "order_canceled",
    "PAYMENT_REFUNDED": "payment_refunded", "PAYMENT_CHARGEBACK_REQUESTED": "order_chargeback",
  } as Record<string, InternalEvent>)[e] || "payment_pending",
  normalize: (p) => {
    const pay = p.payment || {};
    return {
      gateway: "asaas", external_order_id: str(pay.id), external_payment_id: str(pay.id),
      customer: { name: str(pay.customerName), email: str(pay.customerEmail), phone: str(pay.customerPhone), document: str(pay.cpfCnpj) },
      status: str(pay.status), total_value: num(pay.value || pay.netValue),
      currency: "BRL", payment_method: str(pay.billingType), raw_payload: p,
    };
  },
};

// ── Hotmart ──
const hotmartHandler: GatewayHandler = {
  extractEventType: (p) => str(p.event || (p.hottok && "PURCHASE")),
  resolveInternalEvent: (e) => ({
    "PURCHASE_COMPLETE": "order_paid", "PURCHASE_APPROVED": "order_paid",
    "PURCHASE_PROTEST": "order_chargeback", "PURCHASE_REFUNDED": "order_refunded",
    "PURCHASE_CHARGEBACK": "order_chargeback", "PURCHASE_CANCELED": "order_canceled",
    "PURCHASE_BILLET_PRINTED": "boleto_generated", "PURCHASE_DELAYED": "payment_pending",
    "SUBSCRIPTION_CANCELLATION": "subscription_canceled", "SWITCH_PLAN": "subscription_renewed",
  } as Record<string, InternalEvent>)[e] || "order_created",
  normalize: (p) => {
    const d = p.data || p; const buyer = d.buyer || {}; const purchase = d.purchase || {}; const product = d.product || {};
    return {
      gateway: "hotmart", external_order_id: str(purchase.transaction || purchase.order_bump?.id),
      external_payment_id: str(purchase.transaction),
      customer: { email: str(buyer.email), name: str(buyer.name), phone: str(buyer.phone || buyer.cellphone), document: str(buyer.document) },
      status: str(purchase.status), total_value: num(purchase.price?.value || purchase.original_offer_price?.value),
      currency: str(purchase.price?.currency_value || "BRL"), payment_method: str(purchase.payment?.type),
      items: [{ product_name: str(product.name), product_id: str(product.id), quantity: 1, unit_price: num(purchase.price?.value) }],
      raw_payload: p,
    };
  },
};

// ── Monetizze ──
const monetizzeHandler: GatewayHandler = {
  extractEventType: (p) => str(p.tipoPostback?.cod || p.tipo_postback || p.event),
  resolveInternalEvent: (e) => {
    const l = e.toLowerCase();
    if (l.includes("aprovad") || l === "1") return "order_paid";
    if (l.includes("aguardando") || l === "2") return "payment_pending";
    if (l.includes("cancelad") || l === "3") return "order_canceled";
    if (l.includes("devolvid") || l.includes("reembolso") || l === "6") return "order_refunded";
    if (l.includes("chargeback") || l === "7") return "order_chargeback";
    if (l.includes("assinatura_ativ")) return "subscription_started";
    if (l.includes("assinatura_renov")) return "subscription_renewed";
    if (l.includes("assinatura_cancel")) return "subscription_canceled";
    return "order_created";
  },
  normalize: (p) => {
    const v = p.venda || p; const c = p.comprador || v.comprador || {}; const pr = p.produto || v.produto || {};
    return {
      gateway: "monetizze", external_order_id: str(v.codigo || v.transacao || p.transacao),
      external_payment_id: str(v.codigo || v.transacao),
      customer: { email: str(c.email), name: str(c.nome), phone: str(c.telefone), document: str(c.cnpj_cpf) },
      status: str(v.status || v.statusDescricao), total_value: num(v.valorLiquido || v.valor || v.preco),
      currency: "BRL", payment_method: str(v.formaPagamento || v.forma_pagamento),
      items: pr.nome ? [{ product_name: str(pr.nome), product_id: str(pr.codigo), quantity: 1 }] : undefined,
      raw_payload: p,
    };
  },
};

// ── Eduzz ──
const eduzzHandler: GatewayHandler = {
  extractEventType: (p) => str(p.event_type || p.trans_status),
  resolveInternalEvent: (e) => ({
    "invoice_created": "order_created", "invoice_approved": "order_paid", "invoice_paid": "order_paid",
    "invoice_pending": "payment_pending", "invoice_canceled": "order_canceled", "invoice_refunded": "order_refunded",
    "contract_created": "subscription_started", "contract_renewed": "subscription_renewed",
    "contract_canceled": "subscription_canceled",
    "1": "payment_pending", "3": "order_paid", "4": "order_canceled", "6": "payment_pending", "7": "order_refunded",
  } as Record<string, InternalEvent>)[e] || "order_created",
  normalize: (p) => {
    const s = p.sale || p; const cl = p.client || s.client || {}; const co = p.content || s.content || {};
    return {
      gateway: "eduzz", external_order_id: str(s.sale_id || s.invoice_code || p.trans_cod),
      external_payment_id: str(s.sale_id || p.trans_cod),
      customer: { email: str(cl.email || p.cus_email), name: str(cl.name || p.cus_name), phone: str(cl.phone || p.cus_cel), document: str(cl.document || p.cus_taxnumber) },
      status: str(s.sale_status || p.trans_status), total_value: num(s.sale_amount_win || s.sale_net || p.trans_value),
      currency: "BRL", payment_method: str(s.sale_payment_method || p.trans_paymentmethod),
      items: co.title ? [{ product_name: str(co.title), product_id: str(co.id), quantity: 1 }] : undefined,
      raw_payload: p,
    };
  },
};

// ── Appmax ──
const appmaxHandler: GatewayHandler = {
  extractEventType: (p) => str(p.event || p.status),
  resolveInternalEvent: (e) => ({
    "order_created": "order_created", "order_approved": "order_paid", "order_paid": "order_paid",
    "order_canceled": "order_canceled", "order_refunded": "order_refunded",
    "subscription_created": "subscription_started", "subscription_renewed": "subscription_renewed",
    "subscription_canceled": "subscription_canceled", "approved": "order_paid",
    "canceled": "order_canceled", "refunded": "order_refunded",
  } as Record<string, InternalEvent>)[e] || "order_created",
  normalize: (p) => {
    const o = p.data?.order || p.order || p; const c = o.customer || p.customer || {};
    return {
      gateway: "appmax", external_order_id: str(o.id || o.order_id),
      external_payment_id: str(o.payment_id || o.id),
      customer: { email: str(c.email), name: str(c.name || c.firstname), phone: str(c.phone || c.telephone), document: str(c.cpf || c.document) },
      status: str(o.status), total_value: num(o.total || o.amount),
      currency: "BRL", payment_method: str(o.payment_method || o.payment_type), raw_payload: p,
    };
  },
};

// ── Cakto ──
const caktoHandler: GatewayHandler = {
  extractEventType: (p) => str(p.event || p.status),
  resolveInternalEvent: (e) => {
    const l = e.toLowerCase();
    if (l.includes("lead")) return "lead_captured";
    if (l.includes("checkout")) return "checkout_started";
    if (l.includes("approved") || l.includes("paid")) return "payment_paid";
    if (l.includes("pending")) return "payment_pending";
    if (l.includes("cancel")) return "order_canceled";
    if (l.includes("refund")) return "payment_refunded";
    return "order_created";
  },
  normalize: (p) => {
    const d = p.data || p; const c = d.customer || d.buyer || {};
    return {
      gateway: "cakto", external_order_id: str(d.id || d.order_id || d.transaction_id),
      external_payment_id: str(d.payment_id || d.id),
      customer: { email: str(c.email), name: str(c.name), phone: str(c.phone), document: str(c.document) },
      status: str(d.status), total_value: num(d.amount || d.value || d.total),
      currency: "BRL", payment_method: str(d.payment_method), raw_payload: p,
    };
  },
};

// ── Kirvano ──
const kirvanoHandler: GatewayHandler = {
  extractEventType: (p) => str(p.event || p.type || p.status),
  resolveInternalEvent: (e) => {
    const l = e.toLowerCase();
    if (l.includes("checkout")) return "checkout_created";
    if (l.includes("pix") && l.includes("gen")) return "pix_generated";
    if (l.includes("pix") && l.includes("paid")) return "pix_paid";
    if (l.includes("approved") || l.includes("paid")) return "payment_paid";
    if (l.includes("refused") || l.includes("rejected")) return "payment_failed";
    if (l.includes("subscription") && l.includes("creat")) return "subscription_started";
    if (l.includes("subscription") && l.includes("renew")) return "subscription_renewed";
    return "order_created";
  },
  normalize: (p) => {
    const d = p.data || p; const c = d.customer || d.buyer || {};
    return {
      gateway: "kirvano", external_order_id: str(d.id || d.order_id),
      external_payment_id: str(d.payment_id || d.charge_id || d.id),
      customer: { email: str(c.email), name: str(c.name), phone: str(c.phone), document: str(c.document || c.cpf) },
      status: str(d.status), total_value: num(d.amount || d.value),
      currency: "BRL", payment_method: str(d.payment_method || d.payment_type), raw_payload: p,
    };
  },
};

// ── PagSeguro ──
const pagseguroHandler: GatewayHandler = {
  extractEventType: (p) => str(p.notificationType || p.event || p.type),
  resolveInternalEvent: (e) => {
    const l = e.toLowerCase();
    if (l.includes("checkout")) return "checkout_created";
    if (l === "transaction" || l.includes("paid") || l.includes("3")) return "payment_paid";
    if (l.includes("pending") || l.includes("1") || l.includes("2")) return "payment_pending";
    if (l.includes("cancel") || l.includes("7")) return "order_canceled";
    if (l.includes("refund") || l.includes("5") || l.includes("6")) return "payment_refunded";
    return "order_created";
  },
  normalize: (p) => {
    const d = p.transaction || p.charge || p.data || p; const s = d.sender || d.customer || {};
    return {
      gateway: "pagseguro", external_order_id: str(d.code || d.id || d.reference),
      external_payment_id: str(d.code || d.id),
      customer: { email: str(s.email), name: str(s.name), phone: str(dig(s, "phone", "number") || s.phone) },
      status: str(d.status), total_value: num(d.grossAmount || d.amount?.value || d.amount),
      currency: "BRL", payment_method: str(dig(d, "paymentMethod", "type") || d.payment_method), raw_payload: p,
    };
  },
};

// ── Kiwify ──
const kiwifyHandler: GatewayHandler = {
  extractEventType: (p) => str(p.webhook_event_type || p.order_status || p.event),
  resolveInternalEvent: (e) => ({
    "order_approved": "order_paid", "order_completed": "order_paid",
    "order_refunded": "order_refunded", "order_chargedback": "order_chargeback",
    "subscription_created": "subscription_started", "subscription_renewed": "subscription_renewed",
    "subscription_canceled": "subscription_canceled", "waiting_payment": "payment_pending",
    "pix_created": "pix_generated", "billet_created": "boleto_generated",
  } as Record<string, InternalEvent>)[e] || "order_created",
  normalize: (p) => {
    const c = p.Customer || p.customer || {};
    return {
      gateway: "kiwify", external_order_id: str(p.order_id || p.subscription_id),
      external_payment_id: str(p.order_id),
      customer: { email: str(c.email), name: str(c.full_name || c.name), phone: str(c.mobile), document: str(c.CPF || c.cpf) },
      status: str(p.order_status || p.webhook_event_type),
      total_value: num(p.Commissions?.charge_amount || p.product_price || p.approved_value),
      currency: "BRL", payment_method: str(p.payment_method), raw_payload: p,
    };
  },
};

// ── Ticto ──
const tictoHandler: GatewayHandler = {
  extractEventType: (p) => str(p.event || p.status || p.type),
  resolveInternalEvent: (e) => {
    const l = e.toLowerCase();
    if (l.includes("approved") || l.includes("paid")) return "order_paid";
    if (l.includes("refund")) return "order_refunded";
    if (l.includes("chargeback")) return "order_chargeback";
    if (l.includes("cancel")) return "order_canceled";
    if (l.includes("pending") || l.includes("waiting")) return "payment_pending";
    if (l.includes("pix")) return "pix_generated";
    return "order_created";
  },
  normalize: (p) => {
    const d = p.data || p; const c = d.customer || d.buyer || {};
    return {
      gateway: "ticto", external_order_id: str(d.transaction_id || d.id),
      external_payment_id: str(d.transaction_id || d.id),
      customer: { email: str(c.email), name: str(c.name), phone: str(c.phone), document: str(c.document || c.cpf) },
      status: str(d.status), total_value: num(d.amount || d.value),
      currency: "BRL", payment_method: str(d.payment_method), raw_payload: p,
    };
  },
};

// ── Greenn ──
const greennHandler: GatewayHandler = {
  extractEventType: (p) => str(p.event || p.type),
  resolveInternalEvent: (e) => ({
    "purchase_approved": "order_paid", "purchase_complete": "order_paid",
    "purchase_refunded": "order_refunded", "purchase_canceled": "order_canceled",
    "purchase_chargeback": "order_chargeback", "subscription_created": "subscription_started",
    "subscription_canceled": "subscription_canceled",
  } as Record<string, InternalEvent>)[e] || "order_created",
  normalize: (p) => {
    const d = p.data || p; const c = d.buyer || d.customer || {};
    return {
      gateway: "greenn", external_order_id: str(d.transaction || d.id),
      external_payment_id: str(d.transaction || d.id),
      customer: { email: str(c.email), name: str(c.name), phone: str(c.phone || c.cellphone), document: str(c.doc || c.cpf) },
      status: str(d.status), total_value: num(d.price || d.value),
      currency: "BRL", payment_method: str(d.payment_method), raw_payload: p,
    };
  },
};

// ── Shopify ──
const shopifyHandler: GatewayHandler = {
  extractEventType: (p) => str(p.topic || p.event),
  resolveInternalEvent: (e) => ({
    "orders/create": "order_created", "orders/paid": "order_paid",
    "orders/fulfilled": "order_approved", "orders/cancelled": "order_canceled",
    "refunds/create": "order_refunded", "checkouts/create": "checkout_created",
  } as Record<string, InternalEvent>)[e] || "order_created",
  normalize: (p) => {
    const c = p.customer || p.billing_address || {};
    return {
      gateway: "shopify", external_order_id: str(p.id || p.order_number),
      external_checkout_id: str(p.checkout_id || p.checkout_token),
      customer: { email: str(p.email || p.contact_email || c.email), name: str(`${c.first_name || ""} ${c.last_name || ""}`.trim()), phone: str(p.phone || c.phone) },
      status: str(p.financial_status || p.fulfillment_status || "pending"),
      total_value: num(p.total_price || p.subtotal_price),
      currency: str(p.currency || "USD"), payment_method: str(dig(p, "payment_gateway_names", 0)),
      items: (p.line_items || []).map((i: any) => ({ product_name: str(i.title), product_id: str(i.product_id), quantity: num(i.quantity), unit_price: num(i.price) })),
      raw_payload: p,
    };
  },
};

// ── PayPal ──
const paypalHandler: GatewayHandler = {
  extractEventType: (p) => str(p.event_type),
  resolveInternalEvent: (e) => ({
    "CHECKOUT.ORDER.APPROVED": "order_paid", "PAYMENT.CAPTURE.COMPLETED": "payment_paid",
    "PAYMENT.CAPTURE.DENIED": "payment_failed", "PAYMENT.CAPTURE.REFUNDED": "payment_refunded",
    "CUSTOMER.DISPUTE.CREATED": "order_chargeback",
    "BILLING.SUBSCRIPTION.CREATED": "subscription_started",
    "BILLING.SUBSCRIPTION.CANCELLED": "subscription_canceled",
  } as Record<string, InternalEvent>)[e] || "order_created",
  normalize: (p) => {
    const res = p.resource || {}; const payer = res.payer || {};
    const amount = res.amount || dig(res, "purchase_units", 0, "amount") || {};
    return {
      gateway: "paypal", external_order_id: str(res.id || p.id),
      external_payment_id: str(res.id),
      customer: { email: str(dig(payer, "email_address")), name: str(`${dig(payer, "name", "given_name") || ""} ${dig(payer, "name", "surname") || ""}`.trim()) },
      status: str(res.status), total_value: num(amount.value),
      currency: str(amount.currency_code || "USD"), raw_payload: p,
    };
  },
};

// ── Paddle ──
const paddleHandler: GatewayHandler = {
  extractEventType: (p) => str(p.event_type || p.alert_name),
  resolveInternalEvent: (e) => ({
    "transaction.completed": "order_paid", "transaction.payment_failed": "payment_failed",
    "subscription.created": "subscription_started", "subscription.canceled": "subscription_canceled",
    "subscription.updated": "subscription_renewed", "adjustment.created": "order_refunded",
    "payment_succeeded": "payment_paid", "payment_refunded": "payment_refunded",
    "subscription_created": "subscription_started", "subscription_cancelled": "subscription_canceled",
  } as Record<string, InternalEvent>)[e] || "order_created",
  normalize: (p) => {
    const d = p.data || p;
    return {
      gateway: "paddle", external_order_id: str(d.id || d.order_id || p.order_id),
      external_payment_id: str(d.transaction_id || d.id),
      customer: { email: str(d.customer?.email || p.email || d.email), name: str(d.customer?.name || p.passthrough) },
      status: str(d.status), total_value: num(dig(d, "details", "totals", "total") || d.sale_gross || d.total) / 100,
      currency: str(d.currency_code || d.currency || "USD"), raw_payload: p,
    };
  },
};

// ── FortPay ──
const fortpayHandler: GatewayHandler = {
  extractEventType: (p) => str(p.event || p.status || p.type),
  resolveInternalEvent: (e) => {
    const l = e.toLowerCase();
    if (l.includes("approved") || l.includes("paid")) return "order_paid";
    if (l.includes("refund")) return "order_refunded";
    if (l.includes("chargeback")) return "order_chargeback";
    if (l.includes("cancel")) return "order_canceled";
    return "order_created";
  },
  normalize: (p) => {
    const d = p.data || p; const c = d.customer || d.buyer || {};
    return {
      gateway: "fortpay", external_order_id: str(d.transaction_id || d.id),
      external_payment_id: str(d.transaction_id || d.id),
      customer: { email: str(c.email), name: str(c.name), phone: str(c.phone), document: str(c.document) },
      status: str(d.status), total_value: num(d.amount || d.value),
      currency: "BRL", payment_method: str(d.payment_method), raw_payload: p,
    };
  },
};

// ── Cloudfy ──
const cloudfyHandler: GatewayHandler = {
  extractEventType: (p) => str(p.event || p.type || p.status),
  resolveInternalEvent: (e) => {
    const l = e.toLowerCase();
    if (l.includes("paid") || l.includes("approved")) return "order_paid";
    if (l.includes("refund")) return "order_refunded";
    if (l.includes("cancel")) return "order_canceled";
    return "order_created";
  },
  normalize: (p) => {
    const d = p.data || p; const c = d.customer || d.buyer || {};
    return {
      gateway: "cloudfy", external_order_id: str(d.order_id || d.id),
      external_payment_id: str(d.payment_id || d.id),
      customer: { email: str(c.email), name: str(c.name), phone: str(c.phone) },
      status: str(d.status), total_value: num(d.amount || d.value),
      currency: "BRL", payment_method: str(d.payment_method), raw_payload: p,
    };
  },
};

// ── QuantumPay (BR - PIX) ──
// Doc: https://docs.quantumpay.com.br/webhook
// Eventos: transaction_created, transaction_paid, transaction_refunded, transaction_infraction
//          transfer_created, transfer_updated, transfer_completed, transfer_canceled
// Valores em CENTAVOS (dividir por 100)
const quantumpayHandler: GatewayHandler = {
  extractEventType: (p) => str(p.event || p.type),
  resolveInternalEvent: (e) => ({
    "transaction_created": "checkout_created",
    "transaction_paid": "order_paid",
    "transaction_refunded": "order_refunded",
    "transaction_infraction": "order_chargeback",
    // transfer_* são PIX OUT (saídas) — não são eventos de marketing
    "transfer_created": "payment_created",
    "transfer_updated": "payment_pending",
    "transfer_completed": "payment_paid",
    "transfer_canceled": "order_canceled",
  } as Record<string, InternalEvent>)[e] || "order_created",
  normalize: (p) => {
    const t = p.transaction || p.transfer || {};
    const payer = dig(t, "pix", "payerInfo") || {};
    const isTransfer = !!p.transfer;
    return {
      gateway: "quantumpay",
      external_order_id: str(t.id || p.id),
      external_payment_id: str(t.id || p.id),
      customer: {
        name: str(payer.name),
        document: str(payer.document),
      },
      status: str(t.status),
      total_value: num(t.amount) / 100, // centavos → reais
      currency: "BRL",
      payment_method: isTransfer ? "pix_out" : "pix",
      raw_payload: p,
    };
  },
};

// ── Gumroad ──
const gumroadHandler: GatewayHandler = {
  extractEventType: (p) => str(p.resource_name || "sale"),
  resolveInternalEvent: (e) => ({
    "sale": "order_paid", "refund": "order_refunded",
    "cancellation": "subscription_canceled", "subscription_updated": "subscription_renewed",
    "subscription_ended": "subscription_canceled", "subscription_restarted": "subscription_started",
  } as Record<string, InternalEvent>)[e] || "order_created",
  normalize: (p) => ({
    gateway: "gumroad", external_order_id: str(p.sale_id || p.subscription_id || p.id),
    external_payment_id: str(p.sale_id || p.id),
    customer: { email: str(p.email || p.purchaser_id), name: str(p.full_name) },
    status: str(p.resource_name || "paid"), total_value: num(String(p.price || 0).replace(/[^0-9.]/g, "")),
    currency: str(p.currency || "usd").toUpperCase(), raw_payload: p,
  }),
};

// ── Generic fallback ──
const genericHandler: GatewayHandler = {
  extractEventType: (p) => str(p.event || p.type || p.action || "unknown"),
  resolveInternalEvent: (e) => {
    const l = e.toLowerCase();
    if (l.includes("paid") || l.includes("approved") || l.includes("confirmed")) return "payment_paid";
    if (l.includes("refund")) return "payment_refunded";
    if (l.includes("chargeback")) return "order_chargeback";
    if (l.includes("cancel")) return "order_canceled";
    if (l.includes("pending")) return "payment_pending";
    if (l.includes("lead")) return "lead_captured";
    if (l.includes("checkout")) return "checkout_started";
    if (l.includes("subscription") && l.includes("creat")) return "subscription_started";
    return "order_created";
  },
  normalize: (p) => {
    const c = p.customer || p.buyer || p.payer || {};
    return {
      gateway: "generic", external_order_id: str(p.order_id || p.id || p.transaction_id || p.code),
      external_payment_id: str(p.payment_id || p.id),
      customer: { email: str(c.email || p.email), name: str(c.name || p.name), phone: str(c.phone || p.phone), document: str(c.document || p.document) },
      status: str(p.status || p.event), total_value: num(p.amount || p.value || p.total),
      currency: str(p.currency || "BRL"), payment_method: str(p.payment_method || p.method), raw_payload: p,
    };
  },
};

// ── Handler Registry ──
const HANDLERS: Record<string, GatewayHandler> = {
  stripe: stripeHandler, mercadopago: mercadopagoHandler, pagarme: pagarmeHandler,
  asaas: asaasHandler, hotmart: hotmartHandler, monetizze: monetizzeHandler,
  eduzz: eduzzHandler, appmax: appmaxHandler, cakto: caktoHandler,
  kirvano: kirvanoHandler, pagseguro: pagseguroHandler,
  kiwify: kiwifyHandler, ticto: tictoHandler, greenn: greennHandler,
  shopify: shopifyHandler, paypal: paypalHandler, paddle: paddleHandler,
  fortpay: fortpayHandler, cloudfy: cloudfyHandler, gumroad: gumroadHandler,
  quantumpay: quantumpayHandler,
};

// ── Auto-detection by headers/payload ──
function detectProvider(req: Request, payload: any): string {
  // Header-based detection
  if (req.headers.get("stripe-signature")) return "stripe";
  if (req.headers.get("x-hotmart-hottok")) return "hotmart";
  if (req.headers.get("x-shopify-hmac-sha256") || req.headers.get("x-shopify-topic")) return "shopify";
  if (req.headers.get("paypal-transmission-id")) return "paypal";
  if (req.headers.get("paddle-signature")) return "paddle";
  if (req.headers.get("quantum-pay-signature")) return "quantumpay";

  // Payload-based detection
  if (payload?.hottok || payload?.data?.buyer?.hotmart_id) return "hotmart";
  if (payload?.type && payload?.data?.object && payload?.api_version) return "stripe";
  if (payload?.webhook_event_type && (payload?.Customer || payload?.product_type)) return "kiwify";
  if (payload?.event_type && payload?.resource?.id && payload?.summary) return "paypal";
  if (payload?.tipoPostback || payload?.venda?.codigo) return "monetizze";
  if (payload?.sale?.sale_id || payload?.trans_cod) return "eduzz";
  if (payload?.action && payload?.data?.id && (payload?.type === "payment" || payload?.action?.startsWith("payment."))) return "mercadopago";
  if (payload?.event && payload?.payment?.id && payload?.payment?.billingType) return "asaas";
  if (payload?.type && payload?.data?.charges && payload?.data?.customer?.document) return "pagarme";
  if (payload?.notificationType === "transaction" || payload?.transaction?.code) return "pagseguro";
  if (payload?.resource_name && (payload?.sale_id || payload?.seller_id)) return "gumroad";
  if (payload?.line_items && payload?.total_price && payload?.order_number) return "shopify";

  return "generic";
}

function getHandler(provider: string): GatewayHandler {
  return HANDLERS[provider] || { ...genericHandler, normalize: (p: any) => ({ ...genericHandler.normalize(p), gateway: provider }) };
}

// ════════════════════════════════════════════════════════════
// SECTION 3 — Signature Verification
// ════════════════════════════════════════════════════════════

async function verifySignature(provider: string, rawBody: string, req: Request, webhookSecret: string | null): Promise<{ valid: boolean; reason: string }> {
  if (!webhookSecret) return { valid: true, reason: "no_secret_configured" };
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(webhookSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    const hmacHex = async (payload: string) => {
      const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
      return Array.from(sig).map(b => b.toString(16).padStart(2, "0")).join("");
    };

    switch (provider) {
      case "stripe": {
        const sigH = req.headers.get("stripe-signature") || "";
        const parts = Object.fromEntries(sigH.split(",").map(s => s.split("=") as [string, string]));
        if (!parts.t || !parts.v1) return { valid: false, reason: "missing_stripe_signature" };
        const expected = await hmacHex(`${parts.t}.${rawBody}`);
        return { valid: expected === parts.v1, reason: expected === parts.v1 ? "stripe_verified" : "stripe_mismatch" };
      }
      case "pagarme": {
        const sig = req.headers.get("x-hub-signature") || "";
        const computed = "sha256=" + await hmacHex(rawBody);
        return { valid: computed === sig, reason: computed === sig ? "pagarme_verified" : "pagarme_mismatch" };
      }
      case "hotmart": {
        const hottok = req.headers.get("x-hotmart-hottok") || "";
        return { valid: hottok === webhookSecret, reason: hottok === webhookSecret ? "hotmart_verified" : "hotmart_mismatch" };
      }
      case "quantumpay": {
        // Header: Quantum-Pay-Signature: t=<timestamp>,v1=<hmac_sha256>
        // String assinada: `${timestamp}.${rawBody}` com SHA-256 + secret
        const sigH = req.headers.get("quantum-pay-signature") || "";
        if (!sigH) return { valid: false, reason: "missing_quantumpay_signature" };
        let timestamp = "", v1 = "";
        for (const el of sigH.split(",")) {
          const [pref, val] = el.split("=");
          if (pref === "t") timestamp = val;
          else if (pref === "v1") v1 = val;
        }
        if (!timestamp || !v1) return { valid: false, reason: "invalid_quantumpay_format" };
        const expected = await hmacHex(`${timestamp}.${rawBody}`);
        return { valid: expected === v1, reason: expected === v1 ? "quantumpay_verified" : "quantumpay_mismatch" };
      }
      default: {
        const sig = req.headers.get("x-webhook-signature") || req.headers.get("x-signature") || req.headers.get("x-hub-signature-256") || "";
        if (!sig) return { valid: true, reason: "no_signature_header" };
        const computed = await hmacHex(rawBody);
        const normalized = sig.replace(/^sha256=/, "");
        return { valid: computed === normalized, reason: computed === normalized ? "generic_verified" : "generic_mismatch" };
      }
    }
  } catch (err) {
    console.error("Signature verification error:", err);
    return { valid: false, reason: "verification_error" };
  }
}

// ════════════════════════════════════════════════════════════
// SECTION 4 — Reconciler (identity + session matching)
// ════════════════════════════════════════════════════════════

async function reconcile(workspaceId: string, customer: NormalizedCustomer): Promise<{ identityId: string | null; sessionId: string | null; sessionData: any; matchField: string | null }> {
  let identityId: string | null = null;
  let sessionId: string | null = null;
  let matchField: string | null = null;

  // Strategy 1: email
  if (customer.email) {
    const { data } = await supabase.from("identities").select("id").eq("workspace_id", workspaceId).eq("email", customer.email).limit(1).single();
    if (data) { identityId = data.id; matchField = "email"; }
  }
  // Strategy 2: phone
  if (!identityId && customer.phone) {
    const { data } = await supabase.from("identities").select("id").eq("workspace_id", workspaceId).eq("phone", customer.phone).limit(1).single();
    if (data) { identityId = data.id; matchField = "phone"; }
  }
  // Strategy 3: document
  if (!identityId && customer.document) {
    const { data } = await supabase.from("identities").select("id").eq("workspace_id", workspaceId).eq("external_id", customer.document).limit(1).single();
    if (data) { identityId = data.id; matchField = "document"; }
  }
  // Strategy 4: leads
  if (!identityId && (customer.email || customer.phone)) {
    let q = supabase.from("leads").select("identity_id, session_id").eq("workspace_id", workspaceId);
    if (customer.email) q = q.eq("email", customer.email);
    else q = q.eq("phone", customer.phone!);
    const { data } = await q.order("created_at", { ascending: false }).limit(1).single();
    if (data?.identity_id) { identityId = data.identity_id; matchField = "lead"; }
    if (data?.session_id) sessionId = data.session_id;
  }
  // Strategy 5: gateway_customers
  if (!identityId && customer.email) {
    const { data } = await supabase.from("gateway_customers").select("identity_id").eq("workspace_id", workspaceId).eq("email", customer.email).limit(1).single();
    if (data?.identity_id) { identityId = data.identity_id; matchField = "gateway_customer"; }
  }

  // Get session with UTMs
  let sessionData: any = null;
  if (identityId) {
    const { data } = await supabase.from("sessions")
      .select("id, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbp, fbc, fbclid, gclid, ttclid, landing_page, referrer, ip_hash, user_agent")
      .eq("workspace_id", workspaceId).eq("identity_id", identityId)
      .order("created_at", { ascending: false }).limit(1).single();
    if (data) { sessionId = data.id; sessionData = data; }
  }

  return { identityId, sessionId, sessionData, matchField };
}

// ════════════════════════════════════════════════════════════
// SECTION 5 — Queue Dispatcher (enqueue for async processing)
// ════════════════════════════════════════════════════════════

async function enqueueForMeta(
  workspaceId: string, eventId: string, orderId: string | null,
  order: NormalizedOrder, marketingEvent: string,
  sessionData: any, identityId: string | null,
) {
  // Check if workspace has active Meta pixels
  const { data: pixels } = await supabase.from("meta_pixels")
    .select("id, pixel_id").eq("workspace_id", workspaceId).eq("is_active", true);

  if (!pixels?.length) return;

  for (const pixel of pixels) {
    await supabase.from("event_queue").insert({
      workspace_id: workspaceId,
      event_id: eventId,
      order_id: orderId,
      provider: "meta",
      destination: pixel.pixel_id,
      status: "queued",
      payload_json: {
        marketing_event: marketingEvent,
        order: { total_value: order.total_value, currency: order.currency, external_order_id: order.external_order_id, payment_method: order.payment_method, items: order.items },
        customer: order.customer,
        session: sessionData ? { fbp: sessionData.fbp, fbc: sessionData.fbc, ip_hash: sessionData.ip_hash, user_agent: sessionData.user_agent, landing_page: sessionData.landing_page, gclid: sessionData.gclid, ttclid: sessionData.ttclid, ttp: sessionData.ttp, referrer: sessionData.referrer, utm_source: sessionData.utm_source, utm_medium: sessionData.utm_medium, utm_campaign: sessionData.utm_campaign } : null,
        identity_id: identityId,
      },
    });
  }
}

/** Enqueue events for non-Meta providers (Google Ads, TikTok, GA4) */
async function enqueueForOtherProviders(
  workspaceId: string, eventId: string, orderId: string | null,
  order: NormalizedOrder, marketingEvent: string,
  sessionData: any, identityId: string | null,
) {
  const { data: destinations } = await supabase.from("integration_destinations")
    .select("id, provider, destination_id")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .in("provider", ["google_ads", "tiktok", "ga4"]);

  if (!destinations?.length) return;

  for (const dest of destinations) {
    await supabase.from("event_queue").insert({
      workspace_id: workspaceId,
      event_id: eventId,
      order_id: orderId,
      provider: dest.provider,
      destination: dest.destination_id,
      status: "queued",
      payload_json: {
        marketing_event: marketingEvent,
        order: { total_value: order.total_value, currency: order.currency, external_order_id: order.external_order_id, payment_method: order.payment_method, items: order.items },
        customer: order.customer,
        session: sessionData ? { fbp: sessionData.fbp, fbc: sessionData.fbc, ip_hash: sessionData.ip_hash, user_agent: sessionData.user_agent, landing_page: sessionData.landing_page, gclid: sessionData.gclid, ttclid: sessionData.ttclid, ttp: sessionData.ttp, gbraid: sessionData.gbraid, wbraid: sessionData.wbraid, referrer: sessionData.referrer, utm_source: sessionData.utm_source, utm_medium: sessionData.utm_medium, utm_campaign: sessionData.utm_campaign, client_id: sessionData.ga_client_id } : null,
        identity_id: identityId,
      },
    });
  }
}

// ════════════════════════════════════════════════════════════
// SECTION 6 — Main HTTP Handler
// ════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const url = new URL(req.url);
    let provider = url.searchParams.get("provider") || "auto";
    const workspaceId = url.searchParams.get("workspace_id");
    const integrationId = url.searchParams.get("integration_id") || null;

    if (!workspaceId) {
      return new Response(JSON.stringify({ error: "workspace_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rawBody = await req.text();

    // ── Parse payload early for auto-detection ──
    let payload: any;
    try { payload = JSON.parse(rawBody); } catch { payload = { raw: rawBody }; }

    // ── Auto-detect provider if not specified ──
    if (provider === "auto" || provider === "generic") {
      provider = detectProvider(req, payload);
    }

    // ── Signature validation ──
    let webhookSecret: string | null = null;
    if (integrationId) {
      const { data } = await supabase.from("gateway_integrations").select("webhook_secret_encrypted").eq("id", integrationId).single();
      webhookSecret = data?.webhook_secret_encrypted || null;
    }

    // ── Test mode: authenticated workspace member can bypass signature check ──
    let isTestMode = false;
    if (req.headers.get("x-test-mode") === "1") {
      const authHeader = req.headers.get("authorization") || "";
      if (authHeader.startsWith("Bearer ")) {
        const token = authHeader.slice(7);
        const { data: claimsData } = await supabase.auth.getClaims(token);
        const userId = claimsData?.claims?.sub;
        if (userId) {
          const { data: isMember } = await supabase.rpc("is_workspace_member", { _user_id: userId, _workspace_id: workspaceId });
          if (isMember) isTestMode = true;
        }
      }
    }

    const sigResult = isTestMode
      ? { valid: true, reason: "test_mode_bypass" }
      : await verifySignature(provider, rawBody, req, webhookSecret);
    if (!sigResult.valid) {
      await supabase.from("gateway_webhook_logs").insert({
        workspace_id: workspaceId, gateway_integration_id: integrationId, provider,
        signature_valid: false, processing_status: "rejected",
        error_message: `Signature failed: ${sigResult.reason}`, payload_json: { body_length: rawBody.length },
      });
      return new Response(JSON.stringify({ error: "Invalid signature", reason: sigResult.reason }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Normalize ──
    const handler = getHandler(provider);
    const eventType = handler.extractEventType(payload);
    const internalEvent = handler.resolveInternalEvent(eventType);
    const order = handler.normalize(payload);

    const externalEventId = str(payload.id || payload.event_id || payload.notification_id || order.external_order_id);
    const dedupKey = `${provider}:${eventType}:${externalEventId}`;

    // ── Log webhook ──
    const headersJson: Record<string, string> = {};
    req.headers.forEach((v, k) => { headersJson[k] = v; });

    const { data: webhookLog } = await supabase.from("gateway_webhook_logs").insert({
      workspace_id: workspaceId, gateway_integration_id: integrationId, provider,
      external_event_id: externalEventId, event_type: eventType,
      signature_valid: true, http_headers_json: headersJson,
      query_params_json: Object.fromEntries(url.searchParams.entries()),
      payload_json: payload, processing_status: "processing",
    }).select("id").single();

    // ── Idempotency ──
    const { data: existingLog } = await supabase.from("gateway_webhook_logs")
      .select("id").eq("workspace_id", workspaceId).eq("external_event_id", externalEventId)
      .eq("provider", provider).eq("processing_status", "processed").limit(1).single();

    if (existingLog) {
      if (webhookLog?.id) await supabase.from("gateway_webhook_logs").update({ processing_status: "duplicate" }).eq("id", webhookLog.id);
      return new Response(JSON.stringify({ status: "duplicate" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Upsert order ──
    const isPaid = ["order_paid", "payment_paid", "pix_paid", "boleto_paid", "order_approved"].includes(internalEvent);
    const isRefund = internalEvent.includes("refund");
    const isChargeback = internalEvent.includes("chargeback");
    const isCanceled = internalEvent.includes("cancel");

    const orderData: any = {
      workspace_id: workspaceId, gateway: order.gateway, gateway_order_id: order.external_order_id,
      gateway_integration_id: integrationId, customer_email: order.customer.email || null,
      customer_name: order.customer.name || null, customer_phone: order.customer.phone || null,
      customer_document: order.customer.document || null,
      status: isPaid ? "paid" : isRefund ? "refunded" : isChargeback ? "chargeback" : isCanceled ? "canceled" : "pending",
      financial_status: internalEvent, total_value: order.total_value, currency: order.currency,
      payment_method: order.payment_method, installments: order.installments,
      external_checkout_id: order.external_checkout_id, external_subscription_id: order.external_subscription_id,
    };
    if (isPaid) orderData.paid_at = new Date().toISOString();
    if (isRefund) orderData.refunded_at = new Date().toISOString();
    if (isCanceled) orderData.canceled_at = new Date().toISOString();

    const { data: savedOrder } = await supabase.from("orders").insert(orderData).select("id").single();

    // ── Payment record ──
    const paymentStatus = isPaid ? "paid" : isRefund ? "refunded" : isChargeback ? "chargeback" : internalEvent.includes("fail") || internalEvent.includes("refused") ? "failed" : "pending";
    await supabase.from("payments").insert({
      workspace_id: workspaceId, order_id: savedOrder?.id, gateway: order.gateway,
      gateway_integration_id: integrationId, gateway_payment_id: order.external_payment_id,
      payment_method: order.payment_method, status: paymentStatus,
      amount: order.total_value, currency: order.currency, installments: order.installments,
      paid_at: paymentStatus === "paid" ? new Date().toISOString() : null,
      refunded_at: paymentStatus === "refunded" ? new Date().toISOString() : null,
      chargeback_at: paymentStatus === "chargeback" ? new Date().toISOString() : null,
      raw_payload_json: payload,
    });

    // ── Order items ──
    if (order.items?.length && savedOrder?.id) {
      await supabase.from("order_items").insert(order.items.map(i => ({ order_id: savedOrder.id, workspace_id: workspaceId, ...i })));
    }

    // ── Reconciliation ──
    const { identityId, sessionId, sessionData, matchField } = await reconcile(workspaceId, order.customer);

    if (sessionData && savedOrder?.id) {
      await supabase.from("orders").update({
        session_id: sessionId, identity_id: identityId,
        utm_source: sessionData.utm_source, utm_medium: sessionData.utm_medium,
        utm_campaign: sessionData.utm_campaign, utm_content: sessionData.utm_content,
        utm_term: sessionData.utm_term, fbp: sessionData.fbp, fbc: sessionData.fbc,
        fbclid: sessionData.fbclid, gclid: sessionData.gclid, ttclid: sessionData.ttclid,
        landing_page: sessionData.landing_page, referrer: sessionData.referrer,
      }).eq("id", savedOrder.id);
    }

    // Upsert gateway_customer
    if (order.customer.email || order.customer.phone) {
      await supabase.from("gateway_customers").upsert({
        workspace_id: workspaceId, provider, gateway_integration_id: integrationId,
        external_customer_id: order.external_order_id, identity_id: identityId,
        name: order.customer.name || null, email: order.customer.email || null,
        phone: order.customer.phone || null, document: order.customer.document || null,
      }, { onConflict: "workspace_id,provider,external_customer_id", ignoreDuplicates: true });
    }

    // Reconciliation log
    await supabase.from("reconciliation_logs").insert({
      workspace_id: workspaceId, provider, entity_type: "order",
      entity_id: savedOrder?.id, external_id: order.external_order_id,
      reconciliation_type: sessionId ? "session_matched" : identityId ? "identity_only" : "unmatched",
      status: sessionId ? "success" : identityId ? "partial" : "failed",
      details_json: { identity_id: identityId, session_id: sessionId, match_field: matchField },
    });

    // ── Map to marketing event ──
    const { data: customMapping } = await supabase.from("event_mappings")
      .select("marketing_event, external_event_name")
      .eq("workspace_id", workspaceId).eq("gateway", provider).eq("gateway_event", eventType)
      .eq("is_active", true).limit(1).single();

    const marketingEvent = customMapping?.marketing_event || customMapping?.external_event_name || INTERNAL_TO_META[internalEvent] || null;

    // ── Create event ──
    let eventId: string | null = null;
    if (marketingEvent || internalEvent) {
      const evtName = marketingEvent || internalEvent;
      const { data: evt } = await supabase.from("events").insert({
        workspace_id: workspaceId, event_name: evtName, event_id: crypto.randomUUID(),
        event_time: new Date().toISOString(), action_source: "system",
        source: `webhook_${provider}`, session_id: sessionId, identity_id: identityId,
        processing_status: META_EVENTS.has(evtName) ? "queued" : "internal",
        custom_data_json: { value: order.total_value, currency: order.currency, order_id: order.external_order_id, payment_method: order.payment_method, internal_event: internalEvent },
        deduplication_key: dedupKey,
      }).select("id").single();
      eventId = evt?.id || null;

      // Conversion record
      if (["Purchase", "Lead", "Subscribe"].includes(evtName) || isPaid) {
        await supabase.from("conversions").insert({
          workspace_id: workspaceId, event_id: evt?.id || crypto.randomUUID(),
          session_id: sessionId, identity_id: identityId,
          conversion_type: evtName.toLowerCase(), value: order.total_value, currency: order.currency,
          attributed_source: sessionData?.utm_source || null,
          attributed_campaign: sessionData?.utm_campaign || null,
          attribution_model: "last_touch",
        });
      }

      // ── ENQUEUE for all configured providers ──
      if (marketingEvent && eventId) {
        // Meta CAPI
        if (META_EVENTS.has(marketingEvent)) {
          await enqueueForMeta(workspaceId, eventId, savedOrder?.id || null, order, marketingEvent, sessionData, identityId);
        }
        // Google Ads, TikTok, GA4
        await enqueueForOtherProviders(workspaceId, eventId, savedOrder?.id || null, order, marketingEvent, sessionData, identityId);
      }
    }

    // Update webhook log
    if (webhookLog?.id) {
      await supabase.from("gateway_webhook_logs").update({
        processing_status: "processed", processed_at: new Date().toISOString(), processing_attempts: 1,
      }).eq("id", webhookLog.id);
    }

    return new Response(JSON.stringify({
      status: "ok", provider, internal_event: internalEvent,
      marketing_event: marketingEvent, order_id: savedOrder?.id, event_id: eventId,
      queued_for_delivery: !!marketingEvent,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("Gateway webhook error:", err);
    return new Response(JSON.stringify({ error: "Internal server error", details: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
