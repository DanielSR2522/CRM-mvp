'use client';

import React from 'react';
import type { RequestStatus } from '@/lib/consents/types';

/**
 * The summary cards.
 *
 * Every number comes from a real COUNT against the database, filtered the same
 * way the table is — a card that counted only the current page would drop to 25
 * the moment pagination kicked in and quietly mislead.
 *
 * Clicking a card filters by that status, which is why they are buttons.
 */

const CARDS: Array<{ status: RequestStatus; label: string; className: string; activeClassName: string }> = [
  {
    status: 'draft',
    label: 'Draft',
    className: 'border-slate-200 hover:border-slate-300',
    activeClassName: 'border-slate-400 bg-slate-50 ring-2 ring-slate-300/40',
  },
  {
    status: 'pending',
    label: 'Pending',
    className: 'border-slate-200 hover:border-slate-300',
    activeClassName: 'border-slate-400 bg-slate-50 ring-2 ring-slate-300/40',
  },
  {
    status: 'sent',
    label: 'Sent',
    className: 'border-slate-100 hover:border-blue-200',
    activeClassName: 'border-blue-300 bg-blue-50/60 ring-2 ring-blue-300/40',
  },
  {
    status: 'viewed',
    label: 'Viewed',
    className: 'border-slate-100 hover:border-indigo-200',
    activeClassName: 'border-indigo-300 bg-indigo-50/60 ring-2 ring-indigo-300/40',
  },
  {
    status: 'signed',
    label: 'Signed',
    className: 'border-slate-100 hover:border-emerald-200',
    activeClassName: 'border-emerald-300 bg-emerald-50/60 ring-2 ring-emerald-300/40',
  },
  {
    status: 'declined',
    label: 'Declined',
    className: 'border-slate-100 hover:border-rose-200',
    activeClassName: 'border-rose-300 bg-rose-50/60 ring-2 ring-rose-300/40',
  },
  {
    status: 'expired',
    label: 'Expired',
    className: 'border-slate-100 hover:border-amber-200',
    activeClassName: 'border-amber-300 bg-amber-50/60 ring-2 ring-amber-300/40',
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
            // Clicking the active card clears the filter — the same gesture in
            // and out, so there is no separate "clear" to hunt for.
            onClick={() => onSelect(active ? '' : card.status)}
            aria-pressed={active}
            className={`bg-white border rounded-2xl p-4 shadow-sm text-left transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              active ? card.activeClassName : card.className
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {card.label}
            </p>
            {loading ? (
              <div className="h-7 w-10 bg-slate-100 rounded mt-1 animate-pulse" />
            ) : (
              <p className="text-2xl font-extrabold text-slate-900 mt-0.5 tabular-nums">
                {value ?? 0}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
