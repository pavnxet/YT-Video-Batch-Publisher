/*
 * sorter.js — playlist sorting engine.
 *
 * The original `sortPlaylist()` had two real defects:
 *   1. it re-found each video by *name* (`videos.find(v => v.name === name)`),
 *      so duplicate titles moved the wrong row;
 *   2. it clicked menu items by a fixed index (4 / 5), which breaks whenever
 *      YouTube adds or reorders menu entries.
 * Both are fixed here: we keep the actual element references and match menu
 * items by their visible label.
 */
(function (scope) {
  'use strict';

  var dom = scope.dom;
  var sel = scope.selectors;
  var log = scope.logger;

  function naturalCompare(a, b) {
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  }

  function PlaylistSorter(options) {
    options = options || {};
    this.settings = options.settings || scope.settings.DEFAULTS;
    this.direction = options.direction === 'desc' ? 'desc' : 'asc';
    this.onProgress = options.onProgress || function () {};
    this.signal = options.signal || null;
    this.doc = options.document || (typeof document !== 'undefined' ? document : null);
    this.timeout = this.settings.stepTimeoutMs || dom.DEFAULT_TIMEOUT_MS;
  }

  PlaylistSorter.prototype.report = function (payload) {
    try { this.onProgress(payload); } catch (_) {}
  };

  PlaylistSorter.prototype.videos = function () {
    var nodes = this.doc.querySelectorAll(sel.playlistVideo.join(','));
    var self = this;
    return Array.prototype.slice.call(nodes).map(function (node) {
      return { element: node, name: self.nameOf(node) };
    });
  };

  PlaylistSorter.prototype.nameOf = function (node) {
    for (var i = 0; i < sel.playlistVideoTitle.length; i++) {
      var t = node.querySelector(sel.playlistVideoTitle[i]);
      if (t && dom.textOf(t)) return dom.textOf(t);
    }
    return dom.textOf(node);
  };

  PlaylistSorter.prototype.openMenu = async function (video) {
    var button = null;
    for (var i = 0; i < sel.playlistMenuButton.length && !button; i++) {
      button = video.element.querySelector(sel.playlistMenuButton[i]);
    }
    if (!button) throw new Error('Playlist row menu not found');
    dom.click(button);

    var listbox = await dom.waitForAny(sel.playlistMenuListbox, {
      timeout: this.timeout, signal: this.signal
    });
    if (!listbox) throw new Error('Playlist menu did not open');
    return listbox.element;
  };

  /** Click a menu entry by matching its label, with an index fallback. */
  PlaylistSorter.prototype.chooseMenuItem = async function (listbox, patterns, fallbackIndex) {
    var items = Array.prototype.slice.call(listbox.querySelectorAll(sel.playlistMenuItem.join(',')));
    if (!items.length) throw new Error('No menu items');

    for (var i = 0; i < items.length; i++) {
      var text = dom.textOf(items[i]);
      if (patterns.some(function (re) { return re.test(text); })) { dom.click(items[i]); return true; }
    }
    log.warn('menu label not matched, using index', fallbackIndex);
    var fallback = items[fallbackIndex];
    if (!fallback) throw new Error('Menu item not found');
    dom.click(fallback);
    return true;
  };

  PlaylistSorter.prototype.moveToTop = async function (video) {
    var listbox = await this.openMenu(video);
    await this.chooseMenuItem(listbox, sel.text.moveToTop, 4);
  };

  PlaylistSorter.prototype.moveToBottom = async function (video) {
    var listbox = await this.openMenu(video);
    await this.chooseMenuItem(listbox, sel.text.moveToBottom, 5);
  };

  /**
   * Sort the playlist.
   *
   * To order a list ascending by repeatedly appending to the bottom, you visit
   * the items in ascending order: each append places the item after the ones
   * already moved. (The original did the same, but on a name-keyed lookup.)
   */
  PlaylistSorter.prototype.run = async function () {
    var videos = this.videos();
    var sorted = videos.slice().sort(function (a, b) { return naturalCompare(a.name, b.name); });
    if (this.direction === 'desc') sorted.reverse();

    this.report({ total: videos.length, message: 'Sorting ' + videos.length + ' videos (' + this.direction + ')' });

    for (var i = 0; i < sorted.length; i++) {
      if (this.signal && this.signal.aborted) break;
      await this.moveToBottom(sorted[i]);
      this.report({ index: i + 1, total: sorted.length, title: sorted[i].name });
      await dom.sleep(this.settings.actionDelayMs, this.signal);
    }
    return { total: sorted.length, direction: this.direction };
  };

  scope.PlaylistSorter = PlaylistSorter;
  scope.sorterInternals = { naturalCompare };
})(globalThis.YTBP = globalThis.YTBP || {});
