'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import CrmPageContainer from '@/components/layout/CrmPageContainer';
import PolicyQuickViewDrawer, { PolicyModuleType } from '@/components/dashboard/PolicyQuickViewDrawer';
import { supabase } from '@/lib/supabaseClient';
import { formatIsoToUsDate } from '@/utils/dateUtils';
import { formatDateMMDDYYYY } from '@/lib/formatters/date';

interface UserProfile {
  name: string | null;
  email: string | null;
}

interface ClientRow {
  id: string;
  full_name: string;
}

export interface PcDashboardPolicy {
  id: string;
  client_id: string;
  module_type: 'property_casualty';
  policy_type: string;
  policy_number: string | null;
  company_name: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  premium: number | null;
  status: string;
}

interface LeadRow {
  id: string;
  status: string;
  next_follow_up_at: string | null;
}

interface AppointmentRow {
  id: string;
  starts_at: string;
  status: string;
}

export type SortableColumn =
  | 'client_name'
  | 'policy_number'
  | 'policy_type'
  | 'company_name'
  | 'effective_date'
  | 'expiration_date'
  | 'days_left'
  | 'premium'
  | 'status';

export default function DashboardPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // Data States
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [policies, setPolicies] = useState<PcDashboardPolicy[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);

  // Section Loading & Error States
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientsError, setClientsError] = useState<string | null>(null);

  // Compact Toolbar Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [lineFilter, setLineFilter] = useState('ALL');
  const [companyFilter, setCompanyFilter] = useState('ALL');
  const [daysFilter, setDaysFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Column Header Sorting States (Default: Expiration Date Soonest First)
  const [sortColumn, setSortColumn] = useState<SortableColumn>('expiration_date');
  const [sortAscending, setSortAscending] = useState(true);

  // Policy Quick View Drawer State
  const [quickViewDrawer, setQuickViewDrawer] = useState<{
    isOpen: boolean;
    policyId: string | null;
    clientId: string | null;
    moduleType: PolicyModuleType | null;
    policyTypeLabel?: string | null;
  }>({
    isOpen: false,
    policyId: null,
    clientId: null,
    moduleType: null,
    policyTypeLabel: null,
  });

  const handleOpenQuickView = useCallback((
    policyId: string,
    clientId: string,
    policyTypeLabel?: string
  ) => {
    setQuickViewDrawer({
      isOpen: true,
      policyId,
      clientId,
      moduleType: 'property_casualty',
      policyTypeLabel,
    });
  }, []);

  const handleCloseQuickView = useCallback(() => {
    setQuickViewDrawer((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // Client Map for quick lookup
  const clientMap = useMemo(() => {
    const map: Record<string, string> = {};
    clients.forEach((c) => {
      map[c.id] = c.full_name;
    });
    return map;
  }, [clients]);

  // Load User Profile
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data } = await supabase
            .from('profiles')
            .select('name, email')
            .eq('id', session.user.id)
            .single();

          setProfile({
            name: data?.name || null,
            email: session.user.email || 'User',
          });
        }
      } catch (err) {
        console.error('Error loading profile:', err);
      }
    };
    fetchProfile();
  }, []);

  // Query 1: P&C Clients & P&C Policies Only
  const loadClientsAndPolicies = useCallback(async () => {
    try {
      setClientsLoading(true);
      setClientsError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: clientsData, error: clientsErr } = await supabase
        .from('clients')
        .select('id, full_name, agent_id, policies(id)');

      if (clientsErr) throw clientsErr;

      const pcEligibleClients = (clientsData || []).filter((c: any) => {
        if (c.agent_id === user.id) return true;
        return Array.isArray(c.policies) && c.policies.length > 0;
      });

      setClients(pcEligibleClients);

      if (pcEligibleClients && pcEligibleClients.length > 0) {
        const clientIds = pcEligibleClients.map((c) => c.id);

        // Fetch P&C Policies ONLY (excluding Supplemental, Health, Life)
        const { data: pcPoliciesData, error: polErr } = await supabase
          .from('policies')
          .select('id, client_id, policy_type, policy_number, company_name, writing_company, effective_date, expiration_date, premium, total_premium, annual_premium, status')
          .in('client_id', clientIds);

        if (polErr) throw polErr;

        const pcOnlyList: PcDashboardPolicy[] = [];

        (pcPoliciesData || []).forEach((p: any) => {
          const pTypeLower = (p.policy_type || '').trim().toLowerCase();
          if (pTypeLower === 'supplemental' || pTypeLower === 'health' || pTypeLower === 'life') {
            return;
          }

          pcOnlyList.push({
            id: p.id,
            client_id: p.client_id,
            module_type: 'property_casualty',
            policy_type: p.policy_type || 'P&C Policy',
            policy_number: p.policy_number,
            company_name: p.company_name || p.writing_company || null,
            effective_date: p.effective_date,
            expiration_date: p.expiration_date,
            premium: p.premium || p.total_premium || p.annual_premium || null,
            status: p.status || 'Active',
          });
        });

        setPolicies(pcOnlyList);
      } else {
        setPolicies([]);
      }
    } catch (err: any) {
      console.error('Error loading clients/P&C policies:', err);
      setClientsError(err?.message || 'Failed to load clients and P&C policies data.');
    } finally {
      setClientsLoading(false);
    }
  }, []);

  // Query 2: Leads (For KPI calculation)
  const loadLeadsData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('leads')
        .select('id, status, next_follow_up_at')
        .eq('agent_id', user.id);

      setLeads(data || []);
    } catch (err) {
      console.error('Error loading leads metrics:', err);
    }
  }, []);

  // Query 3: Calendar Appointments (For KPI calculation)
  const loadCalendarAppointments = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('calendar_appointments')
        .select('id, starts_at, status')
        .eq('agent_id', user.id);

      setAppointments(data || []);
    } catch (err) {
      console.error('Error loading calendar appointments metrics:', err);
    }
  }, []);

  useEffect(() => {
    loadClientsAndPolicies();
    loadLeadsData();
    loadCalendarAppointments();
  }, [loadClientsAndPolicies, loadLeadsData, loadCalendarAppointments]);

  // DATE HELPERS & METRIC COMPUTATIONS
  const now = new Date();
  const todayIso = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().split('T')[0];

  const in30Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30);
  const in30DaysIso = in30Days.toISOString().split('T')[0];

  // KPI Metrics
  const totalClientsCount = clients.length;
  const activePcPolicies = useMemo(() => policies.filter((p) => p.status === 'Active'), [policies]);
  const activePcPoliciesCount = activePcPolicies.length;

  const pcPoliciesExpiring30Days = useMemo(() => {
    return activePcPolicies.filter((p) => {
      if (!p.expiration_date) return false;
      return p.expiration_date >= todayIso && p.expiration_date <= in30DaysIso;
    });
  }, [activePcPolicies, todayIso, in30DaysIso]);
  const pcPoliciesExpiring30DaysCount = pcPoliciesExpiring30Days.length;

  const leadsInProgressCount = useMemo(() => leads.filter((l) => ['new', 'contacted', 'in_progress', 'qualified'].includes(l.status)).length, [leads]);

  const leadFollowUpsDueCount = useMemo(() => {
    return leads.filter((l) => {
      if (!l.next_follow_up_at || ['converted', 'lost'].includes(l.status)) return false;
      return new Date(l.next_follow_up_at) <= now;
    }).length;
  }, [leads, now]);

  // Today's Appointments
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  const appointmentsTodayCount = useMemo(() => {
    return appointments.filter((a) => {
      if (a.status !== 'scheduled') return false;
      const start = new Date(a.starts_at);
      return start >= todayStart && start <= todayEnd;
    }).length;
  }, [appointments, todayStart, todayEnd]);

  // DYNAMIC FILTER DROPDOWN OPTIONS (From loaded P&C dataset)
  const availableLines = useMemo(() => {
    const lines = new Set<string>();
    activePcPolicies.forEach((p) => {
      if (p.policy_type) lines.add(p.policy_type);
    });
    return Array.from(lines).sort();
  }, [activePcPolicies]);

  const availableCompanies = useMemo(() => {
    const compMap = new Map<string, string>();
    activePcPolicies.forEach((p) => {
      if (p.company_name && p.company_name.trim()) {
        const clean = p.company_name.trim();
        const lower = clean.toLowerCase();
        if (!compMap.has(lower)) {
          compMap.set(lower, clean);
        }
      }
    });
    return Array.from(compMap.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [activePcPolicies]);

  const availableStatuses = useMemo(() => {
    const statuses = new Set<string>();
    policies.forEach((p) => {
      if (p.status) statuses.add(p.status);
    });
    return Array.from(statuses).sort();
  }, [policies]);

  // CLEAR FILTERS STATE CHECK
  const isFiltered = useMemo(() => {
    return (
      searchQuery.trim() !== '' ||
      lineFilter !== 'ALL' ||
      companyFilter !== 'ALL' ||
      daysFilter !== 'ALL' ||
      statusFilter !== 'ALL' ||
      sortColumn !== 'expiration_date' ||
      !sortAscending
    );
  }, [searchQuery, lineFilter, companyFilter, daysFilter, statusFilter, sortColumn, sortAscending]);

  const handleClearFilters = useCallback(() => {
    setSearchQuery('');
    setLineFilter('ALL');
    setCompanyFilter('ALL');
    setDaysFilter('ALL');
    setStatusFilter('ALL');
    setSortColumn('expiration_date');
    setSortAscending(true);
  }, []);

  // Column Header Click Handler
  const handleHeaderSort = useCallback((column: SortableColumn) => {
    if (sortColumn === column) {
      setSortAscending((prev) => !prev);
    } else {
      setSortColumn(column);
      setSortAscending(true);
    }
  }, [sortColumn]);

  // DERIVED PIPELINE: activePcPolicies -> search -> filters -> sorting
  const displayedPolicies = useMemo(() => {
    return activePcPolicies
      .map((p) => {
        const daysRemaining = p.expiration_date
          ? Math.ceil(
              (new Date(p.expiration_date + 'T00:00:00').getTime() - new Date(todayIso + 'T00:00:00').getTime()) /
                (1000 * 3600 * 24)
            )
          : 9999;
        return {
          ...p,
          clientName: clientMap[p.client_id] || 'Client Record',
          formattedEffDate: p.effective_date ? formatIsoToUsDate(p.effective_date) : '—',
          formattedExpDate: p.expiration_date ? formatIsoToUsDate(p.expiration_date) : '—',
          daysRemaining,
        };
      })
      .filter((p) => {
        // 1. Future/Active Expiration filter
        if (!p.expiration_date || p.expiration_date < todayIso) return false;

        // 2. Search Query (Client, Policy #, Carrier, Type)
        if (searchQuery.trim()) {
          const q = searchQuery.trim().toLowerCase();
          const matchesName = p.clientName.toLowerCase().includes(q);
          const matchesPolNum = (p.policy_number || '').toLowerCase().includes(q);
          const matchesCompany = (p.company_name || '').toLowerCase().includes(q);
          const matchesType = (p.policy_type || '').toLowerCase().includes(q);
          if (!matchesName && !matchesPolNum && !matchesCompany && !matchesType) {
            return false;
          }
        }

        // 3. Line / Type Filter
        if (lineFilter !== 'ALL' && p.policy_type !== lineFilter) {
          return false;
        }

        // 4. Company / Carrier Filter
        if (companyFilter !== 'ALL') {
          const pCompLower = (p.company_name || '').trim().toLowerCase();
          if (pCompLower !== companyFilter.trim().toLowerCase()) {
            return false;
          }
        }

        // 5. Days Left Filter
        if (daysFilter !== 'ALL') {
          const days = p.daysRemaining;
          if (daysFilter === '0-7' && (days < 0 || days > 7)) return false;
          if (daysFilter === '8-15' && (days < 8 || days > 15)) return false;
          if (daysFilter === '16-30' && (days < 16 || days > 30)) return false;
          if (daysFilter === '31-60' && (days < 31 || days > 60)) return false;
          if (daysFilter === '61-90' && (days < 61 || days > 90)) return false;
          if (daysFilter === '90+' && days <= 90) return false;
        }

        // 6. Status Filter
        if (statusFilter !== 'ALL' && p.status !== statusFilter) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        let comparison = 0;

        if (sortColumn === 'expiration_date') {
          const dateA = a.expiration_date || '9999-12-31';
          const dateB = b.expiration_date || '9999-12-31';
          comparison = dateA.localeCompare(dateB);
        } else if (sortColumn === 'effective_date') {
          const dateA = a.effective_date || '9999-12-31';
          const dateB = b.effective_date || '9999-12-31';
          comparison = dateA.localeCompare(dateB);
        } else if (sortColumn === 'client_name') {
          comparison = a.clientName.localeCompare(b.clientName, undefined, { sensitivity: 'base' });
        } else if (sortColumn === 'policy_number') {
          const numA = a.policy_number || '';
          const numB = b.policy_number || '';
          comparison = numA.localeCompare(numB, undefined, { numeric: true, sensitivity: 'base' });
        } else if (sortColumn === 'policy_type') {
          comparison = a.policy_type.localeCompare(b.policy_type, undefined, { sensitivity: 'base' });
        } else if (sortColumn === 'company_name') {
          const compA = a.company_name || '';
          const compB = b.company_name || '';
          comparison = compA.localeCompare(compB, undefined, { sensitivity: 'base' });
        } else if (sortColumn === 'days_left') {
          comparison = a.daysRemaining - b.daysRemaining;
        } else if (sortColumn === 'premium') {
          const premA = a.premium || 0;
          const premB = b.premium || 0;
          comparison = premA - premB;
        } else if (sortColumn === 'status') {
          comparison = a.status.localeCompare(b.status, undefined, { sensitivity: 'base' });
        }

        return sortAscending ? comparison : -comparison;
      });
  }, [
    activePcPolicies,
    clientMap,
    todayIso,
    searchQuery,
    lineFilter,
    companyFilter,
    daysFilter,
    statusFilter,
    sortColumn,
    sortAscending,
  ]);

  const currentDateFormatted = formatDateMMDDYYYY(now);

  const formatCurrency = (val?: number | null) => {
    if (val === undefined || val === null) return '—';
    return `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Helper for rendering clickable sortable table headers with chevron indicators
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
    <DashboardLayout>
      <CrmPageContainer className="pb-10">
        
        {/* SECTION 1: HEADER */}
        <div className="crm-card p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-[#172033] tracking-tight">
                Hello, {profile?.name || profile?.email || 'Agent'}
              </h1>
              <span className="px-2.5 py-0.5 rounded bg-[#F8FAFC] border border-[#DCE2EA] text-[#556176] text-xs font-medium">
                {currentDateFormatted}
              </span>
            </div>
            <p className="text-xs text-[#556176] mt-0.5">
              Property & Casualty operational renewal dashboard and client portfolio summary.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/clients"
              className="crm-btn-secondary text-xs px-3 py-1.5"
            >
              + New Client
            </Link>
            <Link
              href="/leads"
              className="crm-btn-primary text-xs px-3 py-1.5"
            >
              + New Lead
            </Link>
            <Link
              href="/calendar"
              className="crm-btn-secondary text-xs px-3 py-1.5"
            >
              + New Appointment
            </Link>
          </div>
        </div>

        {/* SECTION 2: SIX KPI CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* Total Clients */}
          <div className="crm-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#556176]">Total Clients</span>
              <div className="w-7 h-7 rounded bg-[#EEF4FF] text-[#2563EB] flex items-center justify-center border border-[#BFDBFE]">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold text-[#172033]">{clientsLoading ? '...' : totalClientsCount}</div>
              <span className="text-[10px] text-[#7C8799]">Customer records</span>
            </div>
          </div>

          {/* Active P&C Policies */}
          <div className="crm-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#556176]">Active P&C Policies</span>
              <div className="w-7 h-7 rounded bg-[#EEF4FF] text-[#2563EB] flex items-center justify-center border border-[#BFDBFE]">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold text-[#172033]">{clientsLoading ? '...' : activePcPoliciesCount}</div>
              <span className="text-[10px] text-[#7C8799]">In-force P&C policies</span>
            </div>
          </div>

          {/* Expiring P&C 30 Days */}
          <div className="crm-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#556176]">Expiring P&C 30 Days</span>
              <div className="w-7 h-7 rounded bg-[#FEFCE8] text-[#B7791F] flex items-center justify-center border border-[#FEF08A]">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold text-[#172033]">{clientsLoading ? '...' : pcPoliciesExpiring30DaysCount}</div>
              <span className="text-[10px] text-[#7C8799]">P&C renewals due</span>
            </div>
          </div>

          {/* Leads Active */}
          <div className="crm-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#556176]">Leads Active</span>
              <div className="w-7 h-7 rounded bg-[#EEF4FF] text-[#2563EB] flex items-center justify-center border border-[#BFDBFE]">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold text-[#172033]">{leadsInProgressCount}</div>
              <span className="text-[10px] text-[#7C8799]">In pipeline</span>
            </div>
          </div>

          {/* Lead Follow-ups Due */}
          <div className="crm-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#556176]">Follow-ups Due</span>
              <div className="w-7 h-7 rounded bg-[#FEF2F2] text-[#C24141] flex items-center justify-center border border-[#FECACA]">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold text-[#172033]">{leadFollowUpsDueCount}</div>
              <span className="text-[10px] text-[#7C8799]">Overdue / Scheduled</span>
            </div>
          </div>

          {/* Appointments Today */}
          <div className="crm-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#556176]">Appts Today</span>
              <div className="w-7 h-7 rounded bg-[#F0FDF4] text-[#15803D] flex items-center justify-center border border-[#DCFCE7]">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold text-[#172033]">{appointmentsTodayCount}</div>
              <span className="text-[10px] text-[#7C8799]">Scheduled today</span>
            </div>
          </div>
        </div>

        {/* SECTION 3: MAIN OPERATIONAL WORKFLOW — UPCOMING P&C POLICY EXPIRATIONS (FULL WIDTH) */}
        <div className="crm-card p-5 space-y-4 w-full">
          {/* Card Title Header */}
          <div className="flex items-center justify-between border-b border-[#E8ECF2] pb-3">
            <div>
              <h2 className="text-sm font-semibold text-[#172033]">Upcoming P&C Policy Expirations</h2>
              <p className="text-xs text-[#556176]">Primary operational P&C policy renewals requiring immediate attention</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-[#F8FAFC] border border-[#DCE2EA] text-[#556176]">
              {displayedPolicies.length} {displayedPolicies.length === 1 ? 'P&C policy' : 'P&C policies'}
            </span>
          </div>

          {/* SINGLE COMPACT TOOLBAR ROW (Search + Line + Company + Days + Status + Clear) */}
          <div className="flex flex-wrap items-center gap-2.5 bg-[#F8FAFC] p-3 rounded-md border border-[#E8ECF2]">
            {/* Compact Search Input */}
            <div className="relative w-48 sm:w-56">
              <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-[#7C8799]">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-[#DCE2EA] rounded-md text-xs text-[#172033] placeholder-[#7C8799] focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-colors"
              />
            </div>

            {/* Line / Type Filter Dropdown */}
            <div className="flex-shrink-0">
              <select
                value={lineFilter}
                onChange={(e) => setLineFilter(e.target.value)}
                className="bg-white border border-[#DCE2EA] rounded-md px-2.5 py-1.5 text-xs text-[#172033] font-medium focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-colors"
              >
                <option value="ALL">All P&C Lines</option>
                {availableLines.map((line) => (
                  <option key={line} value={line}>{line}</option>
                ))}
              </select>
            </div>

            {/* Company / Carrier Filter Dropdown */}
            <div className="flex-shrink-0">
              <select
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
                className="bg-white border border-[#DCE2EA] rounded-md px-2.5 py-1.5 text-xs text-[#172033] font-medium focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-colors"
              >
                <option value="ALL">All Companies</option>
                {availableCompanies.map((comp) => (
                  <option key={comp} value={comp}>{comp}</option>
                ))}
              </select>
            </div>

            {/* Days Left Filter Dropdown */}
            <div className="flex-shrink-0">
              <select
                value={daysFilter}
                onChange={(e) => setDaysFilter(e.target.value)}
                className="bg-white border border-[#DCE2EA] rounded-md px-2.5 py-1.5 text-xs text-[#172033] font-medium focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-colors"
              >
                <option value="ALL">All Days Left</option>
                <option value="0-7">0–7 days</option>
                <option value="8-15">8–15 days</option>
                <option value="16-30">16–30 days</option>
                <option value="31-60">31–60 days</option>
                <option value="61-90">61–90 days</option>
                <option value="90+">90+ days</option>
              </select>
            </div>

            {/* Status Filter Dropdown */}
            <div className="flex-shrink-0">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-white border border-[#DCE2EA] rounded-md px-2.5 py-1.5 text-xs text-[#172033] font-medium focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-colors"
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
                className="flex-shrink-0 text-xs font-semibold text-[#C24141] hover:text-[#991B1B] hover:bg-[#FEF2F2] px-2.5 py-1.5 rounded-md border border-[#FECACA] transition-colors"
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* TABLE OR EMPTY STATE */}
          {clientsLoading ? (
            <div className="p-12 text-center text-xs text-[#7C8799]">Loading P&C expirations...</div>
          ) : clientsError ? (
            <div className="p-4 rounded-md bg-[#FEF2F2] border border-[#FECACA] text-[#C24141] text-xs font-semibold">{clientsError}</div>
          ) : displayedPolicies.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <p className="text-xs text-[#556176] font-medium">
                {isFiltered ? 'No P&C policies match the current filters.' : 'No active P&C policies expiring in the near future.'}
              </p>
              {isFiltered && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="crm-btn-secondary text-xs px-3.5 py-1.5"
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#E8ECF2] text-[11px] font-semibold text-[#556176] uppercase tracking-wider">
                    {renderSortableHeader('Client', 'client_name')}
                    {renderSortableHeader('Policy / Number', 'policy_number')}
                    {renderSortableHeader('Line / Type', 'policy_type')}
                    {renderSortableHeader('Company', 'company_name')}
                    {renderSortableHeader('Effective Date', 'effective_date')}
                    {renderSortableHeader('Expiration Date', 'expiration_date')}
                    {renderSortableHeader('Days Left', 'days_left')}
                    {renderSortableHeader('Premium', 'premium')}
                    {renderSortableHeader('Status', 'status')}
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8ECF2] text-xs text-[#172033]">
                  {displayedPolicies.map((p) => (
                    <tr key={p.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="py-3 px-3 font-semibold text-[#172033]">{p.clientName}</td>
                      <td className="py-3 px-3">
                        <div className="font-medium text-[#172033]">{p.policy_type}</div>
                        <div className="text-[10px] text-[#7C8799] font-mono">#{p.policy_number || 'N/A'}</div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold border uppercase tracking-wider bg-[#EEF4FF] text-[#2563EB] border-[#BFDBFE]">
                          Property & Casualty
                        </span>
                      </td>
                      <td className="py-3 px-3 text-[#556176]">{p.company_name || '—'}</td>
                      <td className="py-3 px-3 text-[#556176]">{p.formattedEffDate}</td>
                      <td className="py-3 px-3 font-medium text-[#172033]">{p.formattedExpDate}</td>
                      <td className="py-3 px-3">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold ${
                          p.daysRemaining <= 7 ? 'bg-[#FEFCE8] text-[#B7791F] border border-[#FEF08A]' : 'bg-[#EEF4FF] text-[#2563EB] border border-[#BFDBFE]'
                        }`}>
                          {p.daysRemaining} {p.daysRemaining === 1 ? 'day' : 'days'}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-medium text-[#172033]">
                        {formatCurrency(p.premium)}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold border ${
                          p.status === 'Active' ? 'bg-[#F0FDF4] text-[#15803D] border-[#DCFCE7]' : 'bg-[#FEF2F2] text-[#C24141] border-[#FECACA]'
                        }`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => handleOpenQuickView(p.id, p.client_id, p.policy_type)}
                          className="crm-btn-secondary text-xs px-3 py-1"
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

        {/* POLICY QUICK VIEW DRAWER COMPONENT (RIGHT SLIDE-OVER) */}
        <PolicyQuickViewDrawer
          isOpen={quickViewDrawer.isOpen}
          onClose={handleCloseQuickView}
          policyId={quickViewDrawer.policyId}
          clientId={quickViewDrawer.clientId}
          moduleType={quickViewDrawer.moduleType}
          policyTypeLabel={quickViewDrawer.policyTypeLabel}
        />

      </CrmPageContainer>
    </DashboardLayout>
  );
}
