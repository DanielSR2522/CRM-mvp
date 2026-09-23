'use client';

import React from 'react';
import TodaySchedulePanel, { DashboardAppointment } from './TodaySchedulePanel';
import MyTicketsPanel, { DashboardTicket } from './MyTicketsPanel';
import OpportunitiesPanel, { DashboardOpportunity } from './OpportunitiesPanel';
import RecentActivityPanel, { DashboardActivityEvent } from './RecentActivityPanel';
import PolicyMixPanel, { PolicyMixItem } from './PolicyMixPanel';
import TopCarriersPanel, { TopCarrierItem } from './TopCarriersPanel';
import CommissionsChartPanel, { MonthlyCommissionBar } from './CommissionsChartPanel';

export interface NonPcDashboardProps {
  // 5 Top KPI Cards Data
  healthCount: number;
  healthNewThisWeek: number;
  medicareCount: number;
  medicareNewThisWeek: number;
  supplementalCount: number;
  supplementalNewThisWeek: number;
  lifeCount: number;
  lifeNewThisWeek: number;
  healthMembersCount: number;

  // Middle Panels Data
  commissionsThisWeek: number | null;
  commissionsThisMonth: number | null;
  commissionsYtd: number | null;
  commissionsMonthlyBars: MonthlyCommissionBar[];
  hasCommissionData: boolean;

  policyMixItems: PolicyMixItem[];
  totalNonPcPoliciesCount: number;

  topCarrierItems: TopCarrierItem[];

  // Bottom Panels Data
  todayAppointments: DashboardAppointment[];
  myTickets: DashboardTicket[];
  opportunities: DashboardOpportunity[];
  recentActivities: DashboardActivityEvent[];

  loading?: boolean;
}

export default function NonPcDashboard({
  healthCount,
  healthNewThisWeek,
  medicareCount,
  medicareNewThisWeek,
  supplementalCount,
  supplementalNewThisWeek,
  lifeCount,
  lifeNewThisWeek,
  healthMembersCount,
  commissionsThisWeek,
  commissionsThisMonth,
  commissionsYtd,
  commissionsMonthlyBars,
  hasCommissionData,
  policyMixItems,
  totalNonPcPoliciesCount,
  topCarrierItems,
  todayAppointments,
  myTickets,
  opportunities,
  recentActivities,
  loading,
}: NonPcDashboardProps) {
  return (
    <div className="space-y-4">
      {/* 1. TOP KPI CARDS (5 CARDS) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {/* Card 1: Health Policies */}
        <div className="crm-card p-3.5 bg-white border border-[#E8ECF2] rounded-lg shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#556176]">Health Policies</span>
            <div className="w-7 h-7 rounded-md bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center border border-[#BFDBFE] text-xs">
              🩺
            </div>
          </div>
          <div className="mt-1.5">
            <div className="text-xl sm:text-2xl font-extrabold text-[#1E293B] leading-tight">
              {loading ? '...' : healthCount}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-[#2563EB]">
              <span>+ {healthNewThisWeek} new policies this week</span>
            </div>
          </div>
        </div>

        {/* Card 2: Medicare Policies */}
        <div className="crm-card p-3.5 bg-white border border-[#E8ECF2] rounded-lg shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#556176]">Medicare Policies</span>
            <div className="w-7 h-7 rounded-md bg-[#ECFDF5] text-[#059669] flex items-center justify-center border border-[#A7F3D0] text-xs">
              👤
            </div>
          </div>
          <div className="mt-1.5">
            <div className="text-xl sm:text-2xl font-extrabold text-[#1E293B] leading-tight">
              {loading ? '...' : medicareCount}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-[#059669]">
              <span>+ {medicareNewThisWeek} new policies this week</span>
            </div>
          </div>
        </div>

        {/* Card 3: Supplemental Policies */}
        <div className="crm-card p-3.5 bg-white border border-[#E8ECF2] rounded-lg shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#556176]">Supplemental Policies</span>
            <div className="w-7 h-7 rounded-md bg-[#F3E8FF] text-[#9333EA] flex items-center justify-center border border-[#E9D5FF] text-xs">
              🛡️
            </div>
          </div>
          <div className="mt-1.5">
            <div className="text-xl sm:text-2xl font-extrabold text-[#1E293B] leading-tight">
              {loading ? '...' : supplementalCount}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-[#9333EA]">
              <span>+ {supplementalNewThisWeek} new policies this week</span>
            </div>
          </div>
        </div>

        {/* Card 4: Life Policies */}
        <div className="crm-card p-3.5 bg-white border border-[#E8ECF2] rounded-lg shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#556176]">Life Policies</span>
            <div className="w-7 h-7 rounded-md bg-[#FEF2F2] text-[#E11D48] flex items-center justify-center border border-[#FECACA] text-xs">
              ❤️
            </div>
          </div>
          <div className="mt-1.5">
            <div className="text-xl sm:text-2xl font-extrabold text-[#1E293B] leading-tight">
              {loading ? '...' : lifeCount}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-[#E11D48]">
              <span>+ {lifeNewThisWeek} new policies this week</span>
            </div>
          </div>
        </div>

        {/* Card 5: Members in Health Coverage */}
        <div className="crm-card p-3.5 bg-white border border-[#E8ECF2] rounded-lg shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#556176]">Members in Health</span>
            <div className="w-7 h-7 rounded-md bg-[#E0F2FE] text-[#0284C7] flex items-center justify-center border border-[#BAE6FD] text-xs">
              👥
            </div>
          </div>
          <div className="mt-1.5">
            <div className="text-xl sm:text-2xl font-extrabold text-[#1E293B] leading-tight">
              {loading ? '...' : healthMembersCount}
            </div>
            <div className="mt-0.5 text-[11px] font-semibold text-[#64748B]">
              Active members (Health)
            </div>
          </div>
        </div>
      </div>

      {/* 2. MIDDLE ROW (3 PANELS: COMMISSIONS, POLICY MIX, TOP CARRIERS) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CommissionsChartPanel
          title="Commissions (Non-P&C)"
          thisWeekAmount={commissionsThisWeek}
          thisMonthAmount={commissionsThisMonth}
          ytdAmount={commissionsYtd}
          monthlyBars={commissionsMonthlyBars}
          hasData={hasCommissionData}
          unavailableReason="Non-P&C commission statements not yet integrated into the payment ledger."
          loading={loading}
        />

        <PolicyMixPanel
          title="Policy Mix (Non-P&C)"
          items={policyMixItems}
          totalCount={totalNonPcPoliciesCount}
          loading={loading}
        />

        <TopCarriersPanel
          title="Top Carriers (Non-P&C)"
          carriers={topCarrierItems}
          totalCount={totalNonPcPoliciesCount}
          loading={loading}
        />
      </div>

      {/* 3. BOTTOM ROW 1 (2 PANELS: TODAY'S SCHEDULE, MY TICKETS) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TodaySchedulePanel
          appointments={todayAppointments}
          loading={loading}
        />

        <MyTicketsPanel
          tickets={myTickets}
          loading={loading}
        />
      </div>

      {/* 4. BOTTOM ROW 2 (2 PANELS: OPPORTUNITIES, RECENT ACTIVITY) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <OpportunitiesPanel
          opportunities={opportunities}
          loading={loading}
        />

        <RecentActivityPanel
          events={recentActivities}
          mode="non_pc"
          loading={loading}
        />
      </div>
    </div>
  );
}
