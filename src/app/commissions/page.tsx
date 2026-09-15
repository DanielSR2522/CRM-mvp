'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import CommissionsLeftRail, { CommissionsSubTab } from '@/components/commissions/CommissionsLeftRail';
import UploadEvidenceModal from '@/components/commissions/UploadEvidenceModal';
import { CommissionPayment, LedgerStatus, PendingPolicy } from '@/types/commissions';

export default function CommissionsPage() {
  const router = useRouter();
  const [payments, setPayments] = useState<CommissionPayment[]>([]);
  const [pendingPolicies, setPendingPolicies] = useState<PendingPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  // Active Workspace SubTab: summary, pending, paid, review, unmatched
  const [activeSubTab, setActiveSubTab] = useState<CommissionsSubTab>('summary');

  // Selected row detail drawer state
  const [selectedPayment, setSelectedPayment] = useState<CommissionPayment | null>(null);
  const [editingStatus, setEditingStatus] = useState<LedgerStatus>('Paid');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [carrierFilter, setCarrierFilter] = useState<string>('ALL');
  const [agentFilter, setAgentFilter] = useState<string>('ALL');
  const [policyTypeFilter, setPolicyTypeFilter] = useState<string>('ALL');
  const [agingFilter, setAgingFilter] = useState<string>('ALL'); // ALL, 0-30, 31-60, 61-90, 90+
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const loadCommissions = useCallback(() => {
    setLoading(true);
    fetch('/api/commissions/list')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setPayments(data.payments || []);
          setPendingPolicies(data.pendingPolicies || []);
        }
      })
      .catch((err) => console.error('Failed to load commissions:', err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let isMounted = true;
    fetch('/api/commissions/list')
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success) {
          setPayments(data.payments || []);
          setPendingPolicies(data.pendingPolicies || []);
        }
      })
      .catch((err) => console.error('Failed to load commissions:', err))
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSelectPayment = (payment: CommissionPayment) => {
    setSelectedPayment(payment);
    setEditingStatus(payment.status || 'Paid');
  };

  // Unique carriers list for filter dropdown
  const availableCarriers = useMemo(() => {
    const set = new Set<string>();
    payments.forEach((p) => {
      if (p.carrier) set.add(p.carrier);
    });
    pendingPolicies.forEach((p) => {
      if (p.carrier) set.add(p.carrier);
    });
    return Array.from(set).sort();
  }, [payments, pendingPolicies]);

  // Unique agents list for filter dropdown
  const availableAgents = useMemo(() => {
    const set = new Set<string>();
    payments.forEach((p) => {
      if (p.agent_name) set.add(p.agent_name);
    });
    pendingPolicies.forEach((p) => {
      if (p.agent_name) set.add(p.agent_name);
    });
    return Array.from(set).sort();
  }, [payments, pendingPolicies]);

  // Unique policy types list for filter dropdown
  const availablePolicyTypes = useMemo(() => {
    const set = new Set<string>();
    payments.forEach((p) => {
      if (p.policy_type) set.add(p.policy_type);
    });
    pendingPolicies.forEach((p) => {
      if (p.policy_type) set.add(p.policy_type);
    });
    return Array.from(set).sort();
  }, [payments, pendingPolicies]);

  // Filtered Pending Policies List
  const filteredPendingPolicies = useMemo(() => {
    return pendingPolicies.filter((p) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const clientMatch = (p.client_name || '').toLowerCase().includes(query);
        const policyMatch = (p.policy_number || '').toLowerCase().includes(query);
        const carrierMatch = (p.carrier || '').toLowerCase().includes(query);
        if (!clientMatch && !policyMatch && !carrierMatch) return false;
      }

      // 2. Carrier Filter
      if (carrierFilter !== 'ALL' && p.carrier !== carrierFilter) return false;

      // 3. Agent Filter
      if (agentFilter !== 'ALL' && p.agent_name !== agentFilter) return false;

      // 4. Policy Type Filter
      if (policyTypeFilter !== 'ALL' && p.policy_type !== policyTypeFilter) return false;

      // 5. Aging Filter
      if (agingFilter === '0-30' && (p.days_pending < 0 || p.days_pending > 30)) return false;
      if (agingFilter === '31-60' && (p.days_pending < 31 || p.days_pending > 60)) return false;
      if (agingFilter === '61-90' && (p.days_pending < 61 || p.days_pending > 90)) return false;
      if (agingFilter === '90+' && p.days_pending <= 90) return false;

      return true;
    });
  }, [pendingPolicies, searchQuery, carrierFilter, agentFilter, policyTypeFilter, agingFilter]);

  // Filtered Paid Ledger Payments List
  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const clientMatch = (p.client_name || '').toLowerCase().includes(query);
        const policyMatch = (p.policy_number || '').toLowerCase().includes(query);
        const carrierMatch = (p.carrier || '').toLowerCase().includes(query);
        if (!clientMatch && !policyMatch && !carrierMatch) return false;
      }

      // 2. Active Tab & Status Filter
      if (activeSubTab === 'review') {
        if (p.status !== 'Review' && (p.status as string) !== 'NEEDS_REVIEW') return false;
      } else if (activeSubTab === 'unmatched') {
        if (p.status !== 'Unmatched' && p.match_status !== 'UNMATCHED') return false;
      } else if (statusFilter !== 'ALL') {
        if (statusFilter === 'PAID' && p.status !== 'Paid' && (p.status as string) !== 'Confirmed') return false;
        if (statusFilter === 'REVIEW' && p.status !== 'Review' && (p.status as string) !== 'NEEDS_REVIEW') return false;
        if (statusFilter === 'UNMATCHED' && p.status !== 'Unmatched' && p.match_status !== 'UNMATCHED') return false;
      }

      // 3. Carrier Filter
      if (carrierFilter !== 'ALL' && p.carrier !== carrierFilter) return false;

      // 4. Agent Filter
      if (agentFilter !== 'ALL' && p.agent_name !== agentFilter) return false;

      // 5. Policy Type Filter
      if (policyTypeFilter !== 'ALL' && p.policy_type !== policyTypeFilter) return false;

      // 6. Date Range Filter
      if (startDate && p.payment_date < startDate) return false;
      if (endDate && p.payment_date > endDate) return false;

      return true;
    });
  }, [payments, searchQuery, activeSubTab, statusFilter, carrierFilter, agentFilter, policyTypeFilter, startDate, endDate]);

  // Summary Metrics Calculation
  const metrics = useMemo(() => {
    let paidAmountTotal = 0;
    let paidCount = 0;
    let reviewCount = 0;
    let unmatchedCount = 0;

    payments.forEach((p) => {
      const amt = Number(p.amount) || 0;
      if (p.status === 'Paid' || (p.status as string) === 'Confirmed' || (p.status as string) === 'PAID' || (p.status as string) === 'Reconciled') {
        paidAmountTotal += amt;
        paidCount++;
      } else if (p.status === 'Review' || (p.status as string) === 'NEEDS_REVIEW') {
        reviewCount++;
      } else if (p.status === 'Unmatched' || p.match_status === 'UNMATCHED') {
        unmatchedCount++;
      }
    });

    const pendingCount = pendingPolicies.length;
    const over90DaysPending = pendingPolicies.filter((p) => p.days_pending > 90).length;

    return {
      pendingCount,
      paidAmountTotal,
      paidCount,
      reviewCount,
      unmatchedCount,
      over90DaysPending,
    };
  }, [payments, pendingPolicies]);

  const handleUpdateStatus = async (newStatus: LedgerStatus) => {
    if (!selectedPayment) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch('/api/commissions/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_id: selectedPayment.id,
          status: newStatus,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setPayments((prev) =>
          prev.map((p) => (p.id === selectedPayment.id ? { ...p, status: newStatus } : p))
        );
        setSelectedPayment((prev) => (prev ? { ...prev, status: newStatus } : null));
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col w-full font-sans min-h-screen bg-white">
        <div className="flex flex-col lg:flex-row items-stretch w-full flex-1 min-h-0">
          
          {/* Left Context Rail (White workspace sidebar) */}
          <CommissionsLeftRail
            activeSubTab={activeSubTab}
            setActiveSubTab={setActiveSubTab}
            pendingCount={metrics.pendingCount}
            paidCount={metrics.paidCount}
            reviewCount={metrics.reviewCount}
            unmatchedCount={metrics.unmatchedCount}
          />

          {/* Soft-Gray Vertical Strip (8px wide, #F1F5F9 / bg-slate-100) */}
          <div className="hidden lg:block w-2 shrink-0 bg-slate-100 self-stretch" />

          {/* Right Main Content Workspace */}
          <div className="flex-1 w-full min-w-0 bg-white flex flex-col p-6 space-y-6">
            
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h1 className="text-2xl font-extrabold text-slate-900">P&C Commissions</h1>
                <p className="text-xs text-slate-500 mt-1">
                  Policy commission status tracking, carrier statement evidence import, and confirmed payment ledger.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsUploadOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white shadow-md shadow-blue-500/10 hover:bg-blue-700 transition-all cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Upload Statement Evidence
              </button>
            </div>

            {/* 1. SUMMARY VIEW */}
            {activeSubTab === 'summary' && (
              <div className="space-y-6">
                
                {/* Compact KPI Cards (Restrained, Professional White Cards) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-blue-200 transition-all">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-500">Pending payment</span>
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                    </div>
                    <p className="text-2xl font-extrabold text-slate-900 mt-2">{metrics.pendingCount}</p>
                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">Policies awaiting match</p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-emerald-200 transition-all">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-500">Paid commissions</span>
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    </div>
                    <p className="text-2xl font-extrabold text-slate-900 mt-2">${metrics.paidAmountTotal.toFixed(2)}</p>
                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">{metrics.paidCount} confirmed payments</p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-amber-200 transition-all">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-500">Needs review</span>
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                    </div>
                    <p className="text-2xl font-extrabold text-amber-600 mt-2">{metrics.reviewCount}</p>
                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">Ambiguous matches</p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-slate-300 transition-all">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-500">Unmatched</span>
                      <span className="w-2 h-2 rounded-full bg-slate-400" />
                    </div>
                    <p className="text-2xl font-extrabold text-slate-700 mt-2">{metrics.unmatchedCount}</p>
                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">Unassigned rows</p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-rose-200 transition-all">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-500">90+ days pending</span>
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                    </div>
                    <p className="text-2xl font-extrabold text-rose-700 mt-2">{metrics.over90DaysPending}</p>
                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">Aging pending policies</p>
                  </div>

                </div>

                {/* Summary Dual Preview Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  
                  {/* Recent Pending Preview */}
                  <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-bold text-slate-900">Pending Policies Overview</h3>
                        <p className="text-[11px] text-slate-500">P&C policies awaiting carrier commission statement</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveSubTab('pending')}
                        className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                      >
                        View all ({pendingPolicies.length}) →
                      </button>
                    </div>

                    {loading ? (
                      <div className="p-8 text-center text-xs text-slate-400">Loading pending policies...</div>
                    ) : pendingPolicies.length === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-400">No pending policies</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/30">
                              <th className="p-3">Client</th>
                              <th className="p-3">Policy #</th>
                              <th className="p-3">Carrier</th>
                              <th className="p-3 text-right">Days Pending</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {pendingPolicies.slice(0, 5).map((p) => (
                              <tr
                                key={p.policy_id}
                                onClick={() => router.push(`/clients/${p.client_id}`)}
                                className="hover:bg-slate-50 transition-colors cursor-pointer"
                              >
                                <td className="p-3 font-bold text-slate-900">{p.client_name}</td>
                                <td className="p-3 font-mono text-slate-700">{p.policy_number}</td>
                                <td className="p-3 text-slate-600">{p.carrier}</td>
                                <td className="p-3 text-right">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    p.days_pending > 90 ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'
                                  }`}>
                                    {p.days_pending}d
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Recent Paid Preview */}
                  <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-bold text-slate-900">Recent Paid Commissions</h3>
                        <p className="text-[11px] text-slate-500">Latest confirmed carrier statement payments</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveSubTab('paid')}
                        className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                      >
                        View all ({payments.length}) →
                      </button>
                    </div>

                    {loading ? (
                      <div className="p-8 text-center text-xs text-slate-400">Loading paid commissions...</div>
                    ) : payments.length === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-400">No paid commission records found</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/30">
                              <th className="p-3">Client</th>
                              <th className="p-3">Policy #</th>
                              <th className="p-3">Carrier</th>
                              <th className="p-3 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {payments.slice(0, 5).map((p) => (
                              <tr
                                key={p.id}
                                onClick={() => handleSelectPayment(p)}
                                className="hover:bg-slate-50 transition-colors cursor-pointer"
                              >
                                <td className="p-3 font-bold text-slate-900">{p.client_name || 'Client'}</td>
                                <td className="p-3 font-mono text-slate-700">{p.policy_number}</td>
                                <td className="p-3 text-slate-600">{p.carrier}</td>
                                <td className="p-3 text-right font-extrabold text-emerald-700">
                                  ${Number(p.amount).toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                </div>

              </div>
            )}

            {/* 2. PENDING PAYMENTS VIEW */}
            {activeSubTab === 'pending' && (
              <div className="space-y-4">
                
                {/* Filter Bar */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    
                    {/* Search Input */}
                    <div className="lg:col-span-2">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Search Client / Policy #
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Filter by name, policy #..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-blue-500"
                        />
                        {searchQuery && (
                          <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2.5 top-1.5 text-xs text-slate-400 hover:text-slate-600"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Aging Filter */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Aging Filter
                      </label>
                      <select
                        value={agingFilter}
                        onChange={(e) => setAgingFilter(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-500"
                      >
                        <option value="ALL">All Aging Days</option>
                        <option value="0-30">0 – 30 Days</option>
                        <option value="31-60">31 – 60 Days</option>
                        <option value="61-90">61 – 90 Days</option>
                        <option value="90+">90+ Days Pending</option>
                      </select>
                    </div>

                    {/* Carrier Filter */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Carrier
                      </label>
                      <select
                        value={carrierFilter}
                        onChange={(e) => setCarrierFilter(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-500"
                      >
                        <option value="ALL">All Carriers</option>
                        {availableCarriers.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    {/* Agent Filter */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Agent
                      </label>
                      <select
                        value={agentFilter}
                        onChange={(e) => setAgentFilter(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-500"
                      >
                        <option value="ALL">All Agents</option>
                        {availableAgents.map((a) => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </select>
                    </div>

                  </div>
                </div>

                {/* Table */}
                <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">Pending Commission Tracker</h2>
                      <p className="text-xs text-slate-500">P&C policies awaiting appearance in a carrier commission statement.</p>
                    </div>
                    <span className="text-xs font-semibold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-lg">
                      Showing {filteredPendingPolicies.length} of {pendingPolicies.length} pending policies
                    </span>
                  </div>

                  {loading ? (
                    <div className="p-12 text-center text-xs font-semibold text-slate-500">Loading Pending Policies...</div>
                  ) : filteredPendingPolicies.length === 0 ? (
                    <div className="p-12 text-center">
                      <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-sm font-bold text-slate-700">No pending policies found</p>
                      <p className="text-xs text-slate-500 mt-1">All CRM policies have been matched to confirmed statement payments!</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            <th className="p-3.5">Client</th>
                            <th className="p-3.5">Policy / Member #</th>
                            <th className="p-3.5">Carrier</th>
                            <th className="p-3.5">Agent</th>
                            <th className="p-3.5">Policy Type</th>
                            <th className="p-3.5">Effective Date</th>
                            <th className="p-3.5 text-center">Days Pending</th>
                            <th className="p-3.5">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {filteredPendingPolicies.map((p) => (
                            <tr
                              key={p.policy_id}
                              onClick={() => router.push(`/clients/${p.client_id}`)}
                              className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                            >
                              <td className="p-3.5 font-bold text-slate-900">{p.client_name}</td>
                              <td className="p-3.5 font-mono text-slate-800">
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200/80 font-bold">
                                  {p.policy_number}
                                </span>
                              </td>
                              <td className="p-3.5 font-medium text-slate-700">{p.carrier}</td>
                              <td className="p-3.5 text-slate-600">{p.agent_name || 'Agent'}</td>
                              <td className="p-3.5">
                                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-medium">
                                  {p.policy_type}
                                </span>
                              </td>
                              <td className="p-3.5 font-medium text-slate-800">{p.effective_date || 'N/A'}</td>
                              <td className="p-3.5 text-center">
                                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                  p.days_pending > 90
                                    ? 'bg-rose-100 text-rose-800'
                                    : p.days_pending > 60
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-slate-100 text-slate-700'
                                }`}>
                                  {p.days_pending} days
                                </span>
                              </td>
                              <td className="p-3.5">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                                  ⏳ Pending payment
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* 3. PAID, REVIEW, UNMATCHED VIEWS */}
            {(activeSubTab === 'paid' || activeSubTab === 'review' || activeSubTab === 'unmatched') && (
              <div className="space-y-4">
                
                {/* Filter Bar */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    
                    {/* Search Input */}
                    <div className="lg:col-span-2">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Search Client / Policy #
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Filter by name, policy #..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-blue-500"
                        />
                        {searchQuery && (
                          <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2.5 top-1.5 text-xs text-slate-400 hover:text-slate-600"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Status Filter */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Status
                      </label>
                      <select
                        value={activeSubTab === 'review' ? 'REVIEW' : activeSubTab === 'unmatched' ? 'UNMATCHED' : statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        disabled={activeSubTab === 'review' || activeSubTab === 'unmatched'}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-500 disabled:opacity-60"
                      >
                        <option value="ALL">All Statuses</option>
                        <option value="PAID">Paid</option>
                        <option value="REVIEW">Needs Review</option>
                        <option value="UNMATCHED">Unmatched</option>
                      </select>
                    </div>

                    {/* Carrier Filter */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Carrier
                      </label>
                      <select
                        value={carrierFilter}
                        onChange={(e) => setCarrierFilter(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-500"
                      >
                        <option value="ALL">All Carriers</option>
                        {availableCarriers.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    {/* Agent Filter */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Agent
                      </label>
                      <select
                        value={agentFilter}
                        onChange={(e) => setAgentFilter(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-500"
                      >
                        <option value="ALL">All Agents</option>
                        {availableAgents.map((a) => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </select>
                    </div>

                    {/* Policy Type Filter */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Policy Type
                      </label>
                      <select
                        value={policyTypeFilter}
                        onChange={(e) => setPolicyTypeFilter(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-500"
                      >
                        <option value="ALL">All Policy Types</option>
                        {availablePolicyTypes.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>

                  </div>

                  {/* Date Range Row */}
                  <div className="flex items-center space-x-3 pt-2 border-t border-slate-100 text-xs">
                    <span className="font-bold text-slate-500 uppercase text-[10px] tracking-wider">Payment Date:</span>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-700 outline-none focus:border-blue-500 text-xs"
                    />
                    <span className="text-slate-400">to</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-700 outline-none focus:border-blue-500 text-xs"
                    />
                  </div>
                </div>

                {/* Table */}
                <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">
                        {activeSubTab === 'review'
                          ? 'Needs Review Statements'
                          : activeSubTab === 'unmatched'
                          ? 'Unmatched Statement Rows'
                          : 'Paid Commission Ledger'}
                      </h2>
                      <p className="text-xs text-slate-500">
                        {activeSubTab === 'review'
                          ? 'Carrier statement matches requiring manual verification'
                          : activeSubTab === 'unmatched'
                          ? 'Statement rows without matching CRM policy'
                          : 'Confirmed carrier statement payments linked to CRM policies.'}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-lg">
                      Showing {filteredPayments.length} of {payments.length} entries
                    </span>
                  </div>

                  {loading ? (
                    <div className="p-12 text-center text-xs font-semibold text-slate-500">Loading Ledger...</div>
                  ) : filteredPayments.length === 0 ? (
                    <div className="p-12 text-center">
                      <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-sm font-bold text-slate-700">No matching ledger records found</p>
                      <p className="text-xs text-slate-500 mt-1">Upload evidence or adjust your filters to view records.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            <th className="p-3.5">Client</th>
                            <th className="p-3.5">Policy / Member #</th>
                            <th className="p-3.5">Carrier</th>
                            <th className="p-3.5">Agent</th>
                            <th className="p-3.5">Policy Type</th>
                            <th className="p-3.5 text-right">Commission Received</th>
                            <th className="p-3.5">Payment Date</th>
                            <th className="p-3.5">Tx Code</th>
                            <th className="p-3.5">Status</th>
                            <th className="p-3.5 text-center">Source Evidence</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {filteredPayments.map((p) => (
                            <tr
                              key={p.id}
                              onClick={() => handleSelectPayment(p)}
                              className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${
                                selectedPayment?.id === p.id ? 'bg-blue-50/30' : ''
                              }`}
                            >
                              <td className="p-3.5 font-bold text-slate-900">{p.client_name || 'Client'}</td>
                              <td className="p-3.5 font-mono text-slate-800">
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200/80 font-bold">
                                  {p.policy_number}
                                </span>
                              </td>
                              <td className="p-3.5 font-medium text-slate-700">{p.carrier}</td>
                              <td className="p-3.5 text-slate-600">{p.agent_name || 'Agent'}</td>
                              <td className="p-3.5">
                                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-medium">
                                  {p.policy_type || 'Property & Casualty'}
                                </span>
                              </td>
                              <td className="p-3.5 text-right font-extrabold text-emerald-700 text-sm">
                                ${Number(p.amount).toFixed(2)}
                              </td>
                              <td className="p-3.5 font-medium text-slate-800">{p.payment_date}</td>
                              <td className="p-3.5 font-mono text-[11px] text-slate-600 uppercase">
                                {p.transaction_code || 'COMM'}
                              </td>
                              <td className="p-3.5">
                                {(p.status === 'Paid' || (p.status as string) === 'Confirmed' || (p.status as string) === 'PAID') && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800">
                                    ✓ Paid
                                  </span>
                                )}
                                {(p.status === 'Review' || (p.status as string) === 'NEEDS_REVIEW') && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-800">
                                    ⚠️ Review
                                  </span>
                                )}
                                {(p.status === 'Unmatched' || p.match_status === 'UNMATCHED') && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700">
                                    ❓ Unmatched
                                  </span>
                                )}
                              </td>
                              <td className="p-3.5 text-center">
                                {p.source_document_url ? (
                                  <span className="text-blue-600 font-bold hover:underline" title="View Source Evidence">
                                    📄 Evidence
                                  </span>
                                ) : (
                                  <span className="text-slate-400 font-medium">✨ Vision AI</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

              </div>
            )}

          </div>
        </div>
      </div>

      {/* Upload Statement Evidence Modal */}
      <UploadEvidenceModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={() => {
          loadCommissions();
        }}
      />

      {/* Commission Detail Side Panel / Drawer */}
      {selectedPayment && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-xs animate-fade-in font-sans">
          <div className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-slide-left">
            
            {/* Drawer Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">Commission Record Detail</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Policy #{selectedPayment.policy_number} · {selectedPayment.carrier}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPayment(null)}
                className="p-1 text-slate-400 hover:text-slate-600 font-bold rounded-lg transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 p-6 overflow-y-auto space-y-6 min-h-0">
              
              {/* 1. Policy Linkage Card */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/40 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Linked Policy Info</span>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => router.push(`/clients/${selectedPayment.client_id}`)}
                      className="text-xs font-bold text-blue-600 hover:underline cursor-pointer"
                    >
                      Open Client ↗
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 font-medium block">Client Name</span>
                    <span className="font-bold text-slate-900">{selectedPayment.client_name || 'Client'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block">Policy Number</span>
                    <code className="font-bold text-blue-900 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                      {selectedPayment.policy_number}
                    </code>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block">Carrier</span>
                    <span className="font-semibold text-slate-800">{selectedPayment.carrier}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block">Policy Type</span>
                    <span className="font-medium text-slate-700">{selectedPayment.policy_type || 'Property & Casualty'}</span>
                  </div>
                  <div className="col-span-2 pt-1 border-t border-slate-200/60">
                    <span className="text-slate-400 font-medium block">Assigned Agent</span>
                    <span className="font-semibold text-slate-800">{selectedPayment.agent_name || 'Agent'}</span>
                  </div>
                </div>
              </div>

              {/* 2. Commission Payment Details Card */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4 shadow-2xs">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  Commission Received Details
                </span>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 font-medium block">Commission Received</span>
                    <span className="text-xl font-extrabold text-emerald-600">${Number(selectedPayment.amount).toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block">Payment Date</span>
                    <span className="font-bold text-slate-900 mt-1 block">{selectedPayment.payment_date}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block">Transaction Code</span>
                    <span className="font-mono font-bold text-slate-800 uppercase">{selectedPayment.transaction_code || 'COMM'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block">Extraction Method</span>
                    <span className="inline-flex items-center gap-1 font-bold text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md mt-1">
                      {selectedPayment.extraction_method === 'ocr_fallback' ? '⚙️ OCR Fallback' : '✨ Vision AI'}
                    </span>
                  </div>
                </div>

                {/* Status Controller */}
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <label className="block text-xs font-bold text-slate-700">Update Record Status</label>
                  <div className="flex items-center space-x-2">
                    <select
                      value={editingStatus}
                      onChange={(e) => setEditingStatus(e.target.value as LedgerStatus)}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500"
                    >
                      <option value="Paid">Paid</option>
                      <option value="Review">Needs Review</option>
                      <option value="Unmatched">Unmatched</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(editingStatus)}
                      disabled={updatingStatus || editingStatus === selectedPayment.status}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl transition-all cursor-pointer"
                    >
                      {updatingStatus ? 'Saving...' : 'Update Status'}
                    </button>
                  </div>
                </div>
              </div>

              {/* 3. Permanent Evidence Audit Card */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/40 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Source Evidence Audit</span>
                  <span className="text-[10px] text-slate-400 font-medium">Permanently Preserved</span>
                </div>

                <div className="text-xs space-y-2">
                  <div>
                    <span className="text-slate-400 font-medium block mb-1">Raw Extracted Source Line</span>
                    <pre className="p-2.5 rounded-xl bg-white border border-slate-200 font-mono text-[11px] text-slate-800 whitespace-pre-wrap leading-relaxed overflow-x-auto">
                      {selectedPayment.source_text || selectedPayment.original_extracted_value || 'Original evidence line stored.'}
                    </pre>
                  </div>

                  {selectedPayment.original_extracted_value && (
                    <div>
                      <span className="text-slate-400 font-medium block">Original Extracted Audit Snapshot</span>
                      <span className="font-mono text-slate-700 text-xs bg-white px-2 py-1 rounded-lg border border-slate-200 inline-block mt-0.5">
                        {selectedPayment.original_extracted_value}
                      </span>
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Drawer Footer Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setSelectedPayment(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Close Panel
              </button>
            </div>

          </div>
        </div>
      )}

    </DashboardLayout>
  );
}
