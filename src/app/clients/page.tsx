'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import CrmPageContainer from '@/components/layout/CrmPageContainer';
import { supabase } from '@/lib/supabaseClient';
import { formatDateTimeMMDDYYYY } from '@/lib/formatters/date';
import { formatUSPhone } from '@/lib/formatters/phone';
import { LINES_OF_BUSINESS } from '@/constants/linesOfBusiness';
import NewClientWizardModal from '@/components/NewClientWizardModal';
import { getAssignedAgentDisplay } from '@/lib/auth/agentDisplay';

interface Client {
  id: string;
  agent_id?: string;
  full_name: string;
  client_type?: string | null;
  agency_name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  email?: string | null;
  phone?: string | null;
  created_at: string;
  updated_at: string;
  policies?: { id: string; status: string }[];
}

export type FilterGroup = 'client' | 'health' | 'medicare' | 'supplemental' | 'life' | 'property_casualty';

export interface FilterRule {
  id: string;
  group: FilterGroup;
  field: string;
  operator: 'contains' | 'equals' | 'starts_with' | 'before' | 'after' | 'on' | 'between' | 'gt' | 'lt';
  value: string;
  value2?: string;
}

const WHITELIST_BULK_FIELDS = [
  { id: 'client_type', label: 'Client Type', type: 'select', options: ['personal', 'company'] },
  { id: 'agency_name', label: 'Agency Name', type: 'text' },
  { id: 'city', label: 'City', type: 'text' },
  { id: 'state', label: 'State', type: 'text' },
  { id: 'zip_code', label: 'ZIP Code', type: 'text' },
];

