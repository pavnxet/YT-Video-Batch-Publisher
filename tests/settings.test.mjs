import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from './helpers/env.mjs';

test('settings: sanitize fills every default', async () => {
  const { YTBP } = await makeEnv();
  assert.deepEqual(YTBP.settings.sanitize({}), YTBP.settings.DEFAULTS);
});

test('settings: sanitize rejects an unknown visibility', async () => {
  const { YTBP } = await makeEnv();
  assert.equal(YTBP.settings.sanitize({ defaultVisibility: 'Secret' }).defaultVisibility, 'Unlisted');
});

test('settings: sanitize clamps out-of-range numbers', async () => {
  const { YTBP } = await makeEnv();
  const s = YTBP.settings.sanitize({ actionDelayMs: 999999, maxRetries: -4, stepTimeoutMs: 5 });
  assert.equal(s.actionDelayMs, 10000);
  assert.equal(s.maxRetries, 0);
  assert.equal(s.stepTimeoutMs, 1000);
});

test('settings: sanitize coerces numeric strings', async () => {
  const { YTBP } = await makeEnv();
  assert.equal(YTBP.settings.sanitize({ actionDelayMs: '750' }).actionDelayMs, 750);
});

test('settings: load falls back to defaults without an extension API', async () => {
  const { YTBP } = await makeEnv();
  const s = await YTBP.settings.load();
  assert.equal(s.defaultVisibility, 'Unlisted');
});

test('settings: save merges, persists and notifies subscribers', async () => {
  const { YTBP } = await makeEnv();
  const seen = [];
  YTBP.settings.onChange((s) => seen.push(s));
  await YTBP.settings.save({ madeForKids: true, actionDelayMs: 900 });
  const back = await YTBP.settings.load();
  assert.equal(back.madeForKids, true);
  assert.equal(back.actionDelayMs, 900);
  assert.equal(seen.length, 1);
});

test('settings: reset restores defaults', async () => {
  const { YTBP } = await makeEnv();
  await YTBP.settings.save({ debug: true, actionDelayMs: 1234 });
  const s = await YTBP.settings.reset();
  assert.equal(s.debug, false);
  assert.equal(s.actionDelayMs, YTBP.settings.DEFAULTS.actionDelayMs);
});
