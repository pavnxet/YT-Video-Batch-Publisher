/*
 * content.js — content-script entry point.
 *
 * Runs on studio.youtube.com. Owns the single active batch so a second
 * "Start" cannot launch a parallel run, and streams progress to the popup.
 */
(function (scope) {
  'use strict';

  var log = scope.logger;
  var MSG = scope.messaging.MSG;

  var active = null; // { controller, engine }

  function onStudio() {
    return location.hostname === 'studio.youtube.com' ||
           location.hostname.endsWith('.youtube.com');
  }

  async function settingsSnapshot() {
    var s = await scope.settings.load();
    log.setDebug(s.debug);
    return s;
  }

  function makeController() {
    if (typeof AbortController === 'function') return new AbortController();
    // Minimal fallback for very old engines.
    var listeners = [];
    var signal = {
      aborted: false,
      addEventListener: function (_, fn) { listeners.push(fn); },
      removeEventListener: function (_, fn) { listeners = listeners.filter(function (f) { return f !== fn; }); }
    };
    return { signal: signal, abort: function () { signal.aborted = true; listeners.forEach(function (f) { f(); }); } };
  }

  async function handleScan() {
    var settings = await settingsSnapshot();
    var engine = new scope.PublishEngine({ settings: settings, signal: null });
    var result = await engine.scan();
    return { ok: true, count: result.count, titles: result.titles };
  }

  async function handleStart(message) {
    if (active) return { ok: false, error: 'A batch is already running.' };
    var settings = await settingsSnapshot();
    var controller = makeController();
    var visibility = message.visibility || settings.defaultVisibility;

    var engine = new scope.PublishEngine({
      settings: settings,
      visibility: visibility,
      signal: controller.signal,
      onProgress: function (evt) { scope.messaging.emitStatus(evt); }
    });
    active = { controller: controller, engine: engine };

    try {
      var summary = await engine.run();
      return { ok: true, summary: summary };
    } catch (err) {
      if (scope.dom.isAbort(err)) return { ok: true, cancelled: true };
      log.error('batch failed', err);
      return { ok: false, error: err && err.message ? err.message : String(err) };
    } finally {
      active = null;
    }
  }

  function handleStop() {
    if (!active) return { ok: false, error: 'Nothing is running.' };
    active.controller.abort();
    return { ok: true };
  }

  var api = scope.platform.api;
  if (api && api.runtime && api.runtime.onMessage) {
    api.runtime.onMessage.addListener(function (message, sender, sendResponse) {
      if (!message || !message.type) return;
      if (!onStudio() && message.type !== MSG.PING) {
        sendResponse({ ok: false, error: 'Not on YouTube Studio.' });
        return true;
      }
      switch (message.type) {
        case MSG.PING:
          sendResponse({ ok: true, onStudio: onStudio(), busy: !!active, version: (api.runtime.getManifest && api.runtime.getManifest().version) || '' });
          return true;
        case MSG.SCAN:
          handleScan().then(sendResponse, function (e) { sendResponse({ ok: false, error: String(e) }); });
          return true; // async response
        case MSG.START:
          handleStart(message).then(sendResponse, function (e) { sendResponse({ ok: false, error: String(e) }); });
          return true;
        case MSG.STOP:
          sendResponse(handleStop());
          return true;
        default:
          return;
      }
    });
  }

  log.debug('content script ready on', location.hostname);
  scope.contentInternals = { handleScan, handleStart, handleStop, onStudio, isActive: function () { return !!active; } };
})(globalThis.YTBP = globalThis.YTBP || {});
