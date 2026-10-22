/*
 * logger.js — tiny leveled logger. Debug output is off by default and toggled
 * from the options page; nothing is written to the page for normal users.
 */
(function (scope) {
  'use strict';

  var PREFIX = '[YTBP]';
  var debugEnabled = false;
  var buffer = [];
  var MAX_BUFFER = 200;

  function record(level, args) {
    buffer.push({ level, args, at: Date.now() });
    if (buffer.length > MAX_BUFFER) buffer.shift();
  }

  var logger = {
    setDebug(on) { debugEnabled = !!on; },
    isDebug() { return debugEnabled; },

    info()  { record('info', [...arguments]);  console.log.apply(console, [PREFIX].concat([...arguments])); },
    warn()  { record('warn', [...arguments]);  console.warn.apply(console, [PREFIX].concat([...arguments])); },
    error() { record('error', [...arguments]); console.error.apply(console, [PREFIX].concat([...arguments])); },
    debug() {
      if (!debugEnabled) return;
      record('debug', [...arguments]);
      console.debug.apply(console, [PREFIX].concat([...arguments]));
    },

    /** Recent log entries — used by the popup's diagnostics panel. */
    history() { return buffer.slice(); },
    clear() { buffer = []; }
  };

  scope.logger = logger;
})(globalThis.YTBP = globalThis.YTBP || {});
