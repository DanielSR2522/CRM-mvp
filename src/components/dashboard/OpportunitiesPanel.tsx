'use client';

import React from 'react';
import Link from 'next/link';

export interface DashboardOpportunity {
  id: string;
  clientId: string;
  clientName: string;
  type: string;
  title: string;
  actionText: string;
  valueText: string;
  iconBg: string;
  iconEmoji: string;
}

interface OpportunitiesPanelProps {
  opportunities: DashboardOpportunity[];
  loading?: boolean;
}

export default function OpportunitiesPanel({ opportunities, loading }: OpportunitiesPanelProps) {
  const topOpportunities = opportunities.slice(0, 5);

  return (
    <div className="crm-card p-4 flex flex-col justify-between bg-white border border-[#E8ECF2] rounded-lg shadow-sm">
      <div>
        <div className="flex items-center justify-between border-b border-[#E8ECF2] pb-2.5 mb-3">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-[#FEF3C7] text-[#D97706] text-xs">
              🎯
            </span>
            <h2 className="text-xs font-semibold text-[#172033]">Opportunities (Non-P&C)</h2>
          </div>
          <Link
            href="/clients"
            className="text-[11px] font-semibold text-[#2563EB] hover:text-[#1D4ED8] transition-colors flex items-center gap-1"
          >
            <span>View All</span>
            <span>→</span>
          </Link>
        </div>

        {loading ? (
          <div className="py-5 text-center text-xs text-[#7C8799]">Scanning client portfolio for opportunities...</div>
        ) : topOpportunities.length === 0 ? (
          <div className="py-3 px-3 bg-[#F8FAFC] rounded-lg border border-[#F1F5F9] text-center space-y-1">
            <div className="text-lg">🎯</div>
            <p className="text-xs font-medium text-[#556176]">No open opportunities identified at this time.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {topOpportunities.map((opp) => (
              <div
                key={opp.id}
                className="flex items-center justify-between p-2.5 rounded-lg bg-[#F8FAFC] border border-[#F1F5F9] hover:border-[#E2E8F0] transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs ${opp.iconBg}`}>
                    {opp.iconEmoji}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#1E293B]">
                      {opp.title}
                    </div>
                    <div className="text-[11px] font-medium text-[#64748B]">
                      {opp.clientName}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs font-bold text-[#DC2626]">
                    {opp.actionText}
                  </div>
                  <div className="text-[10px] font-semibold text-[#64748B]">
                    {opp.valueText}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
