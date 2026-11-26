/**
 * theme.js - Global Theme Manager for Daily Work Planner
 * Handles Dark / Light theme selection, persistence in localStorage,
 * and immediate dynamic theme switching across all pages.
 */
(function () {
  'use strict';

  var THEME_STORAGE_KEY = 'dailyPlanner:theme';

  function getStoredTheme() {
    try {
      var saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') {
        return saved;
      }
    } catch (e) {
      console.warn('Could not read theme from localStorage:', e);
    }
    return 'light'; // Default is Light Theme
  }

  function applyTheme(theme) {
    var validTheme = (theme === 'dark') ? 'dark' : 'light';
    var root = document.documentElement;
    root.setAttribute('data-theme', validTheme);

    try {
      localStorage.setItem(THEME_STORAGE_KEY, validTheme);
    } catch (e) {
      console.warn('Could not save theme to localStorage:', e);
    }

    // Update active state of any theme toggle buttons on the page
    updateThemeToggleUI(validTheme);

    // Dispatch event so any reactive component can listen
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: validTheme } }));
  }

  function updateThemeToggleUI(theme) {
    // Single toggle button (e.g., in app header)
    var appThemeBtn = document.getElementById('btn-top-theme-toggle');
    if (appThemeBtn) {
      var isDark = (theme === 'dark');
      appThemeBtn.setAttribute('aria-label', isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme');
      appThemeBtn.setAttribute('title', isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme');
      var iconEl = appThemeBtn.querySelector('.theme-btn-icon');
      var textEl = appThemeBtn.querySelector('.theme-btn-text');
      if (iconEl) {
        iconEl.innerHTML = isDark
          ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>'
          : '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
      }
      if (textEl) {
        textEl.textContent = isDark ? 'Light' : 'Dark';
      }
    }

    // Segmented / dual buttons (e.g., on Login page)
    var btnLight = document.getElementById('theme-option-light');
    var btnDark = document.getElementById('theme-option-dark');
    if (btnLight && btnDark) {
      if (theme === 'dark') {
        btnDark.classList.add('active');
        btnDark.setAttribute('aria-pressed', 'true');
        btnLight.classList.remove('active');
        btnLight.setAttribute('aria-pressed', 'false');
      } else {
        btnLight.classList.add('active');
        btnLight.setAttribute('aria-pressed', 'true');
        btnDark.classList.remove('active');
        btnDark.setAttribute('aria-pressed', 'false');
      }
    }
  }

  function initTheme() {
    var initialTheme = getStoredTheme();
    applyTheme(initialTheme);

    // Setup event listeners once DOM is ready
    function bindToggles() {
      var appThemeBtn = document.getElementById('btn-top-theme-toggle');
      if (appThemeBtn) {
        appThemeBtn.addEventListener('click', function () {
          var current = document.documentElement.getAttribute('data-theme') || 'light';
          applyTheme(current === 'dark' ? 'light' : 'dark');
        });
      }

      var btnLight = document.getElementById('theme-option-light');
      var btnDark = document.getElementById('theme-option-dark');
      if (btnLight) {
        btnLight.addEventListener('click', function () {
          applyTheme('light');
        });
      }
      if (btnDark) {
        btnDark.addEventListener('click', function () {
          applyTheme('dark');
        });
      }

      updateThemeToggleUI(document.documentElement.getAttribute('data-theme') || 'light');
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bindToggles);
    } else {
      bindToggles();
    }
  }

  // Execute immediately to prevent flash of wrong theme
  initTheme();

  // Expose global helper if needed
  window.DailyPlannerTheme = {
    get: getStoredTheme,
    set: applyTheme,
    toggle: function () {
      var current = document.documentElement.getAttribute('data-theme') || 'light';
      applyTheme(current === 'dark' ? 'light' : 'dark');
    }
  };
})();
