'use client';

import React, { useState, useEffect } from 'react';
import DatePicker from './DatePicker';
import { parseUsDateAnd12hTimeToDate, extractUsDateAnd12hTime, usDateToIso } from '@/utils/dateUtils';

export interface DateTimePickerProps {
  dateValue?: string | null; // ISO YYYY-MM-DD or US MM/DD/YYYY
  hourValue?: string; // "01"-"12"
  minuteValue?: string; // "00"-"55"
  ampmValue?: 'AM' | 'PM';
  onChangeDate: (dateUs: string | null) => void;
  onChangeHour: (hour: string) => void;
  onChangeMinute: (minute: string) => void;
  onChangeAmPm: (ampm: 'AM' | 'PM') => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string | null;
}

const HOURS_12 = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

export default function DateTimePicker({
  dateValue,
  hourValue = '09',
  minuteValue = '00',
  ampmValue = 'AM',
  onChangeDate,
  onChangeHour,
  onChangeMinute,
  onChangeAmPm,
  label,
  required = false,
  disabled = false,
  error,
}: DateTimePickerProps) {
  return (
    <div className="space-y-1.5 w-full">
      {label && (
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
        {/* Date Selector */}
        <div className="sm:col-span-6">
          <DatePicker
            value={dateValue}
            onChange={(isoStr) => {
              if (!isoStr) {
                onChangeDate(null);
              } else {
                const parts = isoStr.split('-');
                if (parts.length === 3) {
                  onChangeDate(`${parts[1]}/${parts[2]}/${parts[0]}`);
                }
              }
            }}
            disabled={disabled}
            placeholder="MM/DD/YYYY"
          />
        </div>

        {/* 12h Hour */}
        <div className="sm:col-span-2">
          <select
            value={hourValue}
            onChange={(e) => onChangeHour(e.target.value)}
            disabled={disabled}
            className="w-full px-2.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 font-bold text-xs focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
          >
            {HOURS_12.map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
        </div>

        {/* Minute */}
        <div className="sm:col-span-2">
          <select
            value={minuteValue}
            onChange={(e) => onChangeMinute(e.target.value)}
            disabled={disabled}
            className="w-full px-2.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 font-bold text-xs focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
          >
            {MINUTES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* AM / PM */}
        <div className="sm:col-span-2">
          <select
            value={ampmValue}
            onChange={(e) => onChangeAmPm(e.target.value as 'AM' | 'PM')}
            disabled={disabled}
            className="w-full px-2 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 font-bold text-xs focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
          >
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </select>
        </div>
      </div>

      {error && <p className="text-xs text-rose-600 font-semibold">{error}</p>}
    </div>
  );
}
