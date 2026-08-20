'use client';

import React, { useState, useEffect, useRef } from 'react';
import InlineEditActions from './InlineEditActions';

export interface InlineEditableTextProps {
  value: string | null | undefined;
  onSave: (newValue: string) => Promise<void> | void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  emptyDisplay?: string;
  className?: string;
  inputClassName?: string;
  type?: 'text' | 'email' | 'number';
}

export default function InlineEditableText({
  value,
  onSave,
  label,
  placeholder = 'Click to edit...',
  disabled = false,
  emptyDisplay = '—',
  className = '',
  inputClassName = '',
  type = 'text',
}: InlineEditableTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraftValue(value || '');
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  return (
    <div className={`w-full font-sans ${className}`}>
      {label && <span className="block text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</span>}

      {isEditing ? (
        <div className="flex items-center gap-1.5 w-full">
          <input
            ref={inputRef}
            type={type}
            value={draftValue}
            onChange={(e) => {
              setDraftValue(e.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            disabled={saving}
            placeholder={placeholder}
            className={`w-full bg-white border border-blue-500 ring-2 ring-blue-100 rounded-xl px-3 py-1.5 text-sm text-slate-900 font-bold outline-none transition-all ${inputClassName}`}
          />
          <InlineEditActions onSave={handleSave} onCancel={handleCancel} saving={saving} error={error} />
        </div>
      ) : (
        <div
          onClick={handleStartEdit}
          title={disabled ? undefined : 'Click to edit'}
          className={`group flex items-center justify-between py-1 px-2 -mx-2 rounded-lg transition-all ${
            disabled ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-100/80 hover:text-blue-600'
          }`}
        >
          <span className="text-[15px] font-semibold text-slate-950 truncate">
            {value ? value : <span className="text-slate-400 font-normal italic">{emptyDisplay}</span>}
          </span>
          {!disabled && (
            <svg
              className="w-3.5 h-3.5 text-slate-350 opacity-0 group-hover:opacity-100 transition-opacity ml-1.5 shrink-0"
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
