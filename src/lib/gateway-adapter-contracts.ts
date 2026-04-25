/**
 * Gateway Adapter Contracts — Passo M.
 *
 * Read-only specification of the *minimum* fields every gateway adapter MUST
 * normalize before pushing into the canonical pipeline. This is the source
 * of truth used by:
 *
 *   - go-live certification report (UI + script)
 *   - new-gateway templates / external checkout prompts
 *   - validateAdapterPayload() unit tests
 *
 * IMPORTANT
 *   - This file is pure data. No runtime PII passes through it.
 *   - Hard-coding of provider-specific status enums is intentionally MINIMAL —
 *     each gateway adapter handles its own mapping; the contract just enforces
 *     that the canonical mapped status falls into a known bucket.
 *   - Do not import from supabase here — keep it serializable.
 */

export type CanonicalStatus =
  | "paid"
  | "pending"
  | "refunded"
  | "canceled"
  | "chargeback"
  | "expired"
  | "failed";

export type AdapterFieldRequirement = "required" | "recommended" | "optional";

export interface AdapterFieldSpec {
  field: string;
  requirement: AdapterFieldRequirement;
  /** Short, non-PII description used in UI/docs. */
  description: string;
}

export interface GatewayAdapterContract {
  id: string;
  label: string;
  category: "checkout-native" | "checkout-external" | "marketplace" | "subscription";
  /** Slug used in `?provider=` URL of gateway-webhook. */
  providerSlug: string;
  /** Whether the adapter exists today in supabase/functions/gateway-webhook/handlers. */
  shippedHandler: boolean;
  /** Default status mappings expected from the adapter (canonical → upstream samples). */
  statusMap: Partial<Record<CanonicalStatus, string[]>>;
  /** Minimum fields the adapter must surface to the canonical pipeline. */
  fields: AdapterFieldSpec[];
  notes?: string;
}

const COMMON_FIELDS: AdapterFieldSpec[] = [
  {
    field: "transaction_id",
    requirement: "required",
    description:
      "ID estável da transação no gateway (ex.: charge.id, payment_intent.id). Diferente do order_id.",
  },
  {
    field: "order_code",
    requirement: "required",
    description:
      "Código do pedido no painel do lojista. Para multi-etapa, é o código DA etapa.",
  },
  {
    field: "root_order_code",
    requirement: "required",
    description:
      "Código da jornada raiz. Igual ao order_code para o pedido principal; etapas adicionais herdam do principal.",
  },
  {
    field: "external_reference",
    requirement: "required",
    description:
      "Identificador estável passado pelo lojista (ex.: step:upsell_1:<root_order_code>). Permite reidratar root + step_key sem PII.",
  },
  {
    field: "step_key",
    requirement: "recommended",
    description:
      "Identificador da etapa (main / shipping_fee / upsell_1 / insurance / tmt / warranty…). Estável e sem PII.",
  },
  {
    field: "amount",
    requirement: "required",
    description: "Valor isolado dessa transação. Etapas adicionais NÃO somam o principal.",
  },
  {
    field: "currency",
    requirement: "required",
    description: "ISO-4217 (BRL, USD…). Defaults to workspace currency only when truly absent.",
  },
  {
    field: "status",
    requirement: "required",
    description: "Status canônico mapeado: paid / pending / refunded / canceled / chargeback / expired / failed.",
  },
  {
    field: "customer.email_hash",
    requirement: "recommended",
    description: "SHA-256(lowercased email). Email cru NUNCA atravessa o adapter.",
  },
  {
    field: "customer.phone_hash",
    requirement: "recommended",
    description: "SHA-256(E.164). Telefone cru NUNCA atravessa o adapter.",
  },
  {
    field: "tracking.session_id",
    requirement: "recommended",
    description: "Correlação com a sessão capturada no front (não-PII).",
  },
  {
    field: "tracking.gclid",
    requirement: "optional",
    description: "Click ID Google. Case-sensitive — apenas .trim().",
  },
  {
    field: "tracking.fbclid",
    requirement: "optional",
    description: "Click ID Meta. Case-sensitive.",
  },
  {
    field: "tracking.msclkid",
    requirement: "optional",
    description: "Click ID Microsoft Ads. Case-sensitive.",
  },
];

const PAYMENT_STATUS_MAP_DEFAULT: GatewayAdapterContract["statusMap"] = {
  paid: ["paid", "approved", "confirmed", "succeeded", "captured", "PAID", "APPROVED"],
  pending: ["pending", "waiting_payment", "processing", "PENDING"],
  refunded: ["refunded", "REFUNDED"],
  canceled: ["canceled", "cancelled", "CANCELED", "CANCELLED"],
  chargeback: ["chargeback", "disputed"],
  expired: ["expired", "EXPIRED"],
  failed: ["failed", "refused", "declined", "rejected"],
};

