/*
 * env.mjs — test harness.
 *
 * Builds a jsdom window and evaluates the real source modules into it, in the
 * same order the build script concatenates them. That means the tests exercise
 * the shipped code rather than a re-implementation.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const CONTENT_MODULES = [
  'common/platform.js',
  'core/logger.js',
  'core/dom.js',
  'core/selectors.js',
  'core/settings.js',
  'core/messaging.js',
  'core/publisher.js',
  'core/sorter.js'
];

const DEFAULT_HTML = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body></body></html>';

export async function makeEnv(modules = CONTENT_MODULES, { html = DEFAULT_HTML, url = 'https://studio.youtube.com/channel/UC/videos/upload' } = {}) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  for (const rel of modules) {
    const code = await readFile(path.join(ROOT, 'src', rel), 'utf8');
    window.eval(code);
  }
  return { dom, window, YTBP: window.YTBP, document: window.document };
}

/** Load a generated bundle (dist/<target>/<file>) into a fresh jsdom window. */
export async function loadBundle(target, file, options = {}) {
  const dom = new JSDOM(options.html || DEFAULT_HTML, {
    url: options.url || 'https://studio.youtube.com/channel/UC/videos/upload',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const code = await readFile(path.join(ROOT, 'dist', target, file), 'utf8');
  dom.window.eval(code);
  return { dom, window: dom.window, YTBP: dom.window.YTBP };
}

/** A fake YouTube Studio content page: two drafts + one non-draft. */
export const STUDIO_HTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>
  <ytcp-video-row id="row1">
    <a id="video-title">Beta upload</a>
    <button class="edit-draft-button" data-row="1">Edit draft</button>
  </ytcp-video-row>
  <ytcp-video-row id="row2">
    <a id="video-title">Alpha upload</a>
    <button class="edit-draft-button" data-row="2">Edit draft</button>
  </ytcp-video-row>
  <ytcp-video-row id="row3">
    <a id="video-title">Already live</a>
  </ytcp-video-row>
</body></html>`;

/**
 * Wire a fake Studio DOM to behave like the real one:
 *  - clicking an edit-draft button opens the draft dialog
 *  - the dialog's visibility step reveals the visibility radios
 *  - saving shows the success element and the share dialog
 * Records every label the engine clicked into `clicks`.
 */
export function wireStudio(window, { breakRow = null, saveFails = false } = {}) {
  const doc = window.document;
  const clicks = [];
  const record = (label) => clicks.push(label);

  const dialogHtml = `
    <ytcp-uploads-dialog>
      <div id="made-for-kids-group">
        <tp-yt-paper-radio-button>Yes, it's made for kids</tp-yt-paper-radio-button>
        <tp-yt-paper-radio-button>No, it's not made for kids</tp-yt-paper-radio-button>
      </div>
      <div id="step-badge-3" role="button">Visibility</div>
      <ytcp-button id="done-button">Save</ytcp-button>
    </ytcp-uploads-dialog>`;

  const attach = (root, el) => {
    el.addEventListener('click', () => {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      record(text);
      if (el.classList.contains('edit-draft-button')) {
        if (breakRow && el.dataset.row === breakRow) return; // simulate "dialog never opens"
        openDialog();
      }
      if (el.id === 'step-badge-3') revealVisibility(root);
      if (el.id === 'done-button') finishSave(root);
    });
  };

  function openDialog() {
    const holder = doc.createElement('div');
    holder.innerHTML = dialogHtml;
    const dialog = holder.firstElementChild;
    doc.body.appendChild(dialog);
    dialog.querySelectorAll('tp-yt-paper-radio-button, #step-badge-3, #done-button').forEach((n) => attach(dialog, n));
  }

  function revealVisibility(dialog) {
    if (dialog.querySelector('#visibility-radios')) return;
    const group = doc.createElement('div');
    group.id = 'visibility-radios';
    group.innerHTML = `
      <tp-yt-paper-radio-button>Public</tp-yt-paper-radio-button>
      <tp-yt-paper-radio-button>Unlisted</tp-yt-paper-radio-button>
      <tp-yt-paper-radio-button>Private</tp-yt-paper-radio-button>`;
    dialog.appendChild(group);
    group.querySelectorAll('tp-yt-paper-radio-button').forEach((n) => attach(dialog, n));
  }

  function finishSave(dialog) {
    if (!saveFails) {
      const ok = doc.createElement('ytcp-video-thumbnail-with-info');
      doc.body.appendChild(ok);
      const share = doc.createElement('ytcp-video-share-dialog');
      share.innerHTML = '<ytcp-button aria-label="Close">x</ytcp-button>';
      doc.body.appendChild(share);
      const close = share.querySelector('[aria-label="Close"]');
      close.addEventListener('click', () => { record('close-share'); share.remove(); });
      attach(dialog, close);
    }
    dialog.remove();
  }

  doc.querySelectorAll('.edit-draft-button').forEach((b) => attach(doc, b));
  return { clicks };
}
