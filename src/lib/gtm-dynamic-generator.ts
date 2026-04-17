// Dynamic GTM Web container generator — assembles tags based on business type.
// Unlike the static templates (hotmart-web.json, yampi-web.json, etc.), this
// builds the full container in code so we always emit the FULL funnel for
// the chosen business profile (no missing Purchase/begin_checkout/etc).
//
// Output: a GTM Web container JSON ready for "Importar contêiner → Mesclar".

import { BUSINESS_PROFILES, type BusinessType } from "@/lib/prompt-templates";

export interface DynamicGtmConfig {
  businessType: BusinessType;
  publicKey: string;
  capitrackEndpoint: string;
  fbPixelId?: string;
  fbAccessToken?: string;
  ga4MeasurementId?: string;
  googleAdsId?: string; // AW-XXXXXXX
  googleAdsConversionLabel?: string; // optional purchase conversion label
  domain?: string;
  /** Adiciona cookies 1st-party first_name/last_name/email/fone + variáveis jsm para Advanced Matching */
  enablePiiCookies?: boolean;
  /** Adiciona trigger de clique em links wa.me/api.whatsapp.com + tags Meta Lead/GA4 generate_lead */
  enableWhatsAppClick?: boolean;
  /** Adiciona trigger JS Error + tag GA4 exception */
  enableJsErrorTracking?: boolean;
}

// IDs reais de uma conta GTM válida (formato aceito pelo importador).
// Quando o usuário faz "Importar → Mesclar", o GTM reescreve estes IDs
// automaticamente para o container destino — só precisam ser numéricos válidos.
const ACCOUNT_ID = "6004299956";
const CONTAINER_ID = "176842810";

// Prefixo único — evita que o "Mesclar" do GTM exclua tags por conflito de
// nome com containers pré-existentes (Hotmart/Yampi/etc).
const PREFIX = "[CT]";
const VARIABLE_PREFIX = "CT";
const variableName = (name: string) => `${VARIABLE_PREFIX} - ${name}`;

let _idSeq = 100;
const nextId = () => String(++_idSeq);
let _fpSeq = 0;
const fp = () => String(Date.now() + (++_fpSeq));

interface BuildState {
  tags: any[];
  triggers: any[];
  variables: any[];
}

function dlVar(state: BuildState, name: string, dlKey: string) {
  const id = nextId();
  const fullName = variableName(name);
  state.variables.push({
    accountId: ACCOUNT_ID, containerId: CONTAINER_ID, variableId: id, name: fullName,
    type: "v",
    parameter: [
      { type: "INTEGER", key: "dataLayerVersion", value: "2" },
      { type: "BOOLEAN", key: "setDefaultValue", value: "false" },
      { type: "TEMPLATE", key: "name", value: dlKey },
    ],
    fingerprint: fp(),
  });
  return fullName;
}

function constVar(state: BuildState, name: string, value: string) {
  const id = nextId();
  const fullName = variableName(name);
  state.variables.push({
    accountId: ACCOUNT_ID, containerId: CONTAINER_ID, variableId: id, name: fullName,
    type: "c",
    parameter: [{ type: "TEMPLATE", key: "value", value }],
    fingerprint: fp(),
  });
  return fullName;
}

function customEventTrigger(state: BuildState, name: string, eventName: string) {
  const id = nextId();
  state.triggers.push({
    accountId: ACCOUNT_ID, containerId: CONTAINER_ID, triggerId: id, name: `${PREFIX} ${name}`,
    type: "CUSTOM_EVENT",
    customEventFilter: [{
      type: "EQUALS",
      parameter: [
        { type: "TEMPLATE", key: "arg0", value: "{{_event}}" },
        { type: "TEMPLATE", key: "arg1", value: eventName },
      ],
    }],
    fingerprint: fp(),
  });
  return id;
}

