import React, { useState, useEffect } from 'react';
import { revealHealthSecret } from '@/lib/health/health-service';

interface HealthSensitiveFieldProps {
  label: string;
  healthPolicyId: string | undefined;
  fieldName: string;
  hasValue: boolean;
  disabled: boolean;
  value: string;
  onChange: (val: string) => void;
  type?: 'text' | 'password';
}

export default function HealthSensitiveField({
  label,
  healthPolicyId,
  fieldName,
  hasValue,
  disabled,
  value,
  onChange,
  type = 'text'
}: HealthSensitiveFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPasswordMask, setShowPasswordMask] = useState(type === 'password');
  const [error, setError] = useState<string | null>(null);

  // Auto-hide when the field is toggled off or read-only changes
  useEffect(() => {
    return () => {
      setRevealed(false);
      setError(null);
    };
  }, [disabled]);

  const handleReveal = async () => {
    if (!healthPolicyId) return;
    if (revealed) {
      setRevealed(false);
      onChange('');
      setRevealed(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const plaintext = await revealHealthSecret(healthPolicyId, fieldName);
      onChange(plaintext);
      setRevealed(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reveal';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // If policy not saved yet, just render simple text/password input
  if (!healthPolicyId) {
    return (
      <div className="space-y-1.5">
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 font-sans">{label}</label>
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={`Enter ${label}...`}
          className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all font-sans"
        />
      </div>
    );
  }

  // If in editing mode, show standard editable input
  if (!disabled) {
    return (
      <div className="space-y-1.5">
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 font-sans">{label}</label>
        <div className="relative">
          <input
            type={showPasswordMask ? 'password' : 'text'}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={hasValue ? '•••••••• (Type to overwrite)' : `Enter new ${label}...`}
            className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl pl-4 pr-10 py-2.5 text-slate-800 text-sm outline-none transition-all font-sans"
          />
          {type === 'password' && (
            <button
              type="button"
              onClick={() => setShowPasswordMask(!showPasswordMask)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              {showPasswordMask ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>
    );
  }

  // If in read-only mode, mask values unless revealed
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 font-sans">{label}</label>
      <div className="relative flex items-center bg-slate-100/60 border border-slate-200/80 rounded-xl pl-4 pr-3 py-2.5 h-[42px] transition-all">
        {loading ? (
          <span className="text-slate-400 text-xs flex items-center gap-1.5 font-sans">
            <svg className="animate-spin h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Decrypting...
          </span>
        ) : error ? (
          <span className="text-rose-500 text-xs font-sans truncate pr-16">{error}</span>
        ) : !hasValue ? (
          <span className="text-slate-400 text-xs italic font-sans">Not set</span>
        ) : revealed ? (
          <span className="text-slate-700 text-sm font-semibold truncate font-sans">
            {value}
          </span>
        ) : (
          <span className="text-slate-400 text-xs tracking-widest font-sans font-extrabold select-none">
            ••••••••
          </span>
        )}

        {hasValue && !loading && (
          <button
            type="button"
            onClick={handleReveal}
            className="absolute right-2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-600 hover:text-blue-800 bg-blue-50/50 hover:bg-blue-50 border border-blue-100 rounded-lg transition-all font-sans"
          >
            {revealed ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
    </div>
  );
}
