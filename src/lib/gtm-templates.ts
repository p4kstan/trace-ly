// GTM Template Manifest + Injector
// Each template ships as a real exported GTM container (src/assets/gtm-templates/*.json)
// We replace ONLY the dynamic fields: account/container IDs, public ID, fingerprints,
// tagManagerUrl, and the values of well-known "constant" variables (Pixel, Token, GA4, AW, transport_url, domain).

import hotmartTpl from "@/assets/gtm-templates/hotmart-web.json";
import packTpl from "@/assets/gtm-templates/pack-elite-web.json";
import yampiTpl from "@/assets/gtm-templates/yampi-web.json";
import kiwifyTpl from "@/assets/gtm-templates/kiwify-server.json";

export type GtmTemplateId = "hotmart" | "pack-elite" | "yampi" | "kiwify";

export interface GtmTemplateMeta {
  id: GtmTemplateId;
  name: string;
  platform: string;
  usageContext: "WEB" | "SERVER";
  description: string;
  // Mapping from logical field -> variable NAME inside the template
  variableMap: Partial<{
    fbPixelId: string;
    fbAccessToken: string;
    ga4MeasurementId: string;
    googleAdsId: string;
    transportUrl: string;
  }>;
  // Domains to find/replace inside HTML tags (keeps cookies on the right host)
  domainPlaceholders: string[];
}

export const GTM_TEMPLATES: Record<GtmTemplateId, { meta: GtmTemplateMeta; raw: any }> = {
  hotmart: {
    raw: hotmartTpl,
    meta: {
      id: "hotmart",
      name: "Hotmart Web",
      platform: "Hotmart",
      usageContext: "WEB",
      description: "Container Web completo para checkouts Hotmart com Pixel, GA4 e cookies de identidade.",
      variableMap: {
        fbPixelId: "0.01 Facebook Ads",
        ga4MeasurementId: "0.02 GA4",
        transportUrl: "0.03 transport_url",
      },
      domainPlaceholders: ["claudinhacrochet.com.br"],
    },
  },
  "pack-elite": {
    raw: packTpl,
    meta: {
      id: "pack-elite",
      name: "Pack Elite Web",
      platform: "Genérico (Pack Elite)",
      usageContext: "WEB",
      description: "Pack completo Web com Pixel, GA4, Google Ads e cookies de identidade.",
      variableMap: {
        fbPixelId: "0.01 Facebook Ads",
        ga4MeasurementId: "0.02 GA4",
        transportUrl: "0.03 transport_url",
        googleAdsId: "0.04 Tag Google Ads",
      },
      domainPlaceholders: ["seudominio.com.br"],
    },
  },
  yampi: {
    raw: yampiTpl,
    meta: {
      id: "yampi",
      name: "Yampi Web",
      platform: "Yampi",
      usageContext: "WEB",
      description: "Container Web pronto para lojas Yampi (PageView, AddToCart, InitiateCheckout, Purchase).",
      variableMap: {
        fbPixelId: "0.01 Facebook Ads",
        ga4MeasurementId: "0.02 GA4",
        transportUrl: "0.03 transport_url",
        googleAdsId: "0.04 Tag Google Ads",
      },
      domainPlaceholders: ["seudominio.com.br"],
    },
  },
  kiwify: {
    raw: kiwifyTpl,
    meta: {
      id: "kiwify",
      name: "Kiwify Webhook (sGTM)",
      platform: "Kiwify",
      usageContext: "SERVER",
      description: "Container SERVER-SIDE para receber webhooks da Kiwify e enviar para Meta CAPI + GA4.",
      variableMap: {
        fbPixelId: "[VAR] MetaAds - Pixel (3671)",
        fbAccessToken: "[VAR] MetaAds - Token (3671)",
        ga4MeasurementId: "[VAR] ID_GA4",
        transportUrl: "[VAR] Transport_Url",
      },
      domainPlaceholders: [],
    },
  },
};

export interface GtmTemplateConfig {
  // Workspace credentials
  publicKey: string;
  capitrackEndpoint: string; // e.g. https://xxx.supabase.co/functions/v1/track or /gtm-server-events
  // Marketing
  fbPixelId?: string;
  fbAccessToken?: string;
  ga4MeasurementId?: string;
  googleAdsId?: string; // AW-XXXXXXX
  transportUrl?: string; // sGTM URL (stape, mmprod, etc.) — optional
  domain?: string; // primary cookie domain, e.g. minhaloja.com.br
}

/** Deep clone via JSON (templates are pure JSON). */
function clone<T>(o: T): T {
  return JSON.parse(JSON.stringify(o));
}

/** Replace variable VALUE for a given variable name (only if present). */
function setVariableValue(container: any, varName: string, newValue: string) {
  const vars = container.containerVersion?.variable || [];
  for (const v of vars) {
    if (v.name === varName) {
      const param = (v.parameter || []).find((p: any) => p.key === "value");
      if (param) param.value = newValue;
      return true;
    }
  }
  return false;
}

/** Replace a string token everywhere inside container HTML/template fields. */
function replaceInAllStrings(node: any, find: string, replace: string) {
  if (node == null) return;
  if (typeof node === "string") return; // strings handled by parent
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      if (typeof node[i] === "string") {
        if (node[i].includes(find)) node[i] = node[i].split(find).join(replace);
      } else replaceInAllStrings(node[i], find, replace);
    }
    return;
  }
  if (typeof node === "object") {
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (typeof v === "string") {
        if (v.includes(find)) node[k] = v.split(find).join(replace);
      } else replaceInAllStrings(v, find, replace);
    }
  }
}

