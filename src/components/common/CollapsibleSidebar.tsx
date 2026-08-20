'use client';

import React, { useState } from 'react';

interface CollapsibleSidebarProps {
  children: React.ReactNode;
  title?: string;
  className?: string;
  storageKey?: string;
}

export default function CollapsibleSidebar({
  children,
  title,
  className = '',
  storageKey = 'smartrack:sidebar-collapsed',
}: CollapsibleSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        return localStorage.getItem(storageKey) === 'true';
      } catch {
        return false;
      }
    }
    return false;
  });

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(storageKey, String(next));
        } catch {}
      }
      return next;
    });
  };

  if (isCollapsed) {
    return (
      <aside className="hidden lg:flex flex-col items-center bg-white border border-slate-100 rounded-2xl p-3 shadow-xs space-y-4 flex-shrink-0 lg:sticky lg:top-6 self-start transition-all">
        <button
          type="button"
          onClick={toggleCollapse}
          title="Expand sidebar"
          className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all flex items-center justify-center"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>
        {title && (
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest [writing-mode:vertical-lr] rotate-180 py-2">
            {title}
          </span>
        )}
      </aside>
    );
  }

  return (
    <aside className={`w-full lg:w-[320px] lg:min-w-[320px] lg:max-w-[320px] lg:shrink-0 lg:flex-none bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm space-y-4 lg:sticky lg:top-4 relative transition-all ${className}`}>
      <div className="absolute top-[22px] right-[22px] z-10">
        <button
          type="button"
          onClick={toggleCollapse}
          title="Collapse sidebar"
          className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all items-center justify-center"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>
      {children}
    </aside>
  );
}
