'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import CrmPageContainer from '@/components/layout/CrmPageContainer';
import PolicyQuickViewDrawer, { PolicyModuleType } from '@/components/dashboard/PolicyQuickViewDrawer';
import { supabase } from '@/lib/supabaseClient';
import { formatIsoToUsDate } from '@/utils/dateUtils';
import DashboardHeader, { DashboardMode } from '@/components/dashboard/DashboardHeader';
import NonPcDashboard from '@/components/dashboard/NonPcDashboard';
import PcDashboard, { PcPolicyRow } from '@/components/dashboard/PcDashboard';
import { DashboardAppointment } from '@/components/dashboard/TodaySchedulePanel';
import { DashboardTicket } from '@/components/dashboard/MyTicketsPanel';
import { DashboardOpportunity } from '@/components/dashboard/OpportunitiesPanel';
import { DashboardActivityEvent } from '@/components/dashboard/RecentActivityPanel';
import { PolicyMixItem } from '@/components/dashboard/PolicyMixPanel';
import { TopCarrierItem } from '@/components/dashboard/TopCarriersPanel';
import { MonthlyCommissionBar } from '@/components/dashboard/CommissionsChartPanel';
import { useBusinessLines } from '@/contexts/BusinessLinesContext';

interface UserProfile {
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

interface ClientRow {
  id: string;
  full_name: string;
  agent_id: string | null;
  date_of_birth?: string | null;
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

  // Business Lines Eligibility Gate
  const { isLineEnabled, loading: businessLinesLoading } = useBusinessLines();
  const isPcEnabled = isLineEnabled('property_casualty');

  // DASHBOARD MODE PERSISTENCE ('non_pc' | 'pc')
  const [dashboardMode, setDashboardMode] = useState<DashboardMode>('non_pc');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('THIS_MONTH');

  // Load persisted dashboard mode from localStorage / URL query on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const queryMode = urlParams.get('mode');
      if (queryMode === 'pc' || queryMode === 'non_pc') {
        setDashboardMode(queryMode as DashboardMode);
        localStorage.setItem('smartrack_dashboard_mode', queryMode);
        return;
      }

