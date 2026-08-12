'use client';

import React from 'react';

interface Props<T> {
  title: string;
  count: number;
  emptyText: string;
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  onAdd: () => void;
  fullWidth?: boolean;
}

export default function MedicalCategoryCard<T>({
  title,
  count,
  emptyText,
  items,
  renderItem,
  onAdd,
  fullWidth = false,
}: Props<T>) {
  return (
    <div className={`crm-card p-4 flex flex-col justify-between space-y-3 ${fullWidth ? 'w-full' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#E8ECF2] pb-2.5">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-bold text-[#172033]">{title}</h4>
          <span className="inline-flex items-center justify-center bg-[#EEF4FF] text-[#2563EB] px-2 py-0.5 rounded-full text-xs font-bold border border-[#DBEAFE]">
            {count}
          </span>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 bg-[#2563EB] hover:bg-[#1D4ED8] active:scale-[0.98] text-white text-xs font-semibold px-2.5 py-1 rounded-md transition-all shadow-sm"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
          </svg>
          Add
        </button>
      </div>

      {/* Content List / Empty State */}
      <div className="flex-1 min-h-[90px]">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center text-[#94A3B8]">
            <p className="text-xs">{emptyText}</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {items.map((item) => renderItem(item))}
          </div>
        )}
      </div>
    </div>
  );
}
