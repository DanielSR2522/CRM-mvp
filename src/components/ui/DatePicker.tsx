'use client';

import React, { useState, useEffect, useRef } from 'react';
import { formatIsoToUsDate, usDateToIso, formatAsDateInput } from '@/utils/dateUtils';

export interface DatePickerProps {
  value?: string | null; // ISO YYYY-MM-DD or US MM/DD/YYYY
  onChange: (isoDate: string | null) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  optional?: boolean;
  error?: string | null;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function DatePicker({
  value,
  onChange,
  label,
  placeholder = 'MM/DD/YYYY',
  required = false,
  disabled = false,
  optional = false,
  error,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  
  // Popover calendar navigation state (Stabilized for SSR hydration)
  const [viewYear, setViewYear] = useState<number>(2026);
  const [viewMonth, setViewMonth] = useState<number>(6); // 0-indexed

  const containerRef = useRef<HTMLDivElement>(null);

  // Sync value from parent
  useEffect(() => {
    if (!value) {
      const now = new Date();
      setViewYear(now.getFullYear());
      setViewMonth(now.getMonth());
      setInputText('');
      return;
    }
    if (value.includes('/')) {
      setInputText(value);
      const iso = usDateToIso(value);
      if (iso) {
        const [y, m] = iso.split('-').map(Number);
        setViewYear(y);
        setViewMonth(m - 1);
      }
    } else {
      // ISO YYYY-MM-DD
      setInputText(formatIsoToUsDate(value));
      const parts = value.split('T')[0].split('-');
      if (parts.length === 3) {
        const [y, m] = parts.map(Number);
        setViewYear(y);
        setViewMonth(m - 1);
      }
    }
  }, [value]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const formatted = formatAsDateInput(raw);
    setInputText(formatted);

    if (formatted.length === 10) {
      const iso = usDateToIso(formatted);
      if (iso) {
        onChange(iso);
        const [y, m] = iso.split('-').map(Number);
        setViewYear(y);
        setViewMonth(m - 1);
      }
    } else if (formatted === '') {
      onChange(null);
    }
  };

  const selectDay = (day: number) => {
    const mm = String(viewMonth + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const iso = `${viewYear}-${mm}-${dd}`;
    setInputText(`${mm}/${dd}/${viewYear}`);
    onChange(iso);
    setIsOpen(false);
  };

  const handleToday = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    setViewYear(y);
    setViewMonth(m);
    selectDay(d);
  };

  const handleClear = () => {
    setInputText('');
    onChange(null);
    setIsOpen(false);
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // Calendar Days Calculation
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0 = Sun

  const daysGrid: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    daysGrid.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    daysGrid.push(d);
  }

  // Selected Day check
  const currentIso = value ? (value.includes('/') ? usDateToIso(value) : value.split('T')[0]) : null;
  const isSelectedDay = (day: number) => {
    if (!currentIso) return false;
    const mm = String(viewMonth + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${viewYear}-${mm}-${dd}` === currentIso;
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {label && (
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      <div className="relative">
        <input
          type="text"
          value={inputText}
          onChange={handleInputChange}
          onFocus={() => !disabled && setIsOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-all ${
            error
              ? 'border-rose-300 bg-rose-50/50 text-rose-900 focus:ring-rose-500'
              : 'border-slate-200 bg-white text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
          } ${disabled ? 'opacity-60 bg-slate-100 cursor-not-allowed' : ''}`}
        />

        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </button>
      </div>

      {error && <p className="mt-1 text-xs text-rose-600 font-semibold">{error}</p>}

      {/* Calendar Popover */}
      {isOpen && (
        <div className="absolute z-50 mt-2 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 space-y-3 left-0 top-full">
          {/* Popover Header: Month & Year Selector */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
            >
              ‹
            </button>
            <div className="flex items-center gap-1">
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
                className="text-xs font-bold bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 text-slate-800"
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={name} value={idx}>{name}</option>
                ))}
              </select>
              <select
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value))}
                className="text-xs font-bold bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 text-slate-800"
              >
                {Array.from({ length: 80 }, (_, i) => new Date().getFullYear() - 70 + i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
            >
              ›
            </button>
          </div>

          {/* Days of Week Header */}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400 uppercase">
            <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1">
            {daysGrid.map((day, i) => {
              if (day === null) {
                return <div key={`empty-${i}`} className="h-8" />;
              }
              const selected = isSelectedDay(day);
              return (
                <button
                  key={`day-${day}`}
                  type="button"
                  onClick={() => selectDay(day)}
                  className={`h-8 w-8 rounded-xl text-xs font-bold flex items-center justify-center transition-all ${
                    selected
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'hover:bg-slate-100 text-slate-800'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Footer Controls */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={handleToday}
              className="font-bold text-blue-600 hover:underline"
            >
              Today
            </button>
            {optional && (
              <button
                type="button"
                onClick={handleClear}
                className="font-semibold text-slate-500 hover:text-rose-600"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
