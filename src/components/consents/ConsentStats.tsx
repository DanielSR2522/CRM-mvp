'use client';

import React from 'react';
import type { RequestStatus } from '@/lib/consents/types';

const CARDS: Array<{ status: RequestStatus; label: string; className: string; activeClassName: string }> = [
  {
    status: 'draft',
    label: 'Draft',
    className: 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900',
    activeClassName: 'border-slate-400 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 ring-2 ring-slate-300/40',
  },
  {
    status: 'pending',
    label: 'Pending',
    className: 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900',
    activeClassName: 'border-amber-400 dark:border-amber-600 bg-amber-50/50 dark:bg-amber-950/30 ring-2 ring-amber-400/40',
  },
  {
    status: 'sent',
    label: 'Sent',
    className: 'border-slate-200 dark:border-slate-800 hover:border-blue-200 dark:hover:border-blue-900 bg-white dark:bg-slate-900',
    activeClassName: 'border-blue-400 dark:border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 ring-2 ring-blue-400/40',
  },
  {
    status: 'viewed',
    label: 'Viewed',
    className: 'border-slate-200 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-900 bg-white dark:bg-slate-900',
    activeClassName: 'border-indigo-400 dark:border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 ring-2 ring-indigo-400/40',
  },
  {
    status: 'signed',
    label: 'Signed',
    className: 'border-slate-200 dark:border-slate-800 hover:border-emerald-200 dark:hover:border-emerald-900 bg-white dark:bg-slate-900',
    activeClassName: 'border-emerald-400 dark:border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/40 ring-2 ring-emerald-400/40',
  },
  {
    status: 'declined',
    label: 'Declined',
    className: 'border-slate-200 dark:border-slate-800 hover:border-rose-200 dark:hover:border-rose-900 bg-white dark:bg-slate-900',
    activeClassName: 'border-rose-400 dark:border-rose-600 bg-rose-50/60 dark:bg-rose-950/40 ring-2 ring-rose-400/40',
  },
  {
    status: 'expired',
    label: 'Expired',
    className: 'border-slate-200 dark:border-slate-800 hover:border-amber-200 dark:hover:border-amber-900 bg-white dark:bg-slate-900',
    activeClassName: 'border-amber-400 dark:border-amber-600 bg-amber-50/60 dark:bg-amber-950/40 ring-2 ring-amber-400/40',
  },
];

interface ConsentStatsProps {
  counts: Record<RequestStatus, number> | null;
  loading: boolean;
  activeStatus: RequestStatus | '';
  onSelect: (status: RequestStatus | '') => void;
}

export default function ConsentStats({ counts, loading, activeStatus, onSelect }: ConsentStatsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
      {CARDS.map((card) => {
        const active = activeStatus === card.status;
        const value = counts?.[card.status];

        return (
          <button
            key={card.status}
            type="button"
            onClick={() => onSelect(active ? '' : card.status)}
            aria-pressed={active}
            className={`rounded-2xl p-4 shadow-xs text-left transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              active ? card.activeClassName : card.className
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {card.label}
            </p>
            {loading ? (
              <div className="h-7 w-10 bg-slate-100 dark:bg-slate-800 rounded mt-1 animate-pulse" />
            ) : (
              <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums">
                {value ?? 0}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
