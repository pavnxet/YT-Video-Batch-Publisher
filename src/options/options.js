/*
 * options.js — settings page controller. Writes straight to chrome.storage.sync
 * so settings follow the user across devices.
 */
(function (scope) {
  'use strict';

  var BOOLEANS = ['madeForKids', 'continueOnError', 'autoCloseShareDialog', 'dryRun', 'debug'];
  var NUMBERS = ['actionDelayMs', 'stepTimeoutMs', 'maxRetries'];
  var SELECTS = ['defaultVisibility', 'theme'];

  function $(id) { return document.getElementById(id); }

  function flash(text, ok) {
    var chip = $('saveChip');
    chip.textContent = text;
    chip.dataset.state = ok ? 'ok' : 'bad';
    clearTimeout(flash._t);
    flash._t = setTimeout(function () { chip.textContent = 'Saved'; chip.dataset.state = 'ok'; }, 1500);
  }

  function fill(settings) {
    BOOLEANS.forEach(function (k) { $(k).checked = !!settings[k]; });
    NUMBERS.forEach(function (k) { $(k).value = settings[k]; });
    SELECTS.forEach(function (k) { $(k).value = settings[k]; });
    document.documentElement.dataset.theme = settings.theme;
  }

  function read() {
    var out = {};
    BOOLEANS.forEach(function (k) { out[k] = $(k).checked; });
    NUMBERS.forEach(function (k) { out[k] = Number($(k).value); });
    SELECTS.forEach(function (k) { out[k] = $(k).value; });
    return out;
  }

  async function commit() {
    try {
      var saved = await scope.settings.save(read());
      document.documentElement.dataset.theme = saved.theme;
      fill(saved);
      flash('Saved', true);
    } catch (err) {
      flash('Save failed', false);
    }
  }

  async function init() {
    var settings = await scope.settings.load();
    fill(settings);

    BOOLEANS.concat(NUMBERS, SELECTS).forEach(function (id) {
      var node = $(id);
      node.addEventListener('change', commit);
      if (node.type === 'number') node.addEventListener('input', function () {
        clearTimeout(init._t); init._t = setTimeout(commit, 500);
      });
    });

    $('reset').addEventListener('click', async function () {
      var fresh = await scope.settings.reset();
      fill(fresh);
      flash('Defaults restored', true);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})(globalThis.YTBP = globalThis.YTBP || {});
