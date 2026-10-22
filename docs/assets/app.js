/*
 * app.js — theme toggle + sidebar active-link highlighting for the docs site.
 * Deliberately tiny and dependency-free.
 */
(function () {
  'use strict';

  var KEY = 'ytbp-docs-theme';

  function applyTheme(value) {
    if (value === 'light' || value === 'dark') {
      document.documentElement.setAttribute('data-theme', value);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
  applyTheme(stored);

  document.addEventListener('DOMContentLoaded', function () {
    var toggle = document.querySelector('.theme-toggle');
    if (toggle) {
      var sync = function () {
        var current = document.documentElement.getAttribute('data-theme');
        if (!current) current = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        toggle.textContent = current === 'dark' ? '☀️' : '🌙';
        toggle.setAttribute('aria-label', current === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
      };
      sync();
      toggle.addEventListener('click', function () {
        var current = document.documentElement.getAttribute('data-theme');
        if (!current) current = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        var next = current === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        try { localStorage.setItem(KEY, next); } catch (e) { /* ignore */ }
        sync();
      });
    }

    // Highlight the sidebar entry for the current page.
    var here = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.sidebar a').forEach(function (a) {
      var target = a.getAttribute('href');
      if (target === here || (here === '' && target === 'index.html')) {
        a.classList.add('active');
        a.setAttribute('aria-current', 'page');
      }
    });
  });
})();
