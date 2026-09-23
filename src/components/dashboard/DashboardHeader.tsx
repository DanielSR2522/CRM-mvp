'use client';

import React from 'react';
import { formatDateMMDDYYYY } from '@/lib/formatters/date';

export type DashboardMode = 'non_pc' | 'pc';

interface DashboardHeaderProps {
  userName: string;
  mode: DashboardMode;
  onModeChange: (mode: DashboardMode) => void;
  selectedPeriod: string;
  onPeriodChange: (period: string) => void;
  isPcEnabled?: boolean;
}

export default function DashboardHeader({
  userName,
  mode,
  onModeChange,
  selectedPeriod,
  onPeriodChange,
  isPcEnabled = true,
}: DashboardHeaderProps) {
  const firstName = userName ? userName.split(' ')[0] : 'Agent';
  const currentDateFormatted = formatDateMMDDYYYY(new Date());

  // Format today's day of week & date e.g. "Tue, Jan 14, 2025"
  const formattedTodayDate = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="crm-card p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white border border-[#E8ECF2] rounded-lg shadow-sm">
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-lg sm:text-xl font-bold text-[#172033] tracking-tight flex items-center gap-2">
            <span>👋</span>
            {mode === 'non_pc' || !isPcEnabled ? (
              <span>Good morning, {firstName}</span>
            ) : (
              <span>P&C Dashboard</span>
            )}
          </h1>
        </div>
        <p className="text-xs text-[#556176] mt-0.5 font-medium">
          {mode === 'non_pc' || !isPcEnabled
            ? "Here's your Health, Medicare, Supplemental and Life business overview. Stay on top of your clients, policies and opportunities."
            : "Here's your Property & Casualty business overview. Stay on top of your renewals, production and opportunities."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* DASHBOARD MODE TOGGLE SWITCH */}
        <div className="inline-flex items-center p-1 bg-[#F1F5F9] rounded-lg border border-[#E2E8F0]">
          <button
            type="button"
            onClick={() => onModeChange('non_pc')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-150 ${
              mode === 'non_pc' || !isPcEnabled
                ? 'bg-[#2563EB] text-white shadow-sm font-bold'
                : 'text-[#64748B] hover:text-[#1E293B]'
            }`}
          >
            All Business (Non-P&C)
          </button>
          {isPcEnabled && (
            <button
              type="button"
              onClick={() => onModeChange('pc')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-150 ${
                mode === 'pc'
                  ? 'bg-[#2563EB] text-white shadow-sm font-bold'
                  : 'text-[#64748B] hover:text-[#1E293B]'
              }`}
            >
              P&C
            </button>
          )}
        </div>

        {/* DATE INDICATOR */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-md text-xs font-semibold text-[#475569]">
          <svg className="w-3.5 h-3.5 text-[#64748B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span>{formattedTodayDate}</span>
        </div>

        {/* PERIOD DROPDOWN */}
        <select
          value={selectedPeriod}
          onChange={(e) => onPeriodChange(e.target.value)}
          className="bg-white border border-[#CBD5E1] rounded-md px-3 py-1.5 text-xs text-[#1E293B] font-semibold focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-colors shadow-sm"
        >
          <option value="THIS_MONTH">This Month</option>
          <option value="THIS_QUARTER">This Quarter</option>
          <option value="YTD">YTD</option>
          <option value="ALL">All Time</option>
        </select>
      </div>
    </div>
  );
}
