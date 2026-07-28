'use client';

import React from 'react';
import type { RequestStatus } from '@/lib/consents/types';

/**
 * Colour carries meaning here, so it is chosen by outcome rather than by taste:
 * green only for signed, red only for the two failure states a person caused or
 * suffered, amber for anything still in flight.
 */
const STYLES: Record<RequestStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700' },
  pending: { label: 'Pending', className: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60' },
  sent: { label: 'Sent', className: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60' },
  viewed: { label: 'Viewed', className: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60' },
  signed: { label: 'Signed', className: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60' },
  declined: { label: 'Declined', className: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60' },
  expired: { label: 'Expired', className: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60' },
  cancelled: { label: 'Cancelled', className: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700' },
  failed: { label: 'Failed', className: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60' },
};

export default function ConsentStatusBadge({ status }: { status: RequestStatus }) {
  const style = STYLES[status] ?? STYLES.draft;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${style.className}`}
    >
      {style.label}
    </span>
  );
}
