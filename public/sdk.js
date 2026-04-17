/**
 * CapiTrack AI SDK v4.0
 * Full server-side event tracking with:
 * - UTM persistence + Click IDs (gclid, gbraid, wbraid, fbclid, ttclid, msclkid)
 * - Identity resolution + auto-hash (Enhanced Conversions for Google Ads)
 * - GA4 dataLayer bridge (auto-capture gtag/GTM events)
 * - Consent Mode v2 (LGPD/GDPR)
 * - GA4 Client ID sync (cross-channel deduplication)
 * - SPA tracking, debug panel, batching
 */
(function(window, document) {
  'use strict';

  var SDK_VERSION = '4.0.0';
  var BATCH_INTERVAL = 2000;
  var MAX_BATCH_SIZE = 20;
  var COOKIE_DAYS = 390;
  var SESSION_KEY = 'ct_session_id';
  var ANON_KEY = 'ct_anonymous_id';
  var IDENTITY_KEY = 'ct_identity';
  var CONSENT_KEY = 'ct_consent';
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var CLICK_IDS = ['fbclid', 'gclid', 'gbraid', 'wbraid', 'ttclid', 'msclkid', 'twclid', 'li_fat_id'];

  var config = {
    apiKey: '', endpoint: '', debug: false, autoPageView: true,
    trackSPA: false, autoIdentify: true, dataLayerBridge: true, consentMode: false
  };
  var eventQueue = [];
  var batchTimer = null;
  var identifiedUser = {};
  var initialized = false;
  var debugPanel = null;
  var debugLogs = [];
  var consentGranted = { ad_storage: true, analytics_storage: true, ad_user_data: true, ad_personalization: true };

  // ---- Utilities ----
  function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function log() {
    if (config.debug) {
      var args = ['[CapiTrack]'].concat(Array.prototype.slice.call(arguments));
      console.log.apply(console, args);
      debugLogs.push({ ts: new Date().toISOString(), msg: Array.prototype.slice.call(arguments).join(' ') });
      updateDebugPanel();
    }
  }

  function getCookie(name) {
    var m = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return m ? decodeURIComponent(m[2]) : undefined;
  }

  function setCookie(name, value, days) {
    var d = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = name + '=' + encodeURIComponent(value) + ';expires=' + d + ';path=/;SameSite=Lax';
  }

  function getLS(key) { try { return localStorage.getItem(key); } catch(e) { return null; } }
  function setLS(key, val) { try { localStorage.setItem(key, val); } catch(e) {} }
  function getSS(key) { try { return sessionStorage.getItem(key); } catch(e) { return null; } }
  function setSS(key, val) { try { sessionStorage.setItem(key, val); } catch(e) {} }

  // ---- SHA-256 (Enhanced Conversions hashing) ----
  async function sha256(str) {
    if (!str || !window.crypto || !window.crypto.subtle) return null;
    try {
      var buf = new TextEncoder().encode(String(str).trim().toLowerCase());
      var hash = await window.crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(hash)).map(function(b){ return b.toString(16).padStart(2,'0'); }).join('');
    } catch(e) { return null; }
  }

  function normalizePhone(phone) {
    return String(phone || '').replace(/[^\d]/g, '');
  }

  function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  // ---- Anonymous & Session IDs ----
  function getAnonymousId() {
    var id = getCookie(ANON_KEY) || getLS(ANON_KEY);
    if (!id) { id = generateId(); setCookie(ANON_KEY, id, COOKIE_DAYS); setLS(ANON_KEY, id); }
    return id;
  }

  function getSessionId() {
    var id = getSS(SESSION_KEY);
    if (!id) { id = generateId(); setSS(SESSION_KEY, id); }
    return id;
  }

  // ---- GA4 Client ID sync ----
  function getGa4ClientId() {
    var ga = getCookie('_ga');
    if (ga) {
      var m = ga.match(/GA1\.\d\.(\d+\.\d+)/);
      if (m) return m[1];
    }
    return null;
  }

  function getGa4SessionId(measurementId) {
    if (!measurementId) return null;
    var key = '_ga_' + String(measurementId).replace('G-', '');
    var v = getCookie(key);
    if (v) {
      var m = v.match(/GS\d\.\d\.(\d+)/);
      if (m) return m[1];
    }
    return null;
  }

  // ---- UTM Persistence ----
  function captureAndPersistUTMs() {
    var params = new URLSearchParams(window.location.search);
    var utms = {};
    var hasNew = false;

    UTM_KEYS.forEach(function(key) {
      var val = params.get(key);
      if (val) {
        utms[key] = val;
        setCookie('ct_' + key, val, 90);
        setLS('ct_' + key, val);
        setSS('ct_' + key, val);
        hasNew = true;
      } else {
        var stored = getSS('ct_' + key) || getLS('ct_' + key) || getCookie('ct_' + key);
        if (stored) utms[key] = stored;
      }
    });

    CLICK_IDS.forEach(function(key) {
      var val = params.get(key);
      if (val) {
        utms[key] = val;
        setCookie('ct_' + key, val, 90);
        setLS('ct_' + key, val);
      } else {
        var stored = getLS('ct_' + key) || getCookie('ct_' + key);
        if (stored) utms[key] = stored;
      }
    });

    if (hasNew) {
      setLS('ct_last_touch', JSON.stringify(utms));
      if (!getLS('ct_first_touch')) setLS('ct_first_touch', JSON.stringify(utms));
    }
    return utms;
  }

  function getFirstTouch() { try { return JSON.parse(getLS('ct_first_touch') || '{}'); } catch(e) { return {}; } }
  function getLastTouch() { try { return JSON.parse(getLS('ct_last_touch') || '{}'); } catch(e) { return {}; } }

  // ---- Facebook Parameters ----
  function getFbp() {
    var fbp = getCookie('_fbp');
    if (!fbp) {
      fbp = 'fb.1.' + Date.now() + '.' + Math.floor(Math.random() * 2147483648);
      setCookie('_fbp', fbp, COOKIE_DAYS);
    }
    return fbp;
  }

  function getFbc() {
    var params = new URLSearchParams(window.location.search);
    var fbclid = params.get('fbclid');
    if (fbclid) {
      var fbc = 'fb.1.' + Date.now() + '.' + fbclid;
      setCookie('_fbc', fbc, 90);
      return fbc;
    }
    return getCookie('_fbc');
  }

  // ---- Fingerprint ----
  function getFingerprint() {
    var parts = [
      navigator.userAgent, navigator.language,
      screen.width + 'x' + screen.height, screen.colorDepth,
      new Date().getTimezoneOffset(), navigator.hardwareConcurrency || ''
    ].join('|');
    var hash = 0;
    for (var i = 0; i < parts.length; i++) {
      hash = ((hash << 5) - hash) + parts.charCodeAt(i);
      hash |= 0;
    }
    return 'fp_' + Math.abs(hash).toString(36);
  }

  function getLandingPage() {
    var lp = getSS('ct_landing_page');
    if (!lp) { lp = window.location.href; setSS('ct_landing_page', lp); }
    return lp;
  }

  // ---- Consent Mode v2 ----
  function loadConsent() {
    try {
      var saved = JSON.parse(getLS(CONSENT_KEY) || 'null');
      if (saved) consentGranted = saved;
    } catch(e) {}
  }

  function setConsent(updates) {
    for (var k in updates) {
      consentGranted[k] = updates[k] === 'granted' || updates[k] === true;
    }
    setLS(CONSENT_KEY, JSON.stringify(consentGranted));
    // Forward to gtag if present
    if (typeof window.gtag === 'function') {
      try { window.gtag('consent', 'update', updates); } catch(e) {}
    }
    log('Consent updated: ' + JSON.stringify(consentGranted));
  }

  function canTrackAds() { return !config.consentMode || consentGranted.ad_storage; }
  function canTrackAnalytics() { return !config.consentMode || consentGranted.analytics_storage; }

  // ---- Auto-identify (Enhanced Conversions) ----
  function autoCaptureFromForms() {
    if (!config.autoIdentify) return;
    var inputs = document.querySelectorAll('input[type="email"], input[name*="email" i], input[type="tel"], input[name*="phone" i], input[name*="telefone" i]');
    inputs.forEach(function(input) {
      input.addEventListener('blur', function() {
        var val = (input.value || '').trim();
        if (!val) return;
        var update = {};
        if (input.type === 'email' || /email/i.test(input.name)) update.email = val;
        else if (input.type === 'tel' || /phone|telefone/i.test(input.name)) update.phone = val;
        if (Object.keys(update).length) {
          for (var k in update) identifiedUser[k] = update[k];
          setLS(IDENTITY_KEY, JSON.stringify(identifiedUser));
          log('Auto-captured: ' + Object.keys(update).join(', '));
        }
      }, { passive: true });
    });
  }

  // ---- Debug Panel ----
  function createDebugPanel() {
    if (debugPanel) return;
    debugPanel = document.createElement('div');
    debugPanel.id = 'ct-debug-panel';
    debugPanel.style.cssText = 'position:fixed;bottom:10px;right:10px;width:380px;max-height:340px;overflow-y:auto;background:#0a0e1a;color:#0ff;font-family:monospace;font-size:11px;padding:10px;border-radius:8px;border:1px solid #0ff3;z-index:99999;box-shadow:0 4px 20px rgba(0,255,255,0.15);';
    var header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #0ff3;';
    header.innerHTML = '<span style="font-weight:bold;font-size:12px;">🔍 CapiTrack v' + SDK_VERSION + '</span>';
    var closeBtn = document.createElement('span');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'cursor:pointer;color:#f55;font-size:14px;';
    closeBtn.onclick = function() { debugPanel.style.display = 'none'; };
    header.appendChild(closeBtn);
    debugPanel.appendChild(header);
    var content = document.createElement('div');
    content.id = 'ct-debug-content';
    debugPanel.appendChild(content);
    document.body.appendChild(debugPanel);
  }

  function updateDebugPanel() {
    if (!debugPanel) return;
    var content = document.getElementById('ct-debug-content');
    if (!content) return;
    var last = debugLogs.slice(-20);
    content.innerHTML = last.map(function(l) {
      var time = l.ts.split('T')[1].split('.')[0];
      return '<div style="margin:2px 0;opacity:0.9;"><span style="color:#888;">' + time + '</span> ' + l.msg + '</div>';
    }).join('');
    content.scrollTop = content.scrollHeight;
  }

  // ---- Build Event ----
  async function buildEvent(eventName, data) {
    var utms = captureAndPersistUTMs();
    var ga4ClientId = getGa4ClientId();
    var event = {
      event_name: eventName,
      event_id: generateId(),
      url: window.location.href,
      page_path: window.location.pathname,
      referrer: document.referrer || undefined,
      fingerprint: getFingerprint(),
      anonymous_id: getAnonymousId(),
      session_id: getSessionId(),
      landing_page: getLandingPage(),
      fbp: getFbp(),
      fbc: getFbc(),
      ga_client_id: ga4ClientId,
      source: 'sdk',
      action_source: 'website',
      sdk_version: SDK_VERSION,
      consent: config.consentMode ? consentGranted : undefined,
    };

    for (var k in utms) event[k] = utms[k];

    // Merge identified user (raw + hashed for Enhanced Conversions)
    var userData = {};
    for (var u in identifiedUser) userData[u] = identifiedUser[u];

    if (data) {
      var userFields = ['email', 'phone', 'first_name', 'last_name', 'city', 'state', 'zip', 'country', 'external_id', 'name'];
      var customData = {};
      for (var key in data) {
        if (key === 'value') event.value = Number(data[key]);
        else if (key === 'currency') event.currency = String(data[key]);
        else if (userFields.indexOf(key) !== -1) userData[key] = data[key];
        else customData[key] = data[key];
      }
      if (Object.keys(customData).length > 0) event.custom_data = customData;
    }

    // Auto-hash for Enhanced Conversions
    if (Object.keys(userData).length > 0) {
      var hashed = {};
      if (userData.email) {
        var nEmail = normalizeEmail(userData.email);
        var h = await sha256(nEmail);
        if (h) hashed.em = h;
      }
      if (userData.phone) {
        var nPhone = normalizePhone(userData.phone);
        var hp = await sha256(nPhone);
        if (hp) hashed.ph = hp;
      }
      if (userData.first_name) { var hfn = await sha256(userData.first_name); if (hfn) hashed.fn = hfn; }
      if (userData.last_name) { var hln = await sha256(userData.last_name); if (hln) hashed.ln = hln; }
      event.user_data = userData;
      if (Object.keys(hashed).length) event.user_data_hashed = hashed;
    }

    return event;
  }

  // ---- Send Events ----
  function sendEvents(events) {
    if (!events.length || !config.apiKey) return;
    events.forEach(function(event) {
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', config.endpoint, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('X-Api-Key', config.apiKey);
        xhr.onreadystatechange = function() {
          if (xhr.readyState === 4) {
            if (xhr.status >= 200 && xhr.status < 300) log('✓ ' + event.event_name + ' sent (' + xhr.status + ')');
            else log('✗ ' + event.event_name + ' failed (' + xhr.status + '): ' + xhr.responseText);
          }
        };
        xhr.send(JSON.stringify(event));
      } catch(e) { log('Send error:', e); }
    });
    log('Dispatched ' + events.length + ' event(s)');
  }

  function flushQueue() {
    if (eventQueue.length === 0) return;
    sendEvents(eventQueue.splice(0, MAX_BATCH_SIZE));
  }

  function enqueueEvent(eventPromise) {
    Promise.resolve(eventPromise).then(function(event) {
      // Respect consent
      if (config.consentMode && !canTrackAds() && !canTrackAnalytics()) {
        log('Event blocked by consent: ' + event.event_name);
        return;
      }
      eventQueue.push(event);
      if (eventQueue.length >= MAX_BATCH_SIZE) flushQueue();
      else if (!batchTimer) batchTimer = setTimeout(function() { batchTimer = null; flushQueue(); }, BATCH_INTERVAL);
    });
  }

  // ---- SPA Route Change ----
  function setupSPATracking() {
    if (!config.trackSPA) return;
    var lastPath = window.location.pathname;
    var origPushState = history.pushState;
    var origReplaceState = history.replaceState;
    history.pushState = function() { origPushState.apply(this, arguments); onRouteChange(); };
    history.replaceState = function() { origReplaceState.apply(this, arguments); onRouteChange(); };
    window.addEventListener('popstate', onRouteChange);
    function onRouteChange() {
      setTimeout(function() {
        var newPath = window.location.pathname;
        if (newPath !== lastPath) {
          lastPath = newPath;
          enqueueEvent(buildEvent('PageView'));
          log('SPA PageView: ' + newPath);
        }
      }, 50);
    }
  }

  // ---- GA4/GTM dataLayer Bridge ----
  // Maps GA4/gtag events to CapiTrack events automatically
  var GA4_EVENT_MAP = {
    'page_view': 'PageView',
    'view_item': 'ViewContent',
    'add_to_cart': 'AddToCart',
    'begin_checkout': 'InitiateCheckout',
    'add_payment_info': 'AddPaymentInfo',
    'purchase': 'Purchase',
    'generate_lead': 'Lead',
    'sign_up': 'CompleteRegistration',
    'login': 'Login',
    'search': 'Search',
    'view_item_list': 'ViewCategory',
    'add_to_wishlist': 'AddToWishlist',
    'select_item': 'ViewContent',
    'share': 'Share',
  };

  function mapGa4ToCapitrack(ga4Event, params) {
    var ctName = GA4_EVENT_MAP[ga4Event] || ga4Event;
    var data = {};
    if (params) {
      if (params.value != null) data.value = params.value;
      if (params.currency) data.currency = params.currency;
      if (params.transaction_id) data.order_id = params.transaction_id;
      if (params.email) data.email = params.email;
      if (params.phone_number || params.phone) data.phone = params.phone_number || params.phone;
      if (params.items) {
        data.num_items = params.items.length;
        data.content_ids = params.items.map(function(i){ return i.item_id || i.id; }).filter(Boolean);
        if (params.items[0]) data.content_name = params.items[0].item_name || params.items[0].name;
      }
      // Pass through any other custom params
      for (var k in params) {
        if (!(k in data) && ['event_name','send_to'].indexOf(k) === -1) data[k] = params[k];
      }
    }
    return { name: ctName, data: data };
  }

  // Throttle map: dedup_key -> last sent timestamp.
  // Protects against recursive GTM Custom HTML loops where the same logical
  // event ends up pushed to dataLayer multiple times in <500ms.
  var THROTTLE_WINDOW_MS = 500;
  var throttleMap = Object.create(null);

  function shouldThrottle(eventName, payload) {
    try {
      var key = eventName + '::' + JSON.stringify(payload || {});
      var now = Date.now();
      var last = throttleMap[key] || 0;
      if (now - last < THROTTLE_WINDOW_MS) {
        log('⚠️ Throttled duplicate event: ' + eventName + ' (within ' + (now - last) + 'ms)');
        return true;
      }
      throttleMap[key] = now;
      // Garbage collect old entries (keep map small)
      if (Math.random() < 0.05) {
        var cutoff = now - 5000;
        for (var k in throttleMap) if (throttleMap[k] < cutoff) delete throttleMap[k];
      }
      return false;
    } catch (e) { return false; }
  }

  function setupDataLayerBridge() {
    if (!config.dataLayerBridge) return;
    if (window.__capitrackDataLayerBridgeInstalled) {
      log('dataLayer bridge already active');
      return;
    }
    window.__capitrackDataLayerBridgeInstalled = true;
    window.dataLayer = window.dataLayer || [];
    var seen = new WeakSet();

    // Wrap dataLayer.push to intercept future events
    var origPush = window.dataLayer.push;
    window.dataLayer.push = function() {
      var result = origPush.apply(this, arguments);
      for (var i = 0; i < arguments.length; i++) {
        try { handleDataLayerItem(arguments[i]); } catch(e) { log('DL bridge error:', e); }
      }
      return result;
    };

    // Process existing items
    for (var j = 0; j < window.dataLayer.length; j++) {
      try { handleDataLayerItem(window.dataLayer[j]); } catch(e) {}
    }

    function handleDataLayerItem(item) {
      if (!item || typeof item !== 'object') return;
      if (Array.isArray(item)) return;
      if (seen.has(item)) return;
      seen.add(item);
      var eventName = item.event;
      if (!eventName || typeof eventName !== 'string') return;
      // Skip GTM internal events
      if (/^gtm\./.test(eventName) || /^gtag\./.test(eventName) || eventName === 'consent') return;
      var mapped = mapGa4ToCapitrack(eventName, item.ecommerce || item);
      if (shouldThrottle(mapped.name, mapped.data)) return;
      enqueueEvent(buildEvent(mapped.name, mapped.data));
      log('DL bridge: ' + eventName + ' → ' + mapped.name);
    }
    log('dataLayer bridge active');
  }

  // ---- Auto-tracking ----
  function setupAutoTracking() {
    window.addEventListener('beforeunload', function() {
      if (eventQueue.length > 0 && navigator.sendBeacon) {
        eventQueue.forEach(function(event) {
          navigator.sendBeacon(config.endpoint + '?key=' + config.apiKey, JSON.stringify(event));
        });
      }
    });
  }

  // ---- Public API ----
  function processCommand(command) {
    var args = Array.prototype.slice.call(arguments, 1);
    switch (command) {
      case 'init':
        var apiKey = args[0];
        var options = args[1] || {};
        if (!apiKey) { console.error('[CapiTrack] API key required'); return; }
        if (initialized) {
          if (config.debug || options.debug) log('Init ignored: SDK already initialized');
          return;
        }
        config.apiKey = apiKey;
        config.endpoint = options.endpoint || (window.location.origin + '/functions/v1/track');
        config.debug = !!options.debug;
        config.autoPageView = options.autoPageView !== false;
        config.trackSPA = !!options.trackSPA;
        config.autoIdentify = options.autoIdentify !== false;
        config.dataLayerBridge = options.dataLayerBridge !== false;
        config.consentMode = !!options.consentMode;
        initialized = true;
        loadConsent();
        captureAndPersistUTMs();
        setupAutoTracking();
        if (config.debug) createDebugPanel();
        log('Initialized v' + SDK_VERSION + ' | key: ' + apiKey.substring(0, 8) + '...');
        log('Endpoint: ' + config.endpoint);
        log('Anonymous: ' + getAnonymousId().substring(0, 8) + '... | Session: ' + getSessionId().substring(0, 8) + '...');
        if (config.autoPageView) {
          enqueueEvent(buildEvent('PageView'));
          log('Auto PageView: ' + window.location.pathname);
        }
        setupSPATracking();
        setupDataLayerBridge();
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', autoCaptureFromForms);
        } else {
          autoCaptureFromForms();
        }
        break;

      case 'consent':
        // capitrack('consent', 'update', { ad_storage: 'granted', ... })
        if (args[0] === 'update' && args[1]) setConsent(args[1]);
        else if (args[0] === 'default' && args[1]) setConsent(args[1]);
        break;

      case 'page':
        enqueueEvent(buildEvent('PageView', args[0]));
        log('PageView: ' + window.location.pathname);
        break;

      case 'track':
        if (!args[0]) { console.error('[CapiTrack] Event name required'); return; }
        enqueueEvent(buildEvent(args[0], args[1]));
        log('Event: ' + args[0]);
        break;

      case 'identify':
        if (args[0]) {
          for (var k in args[0]) identifiedUser[k] = args[0][k];
          setLS(IDENTITY_KEY, JSON.stringify(identifiedUser));
          log('Identified: ' + Object.keys(args[0]).join(', '));
          enqueueEvent(buildEvent('Identify', args[0]));
        }
        break;

      case 'purchase': enqueueEvent(buildEvent('Purchase', args[0])); log('Purchase'); break;
      case 'lead': enqueueEvent(buildEvent('Lead', args[0])); log('Lead'); break;
      case 'addToCart': enqueueEvent(buildEvent('AddToCart', args[0])); log('AddToCart'); break;
      case 'initiateCheckout': enqueueEvent(buildEvent('InitiateCheckout', args[0])); log('InitiateCheckout'); break;
      case 'viewContent': enqueueEvent(buildEvent('ViewContent', args[0])); log('ViewContent'); break;
      case 'search': enqueueEvent(buildEvent('Search', args[0])); log('Search'); break;
      case 'completeRegistration': enqueueEvent(buildEvent('CompleteRegistration', args[0])); log('CompleteRegistration'); break;

      case 'getAttribution': return { firstTouch: getFirstTouch(), lastTouch: getLastTouch() };
      case 'getGa4ClientId': return getGa4ClientId();
      case 'getSessionId': return getSessionId();
      case 'getAnonymousId': return getAnonymousId();
      case 'getConsent': return Object.assign({}, consentGranted);

      case 'debug':
        config.debug = args[0] !== false;
        if (config.debug) createDebugPanel();
        else if (debugPanel) debugPanel.style.display = 'none';
        break;

      case 'reset':
        identifiedUser = {};
        setLS(IDENTITY_KEY, '{}');
        log('Identity reset');
        break;

      default:
        console.warn('[CapiTrack] Unknown command:', command);
    }
  }

  // Restore persisted identity
  try {
    var saved = JSON.parse(getLS(IDENTITY_KEY) || '{}');
    for (var sk in saved) identifiedUser[sk] = saved[sk];
  } catch(e) {}

  // Process pre-init queue
  var existingQueue = (window.capitrack && window.capitrack.q) || [];
  window.capitrack = function() { return processCommand.apply(null, arguments); };
  window.capitrack.q = [];
  window.capitrack.version = SDK_VERSION;
  for (var i = 0; i < existingQueue.length; i++) processCommand.apply(null, existingQueue[i]);

  log('SDK v' + SDK_VERSION + ' loaded');
})(window, document);
