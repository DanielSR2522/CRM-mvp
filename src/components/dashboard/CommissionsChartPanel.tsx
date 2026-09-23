'use client';

import React from 'react';
import Link from 'next/link';

export interface MonthlyCommissionBar {
  monthName: string;
  amount: number;
  highlight?: boolean;
}

interface CommissionsChartPanelProps {
  title: string;
  thisWeekAmount: number | null;
  thisMonthAmount: number | null;
  ytdAmount: number | null;
  monthlyBars: MonthlyCommissionBar[];
  hasData: boolean;
  unavailableReason?: string;
  loading?: boolean;
}

export default function CommissionsChartPanel({
  title,
  thisWeekAmount,
  thisMonthAmount,
  ytdAmount,
  monthlyBars,
  hasData,
  unavailableReason,
  loading,
}: CommissionsChartPanelProps) {
  const formatCurrency = (val: number | null) => {
    if (val === null || val === undefined) return '—';
    return `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const maxAmount = Math.max(...monthlyBars.map((b) => b.amount), 1);

  return (
    <div className="crm-card p-4 flex flex-col justify-between bg-white border border-[#E8ECF2] rounded-lg shadow-sm">
      <div>
        <div className="flex items-center justify-between border-b border-[#E8ECF2] pb-2.5 mb-3">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-[#DCFCE7] text-[#16A34A] text-xs">
              💰
            </span>
            <h2 className="text-xs font-semibold text-[#172033]">{title}</h2>
          </div>
          <Link
            href="/commissions"
            className="text-[11px] font-semibold text-[#2563EB] hover:text-[#1D4ED8] transition-colors flex items-center gap-1"
          >
            <span>View Details</span>
            <span>→</span>
          </Link>
        </div>

        {loading ? (
          <div className="py-5 text-center text-xs text-[#7C8799]">Loading commission metrics...</div>
        ) : !hasData ? (
          <div className="py-3 px-3 bg-[#F8FAFC] rounded-lg border border-[#F1F5F9] text-center space-y-1">
            <div className="text-lg">💵</div>
            <p className="text-xs font-medium text-[#556176]">
              {unavailableReason || 'No commission payment records found for this period.'}
            </p>
            <p className="text-[11px] text-[#94A3B8]">
              Import statement evidence in Commissions module to populate payment totals.
            </p>
            <Link href="/commissions" className="inline-block text-[11px] font-semibold text-[#2563EB] hover:underline pt-0.5">
              Go to Commissions →
            </Link>
          </div>
        ) : (
          <div>
            {/* KPI TOTALS ROW */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div>
                <div className="text-base font-bold text-[#1E293B] tracking-tight">
                  {formatCurrency(thisWeekAmount)}
                </div>
                <div className="text-[10px] font-semibold text-[#64748B]">This Week</div>
              </div>
              <div>
                <div className="text-base font-bold text-[#1E293B] tracking-tight">
                  {formatCurrency(thisMonthAmount)}
                </div>
                <div className="text-[10px] font-semibold text-[#64748B]">This Month</div>
              </div>
              <div>
                <div className="text-base font-bold text-[#1E293B] tracking-tight">
                  {formatCurrency(ytdAmount)}
                </div>
                <div className="text-[10px] font-semibold text-[#64748B]">YTD</div>
              </div>
            </div>

            {/* MONTHLY BAR CHART */}
            <div className="h-24 flex items-end justify-between gap-1.5 pt-2 border-t border-[#F1F5F9]">
              {monthlyBars.map((bar) => {
                const heightPct = Math.min(100, Math.max(8, (bar.amount / maxAmount) * 100));
                return (
                  <div key={bar.monthName} className="flex-1 flex flex-col items-center gap-1 group relative">
                    {/* Tooltip on hover */}
                    {bar.amount > 0 && (
                      <div className="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity bg-[#1E293B] text-white text-[10px] px-1.5 py-0.5 rounded shadow pointer-events-none whitespace-nowrap z-10 font-bold">
                        ${bar.amount.toLocaleString()}
                      </div>
                    )}
                    <div className="w-full h-18 flex items-end">
                      <div
                        className={`w-full rounded-t-sm transition-all duration-300 ${
                          bar.highlight
                            ? 'bg-[#2563EB]'
                            : 'bg-[#93C5FD] group-hover:bg-[#3B82F6]'
                        }`}
                        style={{ height: `${heightPct}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-semibold text-[#94A3B8]">{bar.monthName}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