function metaPixelTag(state: BuildState, opts: {
  name: string; pixelVar: string; eventName: string; triggerId: string;
  withValue?: boolean; ga4Equivalent?: string;
}) {
  const params = [
    `id: '{{${opts.pixelVar}}}'`,
    `event: '${opts.eventName}'`,
  ];
  const html = `<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '{{${opts.pixelVar}}}');
fbq('track', '${opts.eventName}'${opts.withValue ? `, {
  value: {{CT - DLV - ecommerce.value}} || {{CT - DLV - value}} || 0,
  currency: {{CT - DLV - ecommerce.currency}} || 'BRL',
  content_ids: ((({{CT - DLV - ecommerce.items}}||[]).map(function(i){return i.item_id})) || []),
  contents: (({{CT - DLV - ecommerce.items}}||[]).map(function(i){return {id: i.item_id, quantity: i.quantity, item_price: i.price}})),
  num_items: (({{CT - DLV - ecommerce.items}}||[]).length || 1)
}` : ""});
</script>`;

  state.tags.push({
    accountId: ACCOUNT_ID, containerId: CONTAINER_ID, tagId: nextId(),
    name: `${PREFIX} ${opts.name}`,
    type: "html",
    parameter: [
      { type: "TEMPLATE", key: "html", value: html },
      { type: "BOOLEAN", key: "supportDocumentWrite", value: "false" },
    ],
    fingerprint: fp(),
    firingTriggerId: [opts.triggerId],
    tagFiringOption: "ONCE_PER_EVENT",
    monitoringMetadata: { type: "MAP" },
    consentSettings: { consentStatus: "NOT_SET" },
  });
  void params; // referenced via html
}

function ga4EventTag(state: BuildState, opts: {
  name: string; ga4Var: string; eventName: string; triggerId: string;
}) {
  // GA4 via gtag.js inline (HTML) — funciona sem depender do template nativo
  // resolver corretamente o measurementIdOverride no import.
  const html = `<script>
(function(){
  var id = '{{${opts.ga4Var}}}';
  if (!window.gtag) {
    var s=document.createElement('script');
    s.async=true; s.src='https://www.googletagmanager.com/gtag/js?id='+id;
    document.head.appendChild(s);
    window.dataLayer=window.dataLayer||[];
    window.gtag=function(){window.dataLayer.push(arguments);};
    gtag('js', new Date());
    gtag('config', id, {send_page_view:false});
  }
  gtag('event', '${opts.eventName}', {
    send_to: id,
    value: {{CT - DLV - ecommerce.value}} || {{CT - DLV - value}} || undefined,
    currency: {{CT - DLV - ecommerce.currency}} || undefined,
    transaction_id: {{CT - DLV - ecommerce.transaction_id}} || undefined,
    items: {{CT - DLV - ecommerce.items}} || undefined
  });
})();
</script>`;
  state.tags.push({
    accountId: ACCOUNT_ID, containerId: CONTAINER_ID, tagId: nextId(),
    name: `${PREFIX} ${opts.name}`,
    type: "html",
    parameter: [
      { type: "TEMPLATE", key: "html", value: html },
      { type: "BOOLEAN", key: "supportDocumentWrite", value: "false" },
    ],
    fingerprint: fp(),
    firingTriggerId: [opts.triggerId],
    tagFiringOption: "ONCE_PER_EVENT",
    monitoringMetadata: { type: "MAP" },
    consentSettings: { consentStatus: "NOT_SET" },
  });
}

function googleAdsConversionTag(state: BuildState, opts: {
  name: string; awVar: string; conversionLabel?: string; triggerId: string;
}) {
  // Google Ads conversion via gtag.js inline (HTML) — não depende de template "awct"
  // que pode falhar no import se o tagId não bater com a galeria atual.
  const html = `<script>
(function(){
  var awid = '{{${opts.awVar}}}';
  var label = ${JSON.stringify(opts.conversionLabel || "ABCDEFGHIJK")};
  if (!window.gtag) {
    var s=document.createElement('script');
    s.async=true; s.src='https://www.googletagmanager.com/gtag/js?id='+awid;
    document.head.appendChild(s);
    window.dataLayer=window.dataLayer||[];
    window.gtag=function(){window.dataLayer.push(arguments);};
    gtag('js', new Date());
    gtag('config', awid);
  }
  gtag('event', 'conversion', {
    send_to: awid + '/' + label,
    value: {{CT - DLV - ecommerce.value}} || 0,
    currency: {{CT - DLV - ecommerce.currency}} || 'BRL',
    transaction_id: {{CT - DLV - ecommerce.transaction_id}} || ''
  });
})();
</script>`;
  state.tags.push({
    accountId: ACCOUNT_ID, containerId: CONTAINER_ID, tagId: nextId(),
    name: `${PREFIX} ${opts.name}`,
    type: "html",
    parameter: [
      { type: "TEMPLATE", key: "html", value: html },
      { type: "BOOLEAN", key: "supportDocumentWrite", value: "false" },
    ],
    fingerprint: fp(),
    firingTriggerId: [opts.triggerId],
    tagFiringOption: "ONCE_PER_EVENT",
    monitoringMetadata: { type: "MAP" },
    consentSettings: { consentStatus: "NOT_SET" },
  });
}