export const GATEWAY_ADAPTER_CONTRACTS: GatewayAdapterContract[] = [
  {
    id: "mercadopago",
    label: "Mercado Pago",
    category: "checkout-native",
    providerSlug: "mercadopago",
    shippedHandler: true,
    statusMap: PAYMENT_STATUS_MAP_DEFAULT,
    fields: COMMON_FIELDS,
  },
  {
    id: "stripe",
    label: "Stripe",
    category: "checkout-native",
    providerSlug: "stripe",
    shippedHandler: true,
    statusMap: {
      ...PAYMENT_STATUS_MAP_DEFAULT,
      paid: ["paid", "succeeded"],
    },
    fields: COMMON_FIELDS,
  },
  {
    id: "yampi",
    label: "Yampi",
    category: "checkout-external",
    providerSlug: "yampi",
    shippedHandler: true,
    statusMap: PAYMENT_STATUS_MAP_DEFAULT,
    fields: COMMON_FIELDS,
  },
  {
    id: "shopify",
    label: "Shopify",
    category: "checkout-external",
    providerSlug: "shopify",
    shippedHandler: true,
    statusMap: PAYMENT_STATUS_MAP_DEFAULT,
    fields: COMMON_FIELDS,
  },
  {
    id: "woocommerce",
    label: "WooCommerce",
    category: "checkout-external",
    providerSlug: "generic",
    shippedHandler: false,
    statusMap: PAYMENT_STATUS_MAP_DEFAULT,
    fields: COMMON_FIELDS,
    notes: "Use generic adapter + custom WooCommerce webhook bridge. No hardcoded keys.",
  },
  {
    id: "cartpanda",
    label: "CartPanda",
    category: "checkout-external",
    providerSlug: "generic",
    shippedHandler: false,
    statusMap: PAYMENT_STATUS_MAP_DEFAULT,
    fields: COMMON_FIELDS,
    notes: "Use generic adapter — payload format mirrors common e-commerce contract.",
  },
  {
    id: "hotmart",
    label: "Hotmart",
    category: "marketplace",
    providerSlug: "hotmart",
    shippedHandler: true,
    statusMap: PAYMENT_STATUS_MAP_DEFAULT,
    fields: COMMON_FIELDS,
  },
  {
    id: "kiwify",
    label: "Kiwify",
    category: "marketplace",
    providerSlug: "kiwify",
    shippedHandler: true,
    statusMap: PAYMENT_STATUS_MAP_DEFAULT,
    fields: COMMON_FIELDS,
  },
  {
    id: "eduzz",
    label: "Eduzz",
    category: "marketplace",
    providerSlug: "eduzz",
    shippedHandler: true,
    statusMap: PAYMENT_STATUS_MAP_DEFAULT,
    fields: COMMON_FIELDS,
  },
  {
    id: "monetizze",
    label: "Monetizze",
    category: "marketplace",
    providerSlug: "monetizze",
    shippedHandler: true,
    statusMap: PAYMENT_STATUS_MAP_DEFAULT,
    fields: COMMON_FIELDS,
  },
  {
    id: "ticto",
    label: "Ticto",
    category: "marketplace",
    providerSlug: "ticto",
    shippedHandler: true,
    statusMap: PAYMENT_STATUS_MAP_DEFAULT,
    fields: COMMON_FIELDS,
  },
  {
    id: "braip",
    label: "Braip",
    category: "marketplace",
    providerSlug: "generic",
    shippedHandler: false,
    statusMap: PAYMENT_STATUS_MAP_DEFAULT,
    fields: COMMON_FIELDS,
    notes: "Use generic adapter with Braip postback documentation.",
  },
  {
    id: "perfectpay",
    label: "PerfectPay",
    category: "marketplace",
    providerSlug: "generic",
    shippedHandler: false,
    statusMap: PAYMENT_STATUS_MAP_DEFAULT,
    fields: COMMON_FIELDS,
    notes: "Use generic adapter — sale_status_enum maps to canonical statuses.",
  },
];

/** Result of validating an adapter-normalized payload against the contract. */
export interface AdapterValidationIssue {
  field: string;
  reason: string;
  severity: "error" | "warn" | "info";
}

/**
 * Pure validator. Accepts a *plain object* the adapter would produce after
 * normalization (the same shape as the canonical pipeline expects).
 *
 * It NEVER inspects PII content (no regex over emails / phones); it only
 * checks for required-field PRESENCE and canonical-status membership. Extra
 * fields are ignored.
 */
export function validateAdapterPayload(
  contract: GatewayAdapterContract,
  payload: Record<string, unknown>,
): AdapterValidationIssue[] {
  const issues: AdapterValidationIssue[] = [];
  const get = (path: string): unknown => {
    return path.split(".").reduce<unknown>((acc, key) => {
      if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, payload);
  };

  for (const f of contract.fields) {
    const v = get(f.field);
    const present = v !== undefined && v !== null && v !== "";
    if (!present) {
      if (f.requirement === "required") {
        issues.push({ field: f.field, reason: "missing_required_field", severity: "error" });
      } else if (f.requirement === "recommended") {
        issues.push({ field: f.field, reason: "missing_recommended_field", severity: "warn" });
      }
    }
  }

  // Canonical status membership.
  const status = get("status");
  if (typeof status === "string") {
    const canonical = (Object.keys(contract.statusMap) as CanonicalStatus[]).find((k) => k === status);
    if (!canonical) {
      issues.push({
        field: "status",
        reason: `status "${status}" is not a canonical bucket`,
        severity: "error",
      });
    }
  }

  // Forbid raw PII in the normalized payload (defense in depth).
  const rawPiiKeys = ["email", "phone", "cpf", "cnpj", "document"];
  const cust = (payload as { customer?: Record<string, unknown> }).customer;
  if (cust && typeof cust === "object") {
    for (const k of rawPiiKeys) {
      if (k in cust) {
        issues.push({
          field: `customer.${k}`,
          reason: "raw PII must not leave the adapter — pass *_hash instead",
          severity: "error",
        });
      }
    }
  }

  return issues;
}

export function getAdapterContract(id: string): GatewayAdapterContract | undefined {
  return GATEWAY_ADAPTER_CONTRACTS.find((c) => c.id === id);
}
