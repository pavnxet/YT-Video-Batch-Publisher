import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { loadBundle } from './helpers/env.mjs';
import { STUDIO_HTML, wireStudio } from './helpers/env.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('bundle: dist/chrome/content.js parses and exposes the public surface', async () => {
  const { YTBP } = await loadBundle('chrome', 'content.js', { html: STUDIO_HTML });
  assert.ok(YTBP.PublishEngine, 'PublishEngine missing from the bundle');
  assert.ok(YTBP.PlaylistSorter, 'PlaylistSorter missing from the bundle');
  assert.ok(YTBP.settings && YTBP.dom && YTBP.selectors && YTBP.messaging);
  assert.equal(YTBP.contentInternals.onStudio(), true);
});

test('bundle: the concatenated content script can actually scan a Studio page', async () => {
  const { YTBP, window } = await loadBundle('chrome', 'content.js', { html: STUDIO_HTML });
  wireStudio(window);
  const engine = new YTBP.PublishEngine({
    settings: Object.assign({}, YTBP.settings.DEFAULTS, { stepTimeoutMs: 400, actionDelayMs: 0 }),
    visibility: 'Unlisted',
    document: window.document
  });
  const result = await engine.scan();
  assert.equal(result.count, 2);
});

test('bundle: source modules define no duplicate top-level symbols', async () => {
  // Concatenation is order-based, so a stray duplicate would silently shadow.
  const files = ['common/platform.js', 'core/logger.js', 'core/dom.js', 'core/selectors.js',
    'core/settings.js', 'core/messaging.js', 'core/publisher.js', 'core/sorter.js'];
  const seen = new Map();
  for (const f of files) {
    const code = await readFile(path.join(ROOT, 'src', f), 'utf8');
    for (const m of code.matchAll(/scope\.([A-Za-z_$][\w$]*)\s*=/g)) {
      const name = m[1];
      if (seen.has(name) && seen.get(name) !== f) {
        assert.fail(`namespace member "${name}" assigned by both ${seen.get(name)} and ${f}`);
      }
      seen.set(name, f);
    }
  }
});

test('background: routes a SCAN message to the active Studio tab', async () => {
  const chrome = makeFakeChrome();
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'https://studio.youtube.com/', runScripts: 'outside-only'
  });
  dom.window.chrome = chrome;
  const code = await readFile(path.join(ROOT, 'dist', 'chrome', 'background.js'), 'utf8');
  dom.window.eval(code);

  assert.equal(chrome.listeners.length, 1, 'background should register one message listener');
  const response = await new Promise((resolve) => {
    chrome.listeners[0]({ type: 'YTBP_SCAN' }, {}, resolve);
  });
  assert.deepEqual(response, { ok: true, count: 2 });
  // One PING (the readiness probe) plus the forwarded SCAN.
  assert.equal(chrome.sent.filter((s) => s.msg.type === 'YTBP_SCAN').length, 1);
  assert.ok(chrome.sent.some((s) => s.msg.type === 'YTBP_PING'), 'should probe the tab before routing');
});

test('background: refuses to act when the active tab is not YouTube Studio', async () => {
  const chrome = makeFakeChrome({ tab: { id: 3, url: 'https://example.com/' } });
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'https://studio.youtube.com/', runScripts: 'outside-only'
  });
  dom.window.chrome = chrome;
  dom.window.eval(await readFile(path.join(ROOT, 'dist', 'chrome', 'background.js'), 'utf8'));

  const response = await new Promise((resolve) => chrome.listeners[0]({ type: 'YTBP_START' }, {}, resolve));
  assert.equal(response.ok, false);
  assert.match(response.error, /YouTube Studio/);
  assert.equal(chrome.sent.length, 0, 'nothing should be sent to a non-Studio tab');
});

function makeFakeChrome({ tab = { id: 7, url: 'https://studio.youtube.com/channel/UC/videos/upload' } } = {}) {
  const listeners = [];
  const sent = [];
  return {
    listeners,
    sent,
    runtime: {
      onInstalled: { addListener() {} },
      onMessage: { addListener(fn) { listeners.push(fn); } },
      getManifest: () => ({ version: '2.0.0' }),
      lastError: null,
      sendMessage() {},
      openOptionsPage() {}
    },
    tabs: {
      query(_q, cb) { cb([tab]); },
      sendMessage(tabId, msg, cb) {
        sent.push({ tabId, msg });
        const result = msg.type === 'YTBP_PING' ? { ok: true, onStudio: true } : { ok: true, count: 2 };
        if (cb) cb(result);
        return undefined;
      }
    },
    scripting: { executeScript(_o, cb) { if (cb) cb([]); } },
    action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
    storage: { sync: { get(def, cb) { cb(def); }, set(_v, cb) { if (cb) cb(); } } }
  };
}
