# YouTube Video Batch Publisher

A Chrome / Firefox extension that batch-publishes your **YouTube Studio drafts**
— set the visibility (Public, Unlisted or Private) once, click once, and watch
every draft go out with a live progress bar.

This is **version 2.0**: a ground-up rewrite of the 1.1 codebase. Every known
bug is fixed, the UI reports what it is doing, and the whole thing is covered by
a test suite.

---

## What's new in 2.0

| | v1.1 | v2.0 |
|---|---|---|
| Visibility selection | index into the radio list (Public ⇄ Private were **swapped**) | matched by label text |
| Error in one video | whole batch dies silently | caught, retried, reported; batch continues |
| Progress | none | progress bar + per-video log |
| Stop a run | impossible | Stop button (AbortSignal) |
| Settings | constants in the source file | options page, synced via `chrome.storage.sync` |
| Dry run | none | preview without changing anything |
| Playlist sort | unreachable without editing code; breaks on duplicate titles | selectable, duplicate-safe |
| Browser support | two hand-copied trees that had already drifted | one `src/`, `dist/chrome` + `dist/firefox` generated |
| Tests | none | 54 tests |
| Repo size | 46 MB `node_modules` committed | zero runtime dependencies |

Full breakdown: [`docs/BUG_REPORT.md`](docs/BUG_REPORT.md) · history:
[`CHANGELOG.md`](CHANGELOG.md).

---

## Install

### Chrome / Edge / Brave

1. `npm install && npm run build` (or use the pre-built `dist/chrome` folder).
2. Open `chrome://extensions/` and turn on **Developer mode**.
3. **Load unpacked** → select `dist/chrome`.

### Firefox

1. `npm install && npm run build`.
2. Open `about:debugging#/runtime/this-firefox`.
3. **Load Temporary Add-on…** → select `dist/firefox/manifest.json`.

Firefox needs `web-ext` to sign a permanent build:
`npx web-ext build -s dist/firefox`.

---

## Usage

1. Open [YouTube Studio → Content](https://studio.youtube.com/).
2. Click the extension icon.
3. Pick a visibility, optionally flip **Made for kids** or **Dry run**.
4. Click **Publish drafts**. Watch the progress bar; hit **Stop** any time.

The popup shows how many drafts it can see on the page. If it says *"Not on
Studio"*, you are on the wrong tab.

---

## Development

```bash
npm install        # dev-only: jsdom, for the tests
npm run build      # src/ -> dist/chrome and dist/firefox
npm run validate   # checks manifests, file references and bundle syntax
npm test           # 54 tests
npm run ci         # all three, in order
```

### Layout

```
src/
  common/platform.js   chrome.* / browser.* shim + promise wrapper
  core/
    dom.js             sleep / waitForElement / click — all AbortSignal-aware
    selectors.js       every YouTube selector, each with fallbacks
    settings.js        defaults, validation, chrome.storage persistence
    messaging.js       the popup ⇄ background ⇄ content message contract
    publisher.js       the batch-publish engine
    sorter.js          the playlist-sorting engine
  content/content.js   content-script entry point
  background/          MV3 service worker / event page
  popup/  options/  ui/
manifests/             chrome.json, firefox.json
build/                 build.mjs, validate.mjs, preview.mjs
tests/                 node:test + jsdom
```

`src/` files are plain scripts that hang off one `globalThis.YTBP` namespace, so
the "bundler" is an ordered concatenation — no build dependency to audit. The
tests evaluate the same files (and the built bundles) inside jsdom, so they
exercise the code that actually ships.

---

## Settings

Available from the popup's gear icon or the options page:

| Setting | Default | What it does |
|---|---|---|
| Default visibility | Unlisted | Pre-selected visibility |
| Made for kids | off | Answers YouTube's "made for kids" question |
| Action delay | 400 ms | Pause between videos |
| Step timeout | 10 000 ms | How long to wait for a UI element |
| Retries per video | 1 | Extra attempts after a failure |
| Continue on error | on | Keep going if one video fails |
| Auto-close share dialog | on | Dismiss the "video published" popup |
| Dry run | off | Preview only, changes nothing |
| Debug logging | off | Verbose console output |
| Theme | Match system | Light / dark / system |

---

## How it works

1. The popup asks the background worker for the active tab and checks it is
   `studio.youtube.com`.
2. The background worker makes sure the content script is alive (injecting it if
   the tab was already open when the extension was installed) and forwards the
   request.
3. The content script runs `PublishEngine`: it finds every `ytcp-video-row` with
   an edit-draft button, then for each one opens the draft, sets "made for kids",
   walks to the visibility step, picks the radio **whose label matches** the
   requested visibility, saves, and dismisses the share dialog.
4. Each step is timeout-bounded and cancellable; failures are retried and
   reported rather than swallowed.
5. Progress is streamed back to the popup, which renders a bar and a log.

---

## Limitations

- YouTube Studio's markup is not a public API. Selectors are listed in
  `src/core/selectors.js` with fallbacks; if YouTube ships a redesign, that is
  the one file to update.
- Only the drafts **visible on the current page** are processed — filter or
  scroll first if you have many.
- Playlist sorting requires you to be on the playlist page.

---

## Credits & license

Original concept by [pavnxet](https://github.com/pavnxet). Rewritten as 2.0.

MIT — see [`LICENSE`](LICENSE).

## Disclaimer

This extension automates actions in your own YouTube Studio account. Use it
responsibly; you are responsible for what gets published.
