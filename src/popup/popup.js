/*
 * popup.js — toolbar popup controller.
 *
 * New in v2.0: it actually shows what is happening — connection state, a live
 * draft count, a progress bar, a per-video log and a working Stop button.
 * The original popup was fire-and-forget with zero feedback.
 */
(function (scope) {
  'use strict';

  var MSG = scope.messaging.MSG;
  var PHASE = scope.messaging.PHASE;
  var platform = scope.platform;
  var api = platform.api;

  var el = {};
  var state = { running: false, total: 0, done: 0 };

  function $(id) { return document.getElementById(id); }

  function show(node, on) { node.classList.toggle('hidden', !on); }

  function setBanner(message, kind) {
    if (!message) { show(el.banner, false); return; }
    el.banner.textContent = message;
    el.banner.style.color = kind === 'ok' ? 'var(--success)' : '';
    show(el.banner, true);
  }

  function setConn(stateName, text) {
    el.connChip.dataset.state = stateName;
    el.connChip.textContent = text;
  }

  async function send(message) {
    try {
      return await platform.call(api.runtime, 'sendMessage', message);
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  }

  function visibilityValue() {
    var checked = document.querySelector('input[name="visibility"]:checked');
    return checked ? checked.value : 'Unlisted';
  }

  function setProgress(index, total, label) {
    var pct = total ? Math.round((index / total) * 100) : 0;
    el.progressFill.style.width = pct + '%';
    el.progressPct.textContent = pct + '%';
    if (label) el.progressLabel.textContent = label;
    el.progressBar.setAttribute('aria-valuenow', String(pct));
    el.progressBar.setAttribute('aria-valuemin', '0');
    el.progressBar.setAttribute('aria-valuemax', '100');
  }

  function addLog(title, status, why) {
    var li = document.createElement('li');
    li.dataset.status = status || '';
    var dot = document.createElement('span'); dot.className = 'dot';
    var name = document.createElement('span'); name.className = 'name'; name.textContent = title || '';
    li.appendChild(dot); li.appendChild(name);
    if (why) { var w = document.createElement('span'); w.className = 'why'; w.textContent = why; li.appendChild(w); }
    el.log.appendChild(li);
    el.log.parentElement.scrollTop = el.log.parentElement.scrollHeight;
    show(el.logWrap, true);
  }

  function setRunning(on) {
    state.running = on;
    el.start.disabled = on;
    el.start.textContent = on ? 'Publishing…' : 'Publish drafts';
    show(el.stop, on);
    show(el.progressWrap, on || state.total > 0);
  }

  async function refreshConnection() {
    var res = await send({ type: MSG.PING });
    if (res && res.ok && res.onStudio) {
      setConn('ok', 'YouTube Studio');
      return true;
    }
    setConn('bad', 'Not on Studio');
    el.draftHint.textContent = 'Open YouTube Studio → Content.';
    el.draftCount.textContent = '—';
    el.start.disabled = true;
    return false;
  }

  async function scan() {
    el.rescan.disabled = true;
    el.draftCount.textContent = '…';
    var res = await send({ type: MSG.SCAN });
    el.rescan.disabled = false;
    if (!res || !res.ok) {
      el.draftCount.textContent = '—';
      setBanner((res && res.error) || 'Could not scan the page.');
      return;
    }
    el.draftCount.textContent = String(res.count);
    el.draftHint.textContent = res.count
      ? 'Ready to publish'
      : 'No drafts found on this page.';
    el.start.disabled = res.count === 0 || state.running;
  }

  function onStatus(message) {
    switch (message.phase) {
      case PHASE.SCANNING:
        el.progressLabel.textContent = 'Scanning…';
        break;
      case PHASE.STARTING:
        state.total = message.total || 0;
        setProgress(0, state.total || 1, message.message || 'Starting…');
        break;
      case PHASE.VIDEO_START:
        state.done = Math.max(0, (message.index || 1) - 1);
        setProgress(state.done, state.total || message.total || 1,
          'Publishing ' + message.index + '/' + message.total + ': ' + message.title);
        break;
      case PHASE.VIDEO_DONE:
        state.done = message.index || state.done;
        setProgress(state.done, state.total || message.total || 1, message.title);
        addLog(message.title, message.status, message.status === 'published' ? '✓' : 'skipped');
        break;
      case PHASE.VIDEO_ERROR:
        addLog(message.title, 'error', message.message);
        break;
      case PHASE.FINISHED:
      case PHASE.CANCELLED:
        if (message.summary) {
          setProgress(message.summary.total, message.summary.total, message.message);
        }
        setBanner(message.message, message.phase === PHASE.FINISHED ? 'ok' : '');
        setRunning(false);
        break;
      default:
        break;
    }
  }

  async function start() {
    setBanner('');
    el.log.innerHTML = '';
    show(el.logWrap, false);
    state.done = 0;
    state.total = 0;
    setProgress(0, 1, 'Starting…');
    setRunning(true);

    var settings = await scope.settings.load();
    await scope.settings.save({ defaultVisibility: visibilityValue() });

    var res = await send({ type: MSG.START, visibility: visibilityValue() });
    if (!res || !res.ok) {
      setRunning(false);
      setBanner((res && res.error) || 'Could not start.');
      return;
    }
    if (res.cancelled) { setRunning(false); setBanner('Stopped.', ''); return; }
    if (res.summary) {
      var s = res.summary;
      setProgress(s.total || 1, s.total || 1, 'Done');
      setBanner(s.published + ' published' + (s.failed ? ', ' + s.failed + ' failed' : '') + '.', 'ok');
      setRunning(false);
      scan();
    }
  }

  async function stop() {
    el.stop.disabled = true;
    await send({ type: MSG.STOP });
    el.stop.disabled = false;
  }

  async function init() {
    ['connChip', 'draftCount', 'draftHint', 'start', 'stop', 'rescan', 'log', 'logWrap',
     'progressWrap', 'progressBar', 'progressFill', 'progressPct', 'progressLabel',
     'banner', 'madeForKids', 'dryRun', 'openOptions', 'optionsLink', 'version']
      .forEach(function (id) { el[id] = $(id); });

    var manifest = api.runtime.getManifest ? api.runtime.getManifest() : { version: '2.0' };
    el.version.textContent = 'v' + manifest.version;

    var settings = await scope.settings.load();
    document.documentElement.dataset.theme = settings.theme;
    var radio = document.querySelector('input[name="visibility"][value="' + settings.defaultVisibility + '"]');
    if (radio) radio.checked = true;
    el.madeForKids.checked = !!settings.madeForKids;
    el.dryRun.checked = !!settings.dryRun;

    el.madeForKids.addEventListener('change', function () { scope.settings.save({ madeForKids: el.madeForKids.checked }); });
    el.dryRun.addEventListener('change', function () { scope.settings.save({ dryRun: el.dryRun.checked }); });
    el.start.addEventListener('click', start);
    el.stop.addEventListener('click', stop);
    el.rescan.addEventListener('click', scan);
    var openOpts = function (e) { if (e) e.preventDefault(); api.runtime.openOptionsPage(); };
    el.openOptions.addEventListener('click', openOpts);
    el.optionsLink.addEventListener('click', openOpts);

    if (api.runtime.onMessage) {
      api.runtime.onMessage.addListener(function (message) {
        if (message && message.type === MSG.STATUS) onStatus(message);
      });
    }

    if (await refreshConnection()) await scan();
  }

  document.addEventListener('DOMContentLoaded', init);
  scope.popupInternals = { onStatus, setProgress, addLog };
})(globalThis.YTBP = globalThis.YTBP || {});