function capitrackBridgeTagWithTrig(state: BuildState, publicKey: string, endpoint: string, triggerId: string) {
  const html = `<script>
(function(){
  if (window.__capitrack_bridge) return;
  window.__capitrack_bridge = true;
  var endpoint = ${JSON.stringify(endpoint)};
  var key = ${JSON.stringify(publicKey)};
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
              action_source:'website', url: location.href,
              custom_data: ev, user_data: ev.user_data || {}
            })
          }).catch(function(){});
        }
      }
    } catch(e){}
    return origPush.apply(null, arguments);
  };
})();
</script>`;
  state.tags.push({
    accountId: ACCOUNT_ID, containerId: CONTAINER_ID, tagId: nextId(),
    name: `${PREFIX} 🚀 CapiTrack — Bridge (All Events)`,
    type: "html",
    parameter: [
      { type: "TEMPLATE", key: "html", value: html },
      { type: "BOOLEAN", key: "supportDocumentWrite", value: "false" },
    ],
    fingerprint: fp(),
    firingTriggerId: [triggerId],
    tagFiringOption: "ONCE_PER_LOAD",
    monitoringMetadata: { type: "MAP" },
    consentSettings: { consentStatus: "NOT_SET" },
  });
}

// ===== PII Cookies (1st-party Advanced Matching boost) =====

function jsmVar(state: BuildState, name: string, jsCode: string) {
  const id = nextId();
  const fullName = variableName(name);
  state.variables.push({
    accountId: ACCOUNT_ID, containerId: CONTAINER_ID, variableId: id, name: fullName,
    type: "jsm",
    parameter: [{ type: "TEMPLATE", key: "javascript", value: jsCode }],
    fingerprint: fp(),
    formatValue: {},
  });
  return fullName;
}

function cookieVar(state: BuildState, name: string, cookieName: string) {
  const id = nextId();
  const fullName = variableName(name);
  state.variables.push({
    accountId: ACCOUNT_ID, containerId: CONTAINER_ID, variableId: id, name: fullName,
    type: "k",
    parameter: [
      { type: "BOOLEAN", key: "decodeCookie", value: "true" },
      { type: "TEMPLATE", key: "name", value: cookieName },
    ],
    fingerprint: fp(),
  });
  return fullName;
}

function piiCookieTag(state: BuildState, opts: {
  name: string; cookieName: string; readValueJs: string; domain: string; triggerId: string;
}) {
  const html = `<script>
(function(){
  var cookieName = ${JSON.stringify(opts.cookieName)};
  var cookieValue = (function(){
${opts.readValueJs}
  })();
  if (!cookieValue || cookieValue === 'T') return;
  var date = new Date();
  date.setTime(date.getTime() + (2 * 365 * 24 * 60 * 60 * 1000));
  var expires = date.toUTCString();
  document.cookie = cookieName + "=" + encodeURIComponent(cookieValue) +
    "; SameSite=None; Secure; expires=" + expires + "; path=/; domain=" + ${JSON.stringify("." + opts.domain.replace(/^\./, ""))};
})();
</script>`;
  state.tags.push({
    accountId: ACCOUNT_ID, containerId: CONTAINER_ID, tagId: nextId(),
    name: `${PREFIX} ${opts.name}`,
    type: "html",
    parameter: [
      { type: "TEMPLATE", key: "html", value: html },
      { type: "BOOLEAN", key: "supportDocumentWrite", value: "false" },
    ],
    fingerprint: fp(),
    firingTriggerId: [opts.triggerId],
    tagFiringOption: "ONCE_PER_EVENT",
    monitoringMetadata: { type: "MAP" },
    consentSettings: { consentStatus: "NOT_SET" },
  });
}

