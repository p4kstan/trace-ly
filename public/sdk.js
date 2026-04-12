/**
 * CapiTrack AI SDK v1.1
 * Lightweight server-side event tracking
 */
(function(window, document) {
  'use strict';

  var SDK_VERSION = '1.1.0';
  var BATCH_INTERVAL = 2000;
  var MAX_BATCH_SIZE = 20;
  var SESSION_TIMEOUT = 30 * 60 * 1000;

  var config = { apiKey: '', endpoint: '', debug: false };
  var eventQueue = [];
  var batchTimer = null;
  var identifiedUser = {};

  function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function log() {
    if (config.debug) {
      var args = ['[CapiTrack]'].concat(Array.prototype.slice.call(arguments));
      console.log.apply(console, args);
    }
  }

  function getUTMParams() {
    var params = new URLSearchParams(window.location.search);
    var utms = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function(key) {
      var val = params.get(key);
      if (val) {
        utms[key] = val;
        try { sessionStorage.setItem('ct_' + key, val); } catch(e) {}
      } else {
        try { var s = sessionStorage.getItem('ct_' + key); if (s) utms[key] = s; } catch(e) {}
      }
    });
    return utms;
  }

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : undefined;
  }

  function setCookie(name, value, days) {
    var expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = name + '=' + encodeURIComponent(value) + ';expires=' + expires + ';path=/;SameSite=Lax';
  }

  function getFingerprint() {
    var canvas = [
      navigator.userAgent, navigator.language,
      screen.width + 'x' + screen.height, screen.colorDepth,
      new Date().getTimezoneOffset(), navigator.hardwareConcurrency || ''
    ].join('|');
    var hash = 0;
    for (var i = 0; i < canvas.length; i++) {
      hash = ((hash << 5) - hash) + canvas.charCodeAt(i);
      hash |= 0;
    }
    return 'fp_' + Math.abs(hash).toString(36);
  }

  function getFbp() {
    var fbp = getCookie('_fbp');
    if (!fbp) {
      fbp = 'fb.1.' + Date.now() + '.' + Math.floor(Math.random() * 2147483648);
      setCookie('_fbp', fbp, 390);
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

  function buildEvent(eventName, data) {
    var utms = getUTMParams();
    var event = {
      event_name: eventName,
      event_id: generateId(),
      url: window.location.href,
      page_path: window.location.pathname,
      referrer: document.referrer,
      fingerprint: getFingerprint(),
      fbp: getFbp(),
      fbc: getFbc(),
      source: 'sdk',
      action_source: 'website'
    };

    // Merge UTMs
    for (var k in utms) event[k] = utms[k];

    // User data
    if (Object.keys(identifiedUser).length > 0) {
      event.user_data = {};
      for (var u in identifiedUser) event.user_data[u] = identifiedUser[u];
    }

    // Custom data
    if (data) {
      if (data.value !== undefined) event.value = Number(data.value);
      if (data.currency) event.currency = String(data.currency);

      var userFields = ['email', 'phone', 'first_name', 'last_name', 'city', 'state', 'zip', 'country', 'external_id'];
      var userData = event.user_data || {};
      var customData = {};

      for (var key in data) {
        if (userFields.indexOf(key) !== -1) userData[key] = data[key];
        else if (key !== 'value' && key !== 'currency') customData[key] = data[key];
      }

      if (Object.keys(userData).length > 0) event.user_data = userData;
      if (Object.keys(customData).length > 0) event.custom_data = customData;
    }

    return event;
  }

  function sendEvents(events) {
    if (!events.length || !config.apiKey) return;

    events.forEach(function(event) {
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', config.endpoint, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('X-Api-Key', config.apiKey);
        xhr.send(JSON.stringify(event));
      } catch(e) {
        log('Send error:', e);
      }
    });

    log('Sent ' + events.length + ' events');
  }

  function flushQueue() {
    if (eventQueue.length === 0) return;
    var batch = eventQueue.splice(0, MAX_BATCH_SIZE);
    sendEvents(batch);
  }

  function enqueueEvent(event) {
    eventQueue.push(event);
    if (eventQueue.length >= MAX_BATCH_SIZE) {
      flushQueue();
    } else if (!batchTimer) {
      batchTimer = setTimeout(function() {
        batchTimer = null;
        flushQueue();
      }, BATCH_INTERVAL);
    }
  }

  // Auto-tracking setup
  function setupAutoTracking() {
    // Flush on page unload
    window.addEventListener('beforeunload', function() {
      if (eventQueue.length > 0 && navigator.sendBeacon) {
        eventQueue.forEach(function(event) {
          navigator.sendBeacon(
            config.endpoint + '?key=' + config.apiKey,
            JSON.stringify(event)
          );
        });
      }
    });
  }

  // Public API
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
        setupAutoTracking();
        log('Initialized v' + SDK_VERSION);
        break;

      case 'page':
        enqueueEvent(buildEvent('PageView', args[0]));
        log('PageView tracked');
        break;

      case 'track':
        var eventName = args[0];
        if (!eventName) { console.error('[CapiTrack] Event name required'); return; }
        enqueueEvent(buildEvent(eventName, args[1]));
        log('Event:', eventName);
        break;

      case 'identify':
        var userData = args[0];
        if (userData) {
          for (var k in userData) identifiedUser[k] = userData[k];
          log('Identified:', Object.keys(userData));
        }
        break;

      case 'purchase':
        enqueueEvent(buildEvent('Purchase', args[0]));
        log('Purchase tracked');
        break;

      case 'lead':
        enqueueEvent(buildEvent('Lead', args[0]));
        log('Lead tracked');
        break;

      default:
        console.warn('[CapiTrack] Unknown command:', command);
    }
  }

  // Process pre-init queue
  var existingQueue = (window.capitrack && window.capitrack.q) || [];

  window.capitrack = function() {
    processCommand.apply(null, arguments);
  };
  window.capitrack.q = [];

  for (var i = 0; i < existingQueue.length; i++) {
    processCommand.apply(null, existingQueue[i]);
  }

  log('SDK v' + SDK_VERSION + ' loaded');
})(window, document);
