'use client';

import React from 'react';
import CollapsibleSidebar from '@/components/common/CollapsibleSidebar';

export type CommissionsSubTab = 'summary' | 'pending' | 'paid' | 'review' | 'unmatched';

interface CommissionsLeftRailProps {
  activeSubTab: CommissionsSubTab;
  setActiveSubTab: (tab: CommissionsSubTab) => void;
  pendingCount: number;
  paidCount: number;
  reviewCount: number;
  unmatchedCount: number;
}

export default function CommissionsLeftRail({
  activeSubTab,
  setActiveSubTab,
  pendingCount,
  paidCount,
  reviewCount,
  unmatchedCount,
}: CommissionsLeftRailProps) {
  const navItems: Array<{
    id: CommissionsSubTab;
    label: string;
    icon: string;
    badge?: number;
    badgeColor?: string;
  }> = [
    { id: 'summary', label: 'Summary', icon: '📊' },
    { id: 'pending', label: 'Pending payments', icon: '⏳', badge: pendingCount, badgeColor: 'bg-amber-100 text-amber-800' },
    { id: 'paid', label: 'Paid commissions', icon: '💰', badge: paidCount, badgeColor: 'bg-emerald-100 text-emerald-800' },
    { id: 'review', label: 'Needs review', icon: '⚠️', badge: reviewCount, badgeColor: 'bg-rose-100 text-rose-800' },
    { id: 'unmatched', label: 'Unmatched', icon: '❓', badge: unmatchedCount, badgeColor: 'bg-slate-100 text-slate-700' },
  ];

  return (
    <CollapsibleSidebar
      title="Commissions"
      variant="pane"
      storageKey="smartrack:commissions-sidebar-collapsed"
      className="lg:border-r-0"
    >
      <div className="space-y-1">
        <span className="block text-xs font-semibold text-slate-400 px-2 mb-2">
          Commissions workspace
        </span>
        {navItems.map((item) => {
          const isActive = activeSubTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSubTab(item.id)}
              className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                isActive
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-sm">{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </div>
              {item.badge !== undefined && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : item.badgeColor || 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </CollapsibleSidebar>
  );
}
