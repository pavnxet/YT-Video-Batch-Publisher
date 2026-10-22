#!/usr/bin/env node
/*
 * build.mjs — assembles dist/chrome and dist/firefox from src/.
 *
 * No bundler dependency: the source files are plain scripts that share the
 * globalThis.YTBP namespace, so "bundling" is an ordered concatenation.
 * This is what lets one source tree ship to both browsers instead of the
 * original's hand-maintained (and already drifting) firefox/ copy.
 */
import { readFile, writeFile, mkdir, rm, cp, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (...p) => path.join(root, 'src', ...p);
const dist = (...p) => path.join(root, 'dist', ...p);

const BUNDLES = {
  'content.js': [
    'common/platform.js',
    'core/logger.js',
    'core/dom.js',
    'core/selectors.js',
    'core/settings.js',
    'core/messaging.js',
    'core/publisher.js',
    'core/sorter.js',
    'content/content.js'
  ],
  'background.js': [
    'common/platform.js',
    'core/logger.js',
    'core/settings.js',
    'core/messaging.js',
    'background/service-worker.js'
  ],
  'popup.js': [
    'common/platform.js',
    'core/logger.js',
    'core/settings.js',
    'core/messaging.js',
    'popup/popup.js'
  ],
  'options.js': [
    'common/platform.js',
    'core/logger.js',
    'core/settings.js',
    'options/options.js'
  ]
};

const STATIC = [
  ['popup/popup.html', 'popup.html'],
  ['popup/popup.css', 'popup.css'],
  ['options/options.html', 'options.html'],
  ['options/options.css', 'options.css'],
  ['ui/theme.css', 'theme.css']
];

async function bundle(files) {
  const parts = [];
  for (const rel of files) {
    const body = await readFile(src(rel), 'utf8');
    parts.push(`/* ---- ${rel} ---- */\n${body.trim()}\n`);
  }
  return `/* GENERATED FILE — edit src/ and re-run \`npm run build\`. */\n` + parts.join('\n');
}

async function buildTarget(target) {
  const out = dist(target);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  const manifest = JSON.parse(await readFile(path.join(root, 'manifests', `${target}.json`), 'utf8'));

  for (const [name, files] of Object.entries(BUNDLES)) {
    await writeFile(path.join(out, name), await bundle(files));
  }
  for (const [from, to] of STATIC) {
    await cp(src(from), path.join(out, to));
  }
  await cp(path.join(root, 'icons'), path.join(out, 'icons'), { recursive: true });
  await writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  const entries = await readdir(out);
  console.log(`✔ dist/${target}  (${entries.length} entries, v${manifest.version})`);
  return manifest;
}

async function main() {
  const targets = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const list = targets.length ? targets : ['chrome', 'firefox'];
  for (const t of list) {
    if (!existsSync(path.join(root, 'manifests', `${t}.json`))) {
      console.error(`✖ unknown target: ${t}`);
      process.exitCode = 1;
      continue;
    }
    await buildTarget(t);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
