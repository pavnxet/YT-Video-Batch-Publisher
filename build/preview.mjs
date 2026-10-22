/*
 * preview.mjs — renders the popup and options pages in headless Chrome so the
 * UI can be eyeballed before shipping. Not part of the extension build.
 */
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'preview');
const DIST = path.join(ROOT, 'dist', 'chrome');

const STUB = `<script>
window.chrome = {
  runtime: {
    getManifest: () => ({ version: '2.0.0' }),
    sendMessage: (m, cb) => {
      const r = m.type === 'YTBP_PING' ? { ok: true, onStudio: true }
              : m.type === 'YTBP_SCAN' ? { ok: true, count: 3, titles: ['A','B','C'] }
              : { ok: true };
      if (cb) cb(r);
      return Promise.resolve(r);
    },
    onMessage: { addListener: () => {} },
    openOptionsPage: () => {}
  },
  storage: { sync: { get: (d, cb) => cb(d), set: (v, cb) => cb && cb() } }
};
</script>`;

async function stage() {
  await mkdir(OUT, { recursive: true });
  await cp(DIST, OUT, { recursive: true });
  for (const page of ['popup.html', 'options.html']) {
    const html = await readFile(path.join(DIST, page), 'utf8');
    await writeFile(path.join(OUT, page), html.replace('<script src=', STUB + '\n  <script src='));
  }
}

async function shoot(browser, { page, file, width, height, run }) {
  const tab = await browser.newPage();
  await tab.setViewport({ width, height, deviceScaleFactor: 2 });
  await tab.goto('file://' + path.join(OUT, page), { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 400));
  if (run) await tab.evaluate(run);
  await new Promise((r) => setTimeout(r, 400));
  await tab.screenshot({ path: path.join(OUT, file) });
  await tab.close();
  console.log('✔', file);
}

await stage();
const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/chromium-headless-shell',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb']
});

await shoot(browser, { page: 'popup.html', file: 'popup-idle.png', width: 344, height: 560 });
await shoot(browser, {
  page: 'popup.html', file: 'popup-running.png', width: 344, height: 620,
  run: `(() => {
    const t = globalThis.YTBP;
    t.popupInternals.onStatus({ phase: 'starting', total: 3, message: 'Publishing 3 draft(s) as Unlisted…' });
    t.popupInternals.onStatus({ phase: 'video-done', index: 1, total: 3, title: 'Weekend vlog #12', status: 'published' });
    t.popupInternals.onStatus({ phase: 'video-done', index: 2, total: 3, title: 'Gadget unboxing — Part 2', status: 'published' });
    t.popupInternals.onStatus({ phase: 'video-error', index: 3, total: 3, title: 'Q&A session', message: 'Edit-draft button not found' });
    document.getElementById('stop').classList.remove('hidden');
    document.getElementById('start').disabled = true;
    document.getElementById('start').textContent = 'Publishing…';
    document.getElementById('progressWrap').classList.remove('hidden');
  })()`
});
await shoot(browser, { page: 'options.html', file: 'options.png', width: 760, height: 900 });

// Dark theme — verifies the prefers-color-scheme tokens actually apply.
const dark = await browser.newPage();
await dark.setViewport({ width: 344, height: 560, deviceScaleFactor: 2 });
await dark.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
await dark.goto('file://' + path.join(OUT, 'popup.html'), { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 500));
await dark.screenshot({ path: path.join(OUT, 'popup-dark.png') });
await dark.close();
console.log('✔ popup-dark.png');

await browser.close();
