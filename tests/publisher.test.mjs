import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, STUDIO_HTML, wireStudio } from './helpers/env.mjs';

const FAST = { stepTimeoutMs: 400, actionDelayMs: 0, maxRetries: 0 };

async function setup(overrides = {}, wireOpts = {}) {
  const env = await makeEnv(undefined, { html: STUDIO_HTML });
  const harness = wireStudio(env.window, wireOpts);
  const settings = Object.assign({}, env.YTBP.settings.DEFAULTS, FAST, overrides);
  const events = [];
  const engine = new env.YTBP.PublishEngine({
    settings,
    visibility: overrides.visibility || 'Public',
    document: env.document,
    onProgress: (e) => events.push(e)
  });
  return { ...env, harness, settings, events, engine };
}

test('publisher: scan counts only rows with an edit-draft button', async () => {
  const { engine } = await setup();
  const result = await engine.scan();
  assert.equal(result.count, 2);
  // Spread into a Node-realm array: the engine returns a jsdom-realm array.
  assert.deepEqual([...result.titles].sort(), ['Alpha upload', 'Beta upload']);
});

test('publisher: run publishes every draft and reports a summary', async () => {
  const { engine, harness } = await setup();
  const summary = await engine.run();
  assert.equal(summary.total, 2);
  assert.equal(summary.published, 2);
  assert.equal(summary.failed, 0);
  assert.ok(harness.clicks.includes('Public'), 'expected the Public radio to be clicked');
  assert.ok(harness.clicks.includes("No, it's not made for kids"), 'expected made-for-kids = No');
  assert.ok(harness.clicks.includes('Save'));
});

test('publisher: REGRESSION — Private must not select the Public radio', async () => {
  // The original mapped Private->index 0 and Public->index 2, but YouTube lists
  // them Public, Unlisted, Private, so Private actually published as Public.
  const { engine, harness } = await setup({ visibility: 'Private' });
  await engine.run();
  assert.ok(harness.clicks.includes('Private'));
  assert.ok(!harness.clicks.includes('Public'), 'Private selection must never click the Public radio');
});

test('publisher: visibility is matched by label, not by index', async () => {
  const { engine, harness } = await setup({ visibility: 'Unlisted' });
  await engine.run();
  assert.ok(harness.clicks.includes('Unlisted'));
  assert.ok(!harness.clicks.includes('Public'));
  assert.ok(!harness.clicks.includes('Private'));
});

test('publisher: made-for-kids = true selects the "Yes" option', async () => {
  const { engine, harness } = await setup({ madeForKids: true });
  await engine.run();
  assert.ok(harness.clicks.includes("Yes, it's made for kids"));
  assert.ok(!harness.clicks.includes("No, it's not made for kids"));
});

test('publisher: dry run changes nothing', async () => {
  const { engine, harness, document } = await setup({ dryRun: true });
  const summary = await engine.run();
  assert.equal(summary.skipped, 2);
  assert.equal(summary.published, 0);
  assert.equal(harness.clicks.length, 0, 'dry run must not click anything');
  assert.equal(document.querySelector('ytcp-uploads-dialog'), null);
});

test('publisher: one broken video does not stop the batch (continueOnError)', async () => {
  const { engine, harness } = await setup({ continueOnError: true }, { breakRow: '1' });
  const summary = await engine.run();
  assert.equal(summary.total, 2);
  assert.equal(summary.published, 1, 'the healthy draft should still publish');
  assert.equal(summary.failed, 1);
  assert.ok(harness.clicks.includes('Public'));
});

test('publisher: a failed save is reported as an error, not a silent success', async () => {
  const { engine } = await setup({ maxRetries: 0 }, { saveFails: true });
  const summary = await engine.run();
  assert.equal(summary.published, 0);
  assert.equal(summary.failed, 2);
  assert.ok(summary.results.every((r) => r.status === 'error'));
});

test('publisher: retries the configured number of extra attempts', async () => {
  const { engine, harness } = await setup({ maxRetries: 2 }, { breakRow: '1' });
  await engine.run();
  // row1's edit button is clicked once per attempt: 1 + 2 retries = 3.
  const row1Clicks = harness.clicks.filter((c) => c === 'Edit draft').length;
  assert.ok(row1Clicks >= 3, `expected >=3 attempts, saw ${row1Clicks}`);
});

test('publisher: abort stops the batch mid-run', async () => {
  const env = await makeEnv(undefined, { html: STUDIO_HTML });
  wireStudio(env.window);
  const ctrl = new env.window.AbortController();
  let done = 0;
  const engine = new env.YTBP.PublishEngine({
    settings: Object.assign({}, env.YTBP.settings.DEFAULTS, FAST),
    visibility: 'Public',
    document: env.document,
    signal: ctrl.signal,
    onProgress: (e) => { if (e.phase === 'video-done') { done += 1; ctrl.abort(); } }
  });
  const summary = await engine.run();
  assert.equal(summary.cancelled, true);
  assert.equal(summary.published, 1);
  assert.equal(done, 1);
});

test('publisher: progress events carry phase, index and total', async () => {
  const { engine, events } = await setup();
  await engine.run();
  const phases = events.map((e) => e.phase);
  assert.ok(phases.includes('scanning'));
  assert.ok(phases.includes('starting'));
  assert.ok(phases.includes('video-start'));
  assert.ok(phases.includes('video-done'));
  assert.ok(phases.includes('finished'));
  const start = events.find((e) => e.phase === 'video-start');
  assert.equal(start.total, 2);
  assert.equal(start.index, 1);
});
