'use client';

import React, { useState, useMemo } from 'react';
import NextLink from 'next/link';

interface OscarBookTabProps {
  records: any[];
  onOpenMatchModal: (record: any) => void;
  onOpenImportModal: () => void;
}

export default function OscarBookTab({
  records,
  onOpenMatchModal,
  onOpenImportModal,
}: OscarBookTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [balanceFilter, setBalanceFilter] = useState('all');
  const [matchFilter, setMatchFilter] = useState('all');
  const [selectedRawRecord, setSelectedRawRecord] = useState<any | null>(null);

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      // Search
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const nameMatch = (r.member_name || '').toLowerCase().includes(q);
        const memberIdMatch = (r.external_member_id || '').toLowerCase().includes(q);
        const emailMatch = (r.email || '').toLowerCase().includes(q);
        if (!nameMatch && !memberIdMatch && !emailMatch) return false;
      }

      // Status
      if (statusFilter !== 'all' && r.carrier_status !== statusFilter) {
        return false;
      }

      // Balance
      if (balanceFilter === 'has_balance' && Number(r.balance) <= 0) {
        return false;
      }

      // Match Filter
      if (matchFilter !== 'all') {
        const mStatus = r.match?.match_status || 'unmatched';
        if (mStatus !== matchFilter) return false;
      }

      return true;
    });
  }, [records, searchTerm, statusFilter, balanceFilter, matchFilter]);

  return (
    <div className="space-y-5 font-sans">
      {/* Top Header & Search/Filters */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">Oscar Individual Member Book</h3>
            <p className="text-xs text-slate-500 font-medium">
              Showing {filteredRecords.length} of {records.length} records
            </p>
          </div>

          <button
            onClick={onOpenImportModal}
            className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-blue-500/10 shrink-0"
          >
            <span className="mr-1.5">⬆</span>
            <span>Import CSV</span>
          </button>
        </div>

        {/* Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-50">
          {/* Search Box */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Search Member / ID / Email
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, ID, or email..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all font-sans"
            />
          </div>

          {/* Status Filter */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Carrier Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all font-sans"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="grace_period">Grace Period Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>

          {/* Balance Filter */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Balance Filter
            </label>
            <select
              value={balanceFilter}
              onChange={(e) => setBalanceFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all font-sans"
            >
              <option value="all">All Balances</option>
              <option value="has_balance">Balance Due (&gt; $0)</option>
            </select>
          </div>

          {/* CRM Match Filter */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              CRM Client Match
            </label>
            <select
              value={matchFilter}
              onChange={(e) => setMatchFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all font-sans"
            >
              <option value="all">All Match States</option>
              <option value="matched">Matched Only</option>
              <option value="review">Needs Review Only</option>
              <option value="unmatched">Unmatched Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Book Table */}
      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-xs">
        {filteredRecords.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <p className="text-sm font-bold text-slate-700">No Oscar member records found.</p>
            <p className="text-xs text-slate-450 max-w-sm mx-auto font-sans">
              Try adjusting your filters or import your Oscar Individual Book CSV file.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Member Name / ID</th>
                  <th className="py-3.5 px-4">Plan</th>
                  <th className="py-3.5 px-4">Premium</th>
                  <th className="py-3.5 px-4">Balance</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">CRM Client Match</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 font-sans">
                {filteredRecords.map((r) => {
                  const hasBalance = Number(r.balance) > 0;
                  const isGrace = r.carrier_status === 'grace_period';
                  const matchStatus = r.match?.match_status || 'unmatched';
                  const clientObj = r.match?.client;

                  return (
                    <tr key={r.id || r.external_member_id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Member Info */}
                      <td className="py-3.5 px-4 min-w-[180px]">
                        <div className="space-y-0.5">
                          <p className="font-extrabold text-slate-900 truncate">{r.member_name}</p>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500">
                            <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                              {r.external_member_id}
                            </span>
                            {r.date_of_birth && <span>• DOB: {r.date_of_birth}</span>}
                          </div>
                        </div>
                      </td>

                      {/* Plan */}
                      <td className="py-3.5 px-4 min-w-[160px]">
                        <span className="font-semibold text-slate-800 truncate block max-w-xs" title={r.plan}>
                          {r.plan || 'N/A'}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          {r.on_exchange ? 'On-Exchange' : 'Off-Exchange'} • {r.state || 'FL'}
                        </span>
                      </td>

                      {/* Premium */}
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-slate-900">
                          ${Number(r.premium_amount || 0).toFixed(2)}
                        </span>
                        {r.aptc_subsidy > 0 && (
                          <span className="text-[10px] text-emerald-600 block">
                            APTC: ${Number(r.aptc_subsidy).toFixed(2)}
                          </span>
                        )}
                      </td>

                      {/* Balance */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`font-extrabold ${
                            hasBalance ? 'text-rose-600 font-sans' : 'text-slate-600'
                          }`}
                        >
                          ${Number(r.balance || 0).toFixed(2)}
                        </span>
                        {r.autopay ? (
                          <span className="text-[10px] text-emerald-600 block font-semibold">✓ Autopay ON</span>
                        ) : (
                          <span className="text-[10px] text-slate-400 block">Autopay OFF</span>
                        )}
                      </td>

                      {/* Carrier Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide inline-block border ${
                            isGrace
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : r.carrier_status === 'inactive'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {r.carrier_status === 'grace_period' ? 'Grace Period' : r.carrier_status}
                        </span>
                      </td>

                      {/* CRM Client Match */}
                      <td className="py-3.5 px-4 min-w-[160px]">
                        {clientObj ? (
                          <NextLink
                            href={`/clients/${clientObj.id}`}
                            className="group flex items-center gap-1.5 hover:underline"
                          >
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                            <span className="font-extrabold text-blue-600 group-hover:text-blue-800 truncate">
                              {clientObj.full_name}
                            </span>
                          </NextLink>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                matchStatus === 'review' ? 'bg-amber-500' : 'bg-slate-300'
                              }`}
                            />
                            <span
                              className={`font-semibold text-xs ${
                                matchStatus === 'review' ? 'text-amber-700 font-sans' : 'text-slate-400 font-sans'
                              }`}
                            >
                              {matchStatus === 'review' ? 'Needs Review' : 'Unmatched'}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right shrink-0">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => onOpenMatchModal(r)}
                            className="px-2.5 py-1 text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                          >
                            {clientObj ? 'Edit Link' : 'Match Client'}
                          </button>

                          <button
                            onClick={() => setSelectedRawRecord(r)}
                            className="px-2 py-1 text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                            title="Inspect Raw Carrier Record JSON"
                          >
                            {} Raw
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Raw Record JSON Modal */}
      {selectedRawRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-900">
                Raw Carrier Record: {selectedRawRecord.member_name}
              </h3>
              <button
                onClick={() => setSelectedRawRecord(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="bg-slate-900 text-slate-100 p-4 rounded-xl max-h-96 overflow-y-auto font-mono text-[11px]">
              <pre>{JSON.stringify(selectedRawRecord.raw_data || selectedRawRecord, null, 2)}</pre>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedRawRecord(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
