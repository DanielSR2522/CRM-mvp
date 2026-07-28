'use client';

import React from 'react';
import type { DeliveryChannel, RequestStatus } from '@/lib/consents/types';
import { REQUEST_STATUSES } from '@/lib/consents/types';
import { CHANNEL_LABELS } from '@/lib/consents/status';
import DatePicker from '@/components/ui/DatePicker';
import { formatIsoToUsDate, usDateToIso } from '@/utils/dateUtils';

export interface FilterState {
  clientSearch: string;
  status: RequestStatus | '';
  templateId: string;
  channel: DeliveryChannel | '';
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;   // YYYY-MM-DD
}

export const EMPTY_FILTERS: FilterState = {
  clientSearch: '',
  status: '',
  templateId: '',
  channel: '',
  dateFrom: '',
  dateTo: '',
};

export function hasActiveFilters(f: FilterState): boolean {
  return Object.values(f).some((v) => v !== '');
}

interface ConsentFiltersProps {
  value: FilterState;
  onChange: (next: FilterState) => void;
  templates: Array<{ id: string; internal_name: string }>;
  resultCount: number;
  loading: boolean;
}

export default function ConsentFilters({
  value,
  onChange,
  templates,
  resultCount,
  loading,
}: ConsentFiltersProps) {
  const set = <K extends keyof FilterState>(key: K, v: FilterState[K]) =>
    onChange({ ...value, [key]: v });

  const active = hasActiveFilters(value);
  const rangeInvalid = Boolean(value.dateFrom && value.dateTo && value.dateFrom > value.dateTo);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Field id="f-client" label="Client">
          <input
            id="f-client"
            value={value.clientSearch}
            onChange={(e) => set('clientSearch', e.target.value)}
            placeholder="Client name..."
            className={inputClass}
          />
        </Field>

        <Field id="f-status" label="Status">
          <select
            id="f-status"
            value={value.status}
            onChange={(e) => set('status', e.target.value as RequestStatus | '')}
            className={inputClass}
          >
            <option value="">All statuses</option>
            {REQUEST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </Field>

        <Field id="f-template" label="Template">
          <select
            id="f-template"
            value={value.templateId}
            onChange={(e) => set('templateId', e.target.value)}
            className={inputClass}
          >
            <option value="">All templates</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.internal_name}
              </option>
            ))}
          </select>
        </Field>

        <Field id="f-channel" label="Channel">
          <select
            id="f-channel"
            value={value.channel}
            onChange={(e) => set('channel', e.target.value as DeliveryChannel | '')}
            className={inputClass}
          >
            <option value="">All channels</option>
            {(Object.keys(CHANNEL_LABELS) as DeliveryChannel[]).map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>

        <Field id="f-from" label="Created From">
          <DatePicker
            label=""
            optional
            value={value.dateFrom ? formatIsoToUsDate(value.dateFrom) : ''}
            onChange={(iso) => set('dateFrom', iso || '')}
          />
        </Field>

        <Field id="f-to" label="Created To">
          <DatePicker
            label=""
            optional
            value={value.dateTo ? formatIsoToUsDate(value.dateTo) : ''}
            onChange={(iso) => set('dateTo', iso || '')}
          />
        </Field>
      </div>

      {rangeInvalid && (
        <p className="text-xs text-rose-600 font-medium mt-2">
          The start date is after the end date, so nothing can match.
        </p>
      )}

      {active && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            {loading ? 'Searching…' : `${resultCount} result${resultCount === 1 ? '' : 's'}`}
          </span>
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline transition-colors"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}

const inputClass =
  'w-full text-xs text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
          {label}
        </label>
      )}
      {children}
    </div>
  );
}