function addPiiCookieSystem(state: BuildState, domain: string) {
  const trigId = nextId();
  state.triggers.push({
    accountId: ACCOUNT_ID, containerId: CONTAINER_ID, triggerId: trigId,
    name: `${PREFIX} TRG - PII Capture (forms)`,
    type: "FORM_SUBMISSION",
    customEventFilter: [],
    waitForTags: { type: "BOOLEAN", value: "false" },
    checkValidation: { type: "BOOLEAN", value: "false" },
    fingerprint: fp(),
  });

  piiCookieTag(state, {
    name: "000 - 🍪 Cookie - first_name",
    cookieName: "cookie_first_name",
    readValueJs: `    var i = document.querySelector('input[name*="nome" i],input[name*="name" i]');
    if (i && i.value) return i.value.trim().toLowerCase().split(' ')[0];
    return 'T';`,
    domain,
    triggerId: trigId,
  });
  piiCookieTag(state, {
    name: "000 - 🍪 Cookie - last_name",
    cookieName: "cookie_last_name",
    readValueJs: `    var i = document.querySelector('input[name*="nome" i],input[name*="name" i]');
    if (i && i.value) { var p = i.value.trim().toLowerCase().split(' '); return p.slice(1).join(' ') || 'T'; }
    return 'T';`,
    domain,
    triggerId: trigId,
  });
  piiCookieTag(state, {
    name: "000 - 🍪 Cookie - email",
    cookieName: "cookie_email",
    readValueJs: `    var i = document.querySelector('input[type="email"],input[name*="email" i]');
    if (i && i.value) return i.value.trim().toLowerCase();
    return 'T';`,
    domain,
    triggerId: trigId,
  });
  piiCookieTag(state, {
    name: "000 - 🍪 Cookie - telefone",
    cookieName: "cookie_fone",
    readValueJs: `    var i = document.querySelector('input[type="tel"],input[name*="phone" i],input[name*="telefone" i],input[name*="celular" i]');
    if (i && i.value) return '55' + i.value.replace(/[^0-9]/g, '');
    return 'T';`,
    domain,
    triggerId: trigId,
  });
}

// ===== WhatsApp click =====

function addWhatsAppTracking(state: BuildState, pixelVar: string | null, ga4Var: string | null) {
  const trigId = nextId();
  state.triggers.push({
    accountId: ACCOUNT_ID, containerId: CONTAINER_ID, triggerId: trigId,
    name: `${PREFIX} TRG - WhatsApp Click`,
    type: "CLICK",
    filter: [{
      type: "MATCH_REGEX",
      parameter: [
        { type: "TEMPLATE", key: "arg0", value: "{{Click URL}}" },
        { type: "TEMPLATE", key: "arg1", value: "wa\\.me|api\\.whatsapp\\.com|web\\.whatsapp\\.com" },
        { type: "BOOLEAN", key: "ignore_case", value: "true" },
      ],
    }],
    fingerprint: fp(),
  });
  if (pixelVar) {
    metaPixelTag(state, {
      name: "00.1 - 🔵 Meta - Lead (WhatsApp click)",
      pixelVar, eventName: "Lead", triggerId: trigId,
    });
  }
  if (ga4Var) {
    ga4EventTag(state, {
      name: "00.2 - 🟠 GA4 - generate_lead (WhatsApp)",
      ga4Var, eventName: "generate_lead", triggerId: trigId,
    });
  }
}

// ===== JS Error =====

