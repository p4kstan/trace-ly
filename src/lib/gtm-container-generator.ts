// Generates a GTM Web Container JSON ready to import in Google Tag Manager
// File → Import Container → Choose this JSON

export interface GtmContainerOptions {
  publicKey: string;
  endpoint: string;
  sdkUrl: string;
  containerId?: string; // GTM-XXXXXX (optional)
  accountId?: string;
}

export function generateGtmContainer(opts: GtmContainerOptions): string {
  // GTM importer requires numeric IDs internally — use neutral numerics
  // The user's actual container/account is determined by the workspace they import INTO (Mesclar/Substituir)
  const containerId = opts.containerId || "1";
  const accountId = opts.accountId || "1";
  const publicId = "GTM-CAPITRACK"; // display only
  const now = new Date().toISOString();

  const html = `<script>
(function(){
  if (window.capitrack) return;
  window.capitrack = window.capitrack || function(){
    (window.capitrack.q = window.capitrack.q || []).push(arguments);
  };
  var s = document.createElement("script");
  s.src = "${opts.sdkUrl}";
  s.async = true;
  document.head.appendChild(s);

  capitrack("init", "${opts.publicKey}", {
    endpoint: "${opts.endpoint}",
    debug: false,
    trackSPA: true,
    autoIdentify: true,
    dataLayerBridge: true,
    consentMode: true
  });
})();
</script>`;

  const container = {
    exportFormatVersion: 2,
    exportTime: now,
    containerVersion: {
      path: `accounts/${accountId}/containers/${containerId}/versions/0`,
      accountId,
      containerId,
      containerVersionId: "0",
      container: {
        path: `accounts/${accountId}/containers/${containerId}`,
        accountId,
        containerId,
        name: "CapiTrack AI Container",
        publicId: containerId,
        usageContext: ["WEB"],
        fingerprint: String(Date.now()),
        tagManagerUrl: `https://tagmanager.google.com/#/container/accounts/${accountId}/containers/${containerId}`,
        features: {
          supportUserPermissions: true,
          supportEnvironments: true,
          supportWorkspaces: true,
          supportGtagConfigs: true,
          supportBuiltInVariables: true,
          supportClients: false,
          supportFolders: true,
          supportTags: true,
          supportTemplates: true,
          supportTriggers: true,
          supportVariables: true,
          supportVersions: true,
          supportZones: true,
        },
        tagIds: ["GTM-CAPITRACK"],
      },
      tag: [
        {
          accountId,
          containerId,
          tagId: "1",
          name: "CapiTrack — Init (All Pages)",
          type: "html",
          parameter: [
            { type: "TEMPLATE", key: "html", value: html },
            { type: "BOOLEAN", key: "supportDocumentWrite", value: "false" },
          ],
          fingerprint: String(Date.now()),
          firingTriggerId: ["2147479553"], // Initialization - All Pages
          tagFiringOption: "ONCE_PER_LOAD",
          monitoringMetadata: { type: "MAP" },
          consentSettings: { consentStatus: "NOT_SET" },
        },
      ],
      builtInVariable: [
        { accountId, containerId, type: "PAGE_URL", name: "Page URL" },
        { accountId, containerId, type: "PAGE_PATH", name: "Page Path" },
        { accountId, containerId, type: "REFERRER", name: "Referrer" },
        { accountId, containerId, type: "EVENT", name: "Event" },
        { accountId, containerId, type: "CLIENT_NAME", name: "Client Name" },
      ],
      fingerprint: String(Date.now()),
      tagManagerUrl: `https://tagmanager.google.com/#/versions/accounts/${accountId}/containers/${containerId}/versions/0`,
    },
  };

  return JSON.stringify(container, null, 2);
}

export function downloadGtmContainer(opts: GtmContainerOptions) {
  const content = generateGtmContainer(opts);
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `capitrack-gtm-container-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
