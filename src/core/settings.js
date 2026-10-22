/*
 * settings.js — persisted user settings, with sensible defaults and a
 * storage area that falls back to in-memory when the extension API is absent
 * (so the module is unit-testable).
 */
(function (scope) {
  'use strict';

  var VISIBILITIES = ['Public', 'Unlisted', 'Private'];

  var DEFAULTS = {
    defaultVisibility: 'Unlisted', // Public | Unlisted | Private
    madeForKids: false,            // false = "No, it's not made for kids"
    actionDelayMs: 400,            // pause between videos
    stepTimeoutMs: 10000,          // per-step element timeout
    maxRetries: 1,                 // extra attempts per video after a failure
    continueOnError: true,         // keep going if one video fails
    dryRun: false,                 // scan + simulate, change nothing
    debug: false,                  // verbose logging
    theme: 'auto',                 // auto | light | dark
    autoCloseShareDialog: true     // close the "video published" popup
  };

  var memory = Object.assign({}, DEFAULTS);
  var listeners = [];

  function area() {
    var api = scope.platform && scope.platform.api;
    if (api && api.storage && api.storage.sync) return api.storage.sync;
    if (api && api.storage && api.storage.local) return api.storage.local;
    return null;
  }

  function sanitize(raw) {
    var out = Object.assign({}, DEFAULTS);
    if (!raw || typeof raw !== 'object') return out;

    if (VISIBILITIES.indexOf(raw.defaultVisibility) !== -1) out.defaultVisibility = raw.defaultVisibility;
    if (typeof raw.madeForKids === 'boolean') out.madeForKids = raw.madeForKids;
    if (typeof raw.continueOnError === 'boolean') out.continueOnError = raw.continueOnError;
    if (typeof raw.dryRun === 'boolean') out.dryRun = raw.dryRun;
    if (typeof raw.debug === 'boolean') out.debug = raw.debug;
    if (typeof raw.autoCloseShareDialog === 'boolean') out.autoCloseShareDialog = raw.autoCloseShareDialog;
    if (['auto', 'light', 'dark'].indexOf(raw.theme) !== -1) out.theme = raw.theme;

    out.actionDelayMs = clampInt(raw.actionDelayMs, 0, 10000, DEFAULTS.actionDelayMs);
    out.stepTimeoutMs = clampInt(raw.stepTimeoutMs, 1000, 60000, DEFAULTS.stepTimeoutMs);
    out.maxRetries = clampInt(raw.maxRetries, 0, 5, DEFAULTS.maxRetries);
    return out;
  }

  function clampInt(value, min, max, fallback) {
    var n = Number(value);
    if (!isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  }

  /** Load settings, merged over defaults. Never rejects. */
  async function load() {
    var store = area();
    if (!store) return Object.assign({}, memory);
    try {
      var got = await scope.platform.call(store, 'get', DEFAULTS);
      memory = sanitize(got);
      return Object.assign({}, memory);
    } catch (err) {
      scope.logger && scope.logger.warn('settings.load failed, using defaults', err);
      return Object.assign({}, DEFAULTS);
    }
  }

  /** Persist a partial update and notify subscribers. */
  async function save(partial) {
    var next = sanitize(Object.assign({}, memory, partial));
    memory = next;
    var store = area();
    if (store) {
      try { await scope.platform.call(store, 'set', next); }
      catch (err) { scope.logger && scope.logger.warn('settings.save failed', err); }
    }
    listeners.forEach(function (fn) { try { fn(next); } catch (_) {} });
    return next;
  }

  async function reset() { return save(DEFAULTS); }

  function onChange(fn) { listeners.push(fn); }

  scope.settings = {
    DEFAULTS, VISIBILITIES,
    load, save, reset, onChange, sanitize,
    /** test seam */
    _setMemory(obj) { memory = sanitize(obj); }
  };
})(globalThis.YTBP = globalThis.YTBP || {});
