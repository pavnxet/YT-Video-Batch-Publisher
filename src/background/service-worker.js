/*
 * service-worker.js — MV3 background (Chrome service worker / Firefox event page).
 *
 * Responsibilities:
 *  - seed default settings on install
 *  - make sure the content script is present in the target tab before
 *    forwarding a message (covers the "installed while the tab was already
 *    open" case, which the original extension silently failed on)
 *  - relay SCAN / START / STOP from the popup to the tab
 *  - paint a progress badge on the toolbar icon
 */
(function (scope) {
  'use strict';

  var log = scope.logger;
  var MSG = scope.messaging.MSG;
  var platform = scope.platform;
  var api = platform.api;

  var STUDIO_URL = /^https:\/\/studio\.youtube\.com\//;

  if (!api) return;

  // ---- lifecycle ---------------------------------------------------------
  if (api.runtime.onInstalled) {
    api.runtime.onInstalled.addListener(function (details) {
      if (details.reason === 'install') {
        scope.settings.load().then(function (s) {
          log.setDebug(s.debug);
          return scope.settings.save(s);
        });
      }
    });
  }

  // ---- helpers -----------------------------------------------------------
  async function activeTab() {
    var tabs = await platform.call(api.tabs, 'query', { active: true, currentWindow: true });
    return tabs && tabs[0];
  }

  function isStudioUrl(url) {
    return STUDIO_URL.test(url || '');
  }

  async function pingTab(tabId) {
    try {
      var res = await platform.call(api.tabs, 'sendMessage', tabId, { type: MSG.PING });
      return res && res.ok ? res : null;
    } catch (_) { return null; }
  }

  /** Inject content.js if the content script is not already answering. */
  async function ensureContentScript(tabId) {
    if (await pingTab(tabId)) return true;
    try {
      await platform.call(api.scripting, 'executeScript', { target: { tabId: tabId }, files: ['content.js'] });
      return !!(await pingTab(tabId));
    } catch (err) {
      log.warn('content script injection failed', err);
      return false;
    }
  }

  function setBadge(text, color) {
    try {
      if (api.action && api.action.setBadgeText) api.action.setBadgeText({ text: text || '' });
      if (api.action && api.action.setBadgeBackgroundColor && color) api.action.setBadgeBackgroundColor({ color: color });
    } catch (_) {}
  }

  async function route(message) {
    var tab = await activeTab();
    if (!tab || tab.id == null) return { ok: false, error: 'No active tab.' };
    if (!isStudioUrl(tab.url)) {
      return { ok: false, error: 'Open YouTube Studio (studio.youtube.com) first.' };
    }
    var ready = await ensureContentScript(tab.id);
    if (!ready) return { ok: false, error: 'Could not reach the page. Reload YouTube Studio and try again.' };
    try {
      return await platform.call(api.tabs, 'sendMessage', tab.id, message);
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  }

  // ---- message bus -------------------------------------------------------
  api.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (!message || !message.type) return;

    if (message.type === MSG.STATUS) {
      // Progress ping coming up from the content script — update the badge.
      if (message.total && message.index) setBadge(message.index + '/' + message.total, '#cc0000');
      else if (message.phase === 'finished' || message.phase === 'cancelled') {
        setBadge(message.phase === 'finished' ? '✓' : '');
      }
      return;
    }

    if (message.type === MSG.PING || message.type === MSG.SCAN ||
        message.type === MSG.START || message.type === MSG.STOP) {
      if (message.type === MSG.START) setBadge('…', '#cc0000');
      route(message).then(function (res) {
        if (message.type === MSG.START && res && !res.ok) setBadge('!', '#b30000');
        sendResponse(res);
      }, function (err) {
        sendResponse({ ok: false, error: err.message || String(err) });
      });
      return true; // keep the channel open for the async reply
    }
  });
})(globalThis.YTBP = globalThis.YTBP || {});
