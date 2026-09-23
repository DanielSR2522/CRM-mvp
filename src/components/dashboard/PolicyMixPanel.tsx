'use client';

import React from 'react';
import Link from 'next/link';

export interface PolicyMixItem {
  id: string;
  name: string;
  count: number;
  percentage: number;
  barColor: string;
  iconBg: string;
  iconEmoji: string;
}

interface PolicyMixPanelProps {
  title: string;
  items: PolicyMixItem[];
  totalCount: number;
  loading?: boolean;
}

export default function PolicyMixPanel({ title, items, totalCount, loading }: PolicyMixPanelProps) {
  return (
    <div className="crm-card p-4 flex flex-col justify-between bg-white border border-[#E8ECF2] rounded-lg shadow-sm">
      <div>
        <div className="flex items-center justify-between border-b border-[#E8ECF2] pb-2.5 mb-3">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-[#DCFCE7] text-[#16A34A] text-xs">
              📊
            </span>
            <h2 className="text-xs font-semibold text-[#172033]">{title}</h2>
          </div>
          <Link
            href="/policies"
            className="text-[11px] font-semibold text-[#2563EB] hover:text-[#1D4ED8] transition-colors flex items-center gap-1"
          >
            <span>View All</span>
            <span>→</span>
          </Link>
        </div>

        {loading ? (
          <div className="py-5 text-center text-xs text-[#7C8799]">Calculating policy distribution...</div>
        ) : items.length === 0 || totalCount === 0 ? (
          <div className="py-3 px-3 bg-[#F8FAFC] rounded-lg border border-[#F1F5F9] text-center space-y-1">
            <div className="text-lg">📊</div>
            <p className="text-xs font-medium text-[#556176]">No policies found in this category.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {items.map((item) => (
              <div key={item.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-5 h-5 rounded flex items-center justify-center text-[11px] ${item.iconBg}`}>
                      {item.iconEmoji}
                    </span>
                    <span className="font-bold text-[#1E293B] text-[11px]">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-[10px] font-semibold text-[#64748B]">{item.percentage}%</span>
                    <span className="font-bold text-[#1E293B] text-[11px] min-w-[24px] text-right">{item.count}</span>
                  </div>
                </div>

                {/* HORIZONTAL PROGRESS BAR */}
                <div className="w-full h-2 bg-[#F1F5F9] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${item.barColor}`}
                    style={{ width: `${Math.min(100, Math.max(0, item.percentage))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