export default function ClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Top Toolbar States
  const [searchQuery, setSearchQuery] = useState('');
  const [sortQuickFilter, setSortQuickFilter] = useState<'all' | 'recently_created' | 'recently_modified'>('all');

  // Advanced Filters State
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [activeFilterTab, setActiveFilterTab] = useState<FilterGroup>('client');
  const [filterRules, setFilterRules] = useState<FilterRule[]>([]);

  // Multi-Select & Bulk Action State
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());
  const [isBulkUpdateOpen, setIsBulkUpdateOpen] = useState(false);
  const [bulkUpdateField, setBulkUpdateField] = useState('client_type');
  const [bulkUpdateValue, setBulkUpdateValue] = useState('personal');
  const [bulkUpdating, setBulkUpdating] = useState(false);

  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // Add Client Modal State
  const [isAddWizardOpen, setIsAddWizardOpen] = useState(false);

  // Pagination State
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Server-Side Client Loader
  const loadClientsServerSide = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setCurrentUser(user);

      // Step 1: Handle Policy-Level Subqueries if Policy Filters Active
      let matchedClientIds: string[] | null = null;

      const policyRules = filterRules.filter(r => r.group !== 'client');
      if (policyRules.length > 0) {
        let matchingIdsSet = new Set<string>();

        // Health Rules
        const healthRules = policyRules.filter(r => r.group === 'health');
        if (healthRules.length > 0) {
          let hQuery = supabase.from('health_policies').select('client_id');
          healthRules.forEach(r => {
            if (r.field === 'policy_status' && r.value) hQuery = hQuery.eq('policy_status', r.value);
            if (r.field === 'company_2026' && r.value) hQuery = hQuery.ilike('company_2026', `%${r.value}%`);
            if (r.field === 'plan_name' && r.value) hQuery = hQuery.ilike('plan_name', `%${r.value}%`);
          });
          const { data: hRes } = await hQuery;
          (hRes || []).forEach((h: any) => h.client_id && matchingIdsSet.add(h.client_id));
        }

        // P&C Rules
        const pcRules = policyRules.filter(r => r.group === 'property_casualty');
        if (pcRules.length > 0) {
          let pcQuery = supabase.from('policies').select('client_id');
          pcRules.forEach(r => {
            if (r.field === 'policy_type' && r.value) pcQuery = pcQuery.eq('policy_type', r.value);
            if (r.field === 'status' && r.value) pcQuery = pcQuery.eq('status', r.value);
            if (r.field === 'writing_company' && r.value) pcQuery = pcQuery.ilike('writing_company', `%${r.value}%`);
            if (r.field === 'policy_number' && r.value) pcQuery = pcQuery.ilike('policy_number', `%${r.value}%`);
          });
          const { data: pcRes } = await pcQuery;
          (pcRes || []).forEach((p: any) => p.client_id && matchingIdsSet.add(p.client_id));
        }

        // Life Rules
        const lifeRules = policyRules.filter(r => r.group === 'life');
        if (lifeRules.length > 0) {
          let lQuery = supabase.from('policies').select('client_id').ilike('policy_type', '%life%');
          lifeRules.forEach(r => {
            if (r.field === 'status' && r.value) lQuery = lQuery.eq('status', r.value);
            if (r.field === 'writing_company' && r.value) lQuery = lQuery.ilike('writing_company', `%${r.value}%`);
          });
          const { data: lRes } = await lQuery;
          (lRes || []).forEach((l: any) => l.client_id && matchingIdsSet.add(l.client_id));
        }

        // Supplemental Rules
        const suppRules = policyRules.filter(r => r.group === 'supplemental');
        if (suppRules.length > 0) {
          let sQuery = supabase.from('policies').select('client_id').ilike('policy_type', '%supplemental%');
          suppRules.forEach(r => {
            if (r.field === 'status' && r.value) sQuery = sQuery.eq('status', r.value);
          });
          const { data: sRes } = await sQuery;
          (sRes || []).forEach((s: any) => s.client_id && matchingIdsSet.add(s.client_id));
        }

        // Medicare Rules
        const medRules = policyRules.filter(r => r.group === 'medicare');
        if (medRules.length > 0) {
          let mQuery = supabase.from('policies').select('client_id').or('policy_type.ilike.%medicare%,policy_type.ilike.%part d%,policy_type.ilike.%advantage%');
          medRules.forEach(r => {
            if (r.field === 'status' && r.value) mQuery = mQuery.eq('status', r.value);
          });
          const { data: mRes } = await mQuery;
          (mRes || []).forEach((m: any) => m.client_id && matchingIdsSet.add(m.client_id));
        }

        matchedClientIds = Array.from(matchingIdsSet);
      }

      // Step 2: Build Main Clients Server Query
      let clientQuery = supabase
        .from('clients')
        .select(`
          id,
          agent_id,
          full_name,
          client_type,
          agency_name,
          address,
          city,
          state,
          zip_code,
          email,
          phone,
          created_at,
          updated_at,
          policies (
            id,
            status
          )
        `, { count: 'exact' });

      // Apply Search Query
      if (searchQuery.trim()) {
        const q = `%${searchQuery.trim()}%`;
        clientQuery = clientQuery.or(`full_name.ilike.${q},email.ilike.${q},phone.ilike.${q},city.ilike.${q}`);
      }

      // Apply Matched Client IDs from Policy Subqueries
      if (matchedClientIds !== null) {
        if (matchedClientIds.length === 0) {
          setClients([]);
          setTotalCount(0);
          setLoading(false);
          return;
        }
        clientQuery = clientQuery.in('id', matchedClientIds);
      }

      // Apply Client Field Filter Rules
      const clientRules = filterRules.filter(r => r.group === 'client');
      clientRules.forEach(r => {
        if (!r.value) return;
        if (r.field === 'full_name') clientQuery = clientQuery.ilike('full_name', `%${r.value}%`);
        if (r.field === 'email') clientQuery = clientQuery.ilike('email', `%${r.value}%`);
        if (r.field === 'phone') clientQuery = clientQuery.ilike('phone', `%${r.value}%`);
        if (r.field === 'client_type') clientQuery = clientQuery.eq('client_type', r.value);
        if (r.field === 'state') clientQuery = clientQuery.eq('state', r.value);
        if (r.field === 'city') clientQuery = clientQuery.ilike('city', `%${r.value}%`);
        if (r.field === 'agency_name') clientQuery = clientQuery.ilike('agency_name', `%${r.value}%`);
      });

      // Apply Sorting / Quick Filters
      if (sortQuickFilter === 'recently_created') {
        clientQuery = clientQuery.order('created_at', { ascending: false });
      } else if (sortQuickFilter === 'recently_modified') {
        clientQuery = clientQuery.order('updated_at', { ascending: false });
      } else {
        clientQuery = clientQuery.order('created_at', { ascending: false });
      }

      // Apply Pagination Range
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      clientQuery = clientQuery.range(from, to);

      const { data, count, error } = await clientQuery;
      if (error) throw error;

      setClients(data || []);
      setTotalCount(count || 0);
    } catch (err: any) {
      console.error('Error loading clients server-side:', err);
    } finally {
      setLoading(false);
    }
  }, [router, searchQuery, sortQuickFilter, filterRules, page]);

  useEffect(() => {
    loadClientsServerSide();
  }, [loadClientsServerSide]);

  // Multi-Select Checkbox Handlers
  const handleSelectAllOnPage = (checked: boolean) => {
    if (checked) {
      const pageIds = clients.map(c => c.id);
      setSelectedClientIds(prev => new Set([...Array.from(prev), ...pageIds]));
    } else {
      const pageIdsSet = new Set(clients.map(c => c.id));
      setSelectedClientIds(prev => new Set(Array.from(prev).filter(id => !pageIdsSet.has(id))));
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    setSelectedClientIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const isAllOnPageSelected = useMemo(() => {
    if (clients.length === 0) return false;
    return clients.every(c => selectedClientIds.has(c.id));
  }, [clients, selectedClientIds]);

  // Add / Remove Filter Rule
  const handleAddFilterRule = (group: FilterGroup) => {
    const newRule: FilterRule = {
      id: Math.random().toString(36).substring(2, 9),
      group,
      field: group === 'client' ? 'full_name' : group === 'property_casualty' ? 'policy_type' : 'status',
      operator: 'contains',
      value: ''
    };
    setFilterRules(prev => [...prev, newRule]);
  };

  const handleRemoveFilterRule = (ruleId: string) => {
    setFilterRules(prev => prev.filter(r => r.id !== ruleId));
  };

  const handleUpdateFilterRule = (ruleId: string, updates: Partial<FilterRule>) => {
    setFilterRules(prev => prev.map(r => r.id === ruleId ? { ...r, ...updates } : r));
  };

  // Bulk Update Handler
  const handleExecuteBulkUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedClientIds.size === 0) return;

    // Strict Security Whitelist Check
    const isWhitelisted = WHITELIST_BULK_FIELDS.some(f => f.id === bulkUpdateField);
    if (!isWhitelisted) {
      setBulkError(`Security error: Column "${bulkUpdateField}" is not permitted for bulk update.`);
      return;
    }

    try {
      setBulkUpdating(true);
      setBulkError(null);

      const targetIds = Array.from(selectedClientIds);

      // Validate logged in user authorization
      const { error: updateErr } = await supabase
        .from('clients')
        .update({
          [bulkUpdateField]: bulkUpdateValue.trim() || null,
          updated_at: new Date().toISOString()
        })
        .in('id', targetIds);

      if (updateErr) throw updateErr;

      setIsBulkUpdateOpen(false);
      setSelectedClientIds(new Set());
      await loadClientsServerSide();
    } catch (err: any) {
      console.error('Error executing bulk update:', err);
      setBulkError(err?.message || 'Failed to update clients.');
    } finally {
      setBulkUpdating(false);
    }
  };

  // Bulk Delete Handler using established CRM safe deletion RPC
  const handleExecuteBulkDelete = async () => {
    if (selectedClientIds.size === 0) return;
    try {
      setBulkDeleting(true);
      setBulkError(null);

      const targetIds = Array.from(selectedClientIds);
      for (const id of targetIds) {
        // Execute established CRM safe cascade deletion RPC
        const { error: rpcErr } = await supabase.rpc('delete_client_cascade', {
          p_client_id: id,
          p_agent_id: currentUser?.id,
        });

        if (rpcErr) {
          // Fallback to client delete if RPC call differs
          const { error: delErr } = await supabase
            .from('clients')
            .delete()
            .eq('id', id)
            .eq('agent_id', currentUser?.id);

          if (delErr) throw delErr;
        }
      }

      setIsBulkDeleteOpen(false);
      setSelectedClientIds(new Set());
      await loadClientsServerSide();
    } catch (err: any) {
      console.error('Error executing bulk delete:', err);
      setBulkError(err?.message || 'Failed to delete selected clients.');
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <DashboardLayout>
      <CrmPageContainer>
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 font-sans">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">CLIENTS WORKSPACE</h1>
            <p className="text-slate-500 mt-0.5 text-xs font-medium">Dense CRM client registry, advanced multi-module filtering, and bulk operations.</p>
          </div>
          <div>
            <button
              onClick={() => setIsAddWizardOpen(true)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-blue-500/10 font-sans"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
              </svg>
              + Add Client
            </button>
          </div>
        </div>

        {/* TOP CLIENTS TOOLBAR (Zoho Dense Style) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3 font-sans">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[240px]">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search clients by name, email, phone, city..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl text-slate-800 placeholder-slate-400 text-xs font-medium outline-none transition-all"
              />
            </div>

            {/* Quick Filter Buttons */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => { setSortQuickFilter('all'); setPage(1); }}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  sortQuickFilter === 'all' ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All Clients
              </button>
              <button
                type="button"
                onClick={() => { setSortQuickFilter('recently_created'); setPage(1); }}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  sortQuickFilter === 'recently_created' ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Recently Created
              </button>
              <button
                type="button"
                onClick={() => { setSortQuickFilter('recently_modified'); setPage(1); }}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  sortQuickFilter === 'recently_modified' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Recently Modified
              </button>

              {/* Advanced Filters Toggle Button */}
              <button
                type="button"
                onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                  filterRules.length > 0
                    ? 'bg-amber-50 border-amber-300 text-amber-800'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                🔍 Advanced Filters {filterRules.length > 0 && <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-amber-500 text-slate-950 font-extrabold rounded-full">{filterRules.length}</span>}
              </button>

              {(searchQuery || filterRules.length > 0 || sortQuickFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSortQuickFilter('all');
                    setFilterRules([]);
                    setPage(1);
                  }}
                  className="px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          {/* Selection Actions Bar (Appears when 1+ rows selected) */}
          {selectedClientIds.size > 0 && (
            <div className="flex items-center justify-between p-2.5 bg-blue-50 border border-blue-200 rounded-xl animate-fadeIn">
              <div className="flex items-center gap-3">
                <span className="text-xs font-extrabold text-blue-900">{selectedClientIds.size} client(s) selected</span>
                <button
                  type="button"
                  onClick={() => setSelectedClientIds(new Set())}
                  className="text-xs font-bold text-blue-600 hover:underline"
                >
                  Deselect all
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsBulkUpdateOpen(true)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs transition"
                >
                  ✏️ Update Field
                </button>
                <button
                  type="button"
                  onClick={() => setIsBulkDeleteOpen(true)}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-xs transition"
                >
                  🗑️ Delete Selected
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ADVANCED FILTER DRAWER PANEL (Grouped by Module) */}
        {isFilterPanelOpen && (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 font-sans animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">ZOHO ADVANCED FILTER BUILDER</h3>
              <button
                type="button"
                onClick={() => setIsFilterPanelOpen(false)}
                className="text-xs font-bold text-slate-500 hover:text-slate-800"
              >
                Close ✕
              </button>
            </div>

            {/* Module Filter Group Tabs */}
            <div className="flex items-center gap-1.5 flex-wrap bg-white p-1 rounded-xl border border-slate-200">
              {[
                { id: 'client', label: 'Client Details' },
                { id: 'health', label: 'Health' },
                { id: 'property_casualty', label: 'Property & Casualty' },
                { id: 'life', label: 'Life' },
                { id: 'supplemental', label: 'Supplemental' },
                { id: 'medicare', label: 'Medicare' },
              ].map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveFilterTab(t.id as FilterGroup)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    activeFilterTab === t.id ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Current Active Filter Rules List */}
            <div className="space-y-3">
              {filterRules.map(rule => (
                <div key={rule.id} className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-3 shadow-2xs">
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md">
                    {rule.group.replace('_', ' ')}
                  </span>

                  {/* Field Selector */}
                  <select
                    value={rule.field}
                    onChange={e => handleUpdateFilterRule(rule.id, { field: e.target.value })}
                    className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 outline-none"
                  >
                    {rule.group === 'client' && (
                      <>
                        <option value="full_name">Client Name</option>
                        <option value="email">Email Address</option>
                        <option value="phone">Phone Number</option>
                        <option value="client_type">Client Type</option>
                        <option value="state">State</option>
                        <option value="city">City</option>
                        <option value="agency_name">Agency Name</option>
                        <option value="created_at">Created Date</option>
                        <option value="updated_at">Modified Date</option>
                      </>
                    )}
                    {rule.group === 'health' && (
                      <>
                        <option value="policy_status">Policy Status</option>
                        <option value="company_2026">Carrier / Company</option>
                        <option value="plan_name">Plan Name</option>
                        <option value="effective_date">Effective Date</option>
                      </>
                    )}
                    {rule.group === 'property_casualty' && (
                      <>
                        <option value="policy_type">P&C Policy Type (48 Options)</option>
                        <option value="status">Policy Status</option>
                        <option value="writing_company">Writing Company</option>
                        <option value="policy_number">Policy Number</option>
                        <option value="effective_date">Effective Date</option>
                        <option value="expiration_date">Expiration Date</option>
                        <option value="total_premium">Total Premium</option>
                      </>
                    )}
                    {(rule.group === 'life' || rule.group === 'supplemental' || rule.group === 'medicare') && (
                      <>
                        <option value="status">Policy Status</option>
                        <option value="writing_company">Carrier / Company</option>
                        <option value="policy_number">Policy Number</option>
                        <option value="effective_date">Effective Date</option>
                        <option value="expiration_date">Expiration Date</option>
                        <option value="premium">Premium</option>
                      </>
                    )}
                  </select>

                  {/* Operator Selector */}
                  <select
                    value={rule.operator}
                    onChange={e => handleUpdateFilterRule(rule.id, { operator: e.target.value as any })}
                    className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 outline-none"
                  >
                    {rule.field.endsWith('date') || rule.field.endsWith('at') ? (
                      <>
                        <option value="before">before</option>
                        <option value="after">after</option>
                        <option value="on">on date</option>
                        <option value="between">between dates</option>
                      </>
                    ) : rule.field.includes('premium') ? (
                      <>
                        <option value="equals">=</option>
                        <option value="gt">&gt;</option>
                        <option value="lt">&lt;</option>
                        <option value="between">between</option>
                      </>
                    ) : (
                      <>
                        <option value="contains">contains</option>
                        <option value="equals">equals</option>
                        <option value="starts_with">starts with</option>
                      </>
                    )}
                  </select>

                  {/* Value Input / Dropdown */}
                  {rule.field === 'policy_type' && rule.group === 'property_casualty' ? (
                    <select
                      value={rule.value}
                      onChange={e => handleUpdateFilterRule(rule.id, { value: e.target.value })}
                      className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 outline-none"
                    >
                      <option value="">-- Select P&C Line --</option>
                      {LINES_OF_BUSINESS.map(lob => (
                        <option key={lob} value={lob}>{lob}</option>
                      ))}
                    </select>
                  ) : rule.field === 'status' || rule.field === 'policy_status' ? (
                    <select
                      value={rule.value}
                      onChange={e => handleUpdateFilterRule(rule.id, { value: e.target.value })}
                      className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 outline-none"
                    >
                      <option value="">-- Select Status --</option>
                      <option value="Active">Active</option>
                      <option value="Pending">Pending</option>
                      <option value="Cancelled">Cancelled</option>
                      <option value="Expired">Expired</option>
                    </select>
                  ) : rule.field === 'client_type' ? (
                    <select
                      value={rule.value}
                      onChange={e => handleUpdateFilterRule(rule.id, { value: e.target.value })}
                      className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 outline-none"
                    >
                      <option value="">-- Select Client Type --</option>
                      <option value="personal">Personal</option>
                      <option value="company">Company</option>
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={rule.value}
                      onChange={e => handleUpdateFilterRule(rule.id, { value: e.target.value })}
                      placeholder="Filter value..."
                      className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-3 py-1 text-xs font-medium text-slate-800 outline-none"
                    />
                  )}

                  <button
                    type="button"
                    onClick={() => handleRemoveFilterRule(rule.id)}
                    className="text-rose-500 hover:text-rose-700 text-xs font-bold px-2 py-1"
                  >
                    ✕ Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => handleAddFilterRule(activeFilterTab)}
                className="text-xs font-bold text-blue-600 hover:underline"
              >
                + Add Rule to {activeFilterTab.replace('_', ' ').toUpperCase()}
              </button>

              <button
                type="button"
                onClick={() => {
                  setPage(1);
                  loadClientsServerSide();
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs px-5 py-2 rounded-xl transition shadow-sm font-sans"
              >
                Apply Filters
              </button>
            </div>
          </div>
        )}

        {/* CLIENTS DATA TABLE */}
        {loading ? (
          <div className="flex justify-center items-center py-20 bg-white border border-slate-200 rounded-2xl shadow-sm">
            <svg className="animate-spin h-7 w-7 text-blue-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : clients.length === 0 ? (
          <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-3 font-sans">
            <p className="text-sm font-bold text-slate-700">No clients match the active filter criteria.</p>
            <p className="text-xs text-slate-400">Try clearing or adjusting search queries and filter rules.</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm font-sans">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-extrabold uppercase tracking-wider">
                    <th className="py-3 px-4 w-10">
                      <input
                        type="checkbox"
                        checked={isAllOnPageSelected}
                        onChange={(e) => handleSelectAllOnPage(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                    <th className="py-3 px-4">Client Name</th>
                    <th className="py-3 px-4">Type / Agency</th>
                    <th className="py-3 px-4">Contact Information</th>
                    <th className="py-3 px-4">Location</th>
                    <th className="py-3 px-4">Assigned Agent</th>
                    <th className="py-3 px-4">Created Date</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {clients.map(c => {
                    const isSelected = selectedClientIds.has(c.id);
                    return (
                      <tr
                        key={c.id}
                        onClick={() => router.push(`/clients/${c.id}`)}
                        className={`hover:bg-slate-50/80 transition-all cursor-pointer ${
                          isSelected ? 'bg-blue-50/50' : ''
                        }`}
                      >
                        <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => handleSelectOne(c.id, e.target.checked)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">
                          <Link href={`/clients/${c.id}`} className="hover:text-blue-600 transition">
                            {c.full_name}
                          </Link>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 text-[10px] font-extrabold uppercase rounded-md ${
                            c.client_type === 'company'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}>
                            {c.client_type || 'Personal'}
                          </span>
                          {c.agency_name && (
                            <span className="block text-[10px] font-semibold text-slate-500 mt-0.5 truncate max-w-[140px]">
                              {c.agency_name}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="block text-slate-800 font-semibold">{c.email || 'N/A'}</span>
                          <span className="block text-slate-500 text-[10px]">{formatUSPhone(c.phone) || 'N/A'}</span>
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {c.city || c.state ? `${c.city || ''}${c.city && c.state ? ', ' : ''}${c.state || ''}` : c.address || 'N/A'}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-700">
                          {getAssignedAgentDisplay({ clientAgentId: c.agent_id, currentUserId: currentUser?.id, fallbackName: 'Agent' })}
                        </td>
                        <td className="py-3 px-4 text-slate-500 text-[11px]">
                          {formatDateTimeMMDDYYYY(c.created_at)}
                        </td>
                        <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <Link
                            href={`/clients/${c.id}`}
                            className="inline-flex items-center text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition"
                          >
                            View Profile
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-t border-slate-200">
              <span className="text-xs font-bold text-slate-600">
                Showing {clients.length} of {totalCount} total clients (Page {page})
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(prev => Math.max(1, prev - 1))}
                  className="px-3 py-1 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-xs font-bold disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page * pageSize >= totalCount}
                  onClick={() => setPage(prev => prev + 1)}
                  className="px-3 py-1 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-xs font-bold disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}

        {/* BULK UPDATE MODAL */}
        {isBulkUpdateOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fadeIn font-sans">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-extrabold text-slate-900 font-sans">BULK UPDATE ({selectedClientIds.size} CLIENTS)</h3>
                <button type="button" onClick={() => setIsBulkUpdateOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
              </div>

              {bulkError && (
                <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-600 font-bold">
                  {bulkError}
                </div>
              )}

              <form onSubmit={handleExecuteBulkUpdate} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Target Field (Whitelisted)</label>
                  <select
                    value={bulkUpdateField}
                    onChange={(e) => {
                      setBulkUpdateField(e.target.value);
                      const fieldObj = WHITELIST_BULK_FIELDS.find(f => f.id === e.target.value);
                      if (fieldObj?.type === 'select' && fieldObj.options) {
                        setBulkUpdateValue(fieldObj.options[0]);
                      } else {
                        setBulkUpdateValue('');
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none"
                  >
                    {WHITELIST_BULK_FIELDS.map(f => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">New Field Value</label>
                  {WHITELIST_BULK_FIELDS.find(f => f.id === bulkUpdateField)?.type === 'select' ? (
                    <select
                      value={bulkUpdateValue}
                      onChange={(e) => setBulkUpdateValue(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none capitalize"
                    >
                      {WHITELIST_BULK_FIELDS.find(f => f.id === bulkUpdateField)?.options?.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={bulkUpdateValue}
                      onChange={(e) => setBulkUpdateValue(e.target.value)}
                      placeholder="Enter new value..."
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 outline-none"
                      required
                    />
                  )}
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsBulkUpdateOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={bulkUpdating}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm disabled:opacity-50"
                  >
                    {bulkUpdating ? 'Updating...' : 'Confirm Update'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* BULK DELETE CONFIRMATION MODAL */}
        {isBulkDeleteOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fadeIn font-sans">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-extrabold text-rose-600 font-sans">CONFIRM BULK DELETE</h3>
                <button type="button" onClick={() => setIsBulkDeleteOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
              </div>

              <p className="text-xs font-medium text-slate-700">
                Are you sure you want to delete <strong>{selectedClientIds.size}</strong> selected client(s)? This action will remove all associated policy records.
              </p>

              {bulkError && (
                <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-600 font-bold">
                  {bulkError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsBulkDeleteOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteBulkDelete}
                  disabled={bulkDeleting}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-sm disabled:opacity-50"
                >
                  {bulkDeleting ? 'Deleting...' : 'Confirm Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Client Wizard Modal */}
        {isAddWizardOpen && (
          <NewClientWizardModal
            isOpen={isAddWizardOpen}
            onClose={() => {
              setIsAddWizardOpen(false);
              loadClientsServerSide();
            }}
            currentUserId={currentUser?.id || ''}
          />
        )}
      </CrmPageContainer>
    </DashboardLayout>
  );
}