function addJsErrorTracking(state: BuildState, ga4Var: string | null) {
  const trigId = nextId();
  state.triggers.push({
    accountId: ACCOUNT_ID, containerId: CONTAINER_ID, triggerId: trigId,
    name: `${PREFIX} TRG - JS Error`,
    type: "JS_ERROR",
    fingerprint: fp(),
  });
  if (ga4Var) {
    const html = `<script>
(function(){
  if (!window.gtag) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function(){window.dataLayer.push(arguments);};
  }
  gtag('event', 'exception', {
    send_to: '{{${ga4Var}}}',
    description: 'js_error',
    fatal: false
  });
})();
</script>`;
    state.tags.push({
      accountId: ACCOUNT_ID, containerId: CONTAINER_ID, tagId: nextId(),
      name: `${PREFIX} 00.3 - ⚠️ GA4 - exception (JS Error)`,
      type: "html",
      parameter: [
        { type: "TEMPLATE", key: "html", value: html },
        { type: "BOOLEAN", key: "supportDocumentWrite", value: "false" },
      ],
      fingerprint: fp(),
      firingTriggerId: [trigId],
      tagFiringOption: "ONCE_PER_EVENT",
      monitoringMetadata: { type: "MAP" },
      consentSettings: { consentStatus: "NOT_SET" },
    });
  }
}

