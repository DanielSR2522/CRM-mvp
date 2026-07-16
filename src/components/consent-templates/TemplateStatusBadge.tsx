'use client';

import React from 'react';
import type { TemplateStatus } from '@/lib/consents/types';

const STYLES: Record<TemplateStatus, { label: string; className: string }> = {
  draft: {
    label: 'Draft',
    className: 'bg-slate-100 text-slate-600 border-slate-200',
  },
  active: {
    label: 'Active',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  inactive: {
    label: 'Inactive',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  archived: {
    label: 'Archived',
    className: 'bg-slate-100 text-slate-400 border-slate-200',
  },
};

export default function TemplateStatusBadge({ status }: { status: TemplateStatus }) {
  const style = STYLES[status] ?? STYLES.draft;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${style.className}`}
    >
      {style.label}
    </span>
  );
}
