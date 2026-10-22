/*
 * messaging.js — the message contract shared by popup, background and content
 * script, plus small helpers so no module hard-codes a string twice.
 */
(function (scope) {
  'use strict';

  var MSG = {
    PING: 'YTBP_PING',            // popup -> background: is a tab reachable?
    SCAN: 'YTBP_SCAN',            // popup -> background: count drafts
    START: 'YTBP_START',          // popup -> background: begin publishing
    STOP: 'YTBP_STOP',            // popup -> background: cancel
    STATUS: 'YTBP_STATUS',        // background -> popup: live progress
    SCAN_RESULT: 'YTBP_SCAN_RESULT',
    RUN_RESULT: 'YTBP_RUN_RESULT'
  };

  var PHASE = {
    IDLE: 'idle',
    SCANNING: 'scanning',
    STARTING: 'starting',
    VIDEO_START: 'video-start',
    VIDEO_STEP: 'video-step',
    VIDEO_DONE: 'video-done',
    VIDEO_ERROR: 'video-error',
    FINISHED: 'finished',
    CANCELLED: 'cancelled'
  };

  /** Fire-and-forget progress ping to any listening popup. */
  function emitStatus(payload) {
    var api = scope.platform && scope.platform.api;
    if (!api || !api.runtime || typeof api.runtime.sendMessage !== 'function') return;
    try {
      // Chrome throws if nobody is listening; swallow it.
      var p = api.runtime.sendMessage(Object.assign({ type: MSG.STATUS }, payload));
      if (p && typeof p.catch === 'function') p.catch(function () {});
    } catch (_) { /* no receiver */ }
  }

  scope.messaging = { MSG, PHASE, emitStatus };
})(globalThis.YTBP = globalThis.YTBP || {});
