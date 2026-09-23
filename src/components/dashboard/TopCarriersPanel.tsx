'use client';

import React from 'react';
import Link from 'next/link';

export interface TopCarrierItem {
  id: string;
  name: string;
  count: number;
  percentage: number;
  barColor: string;
}

interface TopCarriersPanelProps {
  title: string;
  carriers: TopCarrierItem[];
  totalCount: number;
  loading?: boolean;
}

export default function TopCarriersPanel({ title, carriers, totalCount, loading }: TopCarriersPanelProps) {
  return (
    <div className="crm-card p-4 flex flex-col justify-between bg-white border border-[#E8ECF2] rounded-lg shadow-sm">
      <div>
        <div className="flex items-center justify-between border-b border-[#E8ECF2] pb-2.5 mb-3">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-[#F3E8FF] text-[#A855F7] text-xs">
              🏆
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
          <div className="py-5 text-center text-xs text-[#7C8799]">Ranking top carriers...</div>
        ) : carriers.length === 0 || totalCount === 0 ? (
          <div className="py-3 px-3 bg-[#F8FAFC] rounded-lg border border-[#F1F5F9] text-center space-y-1">
            <div className="text-lg">🏆</div>
            <p className="text-xs font-medium text-[#556176]">No carrier records found.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {carriers.map((carrier) => (
              <div key={carrier.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#1E293B] text-[11px] truncate max-w-[180px]">
                    {carrier.name}
                  </span>
                  <span className="font-bold text-[#1E293B] text-[11px]">{carrier.percentage}%</span>
                </div>

                {/* HORIZONTAL BAR */}
                <div className="w-full h-2 bg-[#F1F5F9] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${carrier.barColor}`}
                    style={{ width: `${Math.min(100, Math.max(0, carrier.percentage))}%` }}
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
