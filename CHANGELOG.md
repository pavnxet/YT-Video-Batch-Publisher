# Changelog

All notable changes to this project. Format based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] — 2026-10-22

A ground-up rewrite. 25 bugs fixed; see [`docs/BUG_REPORT.md`](docs/BUG_REPORT.md).

### Fixed

- **Visibility was applied to the wrong radio button.** Public and Private were
  swapped, so a video marked Private could be published Public. Selection is now
  by label text, not array index. *(critical)*
- One failing video no longer aborts the whole batch — errors are caught,
  retried and reported per video.
- Draft detection no longer uses a 20 ms timeout that silently skipped
  slow-rendering rows.
- The "made for kids" option is matched by label instead of `:nth-child`, which
  picked the opposite answer whenever the group had any other child.
- Playlist sorting no longer moves the wrong row when two videos share a title,
  and no longer relies on fixed menu indices.
- Removed a `MutationObserver` leak (one live observer per published video) and
  an `async` promise executor that could hang the batch forever.
- Every selector now has fallbacks; the deprecated `createEvent`/`initMouseEvent`
  click was replaced with a `composed` `MouseEvent` sequence.
- Timeouts are measured against a real deadline instead of counting iterations.
- The target tab is validated (URL + existence) and injection failures are
  surfaced instead of being discarded.
- Removed the store-only `update_url` and hard-coded `key` from the manifests.

### Added

- **Options page** — default visibility, made-for-kids, action delay, step
  timeout, retries, continue-on-error, auto-close, dry run, debug logging and
  theme, persisted in `chrome.storage.sync`.
- **Live progress** — progress bar, per-video log and a working **Stop** button
  (AbortSignal threaded through every wait).
- **Dry run** — full scan and report without touching anything.
- **Draft count** in the popup, with a rescan button.
- **Playlist sorting** as a selectable, duplicate-safe feature.
- **Dark mode** and a redesigned popup/options UI.
- **CI** (`.github/workflows/ci.yml`) that builds, validates and tests.
- **54 tests** (`node --test` + jsdom), including four that reproduce v1.1's
  defects as regression guards.
- `build/build.mjs` — one `src/` tree generates `dist/chrome` and `dist/firefox`.
- `build/validate.mjs` — manifest, file-reference and bundle-syntax checks.
- `build/preview.mjs` — renders the UI in headless Chrome for review.
- `README.md`, `LICENSE` (MIT), `.gitignore`, this changelog.

### Changed

- Source reorganized into `src/{common,core,content,background,popup,options,ui}`.
- Manifests moved to `manifests/{chrome,firefox}.json`.
- Popup redesigned: connection state, draft count, segmented visibility control,
  toggles, progress, log, accessible markup.
- Version bumped to 2.0.0.

### Removed

- `node_modules/` (46 MB, committed) and `package-lock.json` for a single
  devDependency.
- `_metadata/` — Chrome Web Store signing artifacts.
- `firefox/` — the duplicated, already-drifted second build.
- `icons/readme.md`, `_metadata/readme.md` — empty files.
- `.github/workflows/super-linter.yml` — EOL linter that checked nothing useful.

See [`docs/CLEANUP.md`](docs/CLEANUP.md) for the full removed-file list.

## [1.1] — (original)

Last release of the pre-rewrite codebase. Chrome MV3 + a hand-copied Firefox
build. See the git history of the `main` branch prior to 2.0.0.
