// GatewayRegistry — central lookup for gateway-specific handlers.
//
// To add a new gateway:
//   1. Create a handler file in this folder implementing GatewayHandler
//   2. Import it here and register it in HANDLERS
//   3. (Optional) Add detection rules in detectProvider() in ../index.ts
//
// All gateway-specific logic lives here. The router in index.ts is now a
// thin orchestrator that delegates to the handler returned by getHandler().

import type { GatewayHandler } from "./_types.ts";
import { hotmartHandler } from "./hotmart.ts";
import { kiwifyHandler } from "./kiwify.ts";
import { yampiHandler } from "./yampi.ts";
import { eduzzHandler } from "./eduzz.ts";
import { stripeHandler } from "./stripe.ts";
import { mercadopagoHandler } from "./mercadopago.ts";
import { pagarmeHandler } from "./pagarme.ts";
import { asaasHandler } from "./asaas.ts";
import { monetizzeHandler } from "./monetizze.ts";
import { appmaxHandler } from "./appmax.ts";
import { caktoHandler } from "./cakto.ts";
import { kirvanoHandler } from "./kirvano.ts";
import { pagseguroHandler } from "./pagseguro.ts";
import { tictoHandler } from "./ticto.ts";
import { greennHandler } from "./greenn.ts";
import { shopifyHandler } from "./shopify.ts";
import { paypalHandler } from "./paypal.ts";
import { paddleHandler } from "./paddle.ts";
import { fortpayHandler } from "./fortpay.ts";
import { cloudfyHandler } from "./cloudfy.ts";
import { quantumpayHandler } from "./quantumpay.ts";
import { gumroadHandler } from "./gumroad.ts";
import { genericHandler } from "./generic.ts";

export const HANDLERS: Record<string, GatewayHandler> = {
  hotmart: hotmartHandler,
  kiwify: kiwifyHandler,
  yampi: yampiHandler,
  eduzz: eduzzHandler,
  stripe: stripeHandler,
  mercadopago: mercadopagoHandler,
  pagarme: pagarmeHandler,
  asaas: asaasHandler,
  monetizze: monetizzeHandler,
  appmax: appmaxHandler,
  cakto: caktoHandler,
  kirvano: kirvanoHandler,
  pagseguro: pagseguroHandler,
  ticto: tictoHandler,
  greenn: greennHandler,
  shopify: shopifyHandler,
  paypal: paypalHandler,
  paddle: paddleHandler,
  fortpay: fortpayHandler,
  cloudfy: cloudfyHandler,
  quantumpay: quantumpayHandler,
  gumroad: gumroadHandler,
};

/** Returns the registered handler for `provider`, or null if not found. */
export function getRegisteredHandler(provider: string): GatewayHandler | null {
  return HANDLERS[provider] || null;
}

/**
 * Returns the handler for `provider`, falling back to the generic handler
 * (rebadged with the requested provider name) when the gateway is not yet
 * supported. Used by the main router after auto-detection.
 */
export function getHandler(provider: string): GatewayHandler {
  const handler = HANDLERS[provider];
  if (handler) return handler;
  return {
    ...genericHandler,
    normalize: (p) => ({ ...genericHandler.normalize(p), gateway: provider }),
  };
}

export { genericHandler };
