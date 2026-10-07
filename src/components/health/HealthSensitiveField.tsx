import React, { useState, useEffect } from 'react';
import { revealHealthSecret, saveHealthSecret } from '@/lib/health/health-service';

interface HealthSensitiveFieldProps {
  label: string;
  healthPolicyId: string | undefined;
  fieldName: string;
  hasValue: boolean;
  disabled?: boolean;
  value: string;
  onChange: (val: string) => void;
  type?: 'text' | 'password';
  onInlineSave?: () => void;
  labelWidth?: number;
}

export default function HealthSensitiveField({
  label,
  healthPolicyId,
  fieldName,
  hasValue,
  disabled,
  value,
  onChange,
  type = 'text',
  onInlineSave,
  labelWidth = 185
}: HealthSensitiveFieldProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInlineEditing, setIsInlineEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  // Auto-fetch decrypted secret on mount if hasValue is true and value is not yet loaded
  useEffect(() => {
    let active = true;
    if (hasValue && !value && healthPolicyId) {
      setLoading(true);
      revealHealthSecret(healthPolicyId, fieldName)
        .then(decrypted => {
          if (active && decrypted) {
            onChange(decrypted);
            setDraftValue(decrypted);
          }
        })
        .catch(err => {
          if (active) {
            console.error(`Failed to auto-decrypt ${fieldName}:`, err);
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    return () => {
      active = false;
    };
  }, [hasValue, value, healthPolicyId, fieldName]);

  const handleSave = async () => {
    setError(null);
    if (!healthPolicyId) {
      setError('Policy ID is missing');
      return;
    }
    setLoading(true);
    try {
      await saveHealthSecret(healthPolicyId, fieldName, draftValue);
      onChange(draftValue);
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
    if (value) return value;
    if (draftValue) return draftValue;
    return '—';
  };

  const gridClass = labelWidth === 150 ? 'grid-cols-[150px_minmax(0,1fr)]' : 'grid-cols-[185px_minmax(0,1fr)]';
  const widthLabelClass = labelWidth === 150 ? 'w-[150px]' : 'w-[185px]';

  const isLongText = fieldName === 'security_questions' || fieldName === 'marketplace_security_questions';
  const editorWidthClass = 'w-full flex-1 min-w-0';

  return (
    <div className={`grid ${gridClass} items-center min-h-[38px] py-[3px] gap-x-[18px] font-sans w-full`}>
      <span className={`text-[15px] font-normal text-[#52627A] text-right ${widthLabelClass} pr-[18px] leading-snug break-words shrink-0`}>{label}</span>

      {isInlineEditing ? (
        <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
          <input
            type="text"
            value={draftValue}
            onChange={e => {
              setDraftValue(e.target.value);
              onChange(e.target.value);
            }}
            placeholder={`Enter ${label}...`}
            className={`h-[34px] ${editorWidthClass} bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans`}
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Escape') {
                e.preventDefault();
                handleCancel();
              }
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleSave();
              }
            }}
          />
          <button
            type="button"
            disabled={loading}
            onClick={handleSave}
            className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
            title="Save"
          >
            ✓
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
            title="Cancel"
          >
            ✕
          </button>
          {error && <span className="text-rose-500 text-xs pl-1 shrink-0">{error}</span>}
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
            <div
              onClick={() => setIsInlineEditing(true)}
              className="group inline-flex items-center gap-1.5 cursor-pointer text-[15px] font-normal text-[#253247] leading-snug transition-colors font-sans"
              title={`Click to edit ${label}`}
            >
              <span>{getDisplayText()}</span>
              <svg
                className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </div>
          )}

          {error && <span className="text-rose-500 text-xs pl-1">{error}</span>}
        </div>
      )}
    </div>
  );
}