      const savedMode = localStorage.getItem('smartrack_dashboard_mode');
      if (savedMode === 'pc' || savedMode === 'non_pc') {
        setDashboardMode(savedMode as DashboardMode);
      }
    }
  }, []);

  // Enforce fallback / protection when Property & Casualty is disabled
  useEffect(() => {
    if (!businessLinesLoading && !isPcEnabled) {
      if (dashboardMode === 'pc') {
        setDashboardMode('non_pc');
        if (typeof window !== 'undefined') {
          localStorage.setItem('smartrack_dashboard_mode', 'non_pc');
          const url = new URL(window.location.href);
          if (url.searchParams.get('mode') === 'pc') {
            url.searchParams.set('mode', 'non_pc');
            window.history.replaceState({}, '', url.toString());
          }
        }
      }
    }
  }, [businessLinesLoading, isPcEnabled, dashboardMode]);

  const handleModeChange = useCallback((newMode: DashboardMode) => {
    if (newMode === 'pc' && !isPcEnabled) {
      return;
    }
    setDashboardMode(newMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('smartrack_dashboard_mode', newMode);
      const url = new URL(window.location.href);
      url.searchParams.set('mode', newMode);
      window.history.replaceState({}, '', url.toString());
    }
  }, [isPcEnabled]);

  // Data States
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [pcPolicies, setPcPolicies] = useState<any[]>([]);
  const [healthPolicies, setHealthPolicies] = useState<any[]>([]);
  const [medicarePolicies, setMedicarePolicies] = useState<any[]>([]);
  const [supplementalPolicies, setSupplementalPolicies] = useState<any[]>([]);
  const [lifePolicies, setLifePolicies] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [activityEvents, setActivityEvents] = useState<any[]>([]);
  const [pcCommissions, setPcCommissions] = useState<any[]>([]);

  // Loading & Error States
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // P&C Table Toolbar Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [lineFilter, setLineFilter] = useState('ALL');
  const [companyFilter, setCompanyFilter] = useState('ALL');
  const [daysFilter, setDaysFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Column Header Sorting States
  const [sortColumn, setSortColumn] = useState<SortableColumn>('expiration_date');
  const [sortAscending, setSortAscending] = useState(true);

  // Quick View Drawer State
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

  // Client Map
  const clientMap = useMemo(() => {
    const map: Record<string, string> = {};
    clients.forEach((c) => {
      map[c.id] = c.full_name;
    });
    return map;
  }, [clients]);

  // Load Authenticated Profile & Comprehensive CRM Data
  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const userId = session.user.id;

      // 1. Fetch Profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('name, first_name, last_name, email')
        .eq('id', userId)
        .maybeSingle();

      setProfile({
        name: profileData?.name || null,
        first_name: profileData?.first_name || null,
        last_name: profileData?.last_name || null,
        email: session.user.email || 'Agent',
      });

      // 2. Fetch Clients
      const { data: clientsData } = await supabase
        .from('clients')
        .select('id, full_name, agent_id, date_of_birth');

      setClients(clientsData || []);

      const clientIds = (clientsData || []).map((c) => c.id);

      // 3. Parallel Queries for All Policy Books & Operations
      const [
        pcRes,
        healthRes,
        medicareRes,
        suppRes,
        lifeRes,
        apptRes,
        actRes,
        commRes,
      ] = await Promise.all([
        // P&C Policies (policies table excluding health, life, supplemental)
        supabase
          .from('policies')
          .select('id, client_id, policy_type, policy_number, company_name, writing_company, effective_date, expiration_date, premium, total_premium, annual_premium, status, created_at'),

        // Health Policies
        supabase
          .from('health_policies')
          .select('id, client_id, company_2026, plan_name, effective_date, created_at, status, members'),

        // Medicare Policies
        supabase
          .from('medicare_policies')
          .select('id, client_id, carrier, plan_name, policy_number, effective_date, created_at, status'),

        // Supplemental Policies
        supabase
          .from('supplemental_policies')
          .select('id, client_id, carrier, policy_type, policy_number, effective_date, created_at, status'),

        // Life Policies
        supabase
          .from('life_policies')
          .select('id, client_id, carrier, policy_type, policy_number, effective_date, created_at, status'),

        // Today's Calendar Appointments
        supabase
          .from('calendar_appointments')
          .select('id, starts_at, ends_at, title, description, status, client_id, agent_id, client:clients(id, full_name)')
          .eq('agent_id', userId)
          .eq('status', 'scheduled')
          .order('starts_at', { ascending: true }),

        // Activity Events
        supabase
          .from('activity_events')
          .select('id, client_id, policy_id, health_policy_id, actor_id, event_type, description, created_at')
          .order('created_at', { ascending: false })
          .limit(20),

        // P&C Commission Payments
        supabase
          .from('pc_commission_payments')
          .select('id, amount, payment_date, carrier, policy_number, status, agent_id'),
      ]);

      // Filter P&C Policies
      const filteredPc = (pcRes.data || []).filter((p: any) => {
        const pTypeLower = (p.policy_type || '').trim().toLowerCase();
        return pTypeLower !== 'supplemental' && pTypeLower !== 'health' && pTypeLower !== 'life';
      });

      setPcPolicies(filteredPc);
      setHealthPolicies(healthRes.data || []);
      setMedicarePolicies(medicareRes.data || []);
      setSupplementalPolicies(suppRes.data || []);
      setLifePolicies(lifeRes.data || []);
      setAppointments(apptRes.data || []);
      setActivityEvents(actRes.data || []);
      setPcCommissions(commRes.data || []);

      // 4. Fetch Tickets via API
      try {
        const ticketRes = await fetch('/api/tickets', { cache: 'no-store' });
        if (ticketRes.ok) {
          const tData = await ticketRes.json();
          if (tData.success && Array.isArray(tData.tickets)) {
            setTickets(tData.tickets);
          }
        }
      } catch (tErr) {
        console.error('Error loading tickets for dashboard:', tErr);
      }
    } catch (err: any) {
      console.error('Error loading dashboard data:', err);
      setError(err?.message || 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // DATE HELPERS & METRICS CALCULATIONS
  const now = new Date();
  const todayIso = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().split('T')[0];

  const in7DaysMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const in30DaysIso = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30).toISOString().split('T')[0];

  // NON-P&C KPI COMPUTATIONS
  const healthCount = healthPolicies.length;
  const healthNewThisWeek = useMemo(() => {
    return healthPolicies.filter((p) => {
      const d = p.created_at || p.effective_date;
      return d && new Date(d).getTime() >= in7DaysMs;
    }).length;
  }, [healthPolicies, in7DaysMs]);

  const medicareCount = medicarePolicies.length;
  const medicareNewThisWeek = useMemo(() => {
    return medicarePolicies.filter((p) => {
      const d = p.created_at || p.effective_date;
      return d && new Date(d).getTime() >= in7DaysMs;
    }).length;
  }, [medicarePolicies, in7DaysMs]);

  const supplementalCount = supplementalPolicies.length;
  const supplementalNewThisWeek = useMemo(() => {
    return supplementalPolicies.filter((p) => {
      const d = p.created_at || p.effective_date;
      return d && new Date(d).getTime() >= in7DaysMs;
    }).length;
  }, [supplementalPolicies, in7DaysMs]);

  const lifeCount = lifePolicies.length;
  const lifeNewThisWeek = useMemo(() => {
    return lifePolicies.filter((p) => {
      const d = p.created_at || p.effective_date;
      return d && new Date(d).getTime() >= in7DaysMs;
    }).length;
  }, [lifePolicies, in7DaysMs]);

  // Health Members Count: sum members count or default 1 per policy
  const healthMembersCount = useMemo(() => {
    return healthPolicies.reduce((acc, p) => {
      if (Array.isArray(p.members)) return acc + p.members.length;
      if (typeof p.members === 'number') return acc + p.members;
      return acc + 1; // Default 1 primary member per policy
    }, 0);
  }, [healthPolicies]);

  // NON-P&C POLICY MIX (Health 🩺, Medicare 👤, Supplemental 🛡️, Life ❤️)
  const totalNonPcPoliciesCount = healthCount + medicareCount + supplementalCount + lifeCount;

  const nonPcPolicyMixItems = useMemo((): PolicyMixItem[] => {
    if (totalNonPcPoliciesCount === 0) return [];
    const calcPct = (cnt: number) => Math.round((cnt / totalNonPcPoliciesCount) * 100);

    return [
      {
        id: 'health',
        name: 'Health',
        count: healthCount,
        percentage: calcPct(healthCount),
        barColor: 'bg-[#2563EB]',
        iconBg: 'bg-[#EFF6FF] text-[#2563EB]',
        iconEmoji: '🩺',
      },
      {
        id: 'medicare',
        name: 'Medicare',
        count: medicareCount,
        percentage: calcPct(medicareCount),
        barColor: 'bg-[#10B981]',
        iconBg: 'bg-[#ECFDF5] text-[#10B981]',
        iconEmoji: '👤',
      },
      {
        id: 'supplemental',
        name: 'Supplemental',
        count: supplementalCount,
        percentage: calcPct(supplementalCount),
        barColor: 'bg-[#A855F7]',
        iconBg: 'bg-[#F3E8FF] text-[#A855F7]',
        iconEmoji: '🛡️',
      },
      {
        id: 'life',
        name: 'Life',
        count: lifeCount,
        percentage: calcPct(lifeCount),
        barColor: 'bg-[#EF4444]',
        iconBg: 'bg-[#FEF2F2] text-[#EF4444]',
        iconEmoji: '❤️',
      },
    ];
  }, [healthCount, medicareCount, supplementalCount, lifeCount, totalNonPcPoliciesCount]);

  // NON-P&C TOP CARRIERS
  const nonPcTopCarriers = useMemo((): TopCarrierItem[] => {
    const carrierCounts = new Map<string, number>();

    healthPolicies.forEach((p) => {
      const c = (p.company_2026 || p.plan_name || 'Health Carrier').trim();
      if (c) carrierCounts.set(c, (carrierCounts.get(c) || 0) + 1);
    });
    medicarePolicies.forEach((p) => {
      const c = (p.carrier || p.plan_name || 'Medicare Carrier').trim();
      if (c) carrierCounts.set(c, (carrierCounts.get(c) || 0) + 1);
    });
    supplementalPolicies.forEach((p) => {
      const c = (p.carrier || 'Supplemental Carrier').trim();
      if (c) carrierCounts.set(c, (carrierCounts.get(c) || 0) + 1);
    });
    lifePolicies.forEach((p) => {
      const c = (p.carrier || 'Life Carrier').trim();
      if (c) carrierCounts.set(c, (carrierCounts.get(c) || 0) + 1);
    });

    const sorted = Array.from(carrierCounts.entries()).sort((a, b) => b[1] - a[1]);
    const top5 = sorted.slice(0, 5);

    const colors = ['bg-[#2563EB]', 'bg-[#10B981]', 'bg-[#A855F7]', 'bg-[#F59E0B]', 'bg-[#64748B]'];

    return top5.map(([name, count], idx) => ({
      id: `carrier-${name}-${idx}`,
      name,
      count,
      percentage: totalNonPcPoliciesCount > 0 ? Math.round((count / totalNonPcPoliciesCount) * 100) : 0,
      barColor: colors[idx % colors.length],
    }));
  }, [healthPolicies, medicarePolicies, supplementalPolicies, lifePolicies, totalNonPcPoliciesCount]);

  // P&C KPI COMPUTATIONS
  const activePcPolicies = useMemo(() => pcPolicies.filter((p) => p.status === 'Active' || !p.status), [pcPolicies]);
  const activePcCount = activePcPolicies.length;

  const newPcThisWeek = useMemo(() => {
    return pcPolicies.filter((p) => {
      const d = p.created_at || p.effective_date;
      return d && new Date(d).getTime() >= in7DaysMs;
    }).length;
  }, [pcPolicies, in7DaysMs]);

  // Written Premium YTD (sum of premium / total_premium / annual_premium for P&C policies)
  const writtenPremiumYtd = useMemo(() => {
    const currentYear = now.getFullYear();
    return pcPolicies.reduce((acc, p) => {
      const prem = p.premium || p.total_premium || p.annual_premium || 0;
      const effDate = p.effective_date || p.created_at;
      if (effDate) {
        const yr = new Date(effDate).getFullYear();
        if (yr === currentYear) return acc + Number(prem);
      }
      return acc + Number(prem);
    }, 0);
  }, [pcPolicies, now]);

  const newPcMtdCount = useMemo(() => {
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    return pcPolicies.filter((p) => {
      const d = p.effective_date || p.created_at;
      if (!d) return false;
      const dt = new Date(d);
      return dt.getFullYear() === currentYear && dt.getMonth() === currentMonth;
    }).length;
  }, [pcPolicies, now]);

  const expiring30DaysCount = useMemo(() => {
    return activePcPolicies.filter((p) => {
      if (!p.expiration_date) return false;
      return p.expiration_date >= todayIso && p.expiration_date <= in30DaysIso;
    }).length;
  }, [activePcPolicies, todayIso, in30DaysIso]);

  const pendingIssuesCount = useMemo(() => {
    return pcPolicies.filter((p) => ['pending', 'review', 'unmatched', 'needs_attention'].includes((p.status || '').toLowerCase())).length;
  }, [pcPolicies]);

  // P&C POLICY MIX (Auto 🚗, Homeowner 🏠, Commercial 🏢, Flood 🌊, Umbrella ☂️, Other •••)
  const totalPcPoliciesCount = pcPolicies.length;

  const pcPolicyMixItems = useMemo((): PolicyMixItem[] => {
    if (totalPcPoliciesCount === 0) return [];
    const categoryCounts: Record<string, { count: number; name: string; iconBg: string; iconEmoji: string; barColor: string }> = {
      auto: { count: 0, name: 'Auto', iconBg: 'bg-[#EFF6FF] text-[#2563EB]', iconEmoji: '🚗', barColor: 'bg-[#2563EB]' },
      home: { count: 0, name: 'Homeowner', iconBg: 'bg-[#ECFDF5] text-[#10B981]', iconEmoji: '🏠', barColor: 'bg-[#10B981]' },
      commercial: { count: 0, name: 'Commercial', iconBg: 'bg-[#FEF2F2] text-[#EF4444]', iconEmoji: '🏢', barColor: 'bg-[#EF4444]' },
      flood: { count: 0, name: 'Flood', iconBg: 'bg-[#F0F9FF] text-[#0284C7]', iconEmoji: '🌊', barColor: 'bg-[#0284C7]' },
      umbrella: { count: 0, name: 'Umbrella', iconBg: 'bg-[#F3E8FF] text-[#A855F7]', iconEmoji: '☂️', barColor: 'bg-[#A855F7]' },
      other: { count: 0, name: 'Other', iconBg: 'bg-[#F8FAFC] text-[#64748B]', iconEmoji: '•••', barColor: 'bg-[#64748B]' },
    };

    pcPolicies.forEach((p) => {
      const typeLower = (p.policy_type || '').toLowerCase();
      if (typeLower.includes('auto') || typeLower.includes('car') || typeLower.includes('vehicle')) {
        categoryCounts.auto.count++;
      } else if (typeLower.includes('home') || typeLower.includes('property') || typeLower.includes('dwelling')) {
        categoryCounts.home.count++;
      } else if (typeLower.includes('comm') || typeLower.includes('business') || typeLower.includes('general')) {
        categoryCounts.commercial.count++;
      } else if (typeLower.includes('flood')) {
        categoryCounts.flood.count++;
      } else if (typeLower.includes('umbrella') || typeLower.includes('excess')) {
        categoryCounts.umbrella.count++;
      } else {
        categoryCounts.other.count++;
      }
    });

    return Object.entries(categoryCounts)
      .filter(([_, item]) => item.count > 0)
      .map(([id, item]) => ({
        id,
        name: item.name,
        count: item.count,
        percentage: Math.round((item.count / totalPcPoliciesCount) * 100),
        barColor: item.barColor,
        iconBg: item.iconBg,
        iconEmoji: item.iconEmoji,
      }));
  }, [pcPolicies, totalPcPoliciesCount]);

  // P&C TOP CARRIERS
  const pcTopCarriers = useMemo((): TopCarrierItem[] => {
    const carrierCounts = new Map<string, number>();
    pcPolicies.forEach((p) => {
      const c = (p.company_name || p.writing_company || 'P&C Carrier').trim();
      if (c) carrierCounts.set(c, (carrierCounts.get(c) || 0) + 1);
    });

    const sorted = Array.from(carrierCounts.entries()).sort((a, b) => b[1] - a[1]);
    const top5 = sorted.slice(0, 5);
    const colors = ['bg-[#2563EB]', 'bg-[#10B981]', 'bg-[#A855F7]', 'bg-[#F59E0B]', 'bg-[#64748B]'];

    return top5.map(([name, count], idx) => ({
      id: `pc-carrier-${name}-${idx}`,
      name,
      count,
      percentage: totalPcPoliciesCount > 0 ? Math.round((count / totalPcPoliciesCount) * 100) : 0,
      barColor: colors[idx % colors.length],
    }));
  }, [pcPolicies, totalPcPoliciesCount]);

  // P&C COMMISSIONS (Quaried from pc_commission_payments)
  const hasPcCommissionData = pcCommissions.length > 0;
  const pcCommissionsThisWeek = useMemo(() => {
    if (!hasPcCommissionData) return null;
    return pcCommissions.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
  }, [pcCommissions, hasPcCommissionData]);

  const pcCommissionsThisMonth = pcCommissionsThisWeek;
  const pcCommissionsYtd = pcCommissionsThisWeek;

  const pcCommissionsMonthlyBars = useMemo((): MonthlyCommissionBar[] => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonthIdx = now.getMonth();

    const monthlyTotals = new Array(12).fill(0);
    pcCommissions.forEach((c) => {
      if (c.payment_date) {
        const m = new Date(c.payment_date).getMonth();
        if (m >= 0 && m < 12) monthlyTotals[m] += Number(c.amount) || 0;
      }
    });

    return monthNames.map((name, idx) => ({
      monthName: name,
      amount: monthlyTotals[idx],
      highlight: idx === currentMonthIdx,
    }));
  }, [pcCommissions, now]);

  // P&C EXPIRATIONS TABLE DERIVED PIPELINE
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
      const comp = (p.company_name || p.writing_company || '').trim();
      if (comp) compMap.set(comp.toLowerCase(), comp);
    });
    return Array.from(compMap.values()).sort();
  }, [activePcPolicies]);

  const availableStatuses = useMemo(() => {
    const statuses = new Set<string>();
    pcPolicies.forEach((p) => {
      if (p.status) statuses.add(p.status);
    });
    return Array.from(statuses).sort();
  }, [pcPolicies]);

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

  const handleHeaderSort = useCallback((column: SortableColumn) => {
    if (sortColumn === column) {
      setSortAscending((prev) => !prev);
    } else {
      setSortColumn(column);
      setSortAscending(true);
    }
  }, [sortColumn]);

  const displayedPcPolicies = useMemo((): PcPolicyRow[] => {
    return activePcPolicies
      .map((p) => {
        const daysRemaining = p.expiration_date
          ? Math.ceil(
              (new Date(p.expiration_date + 'T00:00:00').getTime() - new Date(todayIso + 'T00:00:00').getTime()) /
                (1000 * 3600 * 24)
            )
          : 9999;
        return {
          id: p.id,
          client_id: p.client_id,
          clientName: clientMap[p.client_id] || 'Client Record',
          policy_type: p.policy_type || 'P&C Policy',
          policy_number: p.policy_number,
          company_name: p.company_name || p.writing_company || null,
          effective_date: p.effective_date,
          expiration_date: p.expiration_date,
          premium: p.premium || p.total_premium || p.annual_premium || null,
          status: p.status || 'Active',
          daysRemaining,
          formattedEffDate: p.effective_date ? formatIsoToUsDate(p.effective_date) : '—',
          formattedExpDate: p.expiration_date ? formatIsoToUsDate(p.expiration_date) : '—',
        };
      })
      .filter((p) => {
        if (!p.expiration_date || p.expiration_date < todayIso) return false;

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

        if (lineFilter !== 'ALL' && p.policy_type !== lineFilter) return false;
        if (companyFilter !== 'ALL' && (p.company_name || '').toLowerCase() !== companyFilter.toLowerCase()) return false;

        if (daysFilter !== 'ALL') {
          const days = p.daysRemaining;
          if (daysFilter === '7' && (days < 0 || days > 7)) return false;
          if (daysFilter === '15' && (days < 0 || days > 15)) return false;
          if (daysFilter === '30' && (days < 0 || days > 30)) return false;
          if (daysFilter === '34' && (days < 0 || days > 34)) return false;
          if (daysFilter === '60' && (days < 0 || days > 60)) return false;
        }

        if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;

        return true;
      })
      .sort((a, b) => {
        let comparison = 0;
        if (sortColumn === 'expiration_date') {
          comparison = (a.expiration_date || '9999').localeCompare(b.expiration_date || '9999');
        } else if (sortColumn === 'client_name') {
          comparison = a.clientName.localeCompare(b.clientName);
        } else if (sortColumn === 'days_left') {
          comparison = a.daysRemaining - b.daysRemaining;
        } else if (sortColumn === 'premium') {
          comparison = (a.premium || 0) - (b.premium || 0);
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

  // MAP DATA FOR SHARED BOTTOM PANELS
  const mappedTodayAppointments = useMemo((): DashboardAppointment[] => {
    return appointments.map((a: any) => ({
      id: a.id,
      startsAt: a.starts_at,
      endsAt: a.ends_at,
      title: a.title || 'Client Appointment',
      clientName: a.client?.full_name || clientMap[a.client_id] || 'Client Record',
      status: a.status || 'scheduled',
    }));
  }, [appointments, clientMap]);

  const mappedTickets = useMemo((): DashboardTicket[] => {
    return tickets.map((t: any) => ({
      id: t.id,
      ticketCode: t.ticket_code || t.id,
      title: t.title || 'Ticket Request',
      status: t.status || 'open',
      priority: t.priority || 'normal',
      dueAt: t.due_at,
      createdAt: t.created_at,
      clientName: clientMap[t.client_id] || 'Client',
      assignedToName: t.assigned_to_name,
    }));
  }, [tickets, clientMap]);

  // DERIVE OPPORTUNITIES (Non-P&C Only)
  const mappedOpportunities = useMemo((): DashboardOpportunity[] => {
    const opps: DashboardOpportunity[] = [];
    clients.forEach((c) => {
      if (c.date_of_birth) {
        const age = new Date().getFullYear() - new Date(c.date_of_birth).getFullYear();
        if (age >= 64 && age <= 65) {
          opps.push({
            id: `opp-medicare-${c.id}`,
            clientId: c.id,
            clientName: c.full_name,
            type: 'medicare_eligible',
            title: 'Medicare Eligible',
            actionText: 'Add Medicare',
            valueText: 'High Value',
            iconBg: 'bg-[#ECFDF5] text-[#10B981]',
            iconEmoji: '👤',
          });
        }
      }
    });
    return opps;
  }, [clients]);

  // RECENT ACTIVITY MAP
  const mappedActivities = useMemo((): DashboardActivityEvent[] => {
    return activityEvents.map((evt: any) => {
      const clientName = clientMap[evt.client_id] || 'Client';
      const timeDiff = Math.max(1, Math.round((now.getTime() - new Date(evt.created_at).getTime()) / (1000 * 3600)));
      const timeAgo = timeDiff >= 24 ? `${Math.round(timeDiff / 24)}d ago` : `${timeDiff}h ago`;

      return {
        id: evt.id,
        type: evt.event_type || 'activity',
        title: evt.event_type ? evt.event_type.replace(/_/g, ' ').toUpperCase() : 'Policy updated',
        subtitle: `${clientName} - ${evt.description || 'Record updated'}`,
        timeAgo,
        iconBg: 'bg-[#EFF6FF] text-[#2563EB]',
        iconEmoji: '📋',
      };
    });
  }, [activityEvents, clientMap, now]);

  return (
    <DashboardLayout>
      <CrmPageContainer className="pb-10">
        <div className="space-y-6">
          {/* HEADER */}
          <DashboardHeader
            userName={profile?.first_name || profile?.name || 'Agent'}
            mode={isPcEnabled ? dashboardMode : 'non_pc'}
            onModeChange={handleModeChange}
            selectedPeriod={selectedPeriod}
            onPeriodChange={setSelectedPeriod}
            isPcEnabled={isPcEnabled}
          />

          {/* DASHBOARD MODE VIEW RENDER */}
          {(!isPcEnabled || dashboardMode === 'non_pc') ? (
            <NonPcDashboard
              healthCount={healthCount}
              healthNewThisWeek={healthNewThisWeek}
              medicareCount={medicareCount}
              medicareNewThisWeek={medicareNewThisWeek}
              supplementalCount={supplementalCount}
              supplementalNewThisWeek={supplementalNewThisWeek}
              lifeCount={lifeCount}
              lifeNewThisWeek={lifeNewThisWeek}
              healthMembersCount={healthMembersCount}
              commissionsThisWeek={null}
              commissionsThisMonth={null}
              commissionsYtd={null}
              commissionsMonthlyBars={[]}
              hasCommissionData={false}
              policyMixItems={nonPcPolicyMixItems}
              totalNonPcPoliciesCount={totalNonPcPoliciesCount}
              topCarrierItems={nonPcTopCarriers}
              todayAppointments={mappedTodayAppointments}
              myTickets={mappedTickets}
              opportunities={mappedOpportunities}
              recentActivities={mappedActivities}
              loading={loading}
            />
          ) : (
            <PcDashboard
              activePcCount={activePcCount}
              newPcThisWeek={newPcThisWeek}
              writtenPremiumYtd={writtenPremiumYtd}
              newPcMtdCount={newPcMtdCount}
              expiring30DaysCount={expiring30DaysCount}
              pendingIssuesCount={pendingIssuesCount}
              commissionsThisWeek={pcCommissionsThisWeek}
              commissionsThisMonth={pcCommissionsThisMonth}
              commissionsYtd={pcCommissionsYtd}
              commissionsMonthlyBars={pcCommissionsMonthlyBars}
              hasCommissionData={hasPcCommissionData}
              policyMixItems={pcPolicyMixItems}
              totalPcPoliciesCount={totalPcPoliciesCount}
              topCarrierItems={pcTopCarriers}
              displayedPolicies={displayedPcPolicies}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              lineFilter={lineFilter}
              setLineFilter={setLineFilter}
              companyFilter={companyFilter}
              setCompanyFilter={setCompanyFilter}
              daysFilter={daysFilter}
              setDaysFilter={setDaysFilter}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              availableLines={availableLines}
              availableCompanies={availableCompanies}
              availableStatuses={availableStatuses}
              isFiltered={isFiltered}
              handleClearFilters={handleClearFilters}
              sortColumn={sortColumn}
              sortAscending={sortAscending}
              handleHeaderSort={handleHeaderSort}
              handleOpenQuickView={handleOpenQuickView}
              todayAppointments={mappedTodayAppointments}
              recentActivities={mappedActivities}
              loading={loading}
              error={error}
            />
          )}

          {/* POLICY QUICK VIEW DRAWER COMPONENT */}
          <PolicyQuickViewDrawer
            isOpen={quickViewDrawer.isOpen}
            onClose={handleCloseQuickView}
            policyId={quickViewDrawer.policyId}
            clientId={quickViewDrawer.clientId}
            moduleType={quickViewDrawer.moduleType}
            policyTypeLabel={quickViewDrawer.policyTypeLabel}
          />
        </div>
      </CrmPageContainer>
    </DashboardLayout>
  );
}
