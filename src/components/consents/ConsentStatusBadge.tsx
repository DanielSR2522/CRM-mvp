'use client';

import React from 'react';
import type { RequestStatus } from '@/lib/consents/types';

/**
 * Colour carries meaning here, so it is chosen by outcome rather than by taste:
 * green only for signed, red only for the two failure states a person caused or
 * suffered, amber for anything still in flight.
 */
const STYLES: Record<RequestStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  pending: { label: 'Pending', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  sent: { label: 'Sent', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  viewed: { label: 'Viewed', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  signed: { label: 'Signed', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  declined: { label: 'Declined', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  expired: { label: 'Expired', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  cancelled: { label: 'Cancelled', className: 'bg-slate-100 text-slate-400 border-slate-200' },
  failed: { label: 'Failed', className: 'bg-rose-50 text-rose-700 border-rose-200' },
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
