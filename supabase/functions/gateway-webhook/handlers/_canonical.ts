// ────────────────────────────────────────────────────────────────────────
// Canonical event_id derivation for the multi-step purchase model.
//
// Rules (production-hardened, 04/2026):
//   - Main purchase:  event_id = `purchase:<root_order_code>`
//   - Step purchase:  event_id = `purchase:<root_order_code>:step:<step_key>`
//
// Step examples (NEVER hard-coded — derived from gateway metadata or
// inferred from externalReference): main, shipping_fee, handling_fee,
// upsell_1, insurance, priority_fee, warranty, tmt, etc.
//
// Inference precedence:
//   1. Browser-supplied event_id starting with `purchase:` → trust it.
//   2. For paid/Purchase events: derive from root_order_code + step_key.
//   3. Otherwise: deterministic fallback `<eventName>:<external_id>:<provider>`.
//      NEVER a random UUID for marketing events.

import type { NormalizedOrder, NormalizedTracking } from "./_types.ts";

/** Sanitize a step_key: lowercase, kebab/snake-only, max 32 chars. */
export function normalizeStepKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = String(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return cleaned || null;
}

/** Detect step_key from an externalReference like `tmt-EV-20260425-ABC` or
 *  `step:upsell_1:EV-20260425-ABC`. Returns { stepKey, rootOrderCode }.
 *
 *  Conservative: pure-numeric prefixes (e.g. `pedido-123`) are NOT treated as
 *  step prefixes — those are ordinary order IDs without a step.
 */
export function inferStepFromExternalRef(
  externalRef: string | null | undefined,
): { stepKey: string | null; rootOrderCode: string | null } {
  if (!externalRef) return { stepKey: null, rootOrderCode: null };
  const ref = String(externalRef).trim();
  if (!ref) return { stepKey: null, rootOrderCode: null };

  // Pattern A: `step:<key>:<root>` or `step:<key>-<root>`
  const mA = ref.match(/^step[:\-]([a-z0-9_-]{1,32})[:\-](.+)$/i);
  if (mA) {
    return {
      stepKey: normalizeStepKey(mA[1]),
      rootOrderCode: mA[2].trim() || null,
    };
  }

  // Pattern B: `<key>_<more>-<root>` — key MUST contain an underscore so we never
  // mis-classify a normal order code like `EV-20260425-XYZ` as `EV` (step) +
  // `20260425-XYZ` (root). Real step keys are `shipping_fee`, `upsell_1`,
  // `taxa_transporte`, `priority_fee`, etc. — all snake_case by convention.
  // Examples that match: `shipping_fee-EV-20260425-ABC`, `upsell_1-EV-...`.
  const mB = ref.match(/^([a-z][a-z0-9]*_[a-z0-9_]{1,30})-(.+)$/i);
  if (mB) {
    const candidateRoot = mB[2].trim();
    if (candidateRoot.length >= 4) {
      return {
        stepKey: normalizeStepKey(mB[1]),
        rootOrderCode: candidateRoot || null,
      };
    }
  }

  return { stepKey: null, rootOrderCode: null };
}

/** Derive root_order_code + step_key from order/tracking metadata. */
export function resolveRootAndStep(
  order: NormalizedOrder,
): { rootOrderCode: string | null; stepKey: string | null } {
  const t = (order.tracking || {}) as NormalizedTracking;

  // 1. Explicit fields from gateway metadata always win
  let rootOrderCode = (
    t.root_order_code ||
    t.parent_order_code ||
    t.main_order_code ||
    t.order_code ||
    null
  ) as string | null;

  let stepKey = normalizeStepKey(
    (t.step_key as string | undefined) ||
    (t.checkout_step as string | undefined) ||
    (t.payment_role as string | undefined) ||
    null,
  );

  // 2. Infer from externalReference / external_order_id pattern
  if (!rootOrderCode || !stepKey) {
    const candidateRefs = [
      t.external_reference,
      order.external_order_id,
    ].filter(Boolean) as string[];

    for (const ref of candidateRefs) {
      const inferred = inferStepFromExternalRef(ref);
      if (inferred.rootOrderCode && !rootOrderCode) rootOrderCode = inferred.rootOrderCode;
      if (inferred.stepKey && !stepKey) stepKey = inferred.stepKey;
      if (rootOrderCode && stepKey) break;
    }
  }

  // 3. Default: when no step is detected, the order IS the root and step is null
  if (!rootOrderCode) rootOrderCode = order.external_order_id || null;

  return { rootOrderCode, stepKey };
}

/**
 * Build the canonical event_id. Never returns a random UUID.
 *
 * Precedence:
 *   1. Browser event_id starting with `purchase:` (already canonical).
 *   2. For Purchase / paid statuses → multi-step canonical purchase event_id.
 *   3. Fallback: deterministic <eventName>:<external_id>:<provider>.
 */
export function buildCanonicalEventIdentity(opts: {
  order: NormalizedOrder;
  eventName: string;
  internalEvent: string;
  provider: string;
  externalEventId: string | null;
}): {
  eventId: string;
  rootOrderCode: string | null;
  stepKey: string | null;
  source: "browser" | "purchase_main" | "purchase_step" | "deterministic";
} {
  const { order, eventName, internalEvent, provider, externalEventId } = opts;
  const browserEventId = (order.tracking?.event_id || "").trim();

  // 1) Browser already gave us a canonical purchase id — trust it.
  if (browserEventId.toLowerCase().startsWith("purchase:")) {
    const m = browserEventId.match(/^purchase:([^:]+)(?::step:(.+))?$/i);
    return {
      eventId: browserEventId,
      rootOrderCode: m?.[1] || null,
      stepKey: normalizeStepKey(m?.[2] || null),
      source: "browser",
    };
  }

  const { rootOrderCode, stepKey } = resolveRootAndStep(order);
  const isPurchase = eventName === "Purchase" || eventName === "purchase";
  const PAID = new Set([
    "order_paid", "order_approved", "payment_paid",
    "pix_paid", "boleto_paid",
    "subscription_started", "subscription_renewed",
  ]);
  const isPaid = PAID.has(internalEvent);

  // 2) Purchase / paid → canonical multi-step id
  if ((isPurchase || isPaid) && rootOrderCode) {
    if (stepKey && stepKey !== "main") {
      return {
        eventId: `purchase:${rootOrderCode}:step:${stepKey}`,
        rootOrderCode,
        stepKey,
        source: "purchase_step",
      };
    }
    return {
      eventId: `purchase:${rootOrderCode}`,
      rootOrderCode,
      stepKey: stepKey || null,
      source: "purchase_main",
    };
  }

  // 3) Deterministic fallback — NEVER random UUID for marketing events.
  const ref =
    order.external_order_id ||
    order.external_payment_id ||
    externalEventId ||
    rootOrderCode ||
    "unknown";
  return {
    eventId: `${eventName}:${ref}:${provider}`.toLowerCase(),
    rootOrderCode,
    stepKey,
    source: "deterministic",
  };
}
