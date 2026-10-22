/*
 * legacy-regression.test.mjs
 *
 * These tests encode the *behaviour of the original v1.1 code* so the fixes in
 * v2.0 are verifiable rather than asserted. Each one first reproduces the old
 * defect, then shows the new code doing the right thing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, STUDIO_HTML, wireStudio } from './helpers/env.mjs';

/* ------------------------------------------------------------------ *
 * 1. Visibility radio selected by array index
 * ------------------------------------------------------------------ */

/** Exactly what v1.1 did: map the name to an index and index into the group. */
const V1_VISIBILITY_PUBLISH_ORDER = { Private: 0, Unlisted: 1, Public: 2 };
function v1PickVisibility(radios, visibility) {
  return radios[V1_VISIBILITY_PUBLISH_ORDER[visibility]];
}

test('legacy: v1.1 index mapping selects the WRONG visibility radio', async () => {
  const { document } = await makeEnv();
  // YouTube Studio lists visibility in this order.
  document.body.innerHTML = `
    <div id="visibility-radios">
      <tp-yt-paper-radio-button>Public</tp-yt-paper-radio-button>
      <tp-yt-paper-radio-button>Unlisted</tp-yt-paper-radio-button>
      <tp-yt-paper-radio-button>Private</tp-yt-paper-radio-button>
    </div>`;
  const radios = [...document.querySelectorAll('#visibility-radios tp-yt-paper-radio-button')];
  const label = (el) => el.textContent.trim();

  assert.equal(label(v1PickVisibility(radios, 'Public')), 'Private', 'v1.1 turned a Public publish into Private');
  assert.equal(label(v1PickVisibility(radios, 'Private')), 'Public', 'v1.1 turned a Private publish into Public');
  assert.equal(label(v1PickVisibility(radios, 'Unlisted')), 'Unlisted', 'Unlisted happened to be correct');
});

test('v2.0: the same DOM selects the correct radio for every option', async () => {
  const { YTBP, document } = await makeEnv();
  document.body.innerHTML = `
    <div id="visibility-radios">
      <tp-yt-paper-radio-button>Public</tp-yt-paper-radio-button>
      <tp-yt-paper-radio-button>Unlisted</tp-yt-paper-radio-button>
      <tp-yt-paper-radio-button>Private</tp-yt-paper-radio-button>
    </div>`;
  const group = document.getElementById('visibility-radios');
  for (const name of ['Public', 'Unlisted', 'Private']) {
    const picked = YTBP.publisherInternals.pickRadioByText(
      group, YTBP.selectors.text.visibility[name], YTBP.settings.VISIBILITIES.indexOf(name)
    );
    assert.equal(picked.textContent.trim(), name);
  }
});

test('v2.0: survives YouTube reordering the radios', async () => {
  const { YTBP, document } = await makeEnv();
  document.body.innerHTML = `
    <div id="visibility-radios">
      <tp-yt-paper-radio-button>Private</tp-yt-paper-radio-button>
      <tp-yt-paper-radio-button>Public</tp-yt-paper-radio-button>
      <tp-yt-paper-radio-button>Unlisted</tp-yt-paper-radio-button>
    </div>`;
  const group = document.getElementById('visibility-radios');
  const picked = YTBP.publisherInternals.pickRadioByText(group, YTBP.selectors.text.visibility.Public, 0);
  assert.equal(picked.textContent.trim(), 'Public');
});

/* ------------------------------------------------------------------ *
 * 2. Playlist sorting by name lookup
 * ------------------------------------------------------------------ */

/** Exactly what v1.1 did: re-find each video by name. */
function v1ResolveByName(videos, sortedNames) {
  return sortedNames.map((name) => videos.find((v) => v.name === name));
}

