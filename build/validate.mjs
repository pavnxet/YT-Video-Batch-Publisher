#!/usr/bin/env node
/*
 * validate.mjs — post-build verification.
 *
 * 1. every file the manifest references actually exists in dist/
 * 2. required manifest fields are present and sane for MV3
 * 3. each generated bundle parses as valid JavaScript (node --check)
 * 4. the HTML pages reference only files that exist
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const notes = [];

function fail(msg) { problems.push(msg); }
function ok(msg) { notes.push(msg); }

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function collectRefs(manifest) {
  const refs = new Set();
  const push = (v) => { if (typeof v === 'string') refs.add(v); };
  push(manifest.action?.default_popup);
  Object.values(manifest.icons || {}).forEach(push);
  Object.values(manifest.action?.default_icon || {}).forEach(push);
  push(manifest.background?.service_worker);
  (manifest.background?.scripts || []).forEach(push);
  (manifest.content_scripts || []).forEach((cs) => (cs.js || []).forEach(push));
  push(manifest.options_ui?.page);
  return [...refs];
}

async function validateTarget(target) {
  const dir = path.join(root, 'dist', target);
  if (!(await exists(dir))) { fail(`${target}: dist folder missing — run the build first`); return; }

  let manifest;
  try {
    manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
  } catch (err) {
    fail(`${target}: manifest.json is not valid JSON (${err.message})`);
    return;
  }

  if (manifest.manifest_version !== 3) fail(`${target}: manifest_version must be 3`);
  if (!manifest.name) fail(`${target}: missing name`);
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version || '')) fail(`${target}: version "${manifest.version}" is not semver`);

  const background = manifest.background || {};
  const hasWorker = !!background.service_worker;
  const hasScripts = Array.isArray(background.scripts) && background.scripts.length > 0;
  if (!hasWorker && !hasScripts) fail(`${target}: no background entry point`);
  if (target === 'chrome' && !hasWorker) fail('chrome: MV3 requires background.service_worker');
  if (target === 'firefox' && !hasScripts && !hasWorker) fail('firefox: no background entry point');
  if (target === 'firefox' && !manifest.browser_specific_settings?.gecko?.id) fail('firefox: missing browser_specific_settings.gecko.id');

  // The two legacy store artifacts must not be present in a source build.
  if (manifest.update_url) fail(`${target}: "update_url" belongs to a published store build, not the source repo`);
  if (manifest.key) fail(`${target}: hard-coded "key" should not ship in the source build`);

  for (const ref of await collectRefs(manifest)) {
    if (!(await exists(path.join(dir, ref)))) fail(`${target}: manifest references missing file "${ref}"`);
  }

  // Every content script match must be a real match pattern.
  for (const cs of manifest.content_scripts || []) {
    for (const m of cs.matches || []) {
      if (!/^(\*|https?|file|ftp):\/\//.test(m)) fail(`${target}: bad match pattern "${m}"`);
    }
  }

  // Syntax-check the bundles.
  for (const f of ['content.js', 'background.js', 'popup.js', 'options.js']) {
    const file = path.join(dir, f);
    if (!(await exists(file))) { fail(`${target}: missing bundle ${f}`); continue; }
    try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); }
    catch (err) { fail(`${target}: ${f} failed syntax check — ${String(err.stderr || err).trim()}`); }
  }

  // HTML <link>/<script> references resolve.
  for (const page of ['popup.html', 'options.html']) {
    const file = path.join(dir, page);
    if (!(await exists(file))) { fail(`${target}: missing ${page}`); continue; }
    const html = await readFile(file, 'utf8');
    const refs = [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map((m) => m[1]);
    for (const ref of refs) {
      if (!(await exists(path.join(dir, ref)))) fail(`${target}: ${page} references missing "${ref}"`);
    }
    if (!/<meta charset="UTF-8">/i.test(html)) fail(`${target}: ${page} missing UTF-8 charset`);
  }

  ok(`${target}: v${manifest.version}, ${(await readdir(dir)).length} entries`);
}

/**
 * The docs site is hand-written HTML served by GitHub Pages straight from docs/.
 * That means there is no build step to catch a broken link, so check it here.
 */
async function validateDocs() {
  const dir = path.join(root, 'docs');
  if (!(await exists(dir))) { fail('docs/: missing documentation site'); return; }

  if (!(await exists(path.join(dir, '.nojekyll')))) {
    fail('docs/: .nojekyll missing — Pages would run Jekyll over the static site');
  }

  const pages = (await readdir(dir)).filter((f) => f.endsWith('.html')).sort();
  if (!pages.includes('index.html')) fail('docs/: no index.html — Pages would have no home page');

  const canonical = new Map();
  const siteBase = 'https://pavnxet.github.io/YT-Video-Batch-Publisher/';

  for (const page of pages) {
    const html = await readFile(path.join(dir, page), 'utf8');

    if (!/<meta charset="UTF-8">/i.test(html)) fail(`docs/${page}: missing UTF-8 charset`);
    if (!/<title>[^<]{10,}<\/title>/i.test(html)) fail(`docs/${page}: missing or too-short <title>`);
    if (!/<meta name="description" content="[^"]{40,}"/i.test(html)) fail(`docs/${page}: missing meta description`);
    if (!/<meta name="viewport"/i.test(html)) fail(`docs/${page}: missing viewport meta`);
    if (!/<html lang="/i.test(html)) fail(`docs/${page}: missing lang attribute`);

    const can = html.match(/<link rel="canonical" href="([^"]+)"/);
    if (!can) fail(`docs/${page}: missing canonical link`);
    else {
      if (canonical.has(can[1])) fail(`docs/${page}: canonical duplicates docs/${canonical.get(can[1])}`);
      canonical.set(can[1], page);
      if (!can[1].startsWith(siteBase)) fail(`docs/${page}: canonical "${can[1]}" is outside ${siteBase}`);
    }

    // Local references must resolve inside docs/.
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
    for (const ref of refs) {
      if (/^(https?:|mailto:|#|data:)/.test(ref)) continue;
      const clean = ref.split('#')[0].split('?')[0];
      if (!clean) continue;
      if (!(await exists(path.join(dir, clean)))) fail(`docs/${page}: broken local reference "${ref}"`);
    }
  }

  // sitemap must match the pages that actually exist.
  const sitemap = await readFile(path.join(dir, 'sitemap.xml'), 'utf8');
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const page of pages) {
    const url = siteBase + (page === 'index.html' ? '' : page);
    if (!locs.includes(url)) fail(`docs/sitemap.xml: missing entry for ${page}`);
  }
  for (const loc of locs) {
    const rel = loc.replace(siteBase, '') || 'index.html';
    if (!pages.includes(rel)) fail(`docs/sitemap.xml: "${loc}" does not match a page`);
  }

  ok(`docs: ${pages.length} pages, all local references resolve`);
}

const targets = process.argv.slice(2).filter((a) => !a.startsWith('-'));
for (const t of (targets.length ? targets : ['chrome', 'firefox'])) await validateTarget(t);
await validateDocs();

notes.forEach((n) => console.log('✔', n));
if (problems.length) {
  problems.forEach((p) => console.error('✖', p));
  process.exit(1);
}
console.log(`✔ validation passed (${notes.length} targets)`);
