// Dynamic GTM SERVER container generator (sGTM) — estilo Kiwify.
// Gera um container Server com:
//   • Client GA4 (gaaw_client) — recebe hits /g/collect do GTM Web
//   • Tag GA4 Server (sgtmgaaw) — repassa todos os eventos para o GA4 oficial
//   • Tag HTTP Request — encaminha cada evento ao endpoint CapiTrack
//     (que dispara Meta CAPI / Google Ads CAPI / TikTok Events do nosso backend)
//
// Vantagens:
//   • Portátil (sem custom templates do GTM Gallery embutidos)
//   • Aproveita toda a infra CapiTrack (deduplicação, EMQ, multi-provider)
//   • Funciona com sGTM no Stape, mmprod, Cloud Run, etc.

import { BUSINESS_PROFILES, type BusinessType } from "@/lib/prompt-templates";

export interface DynamicGtmServerConfig {
  businessType: BusinessType;
  publicKey: string;
  /** Endpoint do gtm-server-events (ex.: https://xxx.supabase.co/functions/v1/gtm-server-events) */
  capitrackEndpoint: string;
  ga4MeasurementId?: string;
  /** Domínio do sGTM (ex.: gtm.seudominio.com) — apenas informativo, não afeta o JSON */
  sgtmDomain?: string;
}

const ACCOUNT_ID = "7000000";
const CONTAINER_ID = "7000000";

let _idSeq = 100;
const nextId = () => String(++_idSeq);
const fp = () => String(Date.now());

interface BuildState {
  tags: any[];
  triggers: any[];
  variables: any[];
  clients: any[];
}

function constVar(state: BuildState, name: string, value: string) {
  state.variables.push({
    accountId: ACCOUNT_ID, containerId: CONTAINER_ID, variableId: nextId(), name,
    type: "c",
    parameter: [{ type: "TEMPLATE", key: "value", value }],
    fingerprint: fp(),
  });
  return name;
}

function eventDataVar(state: BuildState, name: string, key: string) {
  state.variables.push({
    accountId: ACCOUNT_ID, containerId: CONTAINER_ID, variableId: nextId(), name,
    type: "ed", // Event Data (server-side)
    parameter: [{ type: "TEMPLATE", key: "keyPath", value: key }],
    fingerprint: fp(),
  });
  return name;
}

function ga4Client(state: BuildState) {
  state.clients.push({
    accountId: ACCOUNT_ID, containerId: CONTAINER_ID, clientId: nextId(),
    name: "Cliente GA4",
    type: "gaaw_client",
    parameter: [
      { type: "TEMPLATE", key: "cookieDomain", value: "auto" },
      { type: "TEMPLATE", key: "cookieMaxAgeInSec", value: "63072000" },
      { type: "BOOLEAN", key: "activateGtagSupport", value: "false" },
      { type: "BOOLEAN", key: "activateDefaultPaths", value: "true" },
      { type: "TEMPLATE", key: "cookiePath", value: "/" },
      { type: "BOOLEAN", key: "migrateFromJsClientId", value: "false" },
      { type: "BOOLEAN", key: "robotsTxtBlockCrawlers", value: "true" },
    ],
    fingerprint: fp(),
    priority: { type: "INTEGER", value: "0" },
  });
}

function allEventsTrigger(state: BuildState) {
  const id = nextId();
  state.triggers.push({
    accountId: ACCOUNT_ID, containerId: CONTAINER_ID, triggerId: id,
    name: "Trigger - All Events",
    type: "ALWAYS",
    fingerprint: fp(),
  });
  return id;
}

function customEventTrigger(state: BuildState, name: string, eventName: string) {
  const id = nextId();
  state.triggers.push({
    accountId: ACCOUNT_ID, containerId: CONTAINER_ID, triggerId: id, name,
    type: "CUSTOM_EVENT",
    customEventFilter: [{
      type: "EQUALS",
      parameter: [
        { type: "TEMPLATE", key: "arg0", value: "{{Event Name}}" },
        { type: "TEMPLATE", key: "arg1", value: eventName },
      ],
    }],
    fingerprint: fp(),
  });
  return id;
}

