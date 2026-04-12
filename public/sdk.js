/**
 * CapiTrack AI SDK v2.0
 * Full-featured server-side event tracking with UTM persistence,
 * identity resolution, and click ID capture.
 */
(function(window, document) {
  'use strict';

  var SDK_VERSION = '2.0.0';
  var BATCH_INTERVAL = 2000;
  var MAX_BATCH_SIZE = 20;
  var COOKIE_DAYS = 390;
  var SESSION_KEY = 'ct_session_id';
  var ANON_KEY = 'ct_anonymous_id';
  var IDENTITY_KEY = 'ct_identity';
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var CLICK_IDS = ['fbclid', 'gclid', 'ttclid'];

  var config = { apiKey: '', endpoint: '', debug: false };
  var eventQueue = [];
  var batchTimer = null;
  var identifiedUser = {};

  // ---- Utilities ----
  function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function log() {
    if (config.debug) console.log.apply(console, ['[CapiTrack]'].concat(Array.prototype.slice.call(arguments)));
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

  // ---- UTM Persistence (cookie + localStorage + sessionStorage) ----
  function captureAndPersistUTMs() {
    var params = new URLSearchParams(window.location.search);
    var utms = {};
    var hasNew = false;

    // UTM params
    UTM_KEYS.forEach(function(key) {
      var val = params.get(key);
      if (val) {
        utms[key] = val;
        setCookie('ct_' + key, val, 90);
        setLS('ct_' + key, val);
        setSS('ct_' + key, val);
        hasNew = true;
      } else {
        // Fallback: session > local > cookie
        var stored = getSS('ct_' + key) || getLS('ct_' + key) || getCookie('ct_' + key);
        if (stored) utms[key] = stored;
      }
    });

    // Click IDs
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

    // First touch vs last touch
    if (hasNew) {
      // Save as last touch
      setLS('ct_last_touch', JSON.stringify(utms));
      // Save first touch only if not set
      if (!getLS('ct_first_touch')) {
        setLS('ct_first_touch', JSON.stringify(utms));
      }
    }

    return utms;
  }

  function getFirstTouch() {
    try { return JSON.parse(getLS('ct_first_touch') || '{}'); } catch(e) { return {}; }
  }

  function getLastTouch() {
    try { return JSON.parse(getLS('ct_last_touch') || '{}'); } catch(e) { return {}; }
  }

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

  // ---- Landing page ----
  function getLandingPage() {
    var lp = getSS('ct_landing_page');
    if (!lp) { lp = window.location.href; setSS('ct_landing_page', lp); }
    return lp;
  }

  // ---- Build Event ----
  function buildEvent(eventName, data) {
    var utms = captureAndPersistUTMs();
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
      source: 'sdk',
      action_source: 'website',
      sdk_version: SDK_VERSION
    };

    // Merge UTMs and click IDs
    for (var k in utms) event[k] = utms[k];

    // Identified user data
    if (Object.keys(identifiedUser).length > 0) {
      event.user_data = {};
      for (var u in identifiedUser) event.user_data[u] = identifiedUser[u];
    }

    // Custom data from caller
    if (data) {
      var userFields = ['email', 'phone', 'first_name', 'last_name', 'city', 'state', 'zip', 'country', 'external_id', 'name'];
      var userData = event.user_data || {};
      var customData = {};

      for (var key in data) {
        if (key === 'value') event.value = Number(data[key]);
        else if (key === 'currency') event.currency = String(data[key]);
        else if (userFields.indexOf(key) !== -1) userData[key] = data[key];
        else customData[key] = data[key];
      }

      if (Object.keys(userData).length > 0) event.user_data = userData;
      if (Object.keys(customData).length > 0) event.custom_data = customData;
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
        xhr.send(JSON.stringify(event));
      } catch(e) { log('Send error:', e); }
    });
    log('Sent ' + events.length + ' events');
  }

  function flushQueue() {
    if (eventQueue.length === 0) return;
    sendEvents(eventQueue.splice(0, MAX_BATCH_SIZE));
  }

  function enqueueEvent(event) {
    eventQueue.push(event);
    if (eventQueue.length >= MAX_BATCH_SIZE) {
      flushQueue();
    } else if (!batchTimer) {
      batchTimer = setTimeout(function() { batchTimer = null; flushQueue(); }, BATCH_INTERVAL);
    }
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
        config.apiKey = apiKey;
        config.endpoint = options.endpoint || (window.location.origin + '/functions/v1/track');
        config.debug = !!options.debug;
        captureAndPersistUTMs();
        setupAutoTracking();
        log('Initialized v' + SDK_VERSION);
        if (options.autoPageView !== false) {
          enqueueEvent(buildEvent('PageView'));
          log('Auto PageView');
        }
        break;

      case 'page':
        enqueueEvent(buildEvent('PageView', args[0]));
        log('PageView');
        break;

      case 'track':
        if (!args[0]) { console.error('[CapiTrack] Event name required'); return; }
        enqueueEvent(buildEvent(args[0], args[1]));
        log('Event:', args[0]);
        break;

      case 'identify':
        if (args[0]) {
          for (var k in args[0]) identifiedUser[k] = args[0][k];
          // Persist identity for cross-session matching
          setLS(IDENTITY_KEY, JSON.stringify(identifiedUser));
          log('Identified:', Object.keys(args[0]));
        }
        break;

      case 'purchase':
        enqueueEvent(buildEvent('Purchase', args[0]));
        log('Purchase');
        break;

      case 'lead':
        enqueueEvent(buildEvent('Lead', args[0]));
        log('Lead');
        break;

      case 'addToCart':
        enqueueEvent(buildEvent('AddToCart', args[0]));
        log('AddToCart');
        break;

      case 'initiateCheckout':
        enqueueEvent(buildEvent('InitiateCheckout', args[0]));
        log('InitiateCheckout');
        break;

      case 'viewContent':
        enqueueEvent(buildEvent('ViewContent', args[0]));
        log('ViewContent');
        break;

      case 'search':
        enqueueEvent(buildEvent('Search', args[0]));
        log('Search');
        break;

      case 'completeRegistration':
        enqueueEvent(buildEvent('CompleteRegistration', args[0]));
        log('CompleteRegistration');
        break;

      case 'getAttribution':
        return { firstTouch: getFirstTouch(), lastTouch: getLastTouch() };

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
  window.capitrack = function() { processCommand.apply(null, arguments); };
  window.capitrack.q = [];
  for (var i = 0; i < existingQueue.length; i++) processCommand.apply(null, existingQueue[i]);

  log('SDK v' + SDK_VERSION + ' loaded');
})(window, document);
