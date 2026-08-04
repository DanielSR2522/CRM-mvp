'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/lib/supabaseClient';
import { formatIsoToUsDate, extractUsDateAnd12hTime } from '@/utils/dateUtils';
import { useBusinessLines } from '@/contexts/BusinessLinesContext';

interface UserProfile {
  name: string | null;
  email: string | null;
}

interface ClientRow {
  id: string;
  full_name: string;
}

interface PolicyRow {
  id: string;
  client_id: string;
  policy_type: string;
  policy_number: string | null;
  company_name: string | null;
  expiration_date: string | null;
  status: string;
}

interface LeadRow {
  id: string;
  first_name: string;
  last_name: string;
  status: string;
  priority: string;
  next_follow_up_at: string | null;
}

interface AppointmentRow {
  id: string;
  client_id: string | null;
  title: string;
  location: string | null;
  starts_at: string;
  status: string;
}

interface NeedsAttentionItem {
  id: string;
  type: 'expired_policy' | 'expiring_7d' | 'overdue_lead' | 'expiring_30d' | 'today_appt';
  urgency: 'Critical' | 'High' | 'Medium' | 'Upcoming';
  urgencyClass: string;
  entityName: string;
  reason: string;
  relevantDate: string;
  statusLabel: string;
  actionUrl: string;
  actionLabel: string;
}

