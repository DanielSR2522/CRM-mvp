'use client';

import React from 'react';
import type { RequestStatus } from '@/lib/consents/types';

const CARDS: Array<{ status: RequestStatus; label: string; className: string; activeClassName: string }> = [
  {
    status: 'draft',
    label: 'Draft',
    className: 'border-slate-200 hover:border-slate-300 bg-white text-slate-900',
    activeClassName: 'border-slate-400 bg-slate-100 ring-2 ring-slate-300/40 text-slate-950 font-extrabold',
  },
  {
    status: 'pending',
    label: 'Pending',
    className: 'border-slate-200 hover:border-slate-300 bg-white text-slate-900',
    activeClassName: 'border-amber-400 bg-amber-50 ring-2 ring-amber-400/40 text-amber-950 font-extrabold',
  },
  {
    status: 'sent',
    label: 'Sent',
    className: 'border-slate-200 hover:border-blue-200 bg-white text-slate-900',
    activeClassName: 'border-blue-500 bg-blue-50 ring-2 ring-blue-400/40 text-blue-950 font-extrabold',
  },
  {
    status: 'viewed',
    label: 'Viewed',
    className: 'border-slate-200 hover:border-indigo-200 bg-white text-slate-900',
    activeClassName: 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-400/40 text-indigo-950 font-extrabold',
  },
  {
    status: 'signed',
    label: 'Signed',
    className: 'border-slate-200 hover:border-emerald-200 bg-white text-slate-900',
    activeClassName: 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-400/40 text-emerald-950 font-extrabold',
  },
  {
    status: 'declined',
    label: 'Declined',
    className: 'border-slate-200 hover:border-rose-200 bg-white text-slate-900',
    activeClassName: 'border-rose-500 bg-rose-50 ring-2 ring-rose-400/40 text-rose-950 font-extrabold',
  },
  {
    status: 'expired',
    label: 'Expired',
    className: 'border-slate-200 hover:border-amber-200 bg-white text-slate-900',
    activeClassName: 'border-amber-500 bg-amber-50 ring-2 ring-amber-400/40 text-amber-950 font-extrabold',
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
            className={`rounded-2xl p-4 border shadow-2xs text-left transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              active ? card.activeClassName : card.className
            }`}
          >
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
              {card.label}
            </p>
            {loading ? (
              <div className="h-7 w-10 bg-slate-100 rounded mt-1 animate-pulse" />
            ) : (
              <p className="text-xl font-black mt-1 text-slate-900">
                {typeof value === 'number' ? value : 0}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
