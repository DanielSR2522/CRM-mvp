'use client';

import React from 'react';
import Link from 'next/link';
import TodaySchedulePanel, { DashboardAppointment } from './TodaySchedulePanel';
import RecentActivityPanel, { DashboardActivityEvent } from './RecentActivityPanel';
import PolicyMixPanel, { PolicyMixItem } from './PolicyMixPanel';
import TopCarriersPanel, { TopCarrierItem } from './TopCarriersPanel';
import CommissionsChartPanel, { MonthlyCommissionBar } from './CommissionsChartPanel';
import { SortableColumn } from '@/app/dashboard/page';
import { formatIsoToUsDate } from '@/utils/dateUtils';

export interface PcPolicyRow {
  id: string;
  client_id: string;
  clientName: string;
  policy_type: string;
  policy_number: string | null;
  company_name: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  premium: number | null;
  status: string;
  daysRemaining: number;
  formattedEffDate: string;
  formattedExpDate: string;
}

export interface PcDashboardProps {
  // Top 5 KPI Cards
  activePcCount: number;
  newPcThisWeek: number;
  writtenPremiumYtd: number | null;
  newPcMtdCount: number;
  expiring30DaysCount: number;
  pendingIssuesCount: number;

  // Middle Panels Data
  commissionsThisWeek: number | null;
  commissionsThisMonth: number | null;
  commissionsYtd: number | null;
  commissionsMonthlyBars: MonthlyCommissionBar[];
  hasCommissionData: boolean;

  policyMixItems: PolicyMixItem[];
  totalPcPoliciesCount: number;

  topCarrierItems: TopCarrierItem[];

  // Operational Table Data & Filters
  displayedPolicies: PcPolicyRow[];
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  lineFilter: string;
  setLineFilter: (val: string) => void;
  companyFilter: string;
  setCompanyFilter: (val: string) => void;
  daysFilter: string;
  setDaysFilter: (val: string) => void;
  statusFilter: string;
  setStatusFilter: (val: string) => void;
  availableLines: string[];
  availableCompanies: string[];
  availableStatuses: string[];
  isFiltered: boolean;
  handleClearFilters: () => void;
  sortColumn: SortableColumn;
  sortAscending: boolean;
  handleHeaderSort: (col: SortableColumn) => void;
  handleOpenQuickView: (policyId: string, clientId: string, policyTypeLabel?: string) => void;

  // Bottom Panels Data
  todayAppointments: DashboardAppointment[];
  recentActivities: DashboardActivityEvent[];

  loading?: boolean;
  error?: string | null;
}

