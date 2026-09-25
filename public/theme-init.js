(function() {
  try {
    var raw = localStorage.getItem('smartrack:theme-settings');
    if (raw) {
      var s = JSON.parse(raw);
      if (s.accent) document.documentElement.setAttribute('data-accent', s.accent);
      var isDark = s.mode === 'dark' || (s.mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      if (isDark) {
        document.documentElement.classList.add('dark');
        document.documentElement.setAttribute('data-mode', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.setAttribute('data-mode', 'light');
      }
    } else {
      document.documentElement.setAttribute('data-accent', 'ocean');
      document.documentElement.setAttribute('data-mode', 'light');
    }
  } catch (e) {}
})();