test('legacy: v1.1 name lookup returns the same element twice for duplicate titles', async () => {
  const videos = [{ id: 'a', name: 'Intro' }, { id: 'b', name: 'Intro' }, { id: 'c', name: 'Zeta' }];
  const sortedNames = ['Intro', 'Intro', 'Zeta'];
  const resolved = v1ResolveByName(videos, sortedNames);
  assert.equal(resolved[0].id, 'a');
  assert.equal(resolved[1].id, 'a', 'the second Intro resolves to the first element — row b is never moved');
  assert.ok(!resolved.some((v) => v.id === 'b'));
});

test('v2.0: sorting keeps every element reference distinct', async () => {
  const { YTBP } = await makeEnv();
  const rows = [{ id: 'a', name: 'Intro' }, { id: 'b', name: 'Intro' }, { id: 'c', name: 'Zeta' }];
  const sorted = rows.slice().sort((x, y) => YTBP.sorterInternals.naturalCompare(x.name, y.name));
  assert.deepEqual(sorted.map((r) => r.id), ['a', 'b', 'c']);
});

/* ------------------------------------------------------------------ *
 * 3. A missing element used to throw and kill the whole batch
 * ------------------------------------------------------------------ */

test('legacy: v1.1 threw a TypeError when the draft dialog never appeared', () => {
  // `new DraftModal(await waitForElement(...))` with a null result, then
  // `waitForElement(selector, null)` -> null.querySelector(...)
  const nullModal = null;
  assert.throws(() => nullModal.querySelector('#made-for-kids-group'), TypeError);
});

test('v2.0: a missing dialog becomes a caught, reported error', async () => {
  const env = await makeEnv(undefined, { html: STUDIO_HTML });
  wireStudio(env.window, { breakRow: '1' });
  const engine = new env.YTBP.PublishEngine({
    settings: Object.assign({}, env.YTBP.settings.DEFAULTS, { stepTimeoutMs: 300, actionDelayMs: 0, maxRetries: 0 }),
    visibility: 'Public',
    document: env.document
  });
  const summary = await engine.run(); // must not reject
  assert.equal(summary.failed, 1);
  assert.equal(summary.published, 1);
  assert.match(summary.results.find((r) => r.status === 'error').message, /did not open|not found/i);
});

/* ------------------------------------------------------------------ *
 * 4. Made-for-kids radio was located by :nth-child
 * ------------------------------------------------------------------ */

test('legacy: v1.1 :nth-child lookup selects the wrong option once the group has any other child', async () => {
  const { document } = await makeEnv();
  document.body.innerHTML = `
    <div id="made-for-kids-group">
      <div class="header">Made for kids?</div>
      <tp-yt-paper-radio-button>Yes, it's made for kids</tp-yt-paper-radio-button>
      <tp-yt-paper-radio-button>No, it's not made for kids</tp-yt-paper-radio-button>
    </div>`;
  const group = document.getElementById('made-for-kids-group');
  // v1.1 asked for `tp-yt-paper-radio-button:nth-child(2)` when the answer should
  // be "No". The header shifts everything down by one, so it lands on "Yes".
  const v1 = group.querySelector('tp-yt-paper-radio-button:nth-child(2)');
  assert.ok(v1, 'the v1.1 selector matched something');
  assert.equal(v1.textContent.trim(), "Yes, it's made for kids",
    'v1.1 answered the opposite of what the user asked for');
});

test('v2.0: made-for-kids is found by its label regardless of position', async () => {
  const { YTBP, document } = await makeEnv();
  document.body.innerHTML = `
    <div id="made-for-kids-group">
      <div class="header">Made for kids?</div>
      <tp-yt-paper-radio-button>Yes, it's made for kids</tp-yt-paper-radio-button>
      <tp-yt-paper-radio-button>No, it's not made for kids</tp-yt-paper-radio-button>
    </div>`;
  const group = document.getElementById('made-for-kids-group');
  const no = YTBP.publisherInternals.pickRadioByText(group, YTBP.selectors.text.madeForKidsNo, 1);
  assert.equal(no.textContent.trim(), "No, it's not made for kids");
});
