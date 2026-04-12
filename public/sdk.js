/**
 * CapiTrack AI SDK v1.0
 * Universal tracking script for server-side event collection
 * 
 * Usage:
 *   <script src="https://cdn.capitrack.ai/sdk.js"></script>
 *   <script>
 *     capitrack('init', 'CT-XXXXXX');
 *     capitrack('page');
 *   </script>
 */
(function (window: Window & { capitrack?: CapiTrackFn }, document: Document) {
  'use strict';

  const SDK_VERSION = '1.0.0';
  const BATCH_INTERVAL = 2000; // 2s batch window
  const MAX_BATCH_SIZE = 20;
  const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000]; // exponential backoff

  interface Config {
    apiKey: string;
    endpoint: string;
    debug: boolean;
    batchEnabled: boolean;
  }

  interface EventPayload {
    event_name: string;
    event_id: string;
    url: string;
    page_path: string;
    referrer: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    utm_term?: string;
    fingerprint: string;
    fbp?: string;
    fbc?: string;
    value?: number;
    currency?: string;
    source: string;
    action_source: string;
    user_data?: Record<string, unknown>;
    custom_data?: Record<string, unknown>;
    [key: string]: unknown;
  }

  type CapiTrackFn = {
    (...args: unknown[]): void;
    q?: unknown[][];
  };

  let config: Config = {
    apiKey: '',
    endpoint: '',
    debug: false,
    batchEnabled: true,
  };

  let eventQueue: EventPayload[] = [];
  let batchTimer: ReturnType<typeof setTimeout> | null = null;
  let sessionId: string | null = null;
  let identifiedUser: Record<string, string> = {};

  // ==========================================
  // UTILITIES
  // ==========================================

  function generateId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function log(...args: unknown[]): void {
    if (config.debug) {
      console.log('[CapiTrack]', ...args);
    }
  }

  function getUTMParams(): Record<string, string> {
    const params = new URLSearchParams(window.location.search);
    const utms: Record<string, string> = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach((key) => {
      const val = params.get(key);
      if (val) {
        utms[key] = val;
        // Persist UTMs for session
        try { sessionStorage.setItem(`ct_${key}`, val); } catch (_e) { /* noop */ }
      } else {
        try {
          const stored = sessionStorage.getItem(`ct_${key}`);
          if (stored) utms[key] = stored;
        } catch (_e) { /* noop */ }
      }
    });
    return utms;
  }

  function getCookie(name: string): string | undefined {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : undefined;
  }

  function setCookie(name: string, value: string, days: number): void {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`;
  }

  function getFingerprint(): string {
    // Simple fingerprint based on available browser data
    const canvas = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      screen.colorDepth,
      new Date().getTimezoneOffset(),
      navigator.hardwareConcurrency || '',
    ].join('|');

    let hash = 0;
    for (let i = 0; i < canvas.length; i++) {
      const char = canvas.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return 'fp_' + Math.abs(hash).toString(36);
  }

  function getFbp(): string {
    let fbp = getCookie('_fbp');
    if (!fbp) {
      // Generate fbp cookie format: fb.1.{timestamp}.{random}
      fbp = `fb.1.${Date.now()}.${Math.floor(Math.random() * 2147483648)}`;
      setCookie('_fbp', fbp, 390); // 13 months
    }
    return fbp;
  }

  function getFbc(): string | undefined {
    // Check URL for fbclid first
    const params = new URLSearchParams(window.location.search);
    const fbclid = params.get('fbclid');
    if (fbclid) {
      const fbc = `fb.1.${Date.now()}.${fbclid}`;
      setCookie('_fbc', fbc, 90);
      return fbc;
    }
    return getCookie('_fbc');
  }

  function getOrCreateSession(): string {
    const SESSION_KEY = 'ct_session';
    const SESSION_TS_KEY = 'ct_session_ts';

    try {
      const existingSession = sessionStorage.getItem(SESSION_KEY);
      const lastActivity = sessionStorage.getItem(SESSION_TS_KEY);

      if (existingSession && lastActivity) {
        const elapsed = Date.now() - parseInt(lastActivity, 10);
        if (elapsed < SESSION_TIMEOUT) {
          sessionStorage.setItem(SESSION_TS_KEY, Date.now().toString());
          return existingSession;
        }
      }

      const newSession = generateId();
      sessionStorage.setItem(SESSION_KEY, newSession);
      sessionStorage.setItem(SESSION_TS_KEY, Date.now().toString());
      return newSession;
    } catch (_e) {
      return generateId();
    }
  }

  // ==========================================
  // EVENT TRACKING
  // ==========================================

  function buildEvent(eventName: string, data?: Record<string, unknown>): EventPayload {
    const utms = getUTMParams();
    sessionId = getOrCreateSession();

    const event: EventPayload = {
      event_name: eventName,
      event_id: generateId(),
      url: window.location.href,
      page_path: window.location.pathname,
      referrer: document.referrer,
      fingerprint: getFingerprint(),
      fbp: getFbp(),
      fbc: getFbc(),
      source: 'sdk',
      action_source: 'website',
      ...utms,
    };

    // Add identified user data
    if (Object.keys(identifiedUser).length > 0) {
      event.user_data = { ...identifiedUser };
    }

    // Add custom data
    if (data) {
      if (data.value !== undefined) event.value = Number(data.value);
      if (data.currency) event.currency = String(data.currency);

      // Separate user_data from custom_data
      const userFields = ['email', 'phone', 'first_name', 'last_name', 'city', 'state', 'zip', 'country', 'external_id'];
      const userData: Record<string, unknown> = event.user_data || {};
      const customData: Record<string, unknown> = {};

      for (const [key, val] of Object.entries(data)) {
        if (userFields.includes(key)) {
          userData[key] = val;
        } else if (key !== 'value' && key !== 'currency') {
          customData[key] = val;
        }
      }

      if (Object.keys(userData).length > 0) event.user_data = userData;
      if (Object.keys(customData).length > 0) event.custom_data = customData;
    }

    return event;
  }

  async function sendBatch(events: EventPayload[]): Promise<void> {
    if (!events.length || !config.apiKey) return;

    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      try {
        const responses = await Promise.allSettled(
          events.map((event) =>
            fetch(config.endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': config.apiKey,
              },
              body: JSON.stringify(event),
              keepalive: true,
            })
          )
        );

        const failed = responses.filter((r) => r.status === 'rejected');
        if (failed.length > 0) {
          log(`${failed.length}/${events.length} events failed`);
        } else {
          log(`Sent ${events.length} events successfully`);
        }
        return;
      } catch (err) {
        if (attempt < RETRY_DELAYS.length) {
          const delay = RETRY_DELAYS[attempt] + Math.random() * 500;
          log(`Retry ${attempt + 1} in ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
        } else {
          console.error('[CapiTrack] Failed to send events after retries:', err);
        }
      }
    }
  }

  function flushQueue(): void {
    if (eventQueue.length === 0) return;
    const batch = eventQueue.splice(0, MAX_BATCH_SIZE);
    sendBatch(batch);
  }

  function enqueueEvent(event: EventPayload): void {
    eventQueue.push(event);

    if (!config.batchEnabled || eventQueue.length >= MAX_BATCH_SIZE) {
      flushQueue();
    } else if (!batchTimer) {
      batchTimer = setTimeout(() => {
        batchTimer = null;
        flushQueue();
      }, BATCH_INTERVAL);
    }
  }

  // ==========================================
  // AUTO-TRACKING
  // ==========================================

  function setupAutoTracking(): void {
    // Track scroll depth
    let maxScroll = 0;
    let scrollTracked = false;
    window.addEventListener('scroll', () => {
      const scrollPercent = Math.round(
        ((window.scrollY + window.innerHeight) / document.documentElement.scrollHeight) * 100
      );
      maxScroll = Math.max(maxScroll, scrollPercent);

      if (!scrollTracked && maxScroll >= 90) {
        scrollTracked = true;
        enqueueEvent(buildEvent('ScrollDepth', { depth: 90 }));
      }
    }, { passive: true });

    // Track time on page
    const pageLoadTime = Date.now();
    const timeThresholds = [30, 60, 120, 300]; // seconds
    const trackedThresholds = new Set<number>();

    setInterval(() => {
      const elapsed = Math.floor((Date.now() - pageLoadTime) / 1000);
      for (const threshold of timeThresholds) {
        if (elapsed >= threshold && !trackedThresholds.has(threshold)) {
          trackedThresholds.add(threshold);
          enqueueEvent(buildEvent('TimeOnPage', { seconds: threshold }));
        }
      }
    }, 5000);

    // Track form submissions
    document.addEventListener('submit', (e) => {
      const form = e.target as HTMLFormElement;
      enqueueEvent(buildEvent('FormSubmit', {
        form_id: form.id || undefined,
        form_action: form.action || undefined,
      }));
    });

    // Flush on page unload
    window.addEventListener('beforeunload', () => {
      if (eventQueue.length > 0) {
        // Use sendBeacon for reliability
        const payload = JSON.stringify(eventQueue[0]);
        navigator.sendBeacon?.(config.endpoint + '?key=' + config.apiKey, payload);
      }
    });

    // Track outbound link clicks
    document.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('a');
      if (target && target.hostname !== window.location.hostname) {
        enqueueEvent(buildEvent('OutboundClick', {
          url: target.href,
          text: target.textContent?.trim()?.substring(0, 100),
        }));
      }
    });
  }

  // ==========================================
  // PUBLIC API
  // ==========================================

  function processCommand(command: string, ...args: unknown[]): void {
    switch (command) {
      case 'init': {
        const apiKey = args[0] as string;
        const options = (args[1] || {}) as Partial<Config>;

        if (!apiKey) {
          console.error('[CapiTrack] API key required');
          return;
        }

        config.apiKey = apiKey;
        config.endpoint = options.endpoint || `https://${window.location.hostname}/functions/v1/track`;
        config.debug = options.debug || false;
        config.batchEnabled = options.batchEnabled !== false;

        setupAutoTracking();
        log('Initialized with key:', apiKey.substring(0, 8) + '...');
        break;
      }

      case 'page': {
        const data = (args[0] || {}) as Record<string, unknown>;
        enqueueEvent(buildEvent('PageView', data));
        log('PageView tracked');
        break;
      }

      case 'track': {
        const eventName = args[0] as string;
        const data = (args[1] || {}) as Record<string, unknown>;
        if (!eventName) {
          console.error('[CapiTrack] Event name required');
          return;
        }
        enqueueEvent(buildEvent(eventName, data));
        log('Event tracked:', eventName, data);
        break;
      }

      case 'identify': {
        const userData = args[0] as Record<string, string>;
        if (userData) {
          identifiedUser = { ...identifiedUser, ...userData };
          log('User identified:', Object.keys(userData));
        }
        break;
      }

      case 'purchase': {
        const purchaseData = (args[0] || {}) as Record<string, unknown>;
        enqueueEvent(buildEvent('Purchase', purchaseData));
        log('Purchase tracked:', purchaseData);
        break;
      }

      case 'lead': {
        const leadData = (args[0] || {}) as Record<string, unknown>;
        enqueueEvent(buildEvent('Lead', leadData));
        log('Lead tracked:', leadData);
        break;
      }

      default:
        console.warn('[CapiTrack] Unknown command:', command);
    }
  }

  // Process any queued commands from before SDK loaded
  const existingQueue = window.capitrack?.q || [];

  window.capitrack = function (...args: unknown[]) {
    processCommand(args[0] as string, ...args.slice(1));
  };

  // Process pre-init queue
  for (const args of existingQueue) {
    processCommand(args[0] as string, ...args.slice(1));
  }

  log(`SDK v${SDK_VERSION} loaded`);
})(window, document);
