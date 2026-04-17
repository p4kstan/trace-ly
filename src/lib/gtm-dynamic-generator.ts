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
}

const ACCOUNT_ID = "6000000";
const CONTAINER_ID = "6000000";
const INIT_TRIGGER_ID = "2147479553"; // Initialization - All Pages
const ALL_PAGES_TRIGGER_ID = "2147479572"; // All Pages

let _idSeq = 100;
const nextId = () => String(++_idSeq);
const fp = () => String(Date.now());

interface BuildState {
  tags: any[];
  triggers: any[];
  variables: any[];
}

function dlVar(state: BuildState, name: string, dlKey: string) {
  const id = nextId();
  state.variables.push({
    accountId: ACCOUNT_ID, containerId: CONTAINER_ID, variableId: id, name,
    type: "v",
    parameter: [
      { type: "INTEGER", key: "dataLayerVersion", value: "2" },
      { type: "BOOLEAN", key: "setDefaultValue", value: "false" },
      { type: "TEMPLATE", key: "name", value: dlKey },
    ],
    fingerprint: fp(),
  });
  return name;
}

function constVar(state: BuildState, name: string, value: string) {
  const id = nextId();
  state.variables.push({
    accountId: ACCOUNT_ID, containerId: CONTAINER_ID, variableId: id, name,
    type: "c",
    parameter: [{ type: "TEMPLATE", key: "value", value }],
    fingerprint: fp(),
  });
  return name;
}

function customEventTrigger(state: BuildState, name: string, eventName: string) {
  const id = nextId();
  state.triggers.push({
    accountId: ACCOUNT_ID, containerId: CONTAINER_ID, triggerId: id, name,
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
  value: {{DLV - ecommerce.value}} || {{DLV - value}} || 0,
  currency: {{DLV - ecommerce.currency}} || 'BRL',
  content_ids: ((({{DLV - ecommerce.items}}||[]).map(function(i){return i.item_id})) || []),
  contents: (({{DLV - ecommerce.items}}||[]).map(function(i){return {id: i.item_id, quantity: i.quantity, item_price: i.price}})),
  num_items: (({{DLV - ecommerce.items}}||[]).length || 1)
}` : ""});
</script>`;

  state.tags.push({
    accountId: ACCOUNT_ID, containerId: CONTAINER_ID, tagId: nextId(),
    name: opts.name,
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
  const html = `<script>
(function(){
  if (!window.gtag) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function(){window.dataLayer.push(arguments);};
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id={{${opts.ga4Var}}}';
    document.head.appendChild(s);
    gtag('js', new Date());
    gtag('config', '{{${opts.ga4Var}}}');
  }
  var ec = ({{DLV - ecommerce}} || {});
  gtag('event', '${opts.eventName}', Object.assign({
    send_to: '{{${opts.ga4Var}}}'
  }, ec));
})();
</script>`;

  state.tags.push({
    accountId: ACCOUNT_ID, containerId: CONTAINER_ID, tagId: nextId(),
    name: opts.name,
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
  const sendTo = opts.conversionLabel
    ? `'{{${opts.awVar}}}/${opts.conversionLabel}'`
    : `'{{${opts.awVar}}}'`;
  const html = `<script>
(function(){
  if (!window.gtag) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function(){window.dataLayer.push(arguments);};
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id={{${opts.awVar}}}';
    document.head.appendChild(s);
    gtag('js', new Date());
    gtag('config', '{{${opts.awVar}}}');
  }
  gtag('event', 'conversion', {
    send_to: ${sendTo},
    value: {{DLV - ecommerce.value}} || {{DLV - value}} || 0,
    currency: {{DLV - ecommerce.currency}} || 'BRL',
    transaction_id: {{DLV - ecommerce.transaction_id}} || ''
  });
})();
</script>`;

  state.tags.push({
    accountId: ACCOUNT_ID, containerId: CONTAINER_ID, tagId: nextId(),
    name: opts.name,
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

function capitrackBridgeTag(state: BuildState, publicKey: string, endpoint: string) {
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
    name: "🚀 CapiTrack — Bridge (All Events)",
    type: "html",
    parameter: [
      { type: "TEMPLATE", key: "html", value: html },
      { type: "BOOLEAN", key: "supportDocumentWrite", value: "false" },
    ],
    fingerprint: fp(),
    firingTriggerId: [INIT_TRIGGER_ID],
    tagFiringOption: "ONCE_PER_LOAD",
    monitoringMetadata: { type: "MAP" },
    consentSettings: { consentStatus: "NOT_SET" },
  });
}

export function buildDynamicGtmContainer(cfg: DynamicGtmConfig): string {
  _idSeq = 100;
  const profile = BUSINESS_PROFILES[cfg.businessType];
  const state: BuildState = { tags: [], triggers: [], variables: [] };

  // Constant variables for IDs
  const pixelVar = cfg.fbPixelId ? constVar(state, "0.01 Facebook Pixel", cfg.fbPixelId) : null;
  const ga4Var = cfg.ga4MeasurementId ? constVar(state, "0.02 GA4 ID", cfg.ga4MeasurementId) : null;
  const adsVar = cfg.googleAdsId ? constVar(state, "0.03 Google Ads ID", cfg.googleAdsId) : null;

  // DataLayer variables for ecommerce
  dlVar(state, "DLV - ecommerce", "ecommerce");
  dlVar(state, "DLV - ecommerce.value", "ecommerce.value");
  dlVar(state, "DLV - ecommerce.currency", "ecommerce.currency");
  dlVar(state, "DLV - ecommerce.items", "ecommerce.items");
  dlVar(state, "DLV - ecommerce.transaction_id", "ecommerce.transaction_id");
  dlVar(state, "DLV - value", "value");

  // CapiTrack bridge — every dataLayer push goes to CapiTrack endpoint
  capitrackBridgeTag(state, cfg.publicKey, cfg.capitrackEndpoint);

  // Build one set per critical event (PageView is always first)
  // PageView (All Pages)
  if (pixelVar) {
    metaPixelTag(state, {
      name: "001 - 🔵 Meta - PageView",
      pixelVar, eventName: "PageView", triggerId: ALL_PAGES_TRIGGER_ID,
    });
  }
  if (ga4Var) {
    ga4EventTag(state, {
      name: "002 - 🟠 GA4 - page_view",
      ga4Var, eventName: "page_view", triggerId: ALL_PAGES_TRIGGER_ID,
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