function ga4ServerTag(state: BuildState, ga4Var: string, triggerId: string) {
  state.tags.push({
    accountId: ACCOUNT_ID, containerId: CONTAINER_ID, tagId: nextId(),
    name: "↩ GA4 Server (forward all events)",
    type: "sgtmgaaw",
    parameter: [
      { type: "BOOLEAN", key: "redactVisitorIp", value: "false" },
      { type: "TEMPLATE", key: "epToIncludeDropdown", value: "all" },
      { type: "TEMPLATE", key: "upToIncludeDropdown", value: "all" },
      { type: "TEMPLATE", key: "measurementId", value: `{{${ga4Var}}}` },
    ],
    fingerprint: fp(),
    firingTriggerId: [triggerId],
    tagFiringOption: "ONCE_PER_EVENT",
    monitoringMetadata: { type: "MAP" },
    consentSettings: { consentStatus: "NOT_SET" },
  });
}

function capitrackForwardTag(state: BuildState, opts: {
  name: string;
  endpoint: string;
  publicKey: string;
  eventName: string;
  triggerId: string;
}) {
  // Tag tipo "HTTP Request" no sGTM = "rh" (Send HTTP Request)
  // Encaminha o evento para o CapiTrack que dispara Meta CAPI / Ads / TikTok
  state.tags.push({
    accountId: ACCOUNT_ID, containerId: CONTAINER_ID, tagId: nextId(),
    name: opts.name,
    type: "rh",
    parameter: [
      { type: "TEMPLATE", key: "url", value: opts.endpoint },
      { type: "TEMPLATE", key: "method", value: "POST" },
      {
        type: "LIST", key: "headers",
        list: [
          {
            type: "MAP", map: [
              { type: "TEMPLATE", key: "name", value: "Content-Type" },
              { type: "TEMPLATE", key: "value", value: "application/json" },
            ],
          },
          {
            type: "MAP", map: [
              { type: "TEMPLATE", key: "name", value: "X-Api-Key" },
              { type: "TEMPLATE", key: "value", value: opts.publicKey },
            ],
          },
        ],
      },
      {
        type: "TEMPLATE", key: "body",
        value: JSON.stringify({
          event_name: opts.eventName,
          source: "gtm-server",
          action_source: "website",
          event_id: "{{Event ID}}",
          url: "{{Page Location}}",
          user_data: {
            em: "{{ED - user_data.em}}",
            ph: "{{ED - user_data.ph}}",
            fn: "{{ED - user_data.fn}}",
            ln: "{{ED - user_data.ln}}",
            external_id: "{{ED - user_data.external_id}}",
            client_ip_address: "{{Client IP Address}}",
            client_user_agent: "{{User Agent}}",
            fbp: "{{ED - user_data.fbp}}",
            fbc: "{{ED - user_data.fbc}}",
          },
          custom_data: {
            value: "{{ED - value}}",
            currency: "{{ED - currency}}",
            transaction_id: "{{ED - transaction_id}}",
            content_ids: "{{ED - items}}",
          },
        }),
      },
      { type: "BOOLEAN", key: "logType", value: "debug" } as any,
    ],
    fingerprint: fp(),
    firingTriggerId: [opts.triggerId],
    tagFiringOption: "ONCE_PER_EVENT",
    monitoringMetadata: { type: "MAP" },
    consentSettings: { consentStatus: "NOT_SET" },
  });
}