export function buildDynamicGtmContainer(cfg: DynamicGtmConfig): string {
  _idSeq = 100;
  const profile = BUSINESS_PROFILES[cfg.businessType];
  const state: BuildState = { tags: [], triggers: [], variables: [] };

  // Constant variables for IDs — SEMPRE criadas (com placeholder se vazio).
  // Assim o container sempre traz as tags Meta/GA4/Ads; o usuário só precisa
  // editar a variável correspondente no GTM se não preencheu antes do download.
  const pixelVar = constVar(state, "0.01 Facebook Pixel", cfg.fbPixelId || "SEU_PIXEL_ID_AQUI");
  const ga4Var = constVar(state, "0.02 GA4 ID", cfg.ga4MeasurementId || "G-XXXXXXX");
  const adsVar = constVar(state, "0.03 Google Ads ID", cfg.googleAdsId || "AW-XXXXXXXX");

  // DataLayer variables for ecommerce
  dlVar(state, "DLV - ecommerce", "ecommerce");
  dlVar(state, "DLV - ecommerce.value", "ecommerce.value");
  dlVar(state, "DLV - ecommerce.currency", "ecommerce.currency");
  dlVar(state, "DLV - ecommerce.items", "ecommerce.items");
  dlVar(state, "DLV - ecommerce.transaction_id", "ecommerce.transaction_id");
  dlVar(state, "DLV - value", "value");

  // Triggers explícitos (NÃO usar built-in IDs que não estão declarados — quebra import)
  const initTrigId = nextId();
  state.triggers.push({
    accountId: ACCOUNT_ID, containerId: CONTAINER_ID, triggerId: initTrigId,
    name: `${PREFIX} TRG - Initialization`,
    type: "INIT",
    fingerprint: fp(),
  });
  const allPagesTrigId = nextId();
  state.triggers.push({
    accountId: ACCOUNT_ID, containerId: CONTAINER_ID, triggerId: allPagesTrigId,
    name: `${PREFIX} TRG - All Pages`,
    type: "PAGEVIEW",
    fingerprint: fp(),
  });

  // CapiTrack bridge — every dataLayer push goes to CapiTrack endpoint
  capitrackBridgeTagWithTrig(state, cfg.publicKey, cfg.capitrackEndpoint, initTrigId);

  // PII Cookies (Advanced Matching) — opcional
  if (cfg.enablePiiCookies) {
    addPiiCookieSystem(state, cfg.domain || "seudominio.com.br");
  }
  // WhatsApp click tracking — opcional
  if (cfg.enableWhatsAppClick) {
    addWhatsAppTracking(state, pixelVar, ga4Var);
  }
  // JS Error tracking — opcional
  if (cfg.enableJsErrorTracking) {
    addJsErrorTracking(state, ga4Var);
  }

  // Build one set per critical event (PageView is always first)
  // PageView (All Pages)
  if (pixelVar) {
    metaPixelTag(state, {
      name: "001 - 🔵 Meta - PageView",
      pixelVar, eventName: "PageView", triggerId: allPagesTrigId,
    });
  }
  if (ga4Var) {
    ga4EventTag(state, {
      name: "002 - 🟠 GA4 - page_view",
      ga4Var, eventName: "page_view", triggerId: allPagesTrigId,
    });
  }

  // Per critical event of the business profile
  let order = 3;
  for (const ev of profile.criticalEvents) {
    const trigName = `TRG - ${ev.ga4}`;
    const trigId = customEventTrigger(state, trigName, ev.ga4);

    if (pixelVar) {
      metaPixelTag(state, {
        name: `${String(order).padStart(3, "0")} - 🔵 Meta - ${ev.meta}`,
        pixelVar, eventName: ev.meta, triggerId: trigId,
        withValue: ev.ga4 === "purchase" || ev.ga4 === "add_to_cart" || ev.ga4 === "begin_checkout" || ev.ga4 === "add_payment_info",
      });
    }
    if (ga4Var) {
      ga4EventTag(state, {
        name: `${String(order).padStart(3, "0")} - 🟠 GA4 - ${ev.ga4}`,
        ga4Var, eventName: ev.ga4, triggerId: trigId,
      });
    }
    if (adsVar && ev.ga4 === "purchase") {
      googleAdsConversionTag(state, {
        name: `${String(order).padStart(3, "0")} - 🟢 Google Ads - Conversion (Purchase)`,
        awVar: adsVar, conversionLabel: cfg.googleAdsConversionLabel, triggerId: trigId,
      });
    }
    order++;
  }

  const container = {
    exportFormatVersion: 2,
    exportTime: new Date().toISOString(),
    containerVersion: {
      path: `accounts/${ACCOUNT_ID}/containers/${CONTAINER_ID}/versions/0`,
      accountId: ACCOUNT_ID,
      containerId: CONTAINER_ID,
      containerVersionId: "0",
      container: {
        path: `accounts/${ACCOUNT_ID}/containers/${CONTAINER_ID}`,
        accountId: ACCOUNT_ID,
        containerId: CONTAINER_ID,
        name: `CapiTrack — ${profile.label}`,
        publicId: "GTM-DYNAMIC",
        usageContext: ["WEB"],
        fingerprint: fp(),
        tagManagerUrl: `https://tagmanager.google.com/#/container/accounts/${ACCOUNT_ID}/containers/${CONTAINER_ID}`,
        features: {
          supportUserPermissions: true, supportEnvironments: true, supportWorkspaces: true,
          supportGtagConfigs: true, supportBuiltInVariables: true, supportClients: false,
          supportFolders: true, supportTags: true, supportTemplates: true,
          supportTriggers: true, supportVariables: true, supportVersions: true, supportZones: true,
        },
        tagIds: ["GTM-DYNAMIC"],
      },
      tag: state.tags,
      trigger: state.triggers,
      variable: state.variables,
      builtInVariable: [
        { accountId: ACCOUNT_ID, containerId: CONTAINER_ID, type: "PAGE_URL", name: "Page URL" },
        { accountId: ACCOUNT_ID, containerId: CONTAINER_ID, type: "PAGE_PATH", name: "Page Path" },
        { accountId: ACCOUNT_ID, containerId: CONTAINER_ID, type: "PAGE_HOSTNAME", name: "Page Hostname" },
        { accountId: ACCOUNT_ID, containerId: CONTAINER_ID, type: "REFERRER", name: "Referrer" },
        { accountId: ACCOUNT_ID, containerId: CONTAINER_ID, type: "EVENT", name: "Event" },
        { accountId: ACCOUNT_ID, containerId: CONTAINER_ID, type: "CLICK_URL", name: "Click URL" },
        { accountId: ACCOUNT_ID, containerId: CONTAINER_ID, type: "ERROR_MESSAGE", name: "Error Message" },
        { accountId: ACCOUNT_ID, containerId: CONTAINER_ID, type: "ERROR_URL", name: "Error URL" },
        { accountId: ACCOUNT_ID, containerId: CONTAINER_ID, type: "ERROR_LINE", name: "Error Line" },
      ],
      fingerprint: fp(),
      tagManagerUrl: `https://tagmanager.google.com/#/versions/accounts/${ACCOUNT_ID}/containers/${CONTAINER_ID}/versions/0`,
    },
  };

  return JSON.stringify(container, null, 2);
}

export function downloadDynamicGtmContainer(cfg: DynamicGtmConfig) {
  const json = buildDynamicGtmContainer(cfg);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `capitrack-dynamic-${cfg.businessType}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
