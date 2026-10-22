import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFile(path.join(ROOT, p), 'utf8');

for (const target of ['chrome', 'firefox']) {
  test(`manifest(${target}): is valid JSON with the required MV3 fields`, async () => {
    const m = JSON.parse(await read(`manifests/${target}.json`));
    assert.equal(m.manifest_version, 3);
    assert.equal(m.version, '2.0.0');
    assert.ok(m.name && m.description);
    assert.ok(Array.isArray(m.permissions) && m.permissions.includes('storage'));
    assert.ok(Array.isArray(m.host_permissions));
    assert.ok(m.host_permissions.every((h) => /^https:\/\/studio\.youtube\.com\//.test(h)),
      'host permissions must be scoped to studio.youtube.com');
    assert.ok(m.action.default_popup.endsWith('.html'));
    assert.ok(m.options_ui.page.endsWith('.html'));
    assert.equal(m.content_scripts.length, 1);
    assert.deepEqual(m.content_scripts[0].matches, ['https://studio.youtube.com/*']);
  });

  test(`manifest(${target}): carries no store-only artifacts`, async () => {
    const m = JSON.parse(await read(`manifests/${target}.json`));
    assert.equal(m.update_url, undefined, 'update_url belongs to a published build');
    assert.equal(m.key, undefined, 'hard-coded key must not ship in the source');
  });
}

test('manifest(firefox): declares a gecko id', async () => {
  const m = JSON.parse(await read('manifests/firefox.json'));
  assert.ok(m.browser_specific_settings.gecko.id);
  assert.ok(m.background.scripts.length > 0);
});

test('manifest(chrome): uses a service worker, not a background page', async () => {
  const m = JSON.parse(await read('manifests/chrome.json'));
  assert.equal(m.background.service_worker, 'background.js');
  assert.equal(m.background.scripts, undefined);
});

test('repo: no committed build junk, and no runtime dependencies', async () => {
  const top = await readdir(ROOT);
  assert.ok(!top.includes('_metadata'), '_metadata is a Chrome Web Store artifact, not source');
  assert.ok(!top.includes('firefox') || !(await exists(path.join(ROOT, 'firefox', 'script.js'))),
    'the duplicated firefox/ tree must be gone — dist/ is generated instead');

  const ignore = await read('.gitignore');
  assert.match(ignore, /^node_modules\/$/m, 'node_modules must be gitignored');
  assert.match(ignore, /^dist\/$/m, 'build output must be gitignored');
  assert.match(ignore, /_metadata\/|\.crx|\.pem/, 'store artifacts must be gitignored');

  const pkg = JSON.parse(await read('package.json'));
  assert.ok(!pkg.dependencies || Object.keys(pkg.dependencies).length === 0,
    'the extension must ship with zero runtime dependencies');
});

async function exists(p) {
  try { await (await import('node:fs/promises')).stat(p); return true; } catch { return false; }
}
