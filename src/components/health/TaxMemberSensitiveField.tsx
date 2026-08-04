import React, { useState, useEffect } from 'react';
import { revealTaxMemberSecret } from '@/lib/health/health-service';
import { formatSsnInput, isValidSsn, normalizeSsn, maskSsn } from '@/utils/ssnUtils';

interface TaxMemberSensitiveFieldProps {
  label: string;
  healthPolicyId: string | undefined;
  memberNumber: number;
  fieldName: 'ssn' | 'immigration_card_number' | 'immigration_uscis_number' | 'immigration_alien_number';
  hasValue: boolean;
  disabled: boolean;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  onInlineSave?: () => void;
}

export default function TaxMemberSensitiveField({
  label,
  healthPolicyId,
  memberNumber,
  fieldName,
  hasValue,
  disabled,
  value,
  onChange,
  placeholder,
  onInlineSave
}: TaxMemberSensitiveFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInlineEditing, setIsInlineEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  useEffect(() => {
    return () => {
      setRevealed(false);
      setError(null);
    };
  }, [disabled]);

  const handleReveal = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!healthPolicyId) return;
    if (revealed) {
      setRevealed(false);
      onChange('');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const plaintext = await revealTaxMemberSecret(healthPolicyId, memberNumber, fieldName);
      const formatted = fieldName === 'ssn' ? formatSsnInput(plaintext) : plaintext;
      onChange(formatted);
      setDraftValue(formatted);
      setRevealed(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reveal secret';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (fieldName === 'ssn') {
      const formatted = formatSsnInput(raw);
      setDraftValue(formatted);
      onChange(formatted);
    } else {
      setDraftValue(raw);
      onChange(raw);
    }
    setError(null);
  };

  const handleSave = () => {
    if (fieldName === 'ssn' && draftValue.trim()) {
      if (!isValidSsn(draftValue, false)) {
        setError('SSN must be exactly 9 digits');
        return;
      }
    }
    setError(null);
    setIsInlineEditing(false);
    if (onInlineSave) onInlineSave();
  };

  const handleCancel = () => {
    setDraftValue(value);
    onChange(value);
    setError(null);
    setIsInlineEditing(false);
  };

  // Display Text Logic
  const getDisplayText = () => {
    if (!hasValue && !value && !draftValue) {
      return '—';
    }
    if (revealed || (value && !hasValue)) {
      return fieldName === 'ssn' ? formatSsnInput(value) : value;
    }
    if (hasValue && fieldName === 'ssn') {
      return '•••-••-••••';
    }
    return '••••••••';
  };

  return (
    <div className="py-2 flex items-center justify-between gap-4 min-h-[36px] font-sans w-full">
      <span className="text-slate-500 font-medium text-xs">{label}</span>

      {isInlineEditing ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={draftValue}
            onChange={handleInputChange}
            placeholder={placeholder || (fieldName === 'ssn' ? '123-45-6789' : `Enter ${label}...`)}
            className="w-36 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none font-sans"
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Escape') handleCancel();
              if (e.key === 'Enter') handleSave();
            }}
          />
          <button
            type="button"
            onClick={handleSave}
            className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
            title="Save"
          >
            ✓
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
            title="Cancel"
          >
            ✕
          </button>
          {error && <span className="text-rose-500 text-[10px] pl-1">{error}</span>}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {loading ? (
            <span className="text-slate-400 text-xs flex items-center gap-1.5 font-sans">
              <svg className="animate-spin h-3 w-3 text-slate-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Decrypting...
            </span>
          ) : (
            <span
              onClick={() => setIsInlineEditing(true)}
              className="text-slate-900 text-xs font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
              title={`Click to edit ${label}`}
            >
              {getDisplayText()}
            </span>
          )}

          {hasValue && !loading && (
            <button
              type="button"
              onClick={handleReveal}
              className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-600 hover:text-blue-800 bg-blue-50/50 hover:bg-blue-50 border border-blue-100 rounded transition-all font-sans"
            >
              {revealed ? 'Hide' : 'Show'}
            </button>
          )}

          {error && <span className="text-rose-500 text-[10px] pl-1">{error}</span>}
        </div>
      )}
    </div>
  );
}
