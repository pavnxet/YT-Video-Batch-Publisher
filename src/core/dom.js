/*
 * dom.js — DOM primitives used by every automation engine.
 *
 * All of these accept an AbortSignal so a running batch can be cancelled
 * instantly instead of waiting out a timeout.
 */
(function (scope) {
  'use strict';

  var DEFAULT_TIMEOUT_MS = 10000;
  var POLL_INTERVAL_MS = 50;

  function abortError() {
    var e = new Error('Operation aborted');
    e.name = 'AbortError';
    return e;
  }
  function isAbort(err) { return !!err && err.name === 'AbortError'; }

  /** Promise-based sleep that rejects with AbortError if the signal fires. */
  function sleep(ms, signal) {
    return new Promise(function (resolve, reject) {
      if (signal && signal.aborted) { reject(abortError()); return; }
      var timer = setTimeout(function () { cleanup(); resolve(); }, Math.max(0, ms));
      function onAbort() { clearTimeout(timer); cleanup(); reject(abortError()); }
      function cleanup() { if (signal) signal.removeEventListener('abort', onAbort); }
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  function root() {
    return (typeof document !== 'undefined' && document) ? document : null;
  }

  /**
   * Poll until `selector` matches inside `options.root`.
   * @returns {Promise<Element|null>} null on timeout (never throws for "not found")
   */
  async function waitForElement(selector, options) {
    options = options || {};
    var container = options.root || root();
    var timeout = options.timeout == null ? DEFAULT_TIMEOUT_MS : options.timeout;
    var signal = options.signal;
    if (!container) return null;

    var deadline = Date.now() + timeout;
    for (;;) {
      var el = container.querySelector(selector);
      if (el) return el;
      if (signal && signal.aborted) throw abortError();
      var remaining = deadline - Date.now();
      if (remaining <= 0) return null;
      await sleep(Math.min(POLL_INTERVAL_MS, remaining), signal);
    }
  }

  /**
   * Try several selectors and return the first one that matches.
   * @returns {Promise<{element: Element, selector: string}|null>}
   */
  async function waitForAny(selectors, options) {
    options = options || {};
    var container = options.root || root();
    var timeout = options.timeout == null ? DEFAULT_TIMEOUT_MS : options.timeout;
    var signal = options.signal;
    if (!container) return null;

    var deadline = Date.now() + timeout;
    for (;;) {
      for (var i = 0; i < selectors.length; i++) {
        var el = container.querySelector(selectors[i]);
        if (el) return { element: el, selector: selectors[i] };
      }
      if (signal && signal.aborted) throw abortError();
      var remaining = deadline - Date.now();
      if (remaining <= 0) return null;
      await sleep(Math.min(POLL_INTERVAL_MS, remaining), signal);
    }
  }

  /** Wait until an element is detached from the document. */
  async function waitForGone(element, options) {
    options = options || {};
    var timeout = options.timeout == null ? DEFAULT_TIMEOUT_MS : options.timeout;
    var signal = options.signal;
    var deadline = Date.now() + timeout;
    for (;;) {
      if (!element || !element.isConnected) return true;
      if (signal && signal.aborted) throw abortError();
      var remaining = deadline - Date.now();
      if (remaining <= 0) return false;
      await sleep(Math.min(POLL_INTERVAL_MS, remaining), signal);
    }
  }

  /**
   * Dispatch a full, trusted-looking click sequence.
   *
   * Replaces the original's deprecated `document.createEvent('MouseEvents')`
   * + `initMouseEvent` with the modern MouseEvent constructor, and fires
   * pointer events too, which YouTube's Polymer components listen for.
   */
  function click(element) {
    if (!element) return false;
    var view = (typeof window !== 'undefined' && window) ? window : undefined;
    var opts = { bubbles: true, cancelable: true, composed: true, view: view, button: 0 };
    try {
      // Exactly one `click` event is dispatched: calling element.click() as well
      // would fire every listener twice.
      element.dispatchEvent(new MouseEvent('pointerdown', opts));
      element.dispatchEvent(new MouseEvent('mousedown', opts));
      element.dispatchEvent(new MouseEvent('pointerup', opts));
      element.dispatchEvent(new MouseEvent('mouseup', opts));
      element.dispatchEvent(new MouseEvent('click', opts));
      return true;
    } catch (err) {
      try { element.click(); return true; } catch (_) { return false; }
    }
  }

  /** Visible text of an element, whitespace-normalised. */
  function textOf(element) {
    if (!element) return '';
    return (element.textContent || '').replace(/\s+/g, ' ').trim();
  }

  /** Best-effort visibility check (layout-free, so it also works in jsdom). */
  function isVisible(element) {
    if (!element || !element.isConnected) return false;
    if (element.hidden) return false;
    var style = element.getAttribute && element.getAttribute('style');
    if (style && /display\s*:\s*none|visibility\s*:\s*hidden/i.test(style)) return false;
    return true;
  }

  scope.dom = {
    sleep, waitForElement, waitForAny, waitForGone,
    click, textOf, isVisible, abortError, isAbort,
    DEFAULT_TIMEOUT_MS
  };
})(globalThis.YTBP = globalThis.YTBP || {});
