/*
 * publisher.js — the batch-publish engine.
 *
 * Rewritten from the original `script.js`. Key differences:
 *  - explicit, cancellable async pipeline (AbortSignal threaded through)
 *  - per-video error isolation + configurable retries
 *  - visibility / "made for kids" chosen by *label text*, not by DOM index
 *    (the original indexed into an array whose order did not match YouTube's,
 *     so "Public" and "Private" were swapped)
 *  - every selector has fallbacks (see selectors.js)
 *  - progress is streamed to the popup
 *  - dry-run mode
 */
(function (scope) {
  'use strict';

  var dom = scope.dom;
  var sel = scope.selectors;
  var log = scope.logger;

  function firstMatch(root, selectorList) {
    if (!root) return null;
    for (var i = 0; i < selectorList.length; i++) {
      var el = root.querySelector(selectorList[i]);
      if (el) return el;
    }
    return null;
  }

  function matchesAny(text, patterns) {
    return patterns.some(function (re) { return re.test(text); });
  }

  /**
   * Choose a radio button by its visible label.
   * @param {Element} container
   * @param {RegExp[]} patterns  label patterns to match
   * @param {number} fallbackIndex  0-based position used only if no label matches
   */
  function pickRadioByText(container, patterns, fallbackIndex) {
    if (!container) return null;
    var radios = [];
    sel.radioButton.forEach(function (s) {
      var found = container.querySelectorAll(s);
      if (found.length && !radios.length) radios = Array.prototype.slice.call(found);
    });
    if (!radios.length) return null;

    for (var i = 0; i < radios.length; i++) {
      if (matchesAny(dom.textOf(radios[i]), patterns)) return radios[i];
    }
    log.warn('radio label match failed, falling back to index', fallbackIndex);
    return radios[fallbackIndex] || null;
  }

  function titleOf(row) {
    var t = firstMatch(row, ['#video-title', 'a#video-title', 'yt-formatted-string#video-title', '#text']);
    return dom.textOf(t) || 'Untitled video';
  }

  function PublishEngine(options) {
    options = options || {};
    this.settings = options.settings || scope.settings.DEFAULTS;
    this.visibility = options.visibility || this.settings.defaultVisibility;
    this.onProgress = options.onProgress || function () {};
    this.signal = options.signal || null;
    this.doc = options.document || (typeof document !== 'undefined' ? document : null);
    this.timeout = this.settings.stepTimeoutMs || dom.DEFAULT_TIMEOUT_MS;
  }

  PublishEngine.prototype.report = function (phase, extra) {
    try { this.onProgress(Object.assign({ phase: phase }, extra || {})); }
    catch (err) { log.warn('progress handler threw', err); }
  };

  PublishEngine.prototype.rows = function () {
    var all = this.doc.querySelectorAll(sel.videoRow.join(','));
    return Array.prototype.slice.call(all);
  };

  /** A row is "editable" (i.e. a draft we can publish) when it has an edit button. */
  PublishEngine.prototype.isDraft = async function (row) {
    var hit = await dom.waitForAny(sel.editDraftButton, {
      root: row, timeout: 120, signal: this.signal
    });
    return !!hit;
  };

  /** Scan the content page for publishable drafts. */
  PublishEngine.prototype.scan = async function () {
    this.report(scope.messaging.PHASE.SCANNING, { message: 'Scanning for drafts…' });
    var rows = this.rows();
    var drafts = [];
    for (var i = 0; i < rows.length; i++) {
      if (this.signal && this.signal.aborted) throw dom.abortError();
      if (await this.isDraft(rows[i])) {
        drafts.push({ element: rows[i], title: titleOf(rows[i]) });
      }
    }
    return { count: drafts.length, titles: drafts.map(function (d) { return d.title; }) };
  };

  PublishEngine.prototype.openDraft = async function (row) {
    var button = await dom.waitForAny(sel.editDraftButton, {
      root: row, timeout: this.timeout, signal: this.signal
    });
    if (!button) throw new Error('Edit-draft button not found');
    dom.click(button.element);

    var dialog = await dom.waitForAny(sel.draftDialog, { timeout: this.timeout, signal: this.signal });
    if (!dialog) throw new Error('Draft editor did not open');
    return dialog.element;
  };

  PublishEngine.prototype.setMadeForKids = async function (dialog) {
    var group = await dom.waitForAny(sel.madeForKidsGroup, {
      root: dialog, timeout: this.timeout, signal: this.signal
    });
    if (!group) { log.debug('made-for-kids group not found; skipping'); return; }

    var want = this.settings.madeForKids;
    var patterns = want ? sel.text.madeForKidsYes : sel.text.madeForKidsNo;
    var radio = pickRadioByText(group.element, patterns, want ? 0 : 1);
    if (!radio) throw new Error('Made-for-kids option not found');
    dom.click(radio);
    await dom.sleep(60, this.signal);
    log.debug('made for kids set to', want);
  };

  PublishEngine.prototype.setVisibility = async function (dialog) {
    var stepper = await dom.waitForAny(sel.visibilityStepper, {
      root: dialog, timeout: this.timeout, signal: this.signal
    });
    if (!stepper) throw new Error('Visibility step not reachable');
    dom.click(stepper.element);

    var group = await dom.waitForAny(sel.visibilityRadioGroup, {
      timeout: this.timeout, signal: this.signal
    });
    if (!group) throw new Error('Visibility options did not appear');

    var order = scope.settings.VISIBILITIES; // ['Public','Unlisted','Private'] — matches YouTube
    var patterns = sel.text.visibility[this.visibility] || [/./];
    var radio = pickRadioByText(group.element, patterns, order.indexOf(this.visibility));
    if (!radio) throw new Error('Visibility option "' + this.visibility + '" not found');
    dom.click(radio);
    await dom.sleep(60, this.signal);
    log.debug('visibility set to', this.visibility);
  };

  PublishEngine.prototype.save = async function () {
    var button = await dom.waitForAny(sel.saveButton, { timeout: this.timeout, signal: this.signal });
    if (!button) throw new Error('Save button not found');
    dom.click(button.element);
    var ok = await dom.waitForAny(sel.successThumbnail, { timeout: this.timeout, signal: this.signal });
    if (!ok) throw new Error('Save did not complete');
  };

  /** Dismiss the "video published" share dialog. Never throws. */
  PublishEngine.prototype.closeShareDialog = async function () {
    if (!this.settings.autoCloseShareDialog) return;
    try {
      var dialog = await dom.waitForAny(sel.shareDialog, { timeout: 3000, signal: this.signal });
      if (!dialog) return;
      var close = firstMatch(dialog.element, sel.shareDialogClose);
      if (close) {
        dom.click(close);
        await dom.waitForGone(dialog.element, { timeout: 2000, signal: this.signal });
      }
      if (dialog.element && dialog.element.isConnected) {
        this.doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      }
    } catch (err) {
      if (!dom.isAbort(err)) log.debug('share dialog close skipped', err);
    }
  };

  PublishEngine.prototype.publishOne = async function (draft, index, total) {
    this.report(scope.messaging.PHASE.VIDEO_START, { index: index, total: total, title: draft.title });

    if (this.settings.dryRun) {
      await dom.sleep(120, this.signal);
      this.report(scope.messaging.PHASE.VIDEO_DONE, {
        index: index, total: total, title: draft.title,
        status: 'skipped', message: 'Dry run — no changes made'
      });
      return { title: draft.title, status: 'skipped' };
    }

    var dialog = await this.openDraft(draft.element);
    this.report(scope.messaging.PHASE.VIDEO_STEP, { index: index, total: total, step: 'made-for-kids' });
    await this.setMadeForKids(dialog);

    this.report(scope.messaging.PHASE.VIDEO_STEP, { index: index, total: total, step: 'visibility' });
    await this.setVisibility(dialog);

    this.report(scope.messaging.PHASE.VIDEO_STEP, { index: index, total: total, step: 'save' });
    await this.save();
    await this.closeShareDialog();

    await dom.sleep(this.settings.actionDelayMs, this.signal);
    this.report(scope.messaging.PHASE.VIDEO_DONE, {
      index: index, total: total, title: draft.title, status: 'published',
      message: 'Published as ' + this.visibility
    });
    return { title: draft.title, status: 'published' };
  };

  /** Run the whole batch. Resolves with a summary; never rejects for a single video. */
  PublishEngine.prototype.run = async function () {
    var started = Date.now();
    var scan = await this.scan();
    var drafts = [];
    // Re-resolve rows (scan collected elements already).
    var rows = this.rows();
    for (var i = 0; i < rows.length; i++) {
      if (await this.isDraft(rows[i])) drafts.push({ element: rows[i], title: titleOf(rows[i]) });
    }

    this.report(scope.messaging.PHASE.STARTING, {
      total: drafts.length, message: drafts.length
        ? 'Publishing ' + drafts.length + ' draft(s) as ' + this.visibility + '…'
        : 'No drafts found.'
    });

    var results = [];
    for (var idx = 0; idx < drafts.length; idx++) {
      if (this.signal && this.signal.aborted) break;
      var draft = drafts[idx];
      var attempt = 0;
      var lastError = null;
      for (;;) {
        try {
          results.push(await this.publishOne(draft, idx + 1, drafts.length));
          lastError = null;
          break;
        } catch (err) {
          if (dom.isAbort(err)) { lastError = err; break; }
          lastError = err;
          if (attempt >= (this.settings.maxRetries || 0)) break;
          attempt += 1;
          log.warn('retrying "' + draft.title + '" (attempt ' + attempt + ')', err);
          await dom.sleep(this.settings.actionDelayMs, this.signal).catch(function () {});
        }
      }
      if (lastError && !dom.isAbort(lastError)) {
        results.push({ title: draft.title, status: 'error', message: lastError.message });
        this.report(scope.messaging.PHASE.VIDEO_ERROR, {
          index: idx + 1, total: drafts.length, title: draft.title,
          message: lastError.message
        });
        if (!this.settings.continueOnError) break;
      }
      if (this.signal && this.signal.aborted) break;
    }

    var cancelled = !!(this.signal && this.signal.aborted);
    var summary = {
      total: drafts.length,
      published: results.filter(function (r) { return r.status === 'published'; }).length,
      skipped: results.filter(function (r) { return r.status === 'skipped'; }).length,
      failed: results.filter(function (r) { return r.status === 'error'; }).length,
      results: results,
      cancelled: cancelled,
      elapsedMs: Date.now() - started
    };

    this.report(cancelled ? scope.messaging.PHASE.CANCELLED : scope.messaging.PHASE.FINISHED, {
      summary: summary,
      message: cancelled ? 'Stopped by user.' : this.summarise(summary)
    });
    return summary;
  };

  PublishEngine.prototype.summarise = function (s) {
    if (!s.total) return 'No drafts to publish.';
    var parts = [s.published + ' published'];
    if (s.skipped) parts.push(s.skipped + ' skipped');
    if (s.failed) parts.push(s.failed + ' failed');
    return parts.join(', ') + ' (of ' + s.total + ')';
  };

  scope.PublishEngine = PublishEngine;
  scope.publisherInternals = { pickRadioByText, firstMatch, matchesAny, titleOf };
})(globalThis.YTBP = globalThis.YTBP || {});
