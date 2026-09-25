'use client';

import React, { useState, useEffect, useRef } from 'react';
import InlineEditActions from './InlineEditActions';

export interface InlineEditableTextareaProps {
  value: string | null | undefined;
  onSave: (newValue: string) => Promise<void> | void;
  label?: string;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  emptyDisplay?: string;
  className?: string;
}

export default function InlineEditableTextarea({
  value,
  onSave,
  label,
  placeholder = 'Click to edit notes...',
  rows = 3,
  disabled = false,
  emptyDisplay = '—',
  className = '',
}: InlineEditableTextareaProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraftValue(value || '');
  }, [value]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    if (disabled) return;
    setDraftValue(value || '');
    setError(null);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setDraftValue(value || '');
    setError(null);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(draftValue.trim());
      setIsEditing(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  return (
    <div className={`w-full font-sans ${className}`}>
      {label && <span className="block text-[15px] font-normal text-[#52627A] leading-snug mb-1">{label}</span>}

      {isEditing ? (
        <div className="space-y-2 w-full max-w-[320px] sm:max-w-[420px]">
          <textarea
            ref={textareaRef}
            rows={rows}
            value={draftValue}
            onChange={(e) => {
              setDraftValue(e.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            disabled={saving}
            placeholder={placeholder}
            className="w-full bg-white border border-slate-300 rounded-md p-3 text-[15px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors resize-y font-sans"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400 font-normal">Ctrl+Enter to save, Esc to cancel</span>
            <InlineEditActions onSave={handleSave} onCancel={handleCancel} saving={saving} error={error} />
          </div>
        </div>
      ) : (
        <div
          onClick={handleStartEdit}
          title={disabled ? undefined : 'Click to edit'}
          className={`group flex items-start justify-between py-1.5 px-2 -mx-2 rounded-lg transition-all ${
            disabled ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-100/80 hover:text-blue-600'
          }`}
        >
          <span className="text-[15px] font-normal text-[#253247] leading-snug whitespace-pre-wrap">
            {value ? value : <span className="text-slate-400 font-normal italic">{emptyDisplay}</span>}
          </span>
          {!disabled && (
            <svg
              className="w-3.5 h-3.5 text-slate-350 opacity-0 group-hover:opacity-100 transition-opacity ml-1.5 shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          )}
        </div>
      )}
    </div>
  );
}
