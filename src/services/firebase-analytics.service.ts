/**
 * Firebase Analytics Service
 * Client-side tracking complementar ao server-side (GA4 Measurement Protocol)
 * 
 * Uso:
 *   import { initFirebaseAnalytics, trackFirebaseEvent } from "@/services/firebase-analytics.service";
 *   await initFirebaseAnalytics({ measurementId: "G-XXXXXXXXXX" });
 *   trackFirebaseEvent("purchase", { value: 99.90, currency: "BRL" });
 */
import { initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import {
  getAnalytics,
  logEvent,
  setUserId,
  setUserProperties,
  setAnalyticsCollectionEnabled,
  isSupported,
  type Analytics,
} from "firebase/analytics";

let app: FirebaseApp | null = null;
let analytics: Analytics | null = null;
let initialized = false;

// ── GA4 recommended event name mapping ──
const EVENT_MAP: Record<string, string> = {
  Purchase: "purchase",
  Lead: "generate_lead",
  Subscribe: "sign_up",
  InitiateCheckout: "begin_checkout",
  AddPaymentInfo: "add_payment_info",
  AddToCart: "add_to_cart",
  ViewContent: "view_item",
  CompleteRegistration: "sign_up",
  Search: "search",
  Contact: "generate_lead",
  AddToWishlist: "add_to_wishlist",
  PageView: "page_view",
};

export interface FirebaseConfig {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId: string;
}

/**
 * Inicializa o Firebase Analytics.
 * Verifica suporte do browser antes de ativar.
 */
export async function initFirebaseAnalytics(config: FirebaseConfig): Promise<boolean> {
  if (initialized && analytics) return true;

  try {
    const supported = await isSupported();
    if (!supported) {
      console.warn("[Firebase Analytics] Browser não suportado");
      return false;
    }

    const firebaseConfig: FirebaseOptions = {
      apiKey: config.apiKey || "AIzaSy-placeholder",
      authDomain: config.authDomain,
      projectId: config.projectId,
      storageBucket: config.storageBucket,
      messagingSenderId: config.messagingSenderId,
      appId: config.appId || "1:000000000:web:placeholder",
      measurementId: config.measurementId,
    };

    app = initializeApp(firebaseConfig);
    analytics = getAnalytics(app);
    initialized = true;

    console.log("[Firebase Analytics] Inicializado com", config.measurementId);
    return true;
  } catch (err) {
    console.error("[Firebase Analytics] Erro na inicialização:", err);
    return false;
  }
}

/**
 * Envia evento para o Firebase Analytics.
 * Aceita nomes internos (Purchase, Lead, etc.) e converte para GA4.
 */
export function trackFirebaseEvent(
  eventName: string,
  params?: Record<string, unknown>
): void {
  if (!analytics) {
    console.warn("[Firebase Analytics] Não inicializado. Chame initFirebaseAnalytics() primeiro.");
    return;
  }

  const ga4EventName = EVENT_MAP[eventName] || eventName;

  try {
    logEvent(analytics, ga4EventName, params as Record<string, string | number>);
  } catch (err) {
    console.error("[Firebase Analytics] Erro ao enviar evento:", err);
  }
}

/**
 * Define o user ID para analytics (cross-device tracking).
 */
export function setFirebaseUserId(userId: string | null): void {
  if (!analytics) return;
  setUserId(analytics, userId);
}

/**
 * Define propriedades do usuário (segmentação).
 */
export function setFirebaseUserProperties(properties: Record<string, string>): void {
  if (!analytics) return;
  setUserProperties(analytics, properties);
}

/**
 * Habilita/desabilita coleta de analytics (GDPR compliance).
 */
export function setFirebaseCollectionEnabled(enabled: boolean): void {
  if (!analytics) return;
  setAnalyticsCollectionEnabled(analytics, enabled);
}

/**
 * Eventos de e-commerce pré-configurados seguindo spec GA4.
 */
export const firebaseEcommerce = {
  purchase(params: {
    transactionId: string;
    value: number;
    currency?: string;
    items?: Array<{ item_id: string; item_name: string; price?: number; quantity?: number }>;
  }) {
    trackFirebaseEvent("purchase", {
      transaction_id: params.transactionId,
      value: params.value,
      currency: params.currency || "BRL",
      items: params.items || [],
    });
  },

  addToCart(params: {
    value: number;
    currency?: string;
    items: Array<{ item_id: string; item_name: string; price?: number; quantity?: number }>;
  }) {
    trackFirebaseEvent("add_to_cart", {
      value: params.value,
      currency: params.currency || "BRL",
      items: params.items,
    });
  },

  beginCheckout(params: {
    value: number;
    currency?: string;
    items?: Array<{ item_id: string; item_name: string; price?: number; quantity?: number }>;
  }) {
    trackFirebaseEvent("begin_checkout", {
      value: params.value,
      currency: params.currency || "BRL",
      items: params.items || [],
    });
  },

  viewItem(params: {
    items: Array<{ item_id: string; item_name: string; price?: number }>;
  }) {
    trackFirebaseEvent("view_item", { items: params.items });
  },

  generateLead(params: { value?: number; currency?: string }) {
    trackFirebaseEvent("generate_lead", {
      value: params.value || 0,
      currency: params.currency || "BRL",
    });
  },
};

export function isFirebaseInitialized(): boolean {
  return initialized && analytics !== null;
}
