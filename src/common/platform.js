/*
 * platform.js — resolves the WebExtension API object in a way that works on
 * Chrome/Edge (`chrome.*`, callback based) and Firefox (`browser.*`, promise based),
 * and degrades gracefully when neither is present (unit tests).
 *
 * Every core module hangs off a single namespace: globalThis.YTBP
 */
(function (scope) {
  'use strict';

  var hasBrowser = typeof browser !== 'undefined' && browser && browser.runtime;
  var hasChrome = typeof chrome !== 'undefined' && chrome && chrome.runtime;
  var api = hasBrowser ? browser : (hasChrome ? chrome : null);

  /**
   * Call an extension API method and always get a Promise back, whether the
   * underlying implementation is callback-based (Chrome) or promise-based (Firefox).
   * @param {object} obj  the object owning the method, e.g. chrome.tabs
   * @param {string} method  method name
   * @param {...*} args  arguments
   * @returns {Promise<*>}
   */
  function call(obj, method, ...args) {
    return new Promise((resolve, reject) => {
      if (!obj || typeof obj[method] !== 'function') {
        reject(new Error('API unavailable: ' + method));
        return;
      }
      let settled = false;
      const done = (value) => { if (!settled) { settled = true; resolve(value); } };
      const fail = (err) => { if (!settled) { settled = true; reject(err); } };

      try {
        const maybePromise = obj[method](...args, (result) => {
          const err = api && api.runtime && api.runtime.lastError;
          if (err) fail(new Error(err.message || String(err)));
          else done(result);
        });
        // Firefox returns a real promise and ignores the extra callback argument.
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(done, fail);
        }
      } catch (err) {
        fail(err);
      }
    });
  }

  scope.platform = {
    api,
    hasApi: !!api,
    isFirefox: !!hasBrowser,
    call
  };
})(globalThis.YTBP = globalThis.YTBP || {});
