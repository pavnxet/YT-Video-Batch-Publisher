import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from './helpers/env.mjs';

test('dom: sleep resolves after the delay', async () => {
  const { YTBP } = await makeEnv();
  const t0 = Date.now();
  await YTBP.dom.sleep(40);
  assert.ok(Date.now() - t0 >= 30);
});

test('dom: sleep rejects with AbortError when the signal fires', async () => {
  const { YTBP, window } = await makeEnv();
  const ctrl = new window.AbortController();
  const p = YTBP.dom.sleep(1000, ctrl.signal);
  ctrl.abort();
  await assert.rejects(p, (err) => err.name === 'AbortError');
});

test('dom: waitForElement returns an existing element immediately', async () => {
  const { YTBP, document } = await makeEnv();
  document.body.innerHTML = '<div id="target">hi</div>';
  const el = await YTBP.dom.waitForElement('#target', { timeout: 200 });
  assert.equal(el.textContent, 'hi');
});

test('dom: waitForElement resolves when the element appears later', async () => {
  const { YTBP, document } = await makeEnv();
  setTimeout(() => { document.body.innerHTML = '<span id="late">x</span>'; }, 60);
  const el = await YTBP.dom.waitForElement('#late', { timeout: 1000 });
  assert.ok(el, 'expected the late element to be found');
});

test('dom: waitForElement returns null (does not throw) on timeout', async () => {
  const { YTBP } = await makeEnv();
  const el = await YTBP.dom.waitForElement('#nope', { timeout: 80 });
  assert.equal(el, null);
});

test('dom: waitForAny returns the first matching fallback selector', async () => {
  const { YTBP, document } = await makeEnv();
  document.body.innerHTML = '<div class="second"></div>';
  const hit = await YTBP.dom.waitForAny(['.first', '.second'], { timeout: 200 });
  assert.equal(hit.selector, '.second');
});

test('dom: click dispatches exactly one click event', async () => {
  const { YTBP, document } = await makeEnv();
  document.body.innerHTML = '<button id="b">go</button>';
  let count = 0;
  document.getElementById('b').addEventListener('click', () => { count += 1; });
  YTBP.dom.click(document.getElementById('b'));
  assert.equal(count, 1);
});

test('dom: click tolerates null', async () => {
  const { YTBP } = await makeEnv();
  assert.equal(YTBP.dom.click(null), false);
});

test('dom: textOf normalises whitespace', async () => {
  const { YTBP, document } = await makeEnv();
  document.body.innerHTML = '<p id="p">  Hello \n\n  world </p>';
  assert.equal(YTBP.dom.textOf(document.getElementById('p')), 'Hello world');
});

test('dom: isVisible respects inline display:none', async () => {
  const { YTBP, document } = await makeEnv();
  document.body.innerHTML = '<div id="hidden" style="display:none">x</div><div id="shown">y</div>';
  assert.equal(YTBP.dom.isVisible(document.getElementById('hidden')), false);
  assert.equal(YTBP.dom.isVisible(document.getElementById('shown')), true);
});
