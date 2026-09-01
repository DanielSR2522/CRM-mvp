'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import CrmPageContainer from '@/components/layout/CrmPageContainer';
import { supabase } from '@/lib/supabaseClient';
import { Lead, LeadStatus, LeadPriority, LeadMetrics, LeadFiltersState, FollowUpFilterOption } from '@/lib/leads/types';
import {
  formatIsoToUsDate,
  usDateToIso,
  formatAsDateInput,
  parseUsDateAnd12hTimeToDate,
  extractUsDateAnd12hTime,
} from '@/utils/dateUtils';
import ConvertLeadModal from '@/components/leads/ConvertLeadModal';
import DatePicker from '@/components/ui/DatePicker';
import { formatUSPhone } from '@/lib/formatters/phone';
import PhoneInput from '@/components/common/PhoneInput';

const DEFAULT_FILTERS: LeadFiltersState = {
  searchQuery: '',
  status: 'all',
  priority: 'all',
  productInterest: '',
  followUp: 'all',
  createdFromUs: '',
  createdToUs: '',
};

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [metrics, setMetrics] = useState<LeadMetrics>({
    totalLeads: 0,
    newLeads: 0,
    inProgressLeads: 0,
    qualifiedLeads: 0,
    convertedLeads: 0,
    followUpsDue: 0,
  });
  const [loading, setLoading] = useState(true);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Filters state
  const [filters, setFilters] = useState<LeadFiltersState>(DEFAULT_FILTERS);
  const [activeFilters, setActiveFilters] = useState<LeadFiltersState>(DEFAULT_FILTERS);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete modal state
  const [deletingLead, setDeletingLead] = useState<Lead | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Conversion modal state
  const [convertingLead, setConvertingLead] = useState<Lead | null>(null);

  // Form Fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [productInterest, setProductInterest] = useState('');
  const [status, setStatus] = useState<LeadStatus>('new');
  const [priority, setPriority] = useState<LeadPriority>('medium');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateVal, setStateVal] = useState('');
  const [zipCode, setZipCode] = useState('');

  // Follow-up Date & Time fields
  const [enableFollowUp, setEnableFollowUp] = useState(false);
  const [followUpDateUs, setFollowUpDateUs] = useState('');
  const [followUpHour, setFollowUpHour] = useState('09');
  const [followUpMinute, setFollowUpMinute] = useState('00');
  const [followUpAmPm, setFollowUpAmPm] = useState<'AM' | 'PM'>('AM');

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // 1. Fetch Metrics independently
  const loadMetrics = useCallback(async () => {
    try {
      setMetricsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error: metricsErr } = await supabase
        .from('leads')
        .select('status, next_follow_up_at')
        .eq('agent_id', user.id);

      if (metricsErr) throw metricsErr;

      if (data) {
        const now = new Date().toISOString();
        const totalLeads = data.length;
        let newLeads = 0;
        let inProgressLeads = 0;
        let qualifiedLeads = 0;
        let convertedLeads = 0;
        let followUpsDue = 0;

        data.forEach((row) => {
          if (row.status === 'new') newLeads++;
          if (row.status === 'in_progress') inProgressLeads++;
          if (row.status === 'qualified') qualifiedLeads++;
          if (row.status === 'converted') convertedLeads++;

          if (
            row.next_follow_up_at &&
            row.next_follow_up_at <= now &&
            row.status !== 'converted' &&
            row.status !== 'lost'
          ) {
            followUpsDue++;
          }
        });

        setMetrics({
          totalLeads,
          newLeads,
          inProgressLeads,
          qualifiedLeads,
          convertedLeads,
          followUpsDue,
        });
      }
    } catch (err: any) {
      console.error('Error loading metrics:', err);
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  // 2. Fetch Leads table data
  const loadLeads = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      let query = supabase
        .from('leads')
        .select('*')
        .eq('agent_id', user.id)
        .order('created_at', { ascending: false });

      // Apply active filters
      if (activeFilters.status !== 'all') {
        query = query.eq('status', activeFilters.status);
      }
      if (activeFilters.priority !== 'all') {
        query = query.eq('priority', activeFilters.priority);
      }
      if (activeFilters.productInterest.trim()) {
        query = query.ilike('product_interest', `%${activeFilters.productInterest.trim()}%`);
      }

      // Date Created filter
      if (activeFilters.createdFromUs) {
        const isoFrom = usDateToIso(activeFilters.createdFromUs);
        if (isoFrom) {
          query = query.gte('created_at', `${isoFrom}T00:00:00.000Z`);
        }
      }
      if (activeFilters.createdToUs) {
        const isoTo = usDateToIso(activeFilters.createdToUs);
        if (isoTo) {
          query = query.lte('created_at', `${isoTo}T23:59:59.999Z`);
        }
      }

      const { data, error: fetchErr } = await query;
      if (fetchErr) throw fetchErr;

      let filteredList: Lead[] = data || [];

      // Client-side text search (matches first_name, last_name, email, phone, product_interest)
      if (activeFilters.searchQuery.trim()) {
        const q = activeFilters.searchQuery.toLowerCase().trim();
        filteredList = filteredList.filter((lead) => {
          const fullName = `${lead.first_name} ${lead.last_name}`.toLowerCase();
          const emailStr = (lead.email || '').toLowerCase();
          const phoneStr = (lead.phone || '').toLowerCase();
          const productStr = (lead.product_interest || '').toLowerCase();

          return (
            fullName.includes(q) ||
            emailStr.includes(q) ||
            phoneStr.includes(q) ||
            productStr.includes(q)
          );
        });
      }

      // Follow-up timeframe filtering
      if (activeFilters.followUp !== 'all') {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
        const nowIso = now.toISOString();

        filteredList = filteredList.filter((lead) => {
          if (activeFilters.followUp === 'none') {
            return !lead.next_follow_up_at;
          }
          if (!lead.next_follow_up_at) return false;

          if (activeFilters.followUp === 'due') {
            return lead.next_follow_up_at <= nowIso && lead.status !== 'converted' && lead.status !== 'lost';
          }
          if (activeFilters.followUp === 'today') {
            return lead.next_follow_up_at >= startOfToday && lead.next_follow_up_at <= endOfToday;
          }
          if (activeFilters.followUp === 'upcoming') {
            return lead.next_follow_up_at > nowIso;
          }
          return true;
        });
      }

      setLeads(filteredList);
    } catch (err: any) {
      console.error('Error loading leads:', err);
      setError(err?.message || 'Failed to load leads.');
    } finally {
      setLoading(false);
    }
  }, [activeFilters]);

  useEffect(() => {
    loadMetrics();
    loadLeads();
  }, [loadMetrics, loadLeads]);

  const handleApplyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveFilters(filters);
  };

  const handleClearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setActiveFilters(DEFAULT_FILTERS);
  };

  // Open Create Lead Modal
  const handleOpenCreateModal = () => {
    setEditingLead(null);
    setFirstName('');
    setLastName('');
    setPhone('');
    setEmail('');
    setProductInterest('');
    setStatus('new');
    setPriority('medium');
    setAddress('');
    setCity('');
    setStateVal('');
    setZipCode('');
    setEnableFollowUp(false);
    
    const { dateUs, hour12, minute, ampm } = extractUsDateAnd12hTime(null);
    setFollowUpDateUs(dateUs);
    setFollowUpHour(hour12);
    setFollowUpMinute(minute);
    setFollowUpAmPm(ampm);

    setFormError(null);
    setIsModalOpen(true);
  };

  // Open Edit Lead Modal
  const handleOpenEditModal = (lead: Lead) => {
    if (lead.status === 'converted') {
      showToast('Converted leads cannot be edited.', 'error');
      return;
    }
    setEditingLead(lead);
    setFirstName(lead.first_name || '');
    setLastName(lead.last_name || '');
    setPhone(lead.phone || '');
    setEmail(lead.email || '');
    setProductInterest(lead.product_interest || '');
    setStatus(lead.status);
    setPriority(lead.priority);
    setAddress(lead.address || '');
    setCity(lead.city || '');
    setStateVal(lead.state || '');
    setZipCode(lead.zip_code || '');

    if (lead.next_follow_up_at) {
      setEnableFollowUp(true);
      const { dateUs, hour12, minute, ampm } = extractUsDateAnd12hTime(lead.next_follow_up_at);
      setFollowUpDateUs(dateUs);
      setFollowUpHour(hour12);
      setFollowUpMinute(minute);
      setFollowUpAmPm(ampm);
    } else {
      setEnableFollowUp(false);
      const { dateUs, hour12, minute, ampm } = extractUsDateAnd12hTime(null);
      setFollowUpDateUs(dateUs);
      setFollowUpHour(hour12);
      setFollowUpMinute(minute);
      setFollowUpAmPm(ampm);
    }

    setFormError(null);
    setIsModalOpen(true);
  };

  // Save Lead (Create or Update)
  const handleSaveLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();

    if (!trimmedFirst) {
      setFormError('First Name is required.');
      return;
    }
    if (!trimmedLast) {
      setFormError('Last Name is required.');
      return;
    }

    // Email validation if entered
    const trimmedEmail = email.trim().toLowerCase();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setFormError('Please enter a valid email address.');
      return;
    }

    // Parse Next Follow-up timestamp if enabled
    let nextFollowUpIso: string | null = null;
    if (enableFollowUp) {
      if (!followUpDateUs.trim()) {
        setFormError('Please enter a valid follow-up date (MM/DD/YYYY).');
        return;
      }
      const parsedDate = parseUsDateAnd12hTimeToDate(
        followUpDateUs,
        followUpHour,
        followUpMinute,
        followUpAmPm
      );
      if (!parsedDate) {
        setFormError('Invalid follow-up date or time. Please use MM/DD/YYYY format.');
        return;
      }
      nextFollowUpIso = parsedDate.toISOString();
    }

    setFormSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated.');

      const payload = {
        agent_id: user.id,
        first_name: trimmedFirst,
        last_name: trimmedLast,
        phone: phone.trim() || null,
        email: trimmedEmail || null,
        product_interest: productInterest.trim() || null,
        status: status,
        priority: priority,
        next_follow_up_at: nextFollowUpIso,
        address: address.trim() || null,
        city: city.trim() || null,
        state: stateVal.trim() || null,
        zip_code: zipCode.trim() || null,
        last_activity_at: new Date().toISOString(),
      };

      if (editingLead) {
        // UPDATE existing lead
        const { error: updateErr } = await supabase
          .from('leads')
          .update(payload)
          .eq('id', editingLead.id)
          .eq('agent_id', user.id);

        if (updateErr) throw updateErr;
        showToast('Lead updated successfully!');
      } else {
        // INSERT new lead
        const { error: insertErr } = await supabase
          .from('leads')
          .insert(payload);

        if (insertErr) throw insertErr;
        showToast('New lead created successfully!');
      }

      setIsModalOpen(false);
      loadMetrics();
      loadLeads();
    } catch (err: any) {
      console.error('Error saving lead:', err);
      setFormError(err?.message || 'Failed to save lead.');
    } finally {
      setFormSaving(false);
    }
  };

  // Quick Status Change from Table
  const handleQuickStatusChange = async (leadId: string, newStatus: LeadStatus) => {
    if (newStatus === 'converted') return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error: statusErr } = await supabase
        .from('leads')
        .update({
          status: newStatus,
          last_activity_at: new Date().toISOString(),
        })
        .eq('id', leadId)
        .eq('agent_id', user.id);

      if (statusErr) throw statusErr;

      showToast(`Status updated to ${getStatusLabel(newStatus)}`);
      loadMetrics();
      loadLeads();
    } catch (err: any) {
      console.error('Error updating status:', err);
      showToast(err?.message || 'Failed to update status', 'error');
    }
  };

  // Execute Lead Deletion
  const handleDeleteLead = async () => {
    if (!deletingLead) return;
    try {
      setDeleting(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error: delErr } = await supabase
        .from('leads')
        .delete()
        .eq('id', deletingLead.id)
        .eq('agent_id', user.id);

      if (delErr) throw delErr;

      showToast('Lead deleted successfully');
      setDeletingLead(null);
      loadMetrics();
      loadLeads();
    } catch (err: any) {
      console.error('Error deleting lead:', err);
      showToast(err?.message || 'Failed to delete lead', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // Helper formatting badges
  const getStatusBadge = (st: LeadStatus) => {
    switch (st) {
      case 'new':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60">New</span>;
      case 'contacted':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60">Contacted</span>;
      case 'in_progress':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800/60">In Progress</span>;
      case 'qualified':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">Qualified</span>;
      case 'converted':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-50 dark:bg-green-950/50 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800/60">Converted</span>;
      case 'lost':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">Lost</span>;
      default:
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">{st}</span>;
    }
  };

  const getPriorityBadge = (pr: LeadPriority) => {
    switch (pr) {
      case 'high':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60">High</span>;
      case 'medium':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">Medium</span>;
      case 'low':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">Low</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">{pr}</span>;
    }
  };

  const getStatusLabel = (st: LeadStatus) => {
    switch (st) {
      case 'new': return 'New';
      case 'contacted': return 'Contacted';
      case 'in_progress': return 'In Progress';
      case 'qualified': return 'Qualified';
      case 'converted': return 'Converted';
      case 'lost': return 'Lost';
      default: return st;
    }
  };

  const formatFollowUpDisplay = (isoStr: string | null) => {
    if (!isoStr) return <span className="text-slate-400 dark:text-slate-500 text-xs italic font-sans">No follow-up set</span>;

    const { dateUs, hour12, minute, ampm } = extractUsDateAnd12hTime(isoStr);
    const now = new Date().toISOString();
    const isOverdue = isoStr <= now;

    return (
      <div className={`flex flex-col text-xs ${isOverdue ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-slate-700 dark:text-slate-300'}`}>
        <span>{dateUs} {hour12}:{minute} {ampm}</span>
        {isOverdue && <span className="text-[10px] text-rose-600 dark:text-rose-400 font-bold uppercase tracking-wider">Overdue</span>}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <CrmPageContainer className="pb-12">
        {/* Toast Notification */}
        {toast && (
          <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium transition-all duration-300 ${
            toast.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-950/90 border-rose-500/30 text-rose-300'
          }`}>
            {toast.message}
          </div>
        )}

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--surface-border)] pb-5">
          <div>
            <h1 className="text-2xl font-extrabold text-[var(--workspace-fg)] tracking-tight">Leads</h1>
            <p className="text-xs text-[var(--workspace-muted)] mt-1">Manage prospects, pipelines, and follow-up opportunities</p>
          </div>
          <button
            onClick={handleOpenCreateModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-foreground)] text-xs font-bold shadow-md transition-all active:scale-[0.98]"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            New Lead
          </button>
        </div>

        {/* Summary Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-[var(--surface-bg)] border border-[var(--surface-border)] rounded-2xl p-4 shadow-xs">
            <span className="text-[10px] text-[var(--workspace-muted)] font-bold uppercase tracking-wider">Total Leads</span>
            <div className="text-2xl font-extrabold text-[var(--workspace-fg)] mt-1">
              {metricsLoading ? '...' : metrics.totalLeads}
            </div>
          </div>
          <div className="bg-[var(--surface-bg)] border border-[var(--surface-border)] rounded-2xl p-4 shadow-xs">
            <span className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">New</span>
            <div className="text-2xl font-extrabold text-blue-600 mt-1">
              {metricsLoading ? '...' : metrics.newLeads}
            </div>
          </div>
          <div className="bg-[var(--surface-bg)] border border-[var(--surface-border)] rounded-2xl p-4 shadow-xs">
            <span className="text-[10px] text-cyan-600 font-bold uppercase tracking-wider">In Progress</span>
            <div className="text-2xl font-extrabold text-cyan-600 mt-1">
              {metricsLoading ? '...' : metrics.inProgressLeads}
            </div>
          </div>
          <div className="bg-[var(--surface-bg)] border border-[var(--surface-border)] rounded-2xl p-4 shadow-xs">
            <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Qualified</span>
            <div className="text-2xl font-extrabold text-emerald-600 mt-1">
              {metricsLoading ? '...' : metrics.qualifiedLeads}
            </div>
          </div>
          <div className="bg-[var(--surface-bg)] border border-[var(--surface-border)] rounded-2xl p-4 shadow-xs">
            <span className="text-[10px] text-green-600 font-bold uppercase tracking-wider">Converted</span>
            <div className="text-2xl font-extrabold text-green-600 mt-1">
              {metricsLoading ? '...' : metrics.convertedLeads}
            </div>
          </div>
          <div className="bg-[var(--surface-bg)] border border-[var(--surface-border)] rounded-2xl p-4 shadow-xs">
            <span className="text-[10px] text-rose-600 font-bold uppercase tracking-wider">Follow-ups Due</span>
            <div className="text-2xl font-extrabold text-rose-600 mt-1">
              {metricsLoading ? '...' : metrics.followUpsDue}
            </div>
          </div>
        </div>

        {/* Filters Bar */}
        <form onSubmit={handleApplyFilters} className="bg-[var(--surface-bg)] border border-[var(--surface-border)] rounded-2xl p-5 shadow-xs space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {/* Search */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-[var(--workspace-fg)] uppercase tracking-wider mb-1">Search</label>
              <input
                type="text"
                placeholder="Name, email, phone, product..."
                value={filters.searchQuery}
                onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value })}
                className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--input-fg)] focus:ring-2 focus:ring-[var(--focus-ring)] rounded-xl px-3.5 py-2 text-xs outline-none"
              />
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-xs font-bold text-[var(--workspace-fg)] uppercase tracking-wider mb-1">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value as any })}
                className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--input-fg)] focus:ring-2 focus:ring-[var(--focus-ring)] rounded-xl px-3.5 py-2 text-xs outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="in_progress">In Progress</option>
                <option value="qualified">Qualified</option>
                <option value="converted">Converted</option>
                <option value="lost">Lost</option>
              </select>
            </div>

            {/* Priority Filter */}
            <div>
              <label className="block text-xs font-bold text-[var(--workspace-fg)] uppercase tracking-wider mb-1">Priority</label>
              <select
                value={filters.priority}
                onChange={(e) => setFilters({ ...filters, priority: e.target.value as any })}
                className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--input-fg)] focus:ring-2 focus:ring-[var(--focus-ring)] rounded-xl px-3.5 py-2 text-xs outline-none"
              >
                <option value="all">All Priorities</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            {/* Product Interest Filter */}
            <div>
              <label className="block text-xs font-bold text-[var(--workspace-fg)] uppercase tracking-wider mb-1">Product Interest</label>
              <input
                type="text"
                placeholder="Product..."
                value={filters.productInterest}
                onChange={(e) => setFilters({ ...filters, productInterest: e.target.value })}
                className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--input-fg)] focus:ring-2 focus:ring-[var(--focus-ring)] rounded-xl px-3.5 py-2 text-xs outline-none"
              />
            </div>

            {/* Follow-up Filter */}
            <div>
              <label className="block text-xs font-bold text-[var(--workspace-fg)] uppercase tracking-wider mb-1">Follow-up</label>
              <select
                value={filters.followUp}
                onChange={(e) => setFilters({ ...filters, followUp: e.target.value as FollowUpFilterOption })}
                className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--input-fg)] focus:ring-2 focus:ring-[var(--focus-ring)] rounded-xl px-3.5 py-2 text-xs outline-none"
              >
                <option value="all">All</option>
                <option value="due">Overdue / Due</option>
                <option value="today">Today</option>
                <option value="upcoming">Upcoming</option>
                <option value="none">No Follow-up</option>
              </select>
            </div>

            {/* Created From */}
            <div>
              <DatePicker
                label="Created From"
                optional
                value={filters.createdFromUs}
                onChange={(iso) => {
                  if (iso) {
                    const parts = iso.split('-');
                    setFilters({ ...filters, createdFromUs: `${parts[1]}/${parts[2]}/${parts[0]}` });
                  } else {
                    setFilters({ ...filters, createdFromUs: '' });
                  }
                }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-[var(--surface-border)] pt-3">
            <span className="text-xs text-[var(--workspace-muted)]">
              Showing <strong className="text-[var(--workspace-fg)] font-bold">{leads.length}</strong> leads
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClearFilters}
                className="px-3.5 py-2 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-bg)] text-xs font-bold text-[var(--workspace-fg)] hover:bg-[var(--surface-muted-bg)] transition-all"
              >
                Clear Filters
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-xs font-bold text-[var(--accent-foreground)] transition-all shadow-xs"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </form>

        {/* Error alert */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
            {error}
          </div>
        )}

        {/* Desktop Table */}
        <div className="hidden lg:block bg-[var(--table-bg)] border border-[var(--surface-border)] rounded-2xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[var(--table-header-bg)] border-b border-[var(--surface-border)] text-[11px] font-bold text-[var(--workspace-muted)] uppercase tracking-wider">
                  <th className="py-3.5 px-4">Lead</th>
                  <th className="py-3.5 px-4">Product Interest</th>
                  <th className="py-3.5 px-4">Priority</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Next Follow-up</th>
                  <th className="py-3.5 px-4">Last Activity</th>
                  <th className="py-3.5 px-4">Created</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--surface-border)] text-xs text-[var(--workspace-fg)]">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-[var(--workspace-muted)] font-medium">
                      Loading leads...
                    </td>
                  </tr>
                ) : leads.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-14 text-center text-[var(--workspace-muted)] font-medium">
                      No leads found. Click "New Lead" to create one.
                    </td>
                  </tr>
                ) : (
                  leads.map((lead) => {
                    const isConverted = lead.status === 'converted';
                    return (
                      <tr key={lead.id} className="bg-[var(--table-row-bg)] hover:bg-[var(--table-row-hover)] transition-colors">
                        <td className="py-3.5 px-4">
                          <Link href={`/leads/${lead.id}`} className="font-extrabold text-[var(--workspace-fg)] hover:text-[var(--accent)] transition-colors">
                            {lead.first_name} {lead.last_name}
                          </Link>
                          <div className="text-[11px] text-[var(--workspace-muted)] flex items-center gap-2 mt-0.5 font-sans">
                            {lead.email && <span>{lead.email}</span>}
                            {lead.email && lead.phone && <span>•</span>}
                            {lead.phone && <span>{formatUSPhone(lead.phone)}</span>}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-[var(--workspace-fg)]">
                          {lead.product_interest || 'N/A'}
                        </td>
                        <td className="py-3.5 px-4">
                          {getPriorityBadge(lead.priority)}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            {getStatusBadge(lead.status)}
                            {!isConverted && (
                              <select
                                value={lead.status}
                                onChange={(e) => handleQuickStatusChange(lead.id, e.target.value as LeadStatus)}
                                className="bg-[var(--input-bg)] border border-[var(--input-border)] text-[11px] text-[var(--input-fg)] rounded-lg px-2 py-1 outline-none cursor-pointer hover:border-slate-300"
                              >
                                <option value="new">New</option>
                                <option value="contacted">Contacted</option>
                                <option value="in_progress">In Progress</option>
                                <option value="qualified">Qualified</option>
                                <option value="lost">Lost</option>
                              </select>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          {formatFollowUpDisplay(lead.next_follow_up_at)}
                        </td>
                        <td className="py-3.5 px-4 text-[var(--workspace-muted)]">
                          {formatIsoToUsDate(lead.last_activity_at)}
                        </td>
                        <td className="py-3.5 px-4 text-[var(--workspace-muted)]">
                          {formatIsoToUsDate(lead.created_at)}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Link
                              href={`/leads/${lead.id}`}
                              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all"
                            >
                              View
                            </Link>

                            {!isConverted ? (
                              <button
                                onClick={() => handleOpenEditModal(lead)}
                                className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-[var(--accent)] text-slate-700 text-xs font-bold transition-all"
                              >
                                Edit
                              </button>
                            ) : (
                              <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-400 text-xs font-bold cursor-not-allowed">
                                Edit
                              </span>
                            )}

                            {!isConverted ? (
                              <button
                                onClick={() => setConvertingLead(lead)}
                                className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold transition-all"
                              >
                                Convert to Client
                              </button>
                            ) : lead.converted_client_id ? (
                              <Link
                                href={`/clients/${lead.converted_client_id}`}
                                className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold transition-all"
                              >
                                Open Client
                              </Link>
                            ) : (
                              <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-400 text-xs font-bold border border-slate-200">
                                Converted
                              </span>
                            )}

                            <button
                              onClick={() => setDeletingLead(lead)}
                              className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-all"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile Stacked Cards */}
        <div className="lg:hidden space-y-3">
          {loading ? (
            <div className="bg-[var(--surface-bg)] border border-[var(--surface-border)] rounded-2xl p-6 text-center text-[var(--workspace-muted)] text-xs font-medium">
              Loading leads...
            </div>
          ) : leads.length === 0 ? (
            <div className="bg-[var(--surface-bg)] border border-[var(--surface-border)] rounded-2xl p-6 text-center text-[var(--workspace-muted)] text-xs font-medium">
              No leads found.
            </div>
          ) : (
            leads.map((lead) => {
              const isConverted = lead.status === 'converted';
              return (
                <div key={lead.id} className="bg-[var(--surface-bg)] border border-[var(--surface-border)] rounded-2xl p-4 space-y-3 shadow-xs">
                  <div className="flex items-start justify-between">
                    <div>
                      <Link href={`/leads/${lead.id}`} className="font-extrabold text-[var(--workspace-fg)] text-sm hover:text-[var(--accent)]">
                        {lead.first_name} {lead.last_name}
                      </Link>
                      <div className="text-xs text-[var(--workspace-muted)] mt-0.5 font-medium">
                        {lead.product_interest || 'No product interest'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {getPriorityBadge(lead.priority)}
                      {getStatusBadge(lead.status)}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs border-t border-b border-[var(--surface-border)] py-2.5 text-[var(--workspace-fg)]">
                    <div>
                      <span className="text-[10px] text-[var(--workspace-muted)] uppercase block font-bold">Phone</span>
                      <span>{lead.phone || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[var(--workspace-muted)] uppercase block font-bold">Email</span>
                      <span className="truncate block">{lead.email || 'N/A'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[10px] text-[var(--workspace-muted)] uppercase block font-bold">Next Follow-up</span>
                      {formatFollowUpDisplay(lead.next_follow_up_at)}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                    <Link
                      href={`/leads/${lead.id}`}
                      className="flex-1 text-center py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold"
                    >
                      View
                    </Link>
                    {!isConverted ? (
                      <>
                        <button
                          onClick={() => handleOpenEditModal(lead)}
                          className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setConvertingLead(lead)}
                          className="px-3.5 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold"
                        >
                          Convert
                        </button>
                      </>
                    ) : lead.converted_client_id ? (
                      <Link
                        href={`/clients/${lead.converted_client_id}`}
                        className="px-3.5 py-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold"
                      >
                        Client Profile
                      </Link>
                    ) : null}
                    <button
                      onClick={() => setDeletingLead(lead)}
                      className="px-3.5 py-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CrmPageContainer>

      {/* New / Edit Lead Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl my-8 relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
              <h2 className="text-xl font-bold text-slate-100">
                {editingLead ? 'Edit Lead' : 'New Lead'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {formError && (
              <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveLead} className="space-y-6">
              {/* SECTION 1 — CONTACT INFORMATION */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 mb-3">
                  1. Contact Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      First Name <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 outline-none focus:border-blue-500/50"
                      placeholder="Jane"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Last Name <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 outline-none focus:border-blue-500/50"
                      placeholder="Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Phone</label>
                    <PhoneInput
                      value={phone}
                      onChange={setPhone}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 outline-none focus:border-blue-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 outline-none focus:border-blue-500/50"
                      placeholder="jane@example.com"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2 — OPPORTUNITY */}
              <div className="border-t border-slate-800/80 pt-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 mb-3">
                  2. Opportunity Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Product Interest</label>
                    <input
                      type="text"
                      value={productInterest}
                      onChange={(e) => setProductInterest(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/50"
                      placeholder="Health / Auto / Commercial"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Lead Status <span className="text-rose-400">*</span>
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as LeadStatus)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/50"
                    >
                      <option value="new">New</option>
                      <option value="contacted">Contacted</option>
                      <option value="in_progress">In Progress</option>
                      <option value="qualified">Qualified</option>
                      <option value="lost">Lost</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Priority <span className="text-rose-400">*</span>
                    </label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as LeadPriority)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/50"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>

                {/* Follow-up Section */}
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300 flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enableFollowUp}
                        onChange={(e) => setEnableFollowUp(e.target.checked)}
                        className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0"
                      />
                      Schedule Next Follow-up
                    </label>
                    {enableFollowUp && (
                      <button
                        type="button"
                        onClick={() => setEnableFollowUp(false)}
                        className="text-[11px] text-rose-400 hover:underline font-medium"
                      >
                        Clear Follow-up
                      </button>
                    )}
                  </div>

                  {enableFollowUp && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          Date (MM/DD/YYYY)
                        </label>
                        <input
                          type="text"
                          maxLength={10}
                          placeholder="MM/DD/YYYY"
                          value={followUpDateUs}
                          onChange={(e) => setFollowUpDateUs(formatAsDateInput(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">Time</label>
                        <div className="flex items-center gap-1">
                          <select
                            value={followUpHour}
                            onChange={(e) => setFollowUpHour(e.target.value)}
                            className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-100 outline-none flex-1"
                          >
                            {['01','02','03','04','05','06','07','08','09','10','11','12'].map((h) => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                          <span className="text-slate-500 font-bold">:</span>
                          <select
                            value={followUpMinute}
                            onChange={(e) => setFollowUpMinute(e.target.value)}
                            className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-100 outline-none flex-1"
                          >
                            {['00','15','30','45'].map((m) => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">AM/PM</label>
                        <select
                          value={followUpAmPm}
                          onChange={(e) => setFollowUpAmPm(e.target.value as 'AM' | 'PM')}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 outline-none"
                        >
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION 3 — ADDRESS */}
              <div className="border-t border-slate-800/80 pt-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-3">
                  3. Address
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Street Address</label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/50"
                      placeholder="123 Main St"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">City</label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/50"
                      placeholder="Miami"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">State</label>
                      <input
                        type="text"
                        value={stateVal}
                        onChange={(e) => setStateVal(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/50"
                        placeholder="FL"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">ZIP Code</label>
                      <input
                        type="text"
                        value={zipCode}
                        onChange={(e) => setZipCode(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/50"
                        placeholder="33101"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 4 — INITIAL NOTE PLACEHOLDER */}
              <div className="border-t border-slate-800/80 pt-5">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 flex items-center gap-2.5">
                  <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Notes can be added after the lead is created.</span>
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-300 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white text-sm font-semibold shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {formSaving ? 'Saving...' : editingLead ? 'Update Lead' : 'Create Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingLead && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <h3 className="text-lg font-bold text-slate-100 mb-2">Delete Lead</h3>
            <p className="text-sm text-slate-400 mb-6">
              Are you sure you want to delete lead <strong className="text-slate-200">{deletingLead.first_name} {deletingLead.last_name}</strong>? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingLead(null)}
                className="px-4 py-2 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteLead}
                disabled={deleting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg transition-all disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete Lead'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Convert Lead Modal */}
      {convertingLead && (
        <ConvertLeadModal
          lead={convertingLead}
          onClose={() => setConvertingLead(null)}
          onSuccess={(clientId) => {
            setConvertingLead(null);
            showToast('Lead converted to client successfully!');
            loadMetrics();
            loadLeads();
          }}
        />
      )}
    </DashboardLayout>
  );
}
