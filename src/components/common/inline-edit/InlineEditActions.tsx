'use client';

import React from 'react';

export interface InlineEditActionsProps {
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
  error?: string | null;
}

export default function InlineEditActions({
  onSave,
  onCancel,
  saving = false,
  error = null,
}: InlineEditActionsProps) {
  return (
    <div className="flex items-center gap-1.5 ml-2 shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSave();
        }}
        disabled={saving}
        title="Save (Enter)"
        className="w-6 h-6 rounded-lg bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white flex items-center justify-center text-xs font-bold transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? (
          <svg className="animate-spin w-3 h-3 text-white" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : (
          '✓'
        )}
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onCancel();
        }}
        disabled={saving}
        title="Cancel (Esc)"
        className="w-6 h-6 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 flex items-center justify-center text-xs font-bold transition-all disabled:opacity-50"
      >
        ✕
      </button>

      {error && (
        <span className="text-[10px] text-rose-600 font-semibold max-w-[120px] truncate" title={error}>
          {error}
        </span>
      )}
    </div>
  );
}