/** Generate a configured GTM container ready for "Mesclar/Substituir" in GTM. */
export function buildGtmContainer(templateId: GtmTemplateId, cfg: GtmTemplateConfig): string {
  const tpl = GTM_TEMPLATES[templateId];
  if (!tpl) throw new Error(`Unknown template: ${templateId}`);
  const out = clone(tpl.raw);
  const cv = out.containerVersion;
  const c = cv.container;

  // Neutralize internal IDs so any GTM workspace can import via "Mesclar"
  const neutralAccount = "1";
  const neutralContainer = "1";
  const oldAccount = c.accountId;
  const oldContainer = c.containerId;

  c.accountId = neutralAccount;
  c.containerId = neutralContainer;
  cv.accountId = neutralAccount;
  cv.containerId = neutralContainer;
  cv.path = `accounts/${neutralAccount}/containers/${neutralContainer}/versions/0`;
  c.path = `accounts/${neutralAccount}/containers/${neutralContainer}`;
  c.tagManagerUrl = `https://tagmanager.google.com/#/container/accounts/${neutralAccount}/containers/${neutralContainer}/workspaces?apiLink=container`;
  cv.tagManagerUrl = `https://tagmanager.google.com/#/versions/accounts/${neutralAccount}/containers/${neutralContainer}/versions/0`;
  c.fingerprint = String(Date.now());
  cv.fingerprint = String(Date.now());

  // Cascade old account/container references inside any nested path string
  replaceInAllStrings(cv, `accounts/${oldAccount}/containers/${oldContainer}`, `accounts/${neutralAccount}/containers/${neutralContainer}`);
  replaceInAllStrings(cv, `"accountId":"${oldAccount}"`, `"accountId":"${neutralAccount}"`); // safety
  // Update accountId / containerId fields that exist on every tag/trigger/variable entry
  for (const arr of ["tag", "trigger", "variable", "builtInVariable", "folder", "customTemplate", "client", "zone"]) {
    const list = cv[arr];
    if (Array.isArray(list)) {
      for (const item of list) {
        if (item.accountId) item.accountId = neutralAccount;
        if (item.containerId) item.containerId = neutralContainer;
      }
    }
  }

  // Apply variable substitutions for marketing IDs
  const map = tpl.meta.variableMap;
  if (cfg.fbPixelId && map.fbPixelId) setVariableValue(out, map.fbPixelId, cfg.fbPixelId);
  if (cfg.fbAccessToken && map.fbAccessToken) setVariableValue(out, map.fbAccessToken, cfg.fbAccessToken);
  if (cfg.ga4MeasurementId && map.ga4MeasurementId) setVariableValue(out, map.ga4MeasurementId, cfg.ga4MeasurementId);
  if (cfg.googleAdsId && map.googleAdsId) setVariableValue(out, map.googleAdsId, cfg.googleAdsId);
  if (cfg.transportUrl && map.transportUrl) setVariableValue(out, map.transportUrl, cfg.transportUrl);

  // Replace cookie domain placeholders inside HTML tags
  if (cfg.domain) {
    for (const placeholder of tpl.meta.domainPlaceholders) {
      replaceInAllStrings(cv, `.${placeholder}`, `.${cfg.domain.replace(/^\./, "")}`);
      replaceInAllStrings(cv, placeholder, cfg.domain.replace(/^\./, ""));
    }
  }

  // Inject CapiTrack bridge tag (sends every event also to CapiTrack endpoint)
  const bridgeHtml = `<script>
(function(){
  if (window.__capitrack_bridge) return;
  window.__capitrack_bridge = true;
  var endpoint = ${JSON.stringify(cfg.capitrackEndpoint)};
  var key = ${JSON.stringify(cfg.publicKey)};
  window.dataLayer = window.dataLayer || [];
  var origPush = window.dataLayer.push.bind(window.dataLayer);
  window.dataLayer.push = function(){
    try {
      for (var i=0;i<arguments.length;i++){
        var ev = arguments[i];
        if (ev && ev.event && typeof ev.event === 'string'){
          fetch(endpoint, {
            method:'POST', keepalive:true,
            headers:{'Content-Type':'application/json','X-Api-Key':key},
            body: JSON.stringify({
              event_name: ev.event, source:'gtm-web',
              action_source:'website',
              url: location.href,
              custom_data: ev,
              user_data: ev.user_data || {}
            })
          }).catch(function(){});
        }
      }
    } catch(e){}
    return origPush.apply(null, arguments);
  };
})();
</script>`;

  cv.tag = cv.tag || [];
  cv.tag.push({
    accountId: neutralAccount,
    containerId: neutralContainer,
    tagId: String(9000 + cv.tag.length + 1),
    name: "🚀 CapiTrack — Bridge (All Events)",
    type: "html",
    parameter: [
      { type: "TEMPLATE", key: "html", value: bridgeHtml },
      { type: "BOOLEAN", key: "supportDocumentWrite", value: "false" },
    ],
    fingerprint: String(Date.now()),
    firingTriggerId: ["2147479553"], // Initialization - All Pages
    tagFiringOption: "ONCE_PER_LOAD",
    monitoringMetadata: { type: "MAP" },
    consentSettings: { consentStatus: "NOT_SET" },
  });

  return JSON.stringify(out, null, 2);
}

export function downloadGtmTemplate(templateId: GtmTemplateId, cfg: GtmTemplateConfig) {
  const json = buildGtmContainer(templateId, cfg);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `capitrack-${templateId}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
