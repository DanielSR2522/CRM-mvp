'use client';

import React from 'react';
import { formatTypingDateMMDDYYYY, formatDateMMDDYYYY } from '@/lib/formatters/date';

interface DateTextInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  error?: string;
  placeholder?: string;
  className?: string;
  name?: string;
  id?: string;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
}

export default function DateTextInput({
  value,
  onChange,
  disabled = false,
  readOnly = false,
  required = false,
  error,
  placeholder = 'MM/DD/YYYY',
  className = 'crm-input w-full',
  name = 'date',
  id,
  onBlur,
}: DateTextInputProps) {
  // If value is ISO YYYY-MM-DD, convert to MM/DD/YYYY for display
  const displayVal = value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? formatDateMMDDYYYY(value)
    : value;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatTypingDateMMDDYYYY(e.target.value);
    onChange(formatted);
  };

  return (
    <div className="w-full">
      <input
        type="text"
        id={id}
        name={name}
        value={displayVal || ''}
        onChange={handleChange}
        onBlur={onBlur}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        placeholder={placeholder}
        maxLength={10}
        className={`${className} ${error ? 'border-[#EF4444] focus:ring-[#EF4444]' : ''}`}
        autoComplete="off"
      />
      {error && <p className="text-[11px] text-[#EF4444] mt-1 font-medium">{error}</p>}
    </div>
  );
}
