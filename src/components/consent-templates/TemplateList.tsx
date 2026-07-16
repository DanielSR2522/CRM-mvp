'use client';

import React from 'react';
import type { ConsentTemplate } from '@/lib/consents/types';
import TemplateCard, { type TemplateCardActions } from './TemplateCard';

interface TemplateListProps extends TemplateCardActions {
  templates: ConsentTemplate[];
  selectedId: string | null;
  onSelect: (template: ConsentTemplate) => void;
  loading: boolean;
  busyId?: string | null;
  /** True when filters are active, so "no results" reads differently from "none yet". */
  filtered: boolean;
  onClearFilters: () => void;
  onCreate: () => void;
}

export default function TemplateList({
  templates,
  selectedId,
  onSelect,
  loading,
  busyId,
  filtered,
  onClearFilters,
  onCreate,
  ...actions
}: TemplateListProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm animate-pulse">
            <div className="h-4 bg-slate-100 rounded w-1/2" />
            <div className="h-3 bg-slate-50 rounded w-3/4 mt-2.5" />
            <div className="flex gap-3 mt-4 pt-3 border-t border-slate-50">
              <div className="h-3 bg-slate-50 rounded w-16" />
              <div className="h-3 bg-slate-50 rounded w-12" />
              <div className="h-3 bg-slate-50 rounded w-20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="bg-white border border-slate-100 rounded-2xl p-10 shadow-sm text-center">
        <div className="w-12 h-12 mx-auto rounded-xl bg-slate-50 flex items-center justify-center mb-3">
          <svg className="w-6 h-6 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>

        {filtered ? (
          <>
            <p className="text-sm font-bold text-slate-700">No templates match these filters</p>
            <p className="text-xs text-slate-400 mt-1">Try widening your search.</p>
            <button
              type="button"
              onClick={onClearFilters}
              className="mt-4 text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
            >
              Clear filters
            </button>
          </>
        ) : (
          <>
            <p className="text-sm font-bold text-slate-700">No templates yet</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
              A template is the document your clients will read and sign. Create one to get started.
            </p>
            <button
              type="button"
              onClick={onCreate}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              New Template
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {templates.map((template) => (
        <TemplateCard
          key={template.id}
          template={template}
          selected={selectedId === template.id}
          onSelect={onSelect}
          busy={busyId === template.id}
          {...actions}
        />
      ))}
    </div>
  );
}
