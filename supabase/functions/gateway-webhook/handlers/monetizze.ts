// Monetizze webhook handler.
// Docs: https://app.monetizze.com.br/api/v2/postback
// HMAC: Monetizze uses a token field inside payload — fallback to generic verifier.

import type { GatewayHandler, InternalEvent } from "./_types.ts";
import { num, str } from "./_helpers.ts";

export const monetizzeHandler: GatewayHandler = {
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
    const v = p.venda || p;
    const c = p.comprador || v.comprador || {};
    const pr = p.produto || v.produto || {};
    return {
      gateway: "monetizze",
      external_order_id: str(v.codigo || v.transacao || p.transacao),
      external_payment_id: str(v.codigo || v.transacao),
      customer: {
        email: str(c.email),
        name: str(c.nome),
        phone: str(c.telefone),
        document: str(c.cnpj_cpf),
      },
      status: str(v.status || v.statusDescricao),
      total_value: num(v.valorLiquido || v.valor || v.preco),
      currency: "BRL",
      payment_method: str(v.formaPagamento || v.forma_pagamento),
      items: pr.nome
        ? [{ product_name: str(pr.nome), product_id: str(pr.codigo), quantity: 1 }]
        : undefined,
      raw_payload: p,
    };
  },
};
