import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from './helpers/env.mjs';

const PLAYLIST_HTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>
  <div id="contents">
    <ytd-playlist-video-renderer data-name="Video 10"><a id="video-title">Video 10</a><div id="menu"><button></button></div></ytd-playlist-video-renderer>
    <ytd-playlist-video-renderer data-name="Video 2"><a id="video-title">Video 2</a><div id="menu"><button></button></div></ytd-playlist-video-renderer>
    <ytd-playlist-video-renderer data-name="Intro"><a id="video-title">Intro</a><div id="menu"><button></button></div></ytd-playlist-video-renderer>
    <ytd-playlist-video-renderer data-name="Intro"><a id="video-title">Intro</a><div id="menu"><button></button></div></ytd-playlist-video-renderer>
  </div>
</body></html>`;

/** Wire menu buttons so "Move to bottom" really reorders the list. */
function wirePlaylist(window) {
  const doc = window.document;
  const clicks = [];
  const contents = doc.getElementById('contents');

  doc.querySelectorAll('ytd-playlist-video-renderer').forEach((row) => {
    row.querySelector('#menu button').addEventListener('click', () => {
      const listbox = doc.createElement('tp-yt-paper-listbox');
      listbox.id = 'items';
      listbox.innerHTML =
        '<ytd-menu-service-item-renderer>Move to top</ytd-menu-service-item-renderer>' +
        '<ytd-menu-service-item-renderer>Move to bottom</ytd-menu-service-item-renderer>';
      doc.body.appendChild(listbox);
      const items = listbox.querySelectorAll('ytd-menu-service-item-renderer');
      const apply = (label) => {
        clicks.push(label);
        listbox.remove();
        if (label === 'Move to bottom') contents.appendChild(row);
        else contents.insertBefore(row, contents.firstChild);
      };
      items[0].addEventListener('click', () => apply('Move to top'));
      items[1].addEventListener('click', () => apply('Move to bottom'));
    });
  });
  return { clicks, contents };
}

async function setup(direction) {
  const env = await makeEnv(undefined, { html: PLAYLIST_HTML });
  const harness = wirePlaylist(env.window);
  const sorter = new env.YTBP.PlaylistSorter({
    settings: Object.assign({}, env.YTBP.settings.DEFAULTS, { actionDelayMs: 0, stepTimeoutMs: 400 }),
    direction,
    document: env.document
  });
  return { ...env, harness, sorter };
}

const order = (contents) => [...contents.children].map((n) => n.dataset.name);

test('sorter: natural compare orders numbers the way a human expects', async () => {
  const { YTBP } = await makeEnv();
  const cmp = YTBP.sorterInternals.naturalCompare;
  assert.ok(cmp('Video 2', 'Video 10') < 0);
  assert.ok(cmp('intro', 'Intro') === 0);
});

test('sorter: sorts the playlist ascending', async () => {
  const { sorter, harness } = await setup('asc');
  await sorter.run();
  assert.deepEqual(order(harness.contents), ['Intro', 'Intro', 'Video 2', 'Video 10']);
});

test('sorter: sorts the playlist descending', async () => {
  const { sorter, harness } = await setup('desc');
  await sorter.run();
  assert.deepEqual(order(harness.contents), ['Video 10', 'Video 2', 'Intro', 'Intro']);
});

test('sorter: REGRESSION — duplicate titles still move the correct rows', async () => {
  // The original looked each video up by name (`videos.find(v => v.name === name)`),
  // so with two rows named "Intro" it moved the same element twice and left the
  // other one stranded.
  const { sorter, harness } = await setup('asc');
  await sorter.run();
  const rows = [...harness.contents.children];
  const introRows = rows.filter((r) => r.dataset.name === 'Intro');
  assert.equal(introRows.length, 2);
  assert.ok(introRows[0] !== introRows[1], 'both Intro rows must survive as distinct elements');
});

test('sorter: finds menu items by label, not by fixed index', async () => {
  const { sorter, harness } = await setup('asc');
  await sorter.run();
  assert.ok(harness.clicks.every((c) => c === 'Move to bottom'));
  assert.equal(harness.clicks.length, 4);
});
