'use client';

import React from 'react';
import type { DeliveryChannel, RequestStatus } from '@/lib/consents/types';
import { REQUEST_STATUSES } from '@/lib/consents/types';
import { CHANNEL_LABELS } from '@/lib/consents/status';

export interface FilterState {
  clientSearch: string;
  status: RequestStatus | '';
  templateId: string;
  channel: DeliveryChannel | '';
  dateFrom: string;
  dateTo: string;
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

  // A backwards range returns nothing and looks like a bug in the app rather
  // than a typo, so it is called out explicitly.
  const rangeInvalid = Boolean(value.dateFrom && value.dateTo && value.dateFrom > value.dateTo);

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Field id="f-client" label="Client">
          <input
            id="f-client"
            value={value.clientSearch}
            onChange={(e) => set('clientSearch', e.target.value)}
            placeholder="Client name"
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

        <Field id="f-from" label="Created from">
          <input
            id="f-from"
            type="date"
            value={value.dateFrom}
            onChange={(e) => set('dateFrom', e.target.value)}
            className={rangeInvalid ? inputErrorClass : inputClass}
          />
        </Field>

        <Field id="f-to" label="Created to">
          <input
            id="f-to"
            type="date"
            value={value.dateTo}
            onChange={(e) => set('dateTo', e.target.value)}
            className={rangeInvalid ? inputErrorClass : inputClass}
          />
        </Field>
      </div>

      {rangeInvalid && (
        <p className="text-xs text-rose-600 font-medium mt-2">
          The start date is after the end date, so nothing can match.
        </p>
      )}

      {active && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-50">
          <span className="text-xs text-slate-500">
            {loading ? 'Searching…' : `${resultCount} result${resultCount === 1 ? '' : 's'}`}
          </span>
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}

const inputClass =
  'w-full text-sm text-slate-800 border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
const inputErrorClass =
  'w-full text-sm text-slate-800 border border-rose-300 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500';

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
