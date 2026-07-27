export type SidebarThemeId =
  | 'navy'
  | 'blue'
  | 'indigo'
  | 'purple'
  | 'emerald'
  | 'red'
  | 'slate';

export interface SidebarThemeConfig {
  id: SidebarThemeId;
  name: string;
  swatchHex: string;
  sidebarBgClass: string;
  sidebarBorderClass: string;
  textPrimaryClass: string;
  textSecondaryClass: string;
  activeBgClass: string;
  activeTextClass: string;
  hoverBgClass: string;
  iconColorClass: string;
  signOutBtnClass: string;
}

export const DEFAULT_SIDEBAR_THEME: SidebarThemeId = 'navy';

export const SIDEBAR_THEMES: Record<SidebarThemeId, SidebarThemeConfig> = {
  navy: {
    id: 'navy',
    name: 'Navy',
    swatchHex: '#0F172A',
    sidebarBgClass: 'bg-[#0F172A]',
    sidebarBorderClass: 'border-slate-800/80',
    textPrimaryClass: 'text-slate-100',
    textSecondaryClass: 'text-slate-400',
    activeBgClass: 'bg-blue-600/20 border-l-4 border-cyan-400',
    activeTextClass: 'text-cyan-300 font-bold',
    hoverBgClass: 'hover:bg-slate-800/60',
    iconColorClass: 'text-cyan-400',
    signOutBtnClass: 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border-rose-500/20',
  },
  blue: {
    id: 'blue',
    name: 'Blue',
    swatchHex: '#1E3A8A',
    sidebarBgClass: 'bg-[#1E3A8A]',
    sidebarBorderClass: 'border-blue-900/60',
    textPrimaryClass: 'text-white',
    textSecondaryClass: 'text-blue-200/80',
    activeBgClass: 'bg-white/15 border-l-4 border-white',
    activeTextClass: 'text-white font-bold',
    hoverBgClass: 'hover:bg-blue-800/50',
    iconColorClass: 'text-blue-200',
    signOutBtnClass: 'bg-blue-950/60 text-blue-100 hover:bg-blue-950/80 border-blue-700/50',
  },
  indigo: {
    id: 'indigo',
    name: 'Indigo',
    swatchHex: '#312E81',
    sidebarBgClass: 'bg-[#312E81]',
    sidebarBorderClass: 'border-indigo-900/60',
    textPrimaryClass: 'text-white',
    textSecondaryClass: 'text-indigo-200/80',
    activeBgClass: 'bg-white/15 border-l-4 border-indigo-300',
    activeTextClass: 'text-white font-bold',
    hoverBgClass: 'hover:bg-indigo-800/50',
    iconColorClass: 'text-indigo-200',
    signOutBtnClass: 'bg-indigo-950/60 text-indigo-100 hover:bg-indigo-950/80 border-indigo-700/50',
  },
  purple: {
    id: 'purple',
    name: 'Purple',
    swatchHex: '#4C1D95',
    sidebarBgClass: 'bg-[#4C1D95]',
    sidebarBorderClass: 'border-purple-900/60',
    textPrimaryClass: 'text-white',
    textSecondaryClass: 'text-purple-200/80',
    activeBgClass: 'bg-white/15 border-l-4 border-purple-300',
    activeTextClass: 'text-white font-bold',
    hoverBgClass: 'hover:bg-purple-800/50',
    iconColorClass: 'text-purple-200',
    signOutBtnClass: 'bg-purple-950/60 text-purple-100 hover:bg-purple-950/80 border-purple-700/50',
  },
  emerald: {
    id: 'emerald',
    name: 'Emerald',
    swatchHex: '#064E3B',
    sidebarBgClass: 'bg-[#064E3B]',
    sidebarBorderClass: 'border-emerald-900/60',
    textPrimaryClass: 'text-white',
    textSecondaryClass: 'text-emerald-200/80',
    activeBgClass: 'bg-white/15 border-l-4 border-emerald-300',
    activeTextClass: 'text-white font-bold',
    hoverBgClass: 'hover:bg-emerald-800/50',
    iconColorClass: 'text-emerald-200',
    signOutBtnClass: 'bg-emerald-950/60 text-emerald-100 hover:bg-emerald-950/80 border-emerald-700/50',
  },
  red: {
    id: 'red',
    name: 'Red',
    swatchHex: '#7F1D1D',
    sidebarBgClass: 'bg-[#7F1D1D]',
    sidebarBorderClass: 'border-red-900/60',
    textPrimaryClass: 'text-white',
    textSecondaryClass: 'text-red-200/80',
    activeBgClass: 'bg-white/15 border-l-4 border-red-300',
    activeTextClass: 'text-white font-bold',
    hoverBgClass: 'hover:bg-red-800/50',
    iconColorClass: 'text-red-200',
    signOutBtnClass: 'bg-red-950/60 text-red-100 hover:bg-red-950/80 border-red-700/50',
  },
  slate: {
    id: 'slate',
    name: 'Slate',
    swatchHex: '#334155',
    sidebarBgClass: 'bg-[#334155]',
    sidebarBorderClass: 'border-slate-700/80',
    textPrimaryClass: 'text-white',
    textSecondaryClass: 'text-slate-300',
    activeBgClass: 'bg-white/15 border-l-4 border-slate-200',
    activeTextClass: 'text-white font-bold',
    hoverBgClass: 'hover:bg-slate-600/50',
    iconColorClass: 'text-slate-200',
    signOutBtnClass: 'bg-slate-900/60 text-slate-100 hover:bg-slate-900/80 border-slate-600/50',
  },
};

const STORAGE_KEY_PREFIX = 'smartrack:sidebar-theme:';
const THEME_CHANGE_EVENT = 'smartrack-theme-change';

/**
 * Gets the stored sidebar theme for a user, falling back to 'navy' for invalid/missing values.
 */
export function getStoredSidebarTheme(userId: string | null): SidebarThemeConfig {
  if (typeof window === 'undefined' || !userId) {
    return SIDEBAR_THEMES[DEFAULT_SIDEBAR_THEME];
  }

  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${userId}`);
    if (raw && raw in SIDEBAR_THEMES) {
      return SIDEBAR_THEMES[raw as SidebarThemeId];
    }
  } catch (err) {
    console.warn('Unable to read sidebar theme from localStorage:', err);
  }

  return SIDEBAR_THEMES[DEFAULT_SIDEBAR_THEME];
}

/**
 * Saves the sidebar theme for a user and dispatches a theme change event.
 */
export function saveSidebarTheme(userId: string | null, themeId: SidebarThemeId): void {
  if (typeof window === 'undefined' || !userId) return;

  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${userId}`, themeId);
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { themeId } }));
  } catch (err) {
    console.warn('Unable to save sidebar theme to localStorage:', err);
  }
}

/**
 * Subscribes to sidebar theme change events.
 */
export function subscribeSidebarThemeChange(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = () => callback();
  window.addEventListener(THEME_CHANGE_EVENT, handler);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, handler);
}
