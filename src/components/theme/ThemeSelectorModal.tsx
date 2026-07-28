'use client';

import React, { useState, useEffect } from 'react';
import {
  ThemeSettings,
  ThemeMode,
  AccentPreset,
  ACCENT_PRESETS,
  getStoredThemeSettings,
  saveThemeSettings,
} from '@/lib/theme/themeSystem';

interface ThemeSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ThemeSelectorModal({ isOpen, onClose }: ThemeSelectorModalProps) {
  const [settings, setSettings] = useState<ThemeSettings>(getStoredThemeSettings());

  useEffect(() => {
    if (isOpen) {
      setSettings(getStoredThemeSettings());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleModeChange = (mode: ThemeMode) => {
    const next = { ...settings, mode };
    setSettings(next);
    saveThemeSettings(next);
  };

  const handleAccentChange = (accent: AccentPreset) => {
    const next = { ...settings, accent };
    setSettings(next);
    saveThemeSettings(next);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-6 text-slate-900 dark:text-slate-100">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h3 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-100">Color Theme & Appearance</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Customize your SmarTrack CRM visual palette</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Section 1: Color Theme Presets */}
        <div className="space-y-3">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            Color Theme
          </label>
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(ACCENT_PRESETS) as AccentPreset[]).map((key) => {
              const preset = ACCENT_PRESETS[key];
              const isSelected = settings.accent === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleAccentChange(key)}
                  className={`p-3 rounded-xl border flex flex-col gap-2.5 text-left transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-950/30 font-bold ring-2 ring-blue-500/40'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-900 dark:text-slate-100 font-extrabold">{preset.name}</span>
                    {isSelected && (
                      <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400" />
                    )}
                  </div>
                  {/* Tri-color Preview Swatch: Sidebar, Workspace, Accent */}
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <span
                      title="Sidebar Color"
                      className="w-4 h-4 rounded-full border border-black/10 shadow-xs"
                      style={{ backgroundColor: preset.sidebarHex }}
                    />
                    <span
                      title="Workspace Background"
                      className="w-4 h-4 rounded-full border border-slate-300 shadow-xs"
                      style={{ backgroundColor: preset.workspaceHex }}
                    />
                    <span
                      title="Accent Color"
                      className="w-4 h-4 rounded-full border border-black/10 shadow-xs ml-auto"
                      style={{ backgroundColor: preset.accentHex }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 2: Mode Toggle */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            Display Mode
          </label>
          <div className="grid grid-cols-3 gap-2 bg-slate-100 dark:bg-slate-800/60 p-1.5 rounded-xl">
            {(['light', 'dark', 'system'] as ThemeMode[]).map((modeOption) => {
              const isActive = settings.mode === modeOption;
              return (
                <button
                  key={modeOption}
                  type="button"
                  onClick={() => handleModeChange(modeOption)}
                  className={`py-2 px-3 rounded-lg text-xs font-bold capitalize transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    isActive
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {modeOption}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold rounded-xl transition-all shadow-md"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
