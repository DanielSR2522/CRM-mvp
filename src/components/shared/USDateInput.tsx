'use client';

import React, { useState, useEffect } from 'react';
import { formatDateForDisplay, parseDateForStorage, isValidUSDate } from '@/lib/formatters/date';

interface USDateInputProps {
  value: string | null | undefined;
  onChange: (isoValue: string, displayValue: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
}

export default function USDateInput({
  value,
  onChange,
  placeholder = 'MM/DD/YYYY',
  className = '',
  disabled = false,
  required = false,
  name,
  id,
}: USDateInputProps) {
  const [displayValue, setDisplayValue] = useState<string>(() => formatDateForDisplay(value));
  const [error, setError] = useState<boolean>(false);

  // Synchronize internal display state if external value changes (e.g. modal edit load)
  useEffect(() => {
    const formatted = formatDateForDisplay(value);
    setDisplayValue(formatted);
    setError(formatted.length > 0 && !isValidUSDate(formatted));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const digits = raw.replace(/\D/g, '').slice(0, 8);

    // Apply MM/DD/YYYY mask
    let masked = '';
    if (digits.length > 0) {
      masked = digits.slice(0, 2);
      if (digits.length >= 3) {
        masked += '/' + digits.slice(2, 4);
      }
      if (digits.length >= 5) {
        masked += '/' + digits.slice(4, 8);
      }
    }

    setDisplayValue(masked);

    if (masked.length === 10) {
      if (isValidUSDate(masked)) {
        setError(false);
        const iso = parseDateForStorage(masked);
        onChange(iso, masked);
      } else {
        setError(true);
        onChange('', masked);
      }
    } else {
      setError(false);
      onChange('', masked);
    }
  };

  const handleBlur = () => {
    if (displayValue.length > 0 && displayValue.length < 10) {
      setError(true);
    } else if (displayValue.length === 10) {
      setError(!isValidUSDate(displayValue));
    }
  };

  return (
    <div className="relative w-full">
      <input
        type="text"
        inputMode="numeric"
        id={id}
        name={name}
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        maxLength={10}
        disabled={disabled}
        required={required}
        className={`w-full border rounded-lg p-2 font-mono text-xs focus:ring-2 focus:ring-indigo-500 transition-all ${
          error
            ? 'border-rose-400 bg-rose-50 text-rose-900 focus:border-rose-500 font-bold'
            : 'border-slate-200 bg-slate-50 focus:bg-white text-slate-900'
        } ${className}`}
      />
      {error && (
        <span className="text-[10px] font-bold text-rose-600 block mt-0.5 font-sans">
          Invalid date (MM/DD/YYYY)
        </span>
      )}
    </div>
  );
}
