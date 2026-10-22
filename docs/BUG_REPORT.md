# Bug report & analysis — `pavnxet/YT-Video-Batch-Publisher` v1.1

Audit of the repository as it stood before the 2.0 rewrite. Every finding below
was read out of the source; the ones marked **verified** are additionally
reproduced by a test in `tests/legacy-regression.test.mjs`.

Severity: **Critical** (silently does the wrong thing to the user's channel) ·
**High** (breaks the feature / leaks / loses data) · **Medium** (unreliable or
unusable in real conditions) · **Low** (hygiene, maintainability, a11y).

---

## 1. What the repository was

A browser extension that batch-publishes YouTube Studio drafts.

| Path | Purpose |
|---|---|
| `manifest.json`, `background.js`, `popup.html`, `popup.js`, `script.js` | Chrome MV3 build |
| `firefox/…` | a second, hand-copied Firefox build |
| `icons/`, `firefox/icons/` | two icon sets |
| `_metadata/` | Chrome Web Store signing artifacts |
| `node_modules/` | 46 MB / 165 packages, committed |
| `.github/workflows/super-linter.yml` | CI |
| `package.json` / `package-lock.json` | one devDependency (`addons-linter`) |

Total 28 tracked files (excluding `node_modules`).

---

## 2. Findings

### BUG-01 — Visibility is chosen by array index, so Public and Private are swapped · **Critical** · verified

```js
const VISIBILITY_PUBLISH_ORDER = { 'Private': 0, 'Unlisted': 1, 'Public': 2 };
// …
const value = VISIBILITY_PUBLISH_ORDER[VISIBILITY];
return [...group.querySelectorAll(RADIO_BUTTON_SELECTOR)][value];
```

YouTube Studio presents visibility as **Public, Unlisted, Private**. The map
assumes the reverse order, so:

* choosing **Public** clicks radio index 2 → **Private**
* choosing **Private** clicks radio index 0 → **Public**

The failure is silent and asymmetric in the worst possible direction: a video the
user asked to keep private can be published publicly. `tests/legacy-regression.test.mjs`
reproduces this against a Public/Unlisted/Private DOM.

**Fix:** select the radio whose visible label matches the requested visibility
(`pickRadioByText`); the index is only a last-resort fallback, using the correct
order. Verified by tests, including one where YouTube has reordered the radios.

---

### BUG-02 — Draft rows are detected with a 20 ms timeout · **High**

```js
get editDraftButton() {
  return waitForElement(DRAFT_BUTTON_SELECTOR, this.raw, 20);   // 20 ms
}
```

`TIMEOUT_STEP_MS` is also 20, so this performs at most one DOM query. Any draft
that has not finished rendering — or any row that needs a moment — is treated as
"not a draft" and skipped, with no warning. Combined with a single brittle
selector (`.edit-draft-button`), this is the most likely cause of "the extension
only published some of my videos".

**Fix:** configurable `stepTimeoutMs` (default 10 s) plus a selector fallback list.

---

### BUG-03 — Configuration is smuggled through a page global · **High**

```js
// background.js
func: (vis) => { window.__YT_BATCH_PUBLISHER_VISIBILITY__ = vis; }, args: [visibility]
// script.js
const VISIBILITY = window.__YT_BATCH_PUBLISHER_VISIBILITY__ || 'Unlisted';
```

Three problems: (a) the value is read once at script load, so a stale value from
a previous run is used if the two `executeScript` calls ever race or the script
is injected by any other path; (b) it writes a predictable global into the page's
`window`, which the page (or any other extension) can read and overwrite;
(c) it is never cleaned up.

**Fix:** options are passed in the message and held by the content script. No
page globals.

---

### BUG-04 — No error handling; one failure kills the whole batch · **High** · verified

```js
async function publishDrafts() {
  for (let video of videos) {
    const draft = await video.openDraft();      // may return DraftModal(null)
    await draft.selectMadeForKids();            // -> null.querySelector(...) -> TypeError
```

`waitForElement` returns `null` on timeout, and the result is wrapped in a modal
object without a check. The next call dereferences `null` and throws, which
rejects out of `publishDrafts()` — there is no `try`/`catch` anywhere. The batch
stops mid-way and the user is told nothing: not which videos were published, not
which were skipped, not why.

**Fix:** per-video `try`/`catch`, configurable retries, `continueOnError`, and a
summary (`published` / `skipped` / `failed` + per-video messages) streamed to the
popup.

---

### BUG-05 — MutationObserver leak and a promise that can hang forever · **High**

```js
function autoClosePublishPopupInstant(onClose) {
  const observer = new MutationObserver(() => { /* … */ observer.disconnect(); … });
  observer.observe(document.body, { childList: true, subtree: true });
}
class SuccessDialog {
  async close() {
    return new Promise(async resolve => {          // ← async executor
      autoClosePublishPopupInstant(() => { done = true; resolve(true); });
      setTimeout(async () => { if (done) return; await tryClosePublishPopupFallback(); resolve(true); }, 400);
    });
  }
}
```

* If the fallback path wins, `observer.disconnect()` is **never called**. A new
  observer is created for every published video, each re-running a query on every
  DOM mutation of `document.body` for the lifetime of the tab. Over a 100-video
  batch that is 100 live observers.
* `new Promise(async resolve => …)` is a known anti-pattern: an exception thrown
  inside the executor is swallowed and the promise **never settles**, so
  `await dialog.close()` hangs and the batch stalls with no error.
* `resolve(true)` is returned even on the fallback path that failed to close the
  popup, so callers cannot tell whether it worked.

**Fix:** no observers at all — a bounded wait for the dialog with an Escape-key
fallback, and a plain `async` method.

---

### BUG-06 — Brittle and over-broad selectors · **High**

| Constant | Value | Problem |
|---|---|---|
| `DRAFT_MODAL_SELECTOR` | `.style-scope.ytcp-uploads-dialog` | `.style-scope` is a Polymer implementation detail |
| `SORTING_MENU_BUTTON_SELECTOR` | `'button'` | matches the *first* button in the row, usually not the menu |
| `DIALOG_CLOSE_BUTTON_SELECTOR` | `tp-yt-iron-icon` | declared but never used |
| `SUCCESS_ELEMENT_SELECTOR` | `ytcp-video-thumbnail-with-info` | weak "did it save?" signal |
| made-for-kids radio | `tp-yt-paper-radio-button:nth-child(n)` | positional, breaks on any sibling element |

The `:nth-child` one is verified in the test suite: once `#made-for-kids-group`
contains any other child (a heading, a description), `nth-child(2)` — the code's
"**No**" — lands on "**Yes, it's made for kids**". The extension answers the
opposite of what the user asked.

**Fix:** every selector lives in `src/core/selectors.js` as an ordered fallback
list; radios are matched by label, not position.

---

### BUG-07 — Playlist sort moves the wrong row for duplicate titles · **Medium** · verified

```js
const video = videos.find((v) => v.name === name);
```

With two videos titled "Intro", `find` always returns the first, so the first is
moved twice and the second is never moved. Sorting silently corrupts the order.
Reproduced in the test suite.

**Fix:** sort the array of element references instead of re-looking them up by name.

---

### BUG-08 — Playlist menu items clicked by fixed index · **Medium**

```js
const MOVE_TO_TOP_INDEX = 4;
const MOVE_TO_BOTTOM_INDEX = 5;
```

These positions are not part of any contract. If YouTube adds or reorders an
entry, or the playlist is not owned by the user (fewer entries), `click()` receives
`undefined` and — because `click()` starts with `if (!element) return;` — silently
does nothing while the loop reports success.

**Fix:** match the menu item by its label ("Move to bottom"), with the index only
as a fallback.

---

### BUG-09 — Deprecated, non-composed click events · **Medium**

```js
const event = document.createEvent('MouseEvents');
event.initMouseEvent('mousedown', true, false, window, 0, …);
```

`createEvent`/`initMouseEvent` are deprecated, the event is not `composed: true`
so it does not cross shadow-DOM boundaries — and YouTube's Polymer components are
shadow-DOM based — and the `catch` block swallows every failure.

**Fix:** `MouseEvent` constructor with `composed: true`, dispatching
pointer + mouse + click, exactly once each.

---

### BUG-10 — No progress, no feedback, no way to stop · **Medium**

The popup sends one message and closes. There is no progress, no result, no
error surface and no cancel. A long batch gives the user nothing to look at and
no way out except closing the tab.

**Fix:** progress events (`scanning → starting → video-start → video-step →
video-done/finished`), a progress bar, a live log and a Stop button wired to an
`AbortController`.

---

### BUG-11 — The target tab is never validated · **Medium**

```js
chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
  chrome.scripting.executeScript({ target: {tabId: tabs[0].id}, … }, () => { … });
});
```

No check that `tabs` is non-empty, no check that the tab is YouTube Studio, and
no `chrome.runtime.lastError` check on either `executeScript` call. On any other
page the script is injected and fails silently; on `chrome://` pages the
injection throws and the error is discarded.

**Fix:** validate the tab and its URL, surface a specific message, and inject the
content script on demand if it is not already answering.

---

### BUG-12 — Settings are compile-time constants · **Medium**

`MADE_FOR_KIDS` and `VISIBILITY` are `const`s at the top of `script.js`, under a
comment that reads "you're safe to edit this". The file ships inside a packaged
extension, so in practice no user can edit it, and nothing persists.

**Fix:** options page + `chrome.storage.sync`, with validation and clamping.

---

### BUG-13 — `DEBUG_MODE = true` ships in production · **Low**

Every run writes verbose output into the user's page console.

**Fix:** debug off by default, toggle in options.

---

### BUG-14 — Store-only artifacts in the source manifest · **Low**

```json
"update_url": "https://clients2.google.com/service/update2/crx",
"key": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A…"
```

`update_url` makes Chrome treat the extension as store-managed; the hard-coded
`key` pins the extension ID. Neither belongs in a source repository, and both
make a plain "Load unpacked" behave surprisingly.

**Fix:** removed from `manifests/*.json`.

---

### BUG-15 — Timeout is counted in iterations, not elapsed time · **Low**

```js
while (timeout > 0) { …; await sleep(TIMEOUT_STEP_MS); timeout -= TIMEOUT_STEP_MS; }
```

A background tab throttles `setTimeout` to ≥ 1 s, so a "10 000 ms" wait can
become ~500 iterations × 1 s ≈ 8 minutes.

**Fix:** a `Date.now()` deadline.

---

### BUG-16 — Dead configuration and an unsafe getter · **Low**

`MODE = 'publish_drafts'` means the entire sorting feature is unreachable without
editing the file. `PlaylistVideo.name` does `this.raw.querySelector('#video-title').textContent`
with no null check.

**Fix:** the sorter is a first-class, selectable mode with a safe title lookup.

---

### BUG-17 — Duplicated Firefox tree that had already drifted · **Low**

`firefox/script.js` is byte-identical to `script.js` and `firefox/popup.html` to
`popup.html`, but `firefox/manifest.json` differs **and `firefox/icons/icon128.png`
(21 KB) is not the same file as `icons/icon128.png` (73 KB)**. Two copies of
everything, no build step, already inconsistent.

**Fix:** one `src/` tree; `build/build.mjs` generates `dist/chrome` and
`dist/firefox`.

---

### BUG-18 — `node_modules/` committed · **Low**

46 MB, 165 packages, committed to the repository — for a single devDependency.
There is no `.gitignore` anywhere in the tree.

**Fix:** `.gitignore`; the extension itself has zero runtime dependencies.

---

### BUG-19 — Chrome Web Store signing metadata in the source repo · **Low**

`_metadata/computed_hashes.json` and `_metadata/verified_contents.json` are
per-package signatures. They are meaningless outside a published CRX and go stale
immediately.

**Fix:** deleted.

---

### BUG-20 — Empty files · **Low**

`icons/readme.md` is 1 byte; `_metadata/readme.md` is 0 bytes.

---

### BUG-21 — CI lints nothing useful · **Low**

`super-linter@v4` is end-of-life, `VALIDATE_ALL_CODEBASE: false` means only
changed files are linted, and the workflow never builds, validates or tests the
extension.

**Fix:** `.github/workflows/ci.yml` builds both targets, runs `validate.mjs`, runs
the test suite, and uploads the unpacked builds.

---

### BUG-22 — README self-credits another repository · **Low**

> "This project is based on and inspired by
> [YouTube-Video-Batch-Publisher](https://github.com/pavnxet/YouTube-Video-Batch-Publisher)."

That is this repository. The README also never mentions the Firefox build.

---

### BUG-23 — No license · **Low**

Public repository, no `LICENSE`.

---

### BUG-24 — Success dialog close reports success unconditionally · **Low**

Covered under BUG-05: `close()` resolves `true` even when the popup was never
closed.

---

### BUG-25 — Popup accessibility · **Low**

No `aria` on the visibility control, no disabled state on the action button, no
live region, `<img>` without intrinsic `width`/`height`.

---

## 3. Summary

| Severity | Count |
|---|---|
| Critical | 1 |
| High | 5 |
| Medium | 6 |
| Low | 13 |
| **Total** | **25** |

The single most important finding is **BUG-01**: the extension could publish a
video the user had marked Private as Public. It is silent, it affects the user's
real channel, and it is exactly the kind of bug that a test suite catches and a
manual click-through does not.

---

## 4. Verification performed on v2.0

| Check | Command | Result |
|---|---|---|
| Unit + integration tests | `npm test` | 54 / 54 pass |
| Legacy-behaviour regression tests | `npm test` | 9 tests, incl. 4 that reproduce v1.1 defects |
| Manifest / bundle validation | `npm run validate` | chrome ✔ firefox ✔ |
| Bundle syntax | `npm run validate` | `node --check` on all 4 bundles |
| Built content script end-to-end | `npm test` | scans a simulated Studio page |
| Background routing | `npm test` | SCAN routed to the Studio tab; refused elsewhere |
| UI render | `build/preview.mjs` | popup (idle + running) and options screenshotted in headless Chrome |

### Not verified (needs a real account)

Automation against live YouTube Studio cannot be exercised from CI: the markup
is not public, the pages require a signed-in account, and publishing is
irreversible. Everything that *can* be tested without a channel — the engine
against a simulated Studio DOM, the message flow, the manifest — is tested. The
selectors are the part to re-check after any Studio redesign, and they are all in
one file.
