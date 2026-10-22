/*
 * selectors.js — every YouTube Studio selector in one place, each with
 * ordered fallbacks.
 *
 * The original code hard-coded single, brittle selectors (e.g. the internal
 * Polymer class `.style-scope.ytcp-uploads-dialog`, or a bare `button`).
 * When YouTube shipped a UI change the whole extension silently broke.
 * Listing fallbacks and matching on stable attributes/text keeps it working.
 */
(function (scope) {
  'use strict';

  scope.selectors = {
    // ---- Content page -----------------------------------------------------
    videoRow: ['ytcp-video-row', 'ytcp-video-row[role="row"]'],

    // The pencil/"Edit draft" affordance on a draft row.
    editDraftButton: [
      '.edit-draft-button',
      'button.edit-draft-button',
      'ytcp-video-row .edit-draft-button',
      '[aria-label="Edit draft"]',
      'ytcp-button.edit-draft-button'
    ],

    // ---- Draft editor dialog ---------------------------------------------
    draftDialog: [
      'ytcp-uploads-dialog',
      '.style-scope.ytcp-uploads-dialog',
      'ytcp-uploads-dialog #dialog'
    ],
    madeForKidsGroup: ['#made-for-kids-group', 'ytcp-video-metadata-editor #made-for-kids-group'],
    radioButton: ['tp-yt-paper-radio-button', 'ytcp-radio-button', '[role="radio"]'],

    // ---- Visibility step --------------------------------------------------
    visibilityStepper: ['#step-badge-3', '#step-badge-3[role="button"]'],
    visibilityRadioGroup: [
      '#visibility-radios',
      'tp-yt-paper-radio-group#visibility-radios',
      'ytcp-uploads-dialog tp-yt-paper-radio-group'
    ],

    // ---- Save / success ---------------------------------------------------
    saveButton: ['#done-button', 'ytcp-button#done-button'],
    successThumbnail: ['ytcp-video-thumbnail-with-info', 'ytcp-uploads-still-processing-dialog'],

    // ---- Share ("video published") popup ---------------------------------
    shareDialog: [
      'ytcp-video-share-dialog',
      'ytcp-dialog.ytcp-video-share-dialog',
      'tp-yt-paper-dialog[role="dialog"]'
    ],
    shareDialogClose: [
      '[aria-label="Close"]',
      'ytcp-button[aria-label="Close"]',
      'tp-yt-paper-icon-button',
      'iron-icon[icon="close"]'
    ],

    // ---- Playlist page ----------------------------------------------------
    playlistVideo: ['ytd-playlist-video-renderer'],
    playlistVideoTitle: ['#video-title', 'a#video-title', 'yt-formatted-string#video-title'],
    playlistMenuButton: [
      'ytd-playlist-video-renderer #menu button',
      'ytd-menu-renderer yt-icon-button button',
      '#menu yt-icon-button button',
      'yt-icon-button#button button'
    ],
    playlistMenuListbox: ['tp-yt-paper-listbox#items', 'ytd-menu-popup-renderer tp-yt-paper-listbox'],
    playlistMenuItem: ['ytd-menu-service-item-renderer', 'tp-yt-paper-item']
  };

  scope.selectors.text = {
    madeForKidsYes: [/made for kids/i, /बच्चों के लिए बनाया/i],
    madeForKidsNo: [/not made for kids/i, /बच्चों के लिए नहीं/i],
    moveToTop: [/move to top/i, /सबसे ऊपर/i],
    moveToBottom: [/move to bottom/i, /सबसे नीचे/i],
    visibility: {
      Public: [/^public$/i, /सार्वजनिक/i],
      Unlisted: [/^unlisted$/i, /अनसूचीबद्ध/i],
      Private: [/^private$/i, /निजी/i]
    }
  };
})(globalThis.YTBP = globalThis.YTBP || {});