export default function PcDashboard({
  activePcCount,
  newPcThisWeek,
  writtenPremiumYtd,
  newPcMtdCount,
  expiring30DaysCount,
  pendingIssuesCount,
  commissionsThisWeek,
  commissionsThisMonth,
  commissionsYtd,
  commissionsMonthlyBars,
  hasCommissionData,
  policyMixItems,
  totalPcPoliciesCount,
  topCarrierItems,
  displayedPolicies,
  searchQuery,
  setSearchQuery,
  lineFilter,
  setLineFilter,
  companyFilter,
  setCompanyFilter,
  daysFilter,
  setDaysFilter,
  statusFilter,
  setStatusFilter,
  availableLines,
  availableCompanies,
  availableStatuses,
  isFiltered,
  handleClearFilters,
  sortColumn,
  sortAscending,
  handleHeaderSort,
  handleOpenQuickView,
  todayAppointments,
  recentActivities,
  loading,
  error,
}: PcDashboardProps) {
  const formatCurrency = (val?: number | null) => {
    if (val === undefined || val === null) return '—';
    return `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const renderSortableHeader = (label: string, column: SortableColumn, alignRight = false) => {
    const isActive = sortColumn === column;
    return (
      <th className={`py-2.5 px-3 ${alignRight ? 'text-right' : ''}`}>
        <button
          type="button"
          onClick={() => handleHeaderSort(column)}
          className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider hover:text-[#172033] transition-colors focus:outline-none ${
            isActive ? 'text-[#2563EB] font-bold' : 'text-[#556176]'
          } ${alignRight ? 'ml-auto' : ''}`}
        >
          <span>{label}</span>
          <span className={`text-[10px] ${isActive ? 'text-[#2563EB] font-bold' : 'text-[#7C8799]'}`}>
            {isActive ? (sortAscending ? '↑' : '↓') : '↕'}
          </span>
        </button>
      </th>
    );
  };

  return (
    <div className="space-y-4">
      {/* 1. TOP 5 KPI CARDS FOR P&C */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {/* Card 1: Active P&C Policies */}
        <div className="crm-card p-3.5 bg-white border border-[#E8ECF2] rounded-lg shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#556176]">Active P&C Policies</span>
            <div className="w-7 h-7 rounded-md bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center border border-[#BFDBFE] text-xs">
              🚙
            </div>
          </div>
          <div className="mt-1.5">
            <div className="text-xl sm:text-2xl font-extrabold text-[#1E293B] leading-tight">
              {loading ? '...' : activePcCount}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-[#2563EB]">
              <span>+ {newPcThisWeek} new policies this week</span>
            </div>
          </div>
        </div>

        {/* Card 2: Written Premium (YTD) */}
        <div className="crm-card p-3.5 bg-white border border-[#E8ECF2] rounded-lg shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#556176]">Written Premium (YTD)</span>
            <div className="w-7 h-7 rounded-md bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center border border-[#BFDBFE] text-xs">
              💵
            </div>
          </div>
          <div className="mt-1.5">
            <div className="text-xl sm:text-2xl font-extrabold text-[#1E293B] leading-tight">
              {loading ? '...' : formatCurrency(writtenPremiumYtd)}
            </div>
            <div className="mt-0.5 text-[11px] font-semibold text-[#059669]">
              In-force production
            </div>
          </div>
        </div>

        {/* Card 3: New Policies (MTD) */}
        <div className="crm-card p-3.5 bg-white border border-[#E8ECF2] rounded-lg shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#556176]">New Policies (MTD)</span>
            <div className="w-7 h-7 rounded-md bg-[#ECFDF5] text-[#059669] flex items-center justify-center border border-[#A7F3D0] text-xs">
              📈
            </div>
          </div>
          <div className="mt-1.5">
            <div className="text-xl sm:text-2xl font-extrabold text-[#1E293B] leading-tight">
              {loading ? '...' : newPcMtdCount}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-[#059669]">
              <span>+ {newPcThisWeek} new policies this week</span>
            </div>
          </div>
        </div>

        {/* Card 4: Expiring (30 Days) */}
        <div className="crm-card p-3.5 bg-white border border-[#E8ECF2] rounded-lg shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#556176]">Expiring (30 Days)</span>
            <div className="w-7 h-7 rounded-md bg-[#FEF2F2] text-[#E11D48] flex items-center justify-center border border-[#FECACA] text-xs">
              🚨
            </div>
          </div>
          <div className="mt-1.5">
            <div className="text-xl sm:text-2xl font-extrabold text-[#1E293B] leading-tight">
              {loading ? '...' : expiring30DaysCount}
            </div>
            <div className="mt-0.5 text-[11px] font-semibold text-[#E11D48]">
              need attention
            </div>
          </div>
        </div>

        {/* Card 5: Pending Issues */}
        <div className="crm-card p-3.5 bg-white border border-[#E8ECF2] rounded-lg shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#556176]">Pending Issues</span>
            <div className="w-7 h-7 rounded-md bg-[#FEF3C7] text-[#D97706] flex items-center justify-center border border-[#FDE68A] text-xs">
              🕒
            </div>
          </div>
          <div className="mt-1.5">
            <div className="text-xl sm:text-2xl font-extrabold text-[#1E293B] leading-tight">
              {loading ? '...' : pendingIssuesCount}
            </div>
            <div className="mt-0.5 text-[11px] font-semibold text-[#D97706]">
              requires follow up
            </div>
          </div>
        </div>
      </div>

      {/* 2. MIDDLE ROW (3 PANELS: P&C COMMISSIONS, P&C POLICY MIX, P&C TOP CARRIERS) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CommissionsChartPanel
          title="Commissions (P&C)"
          thisWeekAmount={commissionsThisWeek}
          thisMonthAmount={commissionsThisMonth}
          ytdAmount={commissionsYtd}
          monthlyBars={commissionsMonthlyBars}
          hasData={hasCommissionData}
          unavailableReason="No P&C commission payments logged in ledger for this period."
          loading={loading}
        />

        <PolicyMixPanel
          title="Policy Mix (P&C)"
          items={policyMixItems}
          totalCount={totalPcPoliciesCount}
          loading={loading}
        />

        <TopCarriersPanel
          title="Top Carriers (P&C)"
          carriers={topCarrierItems}
          totalCount={totalPcPoliciesCount}
          loading={loading}
        />
      </div>

      {/* 3. MAIN OPERATIONAL PANEL — UPCOMING P&C POLICY EXPIRATIONS */}
      <div className="crm-card p-4 space-y-3 bg-white border border-[#E8ECF2] rounded-lg shadow-sm w-full">
        {/* Table Title Header */}
        <div className="flex items-center justify-between border-b border-[#E8ECF2] pb-2.5">
          <div>
            <h2 className="text-xs font-semibold text-[#172033]">Upcoming P&C Expirations</h2>
            <p className="text-[11px] text-[#556176]">Operational P&C renewals requiring review and client outreach</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-[#F8FAFC] border border-[#DCE2EA] text-[#556176]">
              {displayedPolicies.length} {displayedPolicies.length === 1 ? 'policy' : 'policies'}
            </span>
            <Link
              href="/clients/new"
              className="crm-btn-primary text-xs px-2.5 py-1 flex items-center gap-1 font-semibold"
            >
              <span>+ Add Policy</span>
            </Link>
          </div>
        </div>

        {/* TOOLBAR (Search + Line + Company + Days + Status + Clear) */}
        <div className="flex flex-wrap items-center gap-2 bg-[#F8FAFC] p-2.5 rounded-md border border-[#E8ECF2]">
          {/* Search Input */}
          <div className="relative w-44 sm:w-52">
            <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none text-[#7C8799]">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-7 pr-2.5 py-1 bg-white border border-[#DCE2EA] rounded-md text-xs text-[#172033] placeholder-[#7C8799] focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-colors"
            />
          </div>

          {/* Line Filter */}
          <div className="flex-shrink-0">
            <select
              value={lineFilter}
              onChange={(e) => setLineFilter(e.target.value)}
              className="bg-white border border-[#DCE2EA] rounded-md px-2 py-1 text-xs text-[#172033] font-medium focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-colors"
            >
              <option value="ALL">All P&C Lines</option>
              {availableLines.map((line) => (
                <option key={line} value={line}>{line}</option>
              ))}
            </select>
          </div>

          {/* Company Filter */}
          <div className="flex-shrink-0">
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="bg-white border border-[#DCE2EA] rounded-md px-2 py-1 text-xs text-[#172033] font-medium focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-colors"
            >
              <option value="ALL">All Companies</option>
              {availableCompanies.map((comp) => (
                <option key={comp} value={comp}>{comp}</option>
              ))}
            </select>
          </div>

          {/* Days Filter */}
          <div className="flex-shrink-0">
            <select
              value={daysFilter}
              onChange={(e) => setDaysFilter(e.target.value)}
              className="bg-white border border-[#DCE2EA] rounded-md px-2 py-1 text-xs text-[#172033] font-medium focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-colors"
            >
              <option value="ALL">All Upcoming</option>
              <option value="7">Next 7 Days</option>
              <option value="15">Next 15 Days</option>
              <option value="30">Next 30 Days</option>
              <option value="34">Next 34 Days</option>
              <option value="60">Next 60 Days</option>
              <option value="THIS_MONTH">This Month</option>
              <option value="NEXT_MONTH">Next Month</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex-shrink-0">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white border border-[#DCE2EA] rounded-md px-2 py-1 text-xs text-[#172033] font-medium focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-colors"
            >
              <option value="ALL">All Statuses</option>
              {availableStatuses.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>

          {/* Clear Filters Button */}
          {isFiltered && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="flex-shrink-0 text-[11px] font-semibold text-[#C24141] hover:text-[#991B1B] hover:bg-[#FEF2F2] px-2 py-1 rounded-md border border-[#FECACA] transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>

        {/* TABLE OR EMPTY STATE */}
        {loading ? (
          <div className="py-6 text-center text-xs text-[#7C8799]">Loading P&C expirations...</div>
        ) : error ? (
          <div className="p-3 rounded-md bg-[#FEF2F2] border border-[#FECACA] text-[#C24141] text-xs font-semibold">{error}</div>
        ) : displayedPolicies.length === 0 ? (
          <div className="py-6 px-4 text-center space-y-2">
            <p className="text-xs text-[#556176] font-medium">
              {isFiltered ? 'No P&C policies match the current filters.' : 'No active P&C policies expiring in the near future.'}
            </p>
            {isFiltered && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="crm-btn-secondary text-xs px-3 py-1"
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E8ECF2] text-[10px] font-semibold text-[#556176] uppercase tracking-wider">
                  {renderSortableHeader('Client', 'client_name')}
                  {renderSortableHeader('Policy / Number', 'policy_number')}
                  {renderSortableHeader('Type', 'policy_type')}
                  {renderSortableHeader('Company', 'company_name')}
                  {renderSortableHeader('Effective Date', 'effective_date')}
                  {renderSortableHeader('Expiration Date', 'expiration_date')}
                  {renderSortableHeader('Days Left', 'days_left')}
                  {renderSortableHeader('Premium', 'premium')}
                  {renderSortableHeader('Status', 'status')}
                  <th className="py-2 px-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8ECF2] text-xs text-[#172033]">
                {displayedPolicies.map((p) => (
                  <tr key={p.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="py-2 px-2.5 font-bold text-[#2563EB]">
                      <Link href={`/clients/${p.client_id}`} className="hover:underline">
                        {p.clientName}
                      </Link>
                    </td>
                    <td className="py-2 px-2.5">
                      <div className="font-medium text-[#172033]">{p.policy_type}</div>
                      <div className="text-[10px] text-[#7C8799] font-mono">#{p.policy_number || 'N/A'}</div>
                    </td>
                    <td className="py-2 px-2.5">
                      <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold border uppercase tracking-wider bg-[#EEF4FF] text-[#2563EB] border-[#BFDBFE]">
                        {p.policy_type}
                      </span>
                    </td>
                    <td className="py-2 px-2.5 text-[#556176]">{p.company_name || '—'}</td>
                    <td className="py-2 px-2.5 text-[#556176]">{p.formattedEffDate}</td>
                    <td className="py-2 px-2.5 font-medium text-[#172033]">{p.formattedExpDate}</td>
                    <td className="py-2 px-2.5">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        p.daysRemaining <= 7
                          ? 'bg-[#FEF2F2] text-[#DC2626] border border-[#FCA5A5] font-bold animate-pulse'
                          : p.daysRemaining <= 30
                          ? 'bg-[#FEFCE8] text-[#B7791F] border border-[#FEF08A]'
                          : 'bg-[#EEF4FF] text-[#2563EB] border border-[#BFDBFE]'
                      }`}>
                        {p.daysRemaining} {p.daysRemaining === 1 ? 'day' : 'days'}
                      </span>
                    </td>
                    <td className="py-2 px-2.5 font-semibold text-[#172033]">
                      {formatCurrency(p.premium)}
                    </td>
                    <td className="py-2 px-2.5">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                        p.status === 'Active' ? 'bg-[#F0FDF4] text-[#15803D] border-[#DCFCE7]' : 'bg-[#FEF2F2] text-[#C24141] border-[#FECACA]'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="py-2 px-2.5 text-right">
                      <button
                        onClick={() => handleOpenQuickView(p.id, p.client_id, p.policy_type)}
                        className="crm-btn-secondary text-[11px] px-2.5 py-0.5 font-semibold"
                      >
                        Preview
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. BOTTOM ROW (ONLY 2 PANELS: TODAY'S SCHEDULE & RECENT P&C ACTIVITY - STRICT USER EXCLUSION OF TICKETS/OPPORTUNITIES) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TodaySchedulePanel
          appointments={todayAppointments}
          loading={loading}
        />

        <RecentActivityPanel
          events={recentActivities}
          mode="pc"
          loading={loading}
        />
      </div>
    </div>
  );
}
