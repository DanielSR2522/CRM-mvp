export type ThemeMode = 'light' | 'dark' | 'system';
export type AccentPreset = 'ocean' | 'emerald' | 'violet' | 'rose' | 'slate' | 'gold';

export interface ThemeSettings {
  mode: ThemeMode;
  accent: AccentPreset;
}

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  mode: 'light',
  accent: 'ocean',
};

export const ACCENT_PRESETS: Record<
  AccentPreset,
  { name: string; sidebarHex: string; workspaceHex: string; accentHex: string }
> = {
  ocean: { name: 'Ocean', sidebarHex: '#0F172A', workspaceHex: '#F4F7FB', accentHex: '#2563EB' },
  emerald: { name: 'Emerald', sidebarHex: '#063B33', workspaceHex: '#F3F8F6', accentHex: '#059669' },
  violet: { name: 'Violet', sidebarHex: '#24153F', workspaceHex: '#F7F5FB', accentHex: '#7C3AED' },
  rose: { name: 'Rose', sidebarHex: '#471827', workspaceHex: '#FBF5F7', accentHex: '#E11D48' },
  slate: { name: 'Slate', sidebarHex: '#1E293B', workspaceHex: '#F5F7F9', accentHex: '#475569' },
  gold: { name: 'Gold', sidebarHex: '#3A2914', workspaceHex: '#FAF8F3', accentHex: '#B7791F' },
};

const STORAGE_KEY = 'smartrack:theme-settings';
const THEME_SYSTEM_CHANGE_EVENT = 'smartrack-theme-system-change';

export function getStoredThemeSettings(): ThemeSettings {
  if (typeof window === 'undefined') return DEFAULT_THEME_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        mode: ['light', 'dark', 'system'].includes(parsed.mode) ? parsed.mode : DEFAULT_THEME_SETTINGS.mode,
        accent: parsed.accent in ACCENT_PRESETS ? parsed.accent : DEFAULT_THEME_SETTINGS.accent,
      };
    }
  } catch (err) {
    console.warn('Unable to read theme settings from localStorage:', err);
  }
  return DEFAULT_THEME_SETTINGS;
}

export function saveThemeSettings(settings: ThemeSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    applyThemeSettings(settings);
    window.dispatchEvent(new CustomEvent(THEME_SYSTEM_CHANGE_EVENT, { detail: settings }));
  } catch (err) {
    console.warn('Unable to save theme settings to localStorage:', err);
  }
}

export function applyThemeSettings(settings: ThemeSettings): void {
  if (typeof window === 'undefined') return;

  const root = document.documentElement;

  // Apply Accent Preset (which updates sidebar, workspace, and accent variables)
  root.setAttribute('data-accent', settings.accent);

  // Apply Mode
  let isDark = false;
  if (settings.mode === 'dark') {
    isDark = true;
  } else if (settings.mode === 'light') {
    isDark = false;
  } else if (settings.mode === 'system') {
    isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  if (isDark) {
    root.classList.add('dark');
    root.setAttribute('data-mode', 'dark');
  } else {
    root.classList.remove('dark');
    root.setAttribute('data-mode', 'light');
  }
}

export function subscribeThemeSystemChange(callback: (settings: ThemeSettings) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: any) => callback(e.detail || getStoredThemeSettings());
  window.addEventListener(THEME_SYSTEM_CHANGE_EVENT, handler);
  return () => window.removeEventListener(THEME_SYSTEM_CHANGE_EVENT, handler);
}
