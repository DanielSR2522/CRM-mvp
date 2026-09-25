import React, { useState, useEffect } from 'react';
import { revealTaxMemberSecret, saveTaxMemberSecret } from '@/lib/health/health-service';
import { formatSsnInput, isValidSsn } from '@/utils/ssnUtils';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInlineEditing, setIsInlineEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  // Auto-fetch decrypted tax member secret on mount if hasValue is true and value is not yet loaded
  useEffect(() => {
    let active = true;
    if (hasValue && !value && healthPolicyId) {
      setLoading(true);
      revealTaxMemberSecret(healthPolicyId, memberNumber, fieldName)
        .then(plaintext => {
          if (active && plaintext) {
            const formatted = fieldName === 'ssn' ? formatSsnInput(plaintext) : plaintext;
            onChange(formatted);
            setDraftValue(formatted);
          }
        })
        .catch(err => {
          if (active) {
            console.error(`Failed to auto-decrypt tax member field ${fieldName}:`, err);
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    return () => {
      active = false;
    };
  }, [hasValue, value, healthPolicyId, memberNumber, fieldName]);

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

  const handleSave = async () => {
    if (fieldName === 'ssn' && draftValue.trim()) {
      if (!isValidSsn(draftValue, false)) {
        setError('SSN must be exactly 9 digits');
        return;
      }
    }
    setError(null);
    if (!healthPolicyId) {
      setError('Policy ID is missing');
      return;
    }
    setLoading(true);
    try {
      await saveTaxMemberSecret(healthPolicyId, memberNumber, fieldName, draftValue);
      const formatted = fieldName === 'ssn' ? formatSsnInput(draftValue) : draftValue;
      onChange(formatted);
      setIsInlineEditing(false);
      if (onInlineSave) onInlineSave();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save secret';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setDraftValue(value);
    onChange(value);
    setError(null);
    setIsInlineEditing(false);
  };

  const getDisplayText = () => {
    if (value) return fieldName === 'ssn' ? formatSsnInput(value) : value;
    if (draftValue) return fieldName === 'ssn' ? formatSsnInput(draftValue) : draftValue;
    return '—';
  };

  return (
    <div className="grid grid-cols-[185px_minmax(0,1fr)] items-center min-h-[38px] py-[3px] gap-x-[18px] font-sans w-full">
      <span className="text-[15px] font-normal text-[#52627A] text-right w-[185px] pr-[18px] leading-snug break-words shrink-0">{label}</span>

      {isInlineEditing ? (
        <div className="flex items-center gap-2 flex-nowrap min-w-[320px]">
          <input
            type="text"
            value={draftValue}
            onChange={handleInputChange}
            placeholder={placeholder || (fieldName === 'ssn' ? '123-45-6789' : `Enter ${label}...`)}
            className="h-[34px] w-[260px] max-w-[260px] min-w-[220px] flex-none bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans"
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Escape') handleCancel();
              if (e.key === 'Enter') handleSave();
            }}
          />
          <button
            type="button"
            disabled={loading}
            onClick={handleSave}
            className="w-6 h-6 rounded-md bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-xs transition-colors disabled:opacity-50"
            title="Save"
          >
            ✓
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="w-6 h-6 rounded-md bg-slate-200 hover:bg-slate-300 text-slate-700 flex items-center justify-center text-xs font-bold shrink-0 transition-colors"
            title="Cancel"
          >
            ✕
          </button>
          {error && <span className="text-rose-500 text-[10px] pl-1 shrink-0">{error}</span>}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {loading ? (
            <span className="text-slate-400 text-xs flex items-center gap-1.5 font-sans">
              <svg className="animate-spin h-3 w-3 text-slate-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Loading...
            </span>
          ) : (
            <span
              onClick={() => setIsInlineEditing(true)}
              className="text-[15px] font-normal text-[#253247] text-left leading-snug whitespace-nowrap cursor-pointer hover:text-blue-600 hover:underline transition-colors font-sans"
              title={`Click to edit ${label}`}
            >
              {getDisplayText()}
            </span>
          )}

          {error && <span className="text-rose-500 text-[10px] pl-1">{error}</span>}
        </div>
      )}
    </div>
  );
}
