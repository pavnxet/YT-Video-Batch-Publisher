# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] — 2026-10-22

The first public release.

### 🚀 Batch publishing

- Publishes every YouTube Studio draft visible on the content page in a single run.
- Visibility is chosen by matching the option's **label text**, so Public, Unlisted
  and Private are always applied correctly regardless of how YouTube orders them.
- The "made for kids" answer is applied automatically, matched by label rather than
  by position.

### 📊 Feedback and control

- Live progress bar and a per-video log in the popup.
- A working **Stop** button — the run halts cleanly between videos via an
  `AbortSignal` threaded through every wait.
- **Dry run** mode that scans and reports without changing anything.
- Draft count with a rescan button, and a connection badge that confirms the tab is
  really YouTube Studio.

### 🛡️ Reliability

- Per-video error isolation with configurable retries and a continue-on-error
  option, so one bad video does not end a batch.
- Every YouTube selector has ordered fallbacks, in one place.
- All waits are deadline-based and cancellable.
- The target tab is validated before anything is injected, and injection failures
  are surfaced instead of discarded.

### ⚙️ Configuration

- A full options page — default visibility, made-for-kids, action delay, step
  timeout, retries, continue-on-error, auto-close, dry run, debug logging and theme.
- Settings persist in `chrome.storage.sync`, so they follow you across devices.
- Light and dark themes, following the system by default.

### 🌐 Platform

- One source tree builds both a Chrome (Manifest V3, service worker) and a Firefox
  (event page) package.
- Zero runtime dependencies.
- 54 tests covering the engines, the DOM utilities, settings, the background
  message routing and the built bundles.

[2.0.0]: https://github.com/pavnxet/YT-Video-Batch-Publisher/releases/tag/v2.0.0
