(function themeInit() {
  const KEY = 'ss-theme';
  const DEFAULT = 'light';
  const THEMES = ['light', 'dark'];
  const LEGACY = {
    aurora: 'light', ocean: 'light', forest: 'light', sunset: 'light',
    midnight: 'dark', grape: 'dark',
  };

  function current() {
    try {
      const stored = localStorage.getItem(KEY);
      if (THEMES.includes(stored)) return stored;
      if (LEGACY[stored]) return LEGACY[stored];
      return DEFAULT;
    } catch (_err) {
      return DEFAULT;
    }
  }

  function apply(theme) {
    const value = THEMES.includes(theme) ? theme : DEFAULT;
    document.documentElement.setAttribute('data-theme', value);
    try { localStorage.setItem(KEY, value); } catch (_err) { /* ignore */ }
    document.querySelectorAll('#themeSelect, #themeSelectMobile').forEach((select) => {
      if (select) select.value = value;
    });
  }

  apply(current());

  document.addEventListener('DOMContentLoaded', () => {
    apply(current());
    document.querySelectorAll('#themeSelect, #themeSelectMobile').forEach((select) => {
      if (!select) return;
      select.value = current();
      select.addEventListener('change', (event) => apply(event.target.value));
    });
  });

  window.applyStudyTheme = apply;
})();
