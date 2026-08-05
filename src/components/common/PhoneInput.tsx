'use client';

import React from 'react';
import { formatUSPhone } from '@/lib/formatters/phone';

interface PhoneInputProps {
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

export default function PhoneInput({
  value,
  onChange,
  disabled = false,
  readOnly = false,
  required = false,
  error,
  placeholder = '###-###-####',
  className = 'crm-input w-full',
  name = 'phone',
  id,
  onBlur,
}: PhoneInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatUSPhone(e.target.value);
    onChange(formatted);
  };

  return (
    <div className="w-full">
      <input
        type="text"
        id={id}
        name={name}
        value={formatUSPhone(value)}
        onChange={handleChange}
        onBlur={onBlur}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        placeholder={placeholder}
        maxLength={12}
        className={`${className} ${error ? 'border-[#EF4444] focus:ring-[#EF4444]' : ''}`}
        autoComplete="off"
      />
      {error && <p className="text-[11px] text-[#EF4444] mt-1 font-medium">{error}</p>}
    </div>
  );
}