export default function DashboardPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const { isLineEnabled } = useBusinessLines();

  // Independent Data States
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [policies, setPolicies] = useState<PolicyRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);

  // Section Loading & Error States
  const [clientsLoading, setClientsLoading] = useState(true);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [apptsLoading, setApptsLoading] = useState(true);

  const [clientsError, setClientsError] = useState<string | null>(null);
  const [leadsError, setLeadsError] = useState<string | null>(null);
  const [apptsError, setApptsError] = useState<string | null>(null);

  // Client Map for quick lookup
  const clientMap = React.useMemo(() => {
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

  // Query 1: Clients & Policies (Isolated Query)
  const loadClientsAndPolicies = useCallback(async () => {
    try {
      setClientsLoading(true);
      setClientsError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: clientsData, error: clientsErr } = await supabase
        .from('clients')
        .select('id, full_name')
        .eq('agent_id', user.id);

      if (clientsErr) throw clientsErr;
      setClients(clientsData || []);

      if (clientsData && clientsData.length > 0) {
        const clientIds = clientsData.map((c) => c.id);
        const { data: policiesData, error: polErr } = await supabase
          .from('policies')
          .select('id, client_id, policy_type, policy_number, company_name, expiration_date, status')
          .in('client_id', clientIds);

        if (polErr) throw polErr;
        setPolicies(policiesData || []);
      } else {
        setPolicies([]);
      }
    } catch (err: any) {
      console.error('Error loading clients/policies:', err);
      setClientsError(err?.message || 'Failed to load clients and policies data.');
    } finally {
      setClientsLoading(false);
    }
  }, []);

  // Query 2: Leads (Isolated Query)
  const loadLeadsData = useCallback(async () => {
    try {
      setLeadsLoading(true);
      setLeadsError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error: fetchErr } = await supabase
        .from('leads')
        .select('id, first_name, last_name, status, priority, next_follow_up_at')
        .eq('agent_id', user.id);

      if (fetchErr) throw fetchErr;
      setLeads(data || []);
    } catch (err: any) {
      console.error('Error loading leads:', err);
      setLeadsError(err?.message || 'Failed to load leads data.');
    } finally {
      setLeadsLoading(false);
    }
  }, []);

  // Query 3: Calendar Appointments (Isolated Query)
  const loadCalendarAppointments = useCallback(async () => {
    try {
      setApptsLoading(true);
      setApptsError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error: fetchErr } = await supabase
        .from('calendar_appointments')
        .select('id, client_id, title, location, starts_at, status')
        .eq('agent_id', user.id);

      if (fetchErr) throw fetchErr;
      setAppointments(data || []);
    } catch (err: any) {
      console.error('Error loading appointments:', err);
      setApptsError(err?.message || 'Failed to load calendar schedule.');
    } finally {
      setApptsLoading(false);
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
  
  const in7Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
  const in7DaysIso = in7Days.toISOString().split('T')[0];

  const in30Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30);
  const in30DaysIso = in30Days.toISOString().split('T')[0];

  // 1. KPI Metric Calculations
  const totalClientsCount = clients.length;
  const activePolicies = policies.filter((p) => p.status === 'Active');
  const activePoliciesCount = activePolicies.length;

  const policiesExpiring30Days = activePolicies.filter((p) => {
    if (!p.expiration_date) return false;
    return p.expiration_date >= todayIso && p.expiration_date <= in30DaysIso;
  });
  const policiesExpiring30DaysCount = policiesExpiring30Days.length;

  const leadsInProgress = leads.filter((l) => ['new', 'contacted', 'in_progress', 'qualified'].includes(l.status));
  const leadsInProgressCount = leadsInProgress.length;

  const leadFollowUpsDue = leads.filter((l) => {
    if (!l.next_follow_up_at || ['converted', 'lost'].includes(l.status)) return false;
    return new Date(l.next_follow_up_at) <= now;
  });
  const leadFollowUpsDueCount = leadFollowUpsDue.length;

  // Local Day Range for Today's Appointments
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  const appointmentsToday = appointments.filter((a) => {
    if (a.status !== 'scheduled') return false;
    const start = new Date(a.starts_at);
    return start >= todayStart && start <= todayEnd;
  }).sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

  const appointmentsTodayCount = appointmentsToday.length;

  // 2. Needs Attention Item Assembly (Prioritized & Capped at 8-10)
  const needsAttentionItems = React.useMemo<NeedsAttentionItem[]>(() => {
    const items: NeedsAttentionItem[] = [];

    if (isLineEnabled('property_casualty')) {
      // Priority 1: Expired Policies
      activePolicies.forEach((p) => {
        if (p.expiration_date && p.expiration_date < todayIso) {
          items.push({
            id: `exp-pol-${p.id}`,
            type: 'expired_policy',
            urgency: 'Critical',
            urgencyClass: 'bg-rose-100 text-rose-800 border-rose-200',
            entityName: clientMap[p.client_id] || 'Client Policy',
            reason: `Policy #${p.policy_number || 'N/A'} (${p.policy_type}) has expired!`,
            relevantDate: formatIsoToUsDate(p.expiration_date),
            statusLabel: 'Expired',
            actionUrl: `/clients/${p.client_id}`,
            actionLabel: 'View Client',
          });
        }
      });

      // Priority 2: Policies Expiring within 7 Days
      activePolicies.forEach((p) => {
        if (p.expiration_date && p.expiration_date >= todayIso && p.expiration_date <= in7DaysIso) {
          const days = Math.ceil((new Date(p.expiration_date + 'T00:00:00').getTime() - new Date(todayIso + 'T00:00:00').getTime()) / (1000 * 3600 * 24));
          items.push({
            id: `exp-7d-${p.id}`,
            type: 'expiring_7d',
            urgency: 'High',
            urgencyClass: 'bg-amber-100 text-amber-800 border-amber-200',
            entityName: clientMap[p.client_id] || 'Client Policy',
            reason: `Policy #${p.policy_number || 'N/A'} expires in ${days} ${days === 1 ? 'day' : 'days'}.`,
            relevantDate: formatIsoToUsDate(p.expiration_date),
            statusLabel: `Expires in ${days}d`,
            actionUrl: `/clients/${p.client_id}`,
            actionLabel: 'Renew Policy',
          });
        }
      });
    }

    // Priority 3: Leads with Overdue Follow-ups
    leadFollowUpsDue.forEach((l) => {
      const { dateUs, hour12, minute, ampm } = extractUsDateAnd12hTime(l.next_follow_up_at);
      items.push({
        id: `overdue-lead-${l.id}`,
        type: 'overdue_lead',
        urgency: 'High',
        urgencyClass: 'bg-purple-100 text-purple-800 border-purple-200',
        entityName: `${l.first_name} ${l.last_name}`,
        reason: 'Overdue scheduled follow-up outreach.',
        relevantDate: `${dateUs} ${hour12}:${minute} ${ampm}`,
        statusLabel: 'Overdue Follow-up',
        actionUrl: `/leads/${l.id}`,
        actionLabel: 'Contact Lead',
      });
    });

    if (isLineEnabled('property_casualty')) {
      // Priority 4: Policies Expiring in 8–30 Days
      activePolicies.forEach((p) => {
        if (p.expiration_date && p.expiration_date > in7DaysIso && p.expiration_date <= in30DaysIso) {
          const days = Math.ceil((new Date(p.expiration_date + 'T00:00:00').getTime() - new Date(todayIso + 'T00:00:00').getTime()) / (1000 * 3600 * 24));
          items.push({
            id: `exp-30d-${p.id}`,
            type: 'expiring_30d',
            urgency: 'Medium',
            urgencyClass: 'bg-blue-100 text-blue-800 border-blue-200',
            entityName: clientMap[p.client_id] || 'Client Policy',
            reason: `Policy #${p.policy_number || 'N/A'} expires in ${days} days.`,
            relevantDate: formatIsoToUsDate(p.expiration_date),
            statusLabel: `Expires in ${days}d`,
            actionUrl: `/clients/${p.client_id}`,
            actionLabel: 'Review',
          });
        }
      });
    }

    // Priority 5: Today's Pending Appointments
    appointmentsToday.forEach((a) => {
      const { hour12, minute, ampm } = extractUsDateAnd12hTime(a.starts_at);
      items.push({
        id: `today-appt-${a.id}`,
        type: 'today_appt',
        urgency: 'Upcoming',
        urgencyClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        entityName: a.client_id ? (clientMap[a.client_id] || 'Client') : 'Scheduled Meeting',
        reason: `Today's Appointment: "${a.title}"`,
        relevantDate: `Today at ${hour12}:${minute} ${ampm}`,
        statusLabel: 'Scheduled Today',
        actionUrl: '/calendar',
        actionLabel: 'View Schedule',
      });
    });

    // Cap at 10 items max
    return items.slice(0, 10);
  }, [activePolicies, leadFollowUpsDue, appointmentsToday, clientMap, todayIso, in7DaysIso, in30DaysIso]);

  // 3. Upcoming Expirations List (Nearest 5–8 items)
  const upcomingExpirationsList = React.useMemo(() => {
    return activePolicies
      .filter((p) => p.expiration_date && p.expiration_date >= todayIso)
      .sort((a, b) => (a.expiration_date! > b.expiration_date! ? 1 : -1))
      .slice(0, 8)
      .map((p) => {
        const daysRemaining = Math.ceil(
          (new Date(p.expiration_date + 'T00:00:00').getTime() - new Date(todayIso + 'T00:00:00').getTime()) / (1000 * 3600 * 24)
        );
        return {
          ...p,
          clientName: clientMap[p.client_id] || 'Client Record',
          formattedExpDate: formatIsoToUsDate(p.expiration_date),
          daysRemaining,
        };
      });
  }, [activePolicies, clientMap, todayIso]);

  // 4. Lead Pipeline Snapshot Counts
  const leadPipelineSnapshot = React.useMemo(() => {
    const counts = {
      new: 0,
      contacted: 0,
      in_progress: 0,
      qualified: 0,
      converted: 0,
      lost: 0,
    };
    leads.forEach((l) => {
      if (l.status in counts) {
        counts[l.status as keyof typeof counts]++;
      }
    });
    const totalActiveLeads = leads.filter((l) => !['converted', 'lost'].includes(l.status)).length;
    return { counts, totalActiveLeads };
  }, [leads]);

  // US Current Date Formatting
  const currentDateFormatted = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto pb-10 font-sans">
        
        {/* SECTION 1: COMPACT HEADER */}
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
              Here is an overview of your active clients, policies, and priority items today.
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

          {/* Active Policies */}
          <div className="crm-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#556176]">Active Policies</span>
              <div className="w-7 h-7 rounded bg-[#EEF4FF] text-[#2563EB] flex items-center justify-center border border-[#BFDBFE]">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold text-[#172033]">{clientsLoading ? '...' : activePoliciesCount}</div>
              <span className="text-[10px] text-[#7C8799]">In-force policies</span>
            </div>
          </div>

          {/* Policies Expiring in 30 Days */}
          <div className="crm-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#556176]">Expiring 30 Days</span>
              <div className="w-7 h-7 rounded bg-[#FEFCE8] text-[#B7791F] flex items-center justify-center border border-[#FEF08A]">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold text-[#172033]">{clientsLoading ? '...' : policiesExpiring30DaysCount}</div>
              <span className="text-[10px] text-[#7C8799]">Require renewal</span>
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
              <div className="text-2xl font-bold text-[#172033]">{leadsLoading ? '...' : leadsInProgressCount}</div>
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
              <div className="text-2xl font-bold text-[#172033]">{leadsLoading ? '...' : leadFollowUpsDueCount}</div>
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
              <div className="text-2xl font-bold text-[#172033]">{apptsLoading ? '...' : appointmentsTodayCount}</div>
              <span className="text-[10px] text-[#7C8799]">Scheduled today</span>
            </div>
          </div>
        </div>

        {/* MIDDLE ROW: NEEDS ATTENTION & TODAY'S SCHEDULE */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* SECTION 3: NEEDS ATTENTION (Span 2 cols on Desktop) */}
          <div className="lg:col-span-2 crm-card p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E8ECF2] pb-3">
              <div>
                <h2 className="text-sm font-semibold text-[#172033]">Needs Attention</h2>
                <p className="text-xs text-[#556176]">Prioritized operational items requiring immediate action</p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-[#F8FAFC] border border-[#DCE2EA] text-[#556176]">
                {needsAttentionItems.length} items
              </span>
            </div>

            {(clientsLoading || leadsLoading || apptsLoading) ? (
              <div className="p-8 text-center text-xs text-[#7C8799]">Loading priority queue...</div>
            ) : clientsError ? (
              <div className="p-3.5 rounded-md bg-[#FEF2F2] border border-[#FECACA] text-[#C24141] text-xs font-semibold">{clientsError}</div>
            ) : needsAttentionItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#7C8799]">
                No urgent policy expirations, overdue follow-ups, or pending tasks.
              </div>
            ) : (
              <div className="space-y-2.5">
                {needsAttentionItems.map((item) => (
                  <div key={item.id} className="p-3 rounded-md border border-[#E8ECF2] hover:bg-[#F8FAFC] transition-colors flex items-center justify-between gap-4">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border uppercase tracking-wider ${
                          item.urgency === 'Critical' ? 'bg-[#FEF2F2] text-[#C24141] border-[#FECACA]' :
                          item.urgency === 'High' ? 'bg-[#FEFCE8] text-[#B7791F] border-[#FEF08A]' :
                          'bg-[#EEF4FF] text-[#2563EB] border-[#BFDBFE]'
                        }`}>
                          {item.urgency}
                        </span>
                        <span className="font-semibold text-xs text-[#172033] truncate">{item.entityName}</span>
                        <span className="text-[11px] text-[#7C8799]">• {item.relevantDate}</span>
                      </div>
                      <p className="text-xs text-[#556176] truncate">{item.reason}</p>
                    </div>

                    <Link
                      href={item.actionUrl}
                      className="crm-btn-primary text-xs px-3 py-1.5 flex-shrink-0"
                    >
                      {item.actionLabel}
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION 4: TODAY'S SCHEDULE (Span 1 col on Desktop) */}
          <div className="crm-card p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E8ECF2] pb-3">
              <div>
                <h2 className="text-sm font-semibold text-[#172033]">Today's Schedule</h2>
                <p className="text-xs text-[#556176]">Appointments scheduled for today</p>
              </div>
              <Link href="/calendar" className="text-xs font-semibold text-[#2563EB] hover:underline">
                Open Calendar →
              </Link>
            </div>

            {apptsLoading ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading schedule...</div>
            ) : apptsError ? (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">{apptsError}</div>
            ) : appointmentsToday.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No appointments scheduled for today.
              </div>
            ) : (
              <div className="space-y-3">
                {appointmentsToday.map((appt) => {
                  const { hour12, minute, ampm } = extractUsDateAnd12hTime(appt.starts_at);
                  const clientName = appt.client_id ? (clientMap[appt.client_id] || 'Client') : 'Scheduled Meeting';

                  return (
                    <div key={appt.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-blue-600">{hour12}:{minute} {ampm}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase">
                          {appt.status}
                        </span>
                      </div>
                      <div className="font-semibold text-xs text-slate-900">{appt.title}</div>
                      <div className="text-[11px] text-slate-500 flex items-center justify-between">
                        <span>{clientName}</span>
                        {appt.location && <span className="truncate max-w-[120px]">{appt.location}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* LOWER ROW: UPCOMING EXPIRATIONS & LEAD PIPELINE SNAPSHOT */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* SECTION 5: UPCOMING POLICY EXPIRATIONS (Span 2 cols on Desktop) */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Upcoming Policy Expirations</h2>
                <p className="text-xs text-slate-500">Nearest policy expirations requiring renewal attention</p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {upcomingExpirationsList.length} items
              </span>
            </div>

            {clientsLoading ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading expirations...</div>
            ) : upcomingExpirationsList.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No active policies expiring in the near future.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="py-2.5 px-3">Client</th>
                      <th className="py-2.5 px-3">Policy / Number</th>
                      <th className="py-2.5 px-3">Company</th>
                      <th className="py-2.5 px-3">Expiration Date</th>
                      <th className="py-2.5 px-3">Days Left</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs text-slate-800">
                    {upcomingExpirationsList.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-3 font-semibold text-slate-900">{p.clientName}</td>
                        <td className="py-3 px-3">
                          <div className="font-medium text-slate-900">{p.policy_type}</div>
                          <div className="text-[10px] text-slate-400 font-mono">#{p.policy_number || 'N/A'}</div>
                        </td>
                        <td className="py-3 px-3 text-slate-600">{p.company_name || 'N/A'}</td>
                        <td className="py-3 px-3 font-medium text-slate-900">{p.formattedExpDate}</td>
                        <td className="py-3 px-3">
                          <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${
                            p.daysRemaining <= 7 ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {p.daysRemaining} {p.daysRemaining === 1 ? 'day' : 'days'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <Link
                            href={`/clients/${p.client_id}`}
                            className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-semibold transition-colors"
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* SECTION 6: LEAD PIPELINE SNAPSHOT (Span 1 col on Desktop) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Lead Pipeline</h2>
                <p className="text-xs text-slate-500">Stage breakdown & active summary</p>
              </div>
              <Link href="/leads" className="text-xs font-bold text-purple-600 hover:underline">
                Open Leads →
              </Link>
            </div>

            {leadsLoading ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading pipeline...</div>
            ) : leadsError ? (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">{leadsError}</div>
            ) : (
              <div className="space-y-4">
                {/* Stage Breakdown Grid */}
                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                    <span className="font-semibold text-slate-600">New</span>
                    <span className="font-extrabold text-slate-900">{leadPipelineSnapshot.counts.new}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                    <span className="font-semibold text-slate-600">Contacted</span>
                    <span className="font-extrabold text-slate-900">{leadPipelineSnapshot.counts.contacted}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                    <span className="font-semibold text-slate-600">In Progress</span>
                    <span className="font-extrabold text-slate-900">{leadPipelineSnapshot.counts.in_progress}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                    <span className="font-semibold text-slate-600">Qualified</span>
                    <span className="font-extrabold text-slate-900">{leadPipelineSnapshot.counts.qualified}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between">
                    <span className="font-semibold">Converted</span>
                    <span className="font-extrabold">{leadPipelineSnapshot.counts.converted}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-center justify-between">
                    <span className="font-semibold">Lost</span>
                    <span className="font-extrabold">{leadPipelineSnapshot.counts.lost}</span>
                  </div>
                </div>

                {/* Pipeline Summary Footer */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span>Total Active Leads: <strong className="text-slate-900">{leadPipelineSnapshot.totalActiveLeads}</strong></span>
                  <span>Follow-ups: <strong className="text-rose-600">{leadFollowUpsDueCount}</strong></span>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Link
                    href="/leads"
                    className="flex-1 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold text-center transition-colors shadow-sm"
                  >
                    Open Leads
                  </Link>
                  <Link
                    href="/leads"
                    className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold text-center transition-colors"
                  >
                    + New Lead
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