export function buildDynamicGtmServerContainer(cfg: DynamicGtmServerConfig): string {
  _idSeq = 100;
  const profile = BUSINESS_PROFILES[cfg.businessType];
  const state: BuildState = { tags: [], triggers: [], variables: [], clients: [] };

  // Constantes
  const ga4Var = constVar(state, "[VAR] GA4 Measurement ID", cfg.ga4MeasurementId || "G-XXXXXXX");
  constVar(state, "[VAR] CapiTrack Endpoint", cfg.capitrackEndpoint);
  constVar(state, "[VAR] CapiTrack Public Key", cfg.publicKey);

  // Event Data variables (server-side reads from incoming event)
  eventDataVar(state, "ED - value", "value");
  eventDataVar(state, "ED - currency", "currency");
  eventDataVar(state, "ED - transaction_id", "transaction_id");
  eventDataVar(state, "ED - items", "items");
  eventDataVar(state, "ED - user_data.em", "user_data.email_address");
  eventDataVar(state, "ED - user_data.ph", "user_data.phone_number");
  eventDataVar(state, "ED - user_data.fn", "user_data.address.first_name");
  eventDataVar(state, "ED - user_data.ln", "user_data.address.last_name");
  eventDataVar(state, "ED - user_data.external_id", "user_data.external_id");
  eventDataVar(state, "ED - user_data.fbp", "user_data.fbp");
  eventDataVar(state, "ED - user_data.fbc", "user_data.fbc");

  // Client GA4
  ga4Client(state);

  // Trigger geral + GA4 forward
  const allTrigId = allEventsTrigger(state);
  ga4ServerTag(state, ga4Var, allTrigId);

  // CapiTrack forward para cada evento crítico do funil
  // page_view sempre incluso
  const pvTrigId = customEventTrigger(state, "TRG - page_view", "page_view");
  capitrackForwardTag(state, {
    name: "001 - 🚀 CapiTrack - PageView",
    endpoint: cfg.capitrackEndpoint,
    publicKey: cfg.publicKey,
    eventName: "PageView",
    triggerId: pvTrigId,
  });

  let order = 2;
  for (const ev of profile.criticalEvents) {
    const trigId = customEventTrigger(state, `TRG - ${ev.ga4}`, ev.ga4);
    capitrackForwardTag(state, {
      name: `${String(order).padStart(3, "0")} - 🚀 CapiTrack - ${ev.meta}`,
      endpoint: cfg.capitrackEndpoint,
      publicKey: cfg.publicKey,
      eventName: ev.meta,
      triggerId: trigId,
    });
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
        name: `CapiTrack Server — ${profile.label}`,
        publicId: "GTM-DYN-SRV",
        usageContext: ["SERVER"],
        fingerprint: fp(),
        tagManagerUrl: `https://tagmanager.google.com/#/container/accounts/${ACCOUNT_ID}/containers/${CONTAINER_ID}`,
        features: {
          supportUserPermissions: true, supportEnvironments: true, supportWorkspaces: true,
          supportGtagConfigs: false, supportBuiltInVariables: true, supportClients: true,
          supportFolders: true, supportTags: true, supportTemplates: true,
          supportTriggers: true, supportVariables: true, supportVersions: true, supportZones: false,
        },
        tagIds: ["GTM-DYN-SRV"],
      },
      tag: state.tags,
      trigger: state.triggers,
      variable: state.variables,
      client: state.clients,
      builtInVariable: [
        { accountId: ACCOUNT_ID, containerId: CONTAINER_ID, type: "EVENT_NAME", name: "Event Name" },
        { accountId: ACCOUNT_ID, containerId: CONTAINER_ID, type: "PAGE_LOCATION", name: "Page Location" },
        { accountId: ACCOUNT_ID, containerId: CONTAINER_ID, type: "CLIENT_IP_ADDRESS", name: "Client IP Address" },
        { accountId: ACCOUNT_ID, containerId: CONTAINER_ID, type: "USER_AGENT", name: "User Agent" },
        { accountId: ACCOUNT_ID, containerId: CONTAINER_ID, type: "EVENT_ID", name: "Event ID" },
        { accountId: ACCOUNT_ID, containerId: CONTAINER_ID, type: "QUERY_STRING", name: "Query String" },
      ],
      fingerprint: fp(),
      tagManagerUrl: `https://tagmanager.google.com/#/versions/accounts/${ACCOUNT_ID}/containers/${CONTAINER_ID}/versions/0`,
    },
  };

  return JSON.stringify(container, null, 2);
}

export function downloadDynamicGtmServerContainer(cfg: DynamicGtmServerConfig) {
  const json = buildDynamicGtmServerContainer(cfg);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `capitrack-server-${cfg.businessType}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
