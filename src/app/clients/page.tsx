'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import CrmPageContainer from '@/components/layout/CrmPageContainer';
import { supabase } from '@/lib/supabaseClient';
import { formatDateMMDDYYYY, formatDateTimeMMDDYYYY } from '@/lib/formatters/date';
import { formatUSPhone } from '@/lib/formatters/phone';
import NewClientWizardModal from '@/components/NewClientWizardModal';
import { getAssignedAgentDisplay, AMANDA_UUID, LAURA_UUID } from '@/lib/auth/agentDisplay';

import ClientsLeftFilterSidebar, { PolicyTypeFilterState } from '@/components/clients/ClientsLeftFilterSidebar';
import ClientsManageColumnsModal, { ALL_CLIENT_COLUMNS } from '@/components/clients/ClientsManageColumnsModal';

export interface ClientProfile {
  id: string;
  agent_id?: string;
  full_name: string;
  client_type?: string | null;
  agency_name?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  created_at: string;
  updated_at: string;
  policyTypes?: {
    hasHealth: boolean;
    hasMedicare: boolean;
    hasSupplemental: boolean;
    hasLife: boolean;
    hasPC: boolean;
  };
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
  { id: 'address', label: 'Address / Location', type: 'text' },
];

export default function ClientsPage() {
  const router = useRouter();

  // Core Data States
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Generic Auth Session States
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Top Views / Navigation Bar
  const [quickView, setQuickView] = useState<'all' | 'recently_modified' | 'recently_created' | 'not_modified' | 'my_clients'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recently_created' | 'recently_modified' | 'name_asc' | 'name_desc'>('recently_created');

  // Left Filter Sidebar Control
  const [isFilterSidebarOpen, setIsFilterSidebarOpen] = useState(true);

  // Policy Type Filter State
  const [policyTypeFilter, setPolicyTypeFilter] = useState<PolicyTypeFilterState>({
    health: false,
    medicare: false,
    supplemental: false,
    life: false,
    property_casualty: false,
    matchMode: 'ANY',
  });

  // Field Filter Rules
  const [filterRules, setFilterRules] = useState<FilterRule[]>([]);

  // Column Visibility Management
  const [isManageColumnsOpen, setIsManageColumnsOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('smartrack:clients-columns');
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return ALL_CLIENT_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id);
  });

  const handleUpdateVisibleColumns = (cols: string[]) => {
    setVisibleColumns(cols);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('smartrack:clients-columns', JSON.stringify(cols));
      } catch {}
    }
  };

  // Multi-Select & Bulk Operations
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());
  const [isBulkUpdateOpen, setIsBulkUpdateOpen] = useState(false);
  const [bulkUpdateField, setBulkUpdateField] = useState('client_type');
  const [bulkUpdateValue, setBulkUpdateValue] = useState('personal');
  const [bulkUpdating, setBulkUpdating] = useState(false);

  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // Add Client Modal
  const [isAddWizardOpen, setIsAddWizardOpen] = useState(false);

  // Server Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25);

  // 1. GENERIC AUTH SESSION INITIALIZATION
  useEffect(() => {
    let isMounted = true;

    const initAuthSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (isMounted) {
          if (session?.user) {
            setCurrentUser(session.user);
          } else {
            const { data: userData } = await supabase.auth.getUser();
            setCurrentUser(userData.user || null);
          }
          setAuthLoading(false);
        }
      } catch (err) {
        console.error('Auth session error:', err);
        if (isMounted) {
          setCurrentUser(null);
          setAuthLoading(false);
        }
      }
    };

    initAuthSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) {
        setCurrentUser(session?.user || null);
        setAuthLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  // 2. SERVER-SIDE QUERY LOADER
  const loadClientsServerSide = useCallback(async () => {
    if (authLoading) return;

    try {
      setLoading(true);

      // Require an authenticated session; if unauthenticated, redirect to login
      if (!currentUser) {
        router.push('/login');
        return;
      }

      const currentAgentId = currentUser.id;
      const isAgencyOwner = currentAgentId === AMANDA_UUID || currentAgentId === LAURA_UUID;

      // Step 1: Check active policy filter categories and policy field rules
      const selectedPolicyTypes = Object.entries(policyTypeFilter)
        .filter(([k, v]) => k !== 'matchMode' && v === true)
        .map(([k]) => k);

      const policyFieldRules = filterRules.filter((r) => r.group !== 'client');

      let matchedClientIdsSet: Set<string> | null = null;

      // Execute policy subqueries ONLY when at least one policy type checkbox or policy field rule is active
      if (selectedPolicyTypes.length > 0 || policyFieldRules.length > 0) {
        const categorySets: Set<string>[] = [];

        // Helper to query a policy table and get client_ids
        const fetchCategoryClientIds = async (table: string, clientField = 'client_id', customFilter?: (q: any) => any) => {
          let q = supabase.from(table).select(clientField);
          if (customFilter) q = customFilter(q);
          const { data } = await q;
          const ids = new Set<string>();
          (data || []).forEach((row: any) => row[clientField] && ids.add(row[clientField]));
          return ids;
        };

        // 1. Health
        if (policyTypeFilter.health || policyFieldRules.some((r) => r.group === 'health')) {
          const hRules = policyFieldRules.filter((r) => r.group === 'health');
          const hIds = await fetchCategoryClientIds('health_policies', 'client_id', (q) => {
            hRules.forEach((r) => {
              if (r.field === 'policy_status' && r.value) q = q.eq('policy_status', r.value);
              if (r.field === 'company_2026' && r.value) q = q.ilike('company_2026', `%${r.value}%`);
              if (r.field === 'plan_name' && r.value) q = q.ilike('plan_name', `%${r.value}%`);
            });
            return q;
          });
          categorySets.push(hIds);
        }

        // 2. Property & Casualty
        if (policyTypeFilter.property_casualty || policyFieldRules.some((r) => r.group === 'property_casualty')) {
          const pcRules = policyFieldRules.filter((r) => r.group === 'property_casualty');
          const pcIds = await fetchCategoryClientIds('policies', 'client_id', (q) => {
            pcRules.forEach((r) => {
              if (r.field === 'policy_type' && r.value) q = q.eq('policy_type', r.value);
              if (r.field === 'status' && r.value) q = q.eq('status', r.value);
              if (r.field === 'writing_company' && r.value) q = q.ilike('writing_company', `%${r.value}%`);
              if (r.field === 'policy_number' && r.value) q = q.ilike('policy_number', `%${r.value}%`);
            });
            return q;
          });
          categorySets.push(pcIds);
        }

        // 3. Life
        if (policyTypeFilter.life || policyFieldRules.some((r) => r.group === 'life')) {
          const lRules = policyFieldRules.filter((r) => r.group === 'life');
          const lIds = await fetchCategoryClientIds('life_policies', 'client_id', (q) => {
            lRules.forEach((r) => {
              if (r.field === 'status' && r.value) q = q.eq('status', r.value);
            });
            return q;
          });
          categorySets.push(lIds);
        }

        // 4. Supplemental
        if (policyTypeFilter.supplemental || policyFieldRules.some((r) => r.group === 'supplemental')) {
          const sRules = policyFieldRules.filter((r) => r.group === 'supplemental');
          const sIds = await fetchCategoryClientIds('supplemental_policies', 'client_id', (q) => {
            sRules.forEach((r) => {
              if (r.field === 'status' && r.value) q = q.eq('status', r.value);
            });
            return q;
          });
          categorySets.push(sIds);
        }

        // 5. Medicare
        if (policyTypeFilter.medicare || policyFieldRules.some((r) => r.group === 'medicare')) {
          const mIds = await fetchCategoryClientIds('medicare_information', 'client_id');
          categorySets.push(mIds);
        }

        // Combine category sets based on matchMode ANY vs ALL
        if (categorySets.length > 0) {
          if (policyTypeFilter.matchMode === 'ALL') {
            const first = categorySets[0];
            matchedClientIdsSet = new Set(
              Array.from(first).filter((id) => categorySets.every((set) => set.has(id)))
            );
          } else {
            matchedClientIdsSet = new Set();
            categorySets.forEach((set) => {
              set.forEach((id) => matchedClientIdsSet!.add(id));
            });
          }
        }
      }

      // Step 2: Build Main Client Query with CANONICAL Schema Columns
      let clientQuery = supabase
        .from('clients')
        .select(`
          id,
          agent_id,
          full_name,
          client_type,
          agency_name,
          address,
          email,
          phone,
          created_at,
          updated_at
        `, { count: 'exact' });

      // Ownership Scope: Filter by current agent's owned clients unless user is an agency owner/admin
      if (!isAgencyOwner || quickView === 'my_clients') {
        clientQuery = clientQuery.eq('agent_id', currentAgentId);
      }

      // Quick View Filters
      if (quickView === 'recently_modified') {
        clientQuery = clientQuery.order('updated_at', { ascending: false });
      } else if (quickView === 'recently_created') {
        clientQuery = clientQuery.order('created_at', { ascending: false });
      } else if (quickView === 'not_modified') {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        clientQuery = clientQuery.lt('updated_at', thirtyDaysAgo);
      }

      // Apply Matched Client IDs Subquery ONLY when policy filters are active
      if (matchedClientIdsSet !== null) {
        const matchedIdsArray = Array.from(matchedClientIdsSet);
        if (matchedIdsArray.length === 0) {
          setClients([]);
          setTotalCount(0);
          setLoading(false);
          return;
        }
        clientQuery = clientQuery.in('id', matchedIdsArray);
      }

      // Apply Text Search Query against VALID schema columns ONLY (full_name, email, phone, address, agency_name)
      if (searchQuery.trim()) {
        const term = searchQuery.trim();
        clientQuery = clientQuery.or(
          `full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%,address.ilike.%${term}%,agency_name.ilike.%${term}%`
        );
      }

      // Apply Client Field Filter Rules
      const clientRules = filterRules.filter((r) => r.group === 'client');
      clientRules.forEach((r) => {
        if (!r.value) return;
        if (r.field === 'full_name') clientQuery = clientQuery.ilike('full_name', `%${r.value}%`);
        if (r.field === 'email') clientQuery = clientQuery.ilike('email', `%${r.value}%`);
        if (r.field === 'phone') clientQuery = clientQuery.ilike('phone', `%${r.value}%`);
        if (r.field === 'client_type') clientQuery = clientQuery.eq('client_type', r.value);
        if (r.field === 'address' || r.field === 'city' || r.field === 'state' || r.field === 'zip_code') {
          clientQuery = clientQuery.ilike('address', `%${r.value}%`);
        }
        if (r.field === 'agency_name') clientQuery = clientQuery.ilike('agency_name', `%${r.value}%`);
      });

      // Apply Sorting
      if (sortBy === 'recently_created') {
        clientQuery = clientQuery.order('created_at', { ascending: false });
      } else if (sortBy === 'recently_modified') {
        clientQuery = clientQuery.order('updated_at', { ascending: false });
      } else if (sortBy === 'name_asc') {
        clientQuery = clientQuery.order('full_name', { ascending: true });
      } else if (sortBy === 'name_desc') {
        clientQuery = clientQuery.order('full_name', { ascending: false });
      }

      // Apply Pagination Range
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      clientQuery = clientQuery.range(from, to);

      const { data, count, error } = await clientQuery;
      if (error) throw error;

      // Step 3: Fetch Policy Badges for Loaded Client Profiles
      const loadedClients = data || [];
      const clientIds = loadedClients.map((c: any) => c.id);

      if (clientIds.length > 0) {
        const [
          { data: hPolicies },
          { data: pcPolicies },
          { data: lPolicies },
          { data: sPolicies },
          { data: mPolicies },
        ] = await Promise.all([
          supabase.from('health_policies').select('client_id').in('client_id', clientIds),
          supabase.from('policies').select('client_id').in('client_id', clientIds),
          supabase.from('life_policies').select('client_id').in('client_id', clientIds),
          supabase.from('supplemental_policies').select('client_id').in('client_id', clientIds),
          supabase.from('medicare_information').select('client_id').in('client_id', clientIds),
        ]);

        const hSet = new Set((hPolicies || []).map((h: any) => h.client_id));
        const pcSet = new Set((pcPolicies || []).map((p: any) => p.client_id));
        const lSet = new Set((lPolicies || []).map((l: any) => l.client_id));
        const sSet = new Set((sPolicies || []).map((s: any) => s.client_id));
        const mSet = new Set((mPolicies || []).map((m: any) => m.client_id));

        const enrichedClients: ClientProfile[] = loadedClients.map((c: any) => ({
          ...c,
          policyTypes: {
            hasHealth: hSet.has(c.id),
            hasMedicare: mSet.has(c.id),
            hasSupplemental: sSet.has(c.id),
            hasLife: lSet.has(c.id),
            hasPC: pcSet.has(c.id),
          },
        }));

        setClients(enrichedClients);
      } else {
        setClients([]);
      }

      setTotalCount(count || 0);
    } catch (err: any) {
      console.error('Error loading clients:', err);
    } finally {
      setLoading(false);
    }
  }, [authLoading, currentUser, router, quickView, searchQuery, sortBy, policyTypeFilter, filterRules, page, pageSize]);

  useEffect(() => {
    loadClientsServerSide();
  }, [loadClientsServerSide]);

  // Multi-Select Handlers
  const handleSelectAllOnPage = (checked: boolean) => {
    if (checked) {
      const pageIds = clients.map((c) => c.id);
      setSelectedClientIds((prev) => new Set([...Array.from(prev), ...pageIds]));
    } else {
      const pageIdsSet = new Set(clients.map((c) => c.id));
      setSelectedClientIds((prev) => new Set(Array.from(prev).filter((id) => !pageIdsSet.has(id))));
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    setSelectedClientIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const isAllOnPageSelected = useMemo(() => {
    if (clients.length === 0) return false;
    return clients.every((c) => selectedClientIds.has(c.id));
  }, [clients, selectedClientIds]);

  // Filter Rule Handlers
  const handleAddFilterRule = (rule: FilterRule) => {
    setFilterRules((prev) => [...prev, rule]);
  };

  const handleRemoveFilterRule = (ruleId: string) => {
    setFilterRules((prev) => prev.filter((r) => r.id !== ruleId));
  };

  const handleUpdateFilterRule = (ruleId: string, updates: Partial<FilterRule>) => {
    setFilterRules((prev) => prev.map((r) => (r.id === ruleId ? { ...r, ...updates } : r)));
  };

  const handleClearAllFilters = () => {
    setQuickView('all');
    setSearchQuery('');
    setPolicyTypeFilter({
      health: false,
      medicare: false,
      supplemental: false,
      life: false,
      property_casualty: false,
      matchMode: 'ANY',
    });
    setFilterRules([]);
    setPage(1);
  };

  // Bulk Update Execution
  const handleExecuteBulkUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedClientIds.size === 0) return;

    const isWhitelisted = WHITELIST_BULK_FIELDS.some((f) => f.id === bulkUpdateField);
    if (!isWhitelisted) {
      setBulkError(`Column "${bulkUpdateField}" is not permitted for bulk update.`);
      return;
    }

    try {
      setBulkUpdating(true);
      setBulkError(null);

      const targetIds = Array.from(selectedClientIds);

      const { error: updateErr } = await supabase
        .from('clients')
        .update({
          [bulkUpdateField]: bulkUpdateValue.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .in('id', targetIds);

      if (updateErr) throw updateErr;

      setIsBulkUpdateOpen(false);
      setSelectedClientIds(new Set());
      await loadClientsServerSide();
    } catch (err: any) {
      console.error('Bulk update error:', err);
      setBulkError(err?.message || 'Failed to update clients.');
    } finally {
      setBulkUpdating(false);
    }
  };

  // Bulk Delete Execution
  const handleExecuteBulkDelete = async () => {
    if (selectedClientIds.size === 0) return;
    try {
      setBulkDeleting(true);
      setBulkError(null);

      const targetIds = Array.from(selectedClientIds);
      for (const id of targetIds) {
        const { error: rpcErr } = await supabase.rpc('delete_client_cascade', {
          p_client_id: id,
          p_agent_id: currentUser?.id,
        });

        if (rpcErr) {
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
      console.error('Bulk delete error:', err);
      setBulkError(err?.message || 'Failed to delete clients.');
    } finally {
      setBulkDeleting(false);
    }
  };

  const getInitials = (name: string) => {
    if (!name) return 'C';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  return (
    <DashboardLayout>
      <CrmPageContainer>
        <div className="space-y-3 font-sans text-xs">
          {/* 1. ZOHO-STYLE QUICK VIEWS & SEARCH BAR (TOP HEADER STRIP REMOVED) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-2.5 shadow-xs flex flex-wrap items-center justify-between gap-3 font-sans">
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { id: 'all', label: 'All Clients' },
                { id: 'recently_modified', label: 'Recently Modified' },
                { id: 'recently_created', label: 'Recently Created' },
                { id: 'my_clients', label: 'My Clients' },
              ].map((view) => (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => {
                    setQuickView(view.id as any);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all ${
                    quickView === view.id
                      ? 'bg-blue-50 text-blue-700 border border-blue-100 font-bold shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {view.label}
                </button>
              ))}
            </div>

            {/* Global Client Record Search Input */}
            <div className="relative w-full sm:w-72">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                🔍
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search clients by name, email, phone, address..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl text-xs text-slate-900 font-medium outline-none transition-all placeholder-slate-400"
              />
            </div>
          </div>

          {/* 2. ACTION TOOLBAR WITH + ADD CLIENT PROFILE BUTTON */}
          <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs flex flex-wrap items-center justify-between gap-3 font-sans">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Filter Sidebar Toggle */}
              <button
                type="button"
                onClick={() => setIsFilterSidebarOpen(!isFilterSidebarOpen)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border transition-all ${
                  isFilterSidebarOpen
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>🔍</span> {isFilterSidebarOpen ? 'Hide Filters' : 'Filter Sidebar'}
              </button>

              {/* Sort Selector */}
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs text-slate-700 font-semibold">
                <span className="text-slate-400 font-normal">Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-transparent text-xs font-bold text-slate-900 outline-none cursor-pointer"
                >
                  <option value="recently_created">Recently Created</option>
                  <option value="recently_modified">Recently Modified</option>
                  <option value="name_asc">Client Name (A–Z)</option>
                  <option value="name_desc">Client Name (Z–A)</option>
                </select>
              </div>

              {/* Manage Columns Button */}
              <button
                type="button"
                onClick={() => setIsManageColumnsOpen(true)}
                className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all flex items-center gap-1.5"
              >
                <span>📊</span> Manage Columns
              </button>

              {/* Clear All Filters */}
              {(searchQuery || filterRules.length > 0 || quickView !== 'all' || policyTypeFilter.health || policyTypeFilter.medicare || policyTypeFilter.supplemental || policyTypeFilter.life || policyTypeFilter.property_casualty) && (
                <button
                  type="button"
                  onClick={handleClearAllFilters}
                  className="px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                >
                  Clear All Filters
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Records Count & Page Size Selector */}
              <div className="flex items-center gap-3 text-xs font-semibold text-slate-600">
                <div className="flex items-center gap-1">
                  <span>Show:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value) as any);
                      setPage(1);
                    }}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-900 outline-none"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
                <span className="text-slate-950 font-bold">
                  {totalCount === 0
                    ? '0 Client Profiles'
                    : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalCount)} of ${totalCount.toLocaleString()} Client Profiles`}
                </span>
              </div>

              {/* Add Client Profile Button inside Toolbar */}
              <button
                type="button"
                onClick={() => setIsAddWizardOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-bold px-3.5 py-1.5 rounded-xl transition-all shadow-md shadow-blue-500/10 font-sans"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                </svg>
                + Add Client Profile
              </button>
            </div>
          </div>

          {/* 3. MULTI-SELECT SELECTION ACTION BAR */}
          {selectedClientIds.size > 0 && (
            <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-2xl animate-fadeIn">
              <div className="flex items-center gap-3">
                <span className="text-xs font-extrabold text-blue-950">
                  {selectedClientIds.size} unique client profile(s) selected
                </span>
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
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5"
                >
                  <span>✏️</span> Update Field
                </button>
                <button
                  type="button"
                  onClick={() => setIsBulkDeleteOpen(true)}
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5"
                >
                  <span>🗑️</span> Delete Selected
                </button>
              </div>
            </div>
          )}

          {/* 4. MAIN WORKSPACE LAYOUT (LEFT FILTER SIDEBAR + RIGHT DENSE TABLE) */}
          <div className="flex items-start gap-4">
            {/* Left Filter Sidebar */}
            <ClientsLeftFilterSidebar
              isOpen={isFilterSidebarOpen}
              onClose={() => setIsFilterSidebarOpen(false)}
              quickFilter={quickView}
              onSelectQuickFilter={(fv) => {
                setQuickView(fv);
                setPage(1);
              }}
              policyTypeFilter={policyTypeFilter}
              onPolicyTypeFilterChange={(pt) => {
                setPolicyTypeFilter(pt);
                setPage(1);
              }}
              filterRules={filterRules}
              onAddRule={handleAddFilterRule}
              onRemoveRule={handleRemoveFilterRule}
              onUpdateRule={handleUpdateFilterRule}
              onClearAll={handleClearAllFilters}
              onApplyFilters={() => {
                setPage(1);
                loadClientsServerSide();
              }}
            />

            {/* Right Master Clients Table */}
            <div className="flex-1 min-w-0 bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
              {authLoading || loading ? (
                <div className="flex justify-center items-center py-20">
                  <div className="h-8 w-8 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
                </div>
              ) : clients.length === 0 ? (
                <div className="p-12 text-center space-y-3">
                  <div className="text-3xl">👤</div>
                  <h3 className="text-sm font-bold text-slate-900">No client profiles found</h3>
                  <p className="text-xs text-slate-500 font-medium max-w-sm mx-auto">
                    No client profiles match your active search, quick view, or policy filters.
                  </p>
                  <button
                    type="button"
                    onClick={handleClearAllFilters}
                    className="px-4 py-2 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition-all"
                  >
                    Reset All Filters
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse font-sans text-xs">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                        {visibleColumns.includes('checkbox') && (
                          <th className="py-3 px-3.5 w-10 text-center">
                            <input
                              type="checkbox"
                              checked={isAllOnPageSelected}
                              onChange={(e) => handleSelectAllOnPage(e.target.checked)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                            />
                          </th>
                        )}

                        {visibleColumns.includes('name') && (
                          <th className="py-3 px-3.5">Client Profile</th>
                        )}

                        {visibleColumns.includes('contact') && (
                          <th className="py-3 px-3.5">Primary Contact</th>
                        )}

                        {visibleColumns.includes('policy_types') && (
                          <th className="py-3 px-3.5">Policy Types</th>
                        )}

                        {visibleColumns.includes('status') && (
                          <th className="py-3 px-3.5">Client Type</th>
                        )}

                        {visibleColumns.includes('agent') && (
                          <th className="py-3 px-3.5">Agent</th>
                        )}

                        {visibleColumns.includes('updated_at') && (
                          <th className="py-3 px-3.5">Last Modified</th>
                        )}

                        {visibleColumns.includes('created_at') && (
                          <th className="py-3 px-3.5">Created On</th>
                        )}

                        {visibleColumns.includes('address') && (
                          <th className="py-3 px-3.5">Location / Address</th>
                        )}

                        {visibleColumns.includes('agency') && (
                          <th className="py-3 px-3.5">Agency</th>
                        )}

                        <th className="py-3 px-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                      {clients.map((client) => {
                        const isSelected = selectedClientIds.has(client.id);

                        return (
                          <tr
                            key={client.id}
                            className={`hover:bg-blue-50/40 transition-colors ${
                              isSelected ? 'bg-blue-50/70' : ''
                            }`}
                          >
                            {visibleColumns.includes('checkbox') && (
                              <td className="py-3 px-3.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => handleSelectOne(client.id, e.target.checked)}
                                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                                />
                              </td>
                            )}

                            {visibleColumns.includes('name') && (
                              <td className="py-3 px-3.5">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-extrabold text-xs flex items-center justify-center shrink-0 border border-blue-500 shadow-2xs">
                                    {getInitials(client.full_name)}
                                  </div>
                                  <div>
                                    <Link
                                      href={`/clients/${client.id}`}
                                      className="font-extrabold text-slate-950 hover:text-blue-600 hover:underline block text-xs"
                                    >
                                      {client.full_name}
                                    </Link>
                                    <span className="text-[10px] text-slate-400 font-mono block">
                                      ID: {client.id.substring(0, 8)}
                                    </span>
                                  </div>
                                </div>
                              </td>
                            )}

                            {visibleColumns.includes('contact') && (
                              <td className="py-3 px-3.5">
                                <span className="block font-semibold text-slate-900">{client.email || '—'}</span>
                                <span className="block text-[11px] text-slate-500 font-mono">
                                  {client.phone ? formatUSPhone(client.phone) : '—'}
                                </span>
                              </td>
                            )}

                            {visibleColumns.includes('policy_types') && (
                              <td className="py-3 px-3.5">
                                <div className="flex flex-wrap items-center gap-1">
                                  {client.policyTypes?.hasHealth && (
                                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                                      Health
                                    </span>
                                  )}
                                  {client.policyTypes?.hasMedicare && (
                                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-purple-50 text-purple-700 border border-purple-200">
                                      Medicare
                                    </span>
                                  )}
                                  {client.policyTypes?.hasSupplemental && (
                                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                                      Supplemental
                                    </span>
                                  )}
                                  {client.policyTypes?.hasLife && (
                                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      Life
                                    </span>
                                  )}
                                  {client.policyTypes?.hasPC && (
                                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                                      P&C
                                    </span>
                                  )}
                                  {!client.policyTypes?.hasHealth &&
                                    !client.policyTypes?.hasMedicare &&
                                    !client.policyTypes?.hasSupplemental &&
                                    !client.policyTypes?.hasLife &&
                                    !client.policyTypes?.hasPC && (
                                      <span className="text-[11px] text-slate-400 font-medium">No policies</span>
                                    )}
                                </div>
                              </td>
                            )}

                            {visibleColumns.includes('status') && (
                              <td className="py-3 px-3.5">
                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                  client.client_type === 'company'
                                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                                }`}>
                                  {client.client_type || 'Personal'}
                                </span>
                              </td>
                            )}

                            {visibleColumns.includes('agent') && (
                              <td className="py-3 px-3.5 text-slate-700 font-semibold">
                                {getAssignedAgentDisplay({ clientAgentId: client.agent_id, currentUserId: currentUser?.id })}
                              </td>
                            )}

                            {visibleColumns.includes('updated_at') && (
                              <td className="py-3 px-3.5 text-slate-600 text-[11px]">
                                {formatDateTimeMMDDYYYY(client.updated_at)}
                              </td>
                            )}

                            {visibleColumns.includes('created_at') && (
                              <td className="py-3 px-3.5 text-slate-600 text-[11px]">
                                {formatDateMMDDYYYY(client.created_at)}
                              </td>
                            )}

                            {visibleColumns.includes('address') && (
                              <td className="py-3 px-3.5 text-slate-700 font-medium">
                                {client.address || '—'}
                              </td>
                            )}

                            {visibleColumns.includes('agency') && (
                              <td className="py-3 px-3.5 text-slate-700 font-medium">
                                {client.agency_name || '—'}
                              </td>
                            )}

                            <td className="py-3 px-3.5 text-right">
                              <Link
                                href={`/clients/${client.id}`}
                                className="px-3 py-1 text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg transition-all"
                              >
                                View Profile →
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* PAGINATION FOOTER */}
              {totalCount > 0 && (
                <div className="p-3.5 bg-slate-50/80 border-t border-slate-200 flex items-center justify-between font-sans text-xs">
                  <span className="text-slate-500 font-semibold">
                    Page {page} of {Math.ceil(totalCount / pageSize)}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={page === 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1.5 font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40 rounded-xl transition-all"
                    >
                      ← Previous
                    </button>
                    <button
                      type="button"
                      disabled={page * pageSize >= totalCount}
                      onClick={() => setPage((p) => p + 1)}
                      className="px-3 py-1.5 font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40 rounded-xl transition-all"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </CrmPageContainer>

      {/* MANAGE COLUMNS MODAL */}
      <ClientsManageColumnsModal
        isOpen={isManageColumnsOpen}
        onClose={() => setIsManageColumnsOpen(false)}
        visibleColumns={visibleColumns}
        onChangeColumns={handleUpdateVisibleColumns}
      />

      {/* BULK UPDATE MODAL */}
      {isBulkUpdateOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-2xl max-w-md w-full space-y-4 font-sans animate-scale-up">
            <h4 className="text-base font-extrabold text-slate-900">
              Bulk Update ({selectedClientIds.size} Clients Selected)
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Updates the selected field for all checked client profiles.
            </p>

            {bulkError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs font-semibold">
                {bulkError}
              </div>
            )}

            <form onSubmit={handleExecuteBulkUpdate} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Target Field</label>
                <select
                  value={bulkUpdateField}
                  onChange={(e) => {
                    setBulkUpdateField(e.target.value);
                    const matched = WHITELIST_BULK_FIELDS.find((f) => f.id === e.target.value);
                    if (matched && matched.options) setBulkUpdateValue(matched.options[0]);
                    else setBulkUpdateValue('');
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none"
                >
                  {WHITELIST_BULK_FIELDS.map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">New Value</label>
                {WHITELIST_BULK_FIELDS.find((f) => f.id === bulkUpdateField)?.type === 'select' ? (
                  <select
                    value={bulkUpdateValue}
                    onChange={(e) => setBulkUpdateValue(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none"
                  >
                    {WHITELIST_BULK_FIELDS.find((f) => f.id === bulkUpdateField)?.options?.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={bulkUpdateValue}
                    onChange={(e) => setBulkUpdateValue(e.target.value)}
                    placeholder="Enter value..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 outline-none"
                  />
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsBulkUpdateOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bulkUpdating}
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md transition-all"
                >
                  {bulkUpdating ? 'Updating...' : 'Execute Bulk Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BULK DELETE CONFIRMATION MODAL */}
      {isBulkDeleteOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-2xl max-w-md w-full space-y-4 font-sans animate-scale-up">
            <h4 className="text-base font-extrabold text-slate-900">
              Delete {selectedClientIds.size} Client Profile(s)?
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              This will execute a safe cascade deletion for the selected client profile(s). All associated policy rows, notes, and documents will be removed safely.
            </p>

            {bulkError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs font-semibold">
                {bulkError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsBulkDeleteOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteBulkDelete}
                disabled={bulkDeleting}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md transition-all flex items-center gap-1.5"
              >
                {bulkDeleting ? 'Deleting...' : 'Delete Selected Clients'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW CLIENT WIZARD MODAL */}
      <NewClientWizardModal
        isOpen={isAddWizardOpen}
        onClose={() => {
          setIsAddWizardOpen(false);
          loadClientsServerSide();
        }}
        currentUserId={currentUser?.id || ''}
      />
    </DashboardLayout>
  );
}
