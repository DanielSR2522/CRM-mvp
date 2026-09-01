'use client';

import React, { useState, useMemo } from 'react';
import { formatDateMMDDYYYY } from '@/lib/carrier-portals/date-formatter';

interface CarrierBookTabProps {
  records: any[];
  onOpenMatchModal: (record: any) => void;
  onOpenImportModal: () => void;
}

export default function CarrierBookTab({
  records,
  onOpenMatchModal,
  onOpenImportModal,
}: CarrierBookTabProps) {
  const [selectedCarrier, setSelectedCarrier] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Filtered records
  const filteredRecords = useMemo(() => {
    return records.filter((rec) => {
      // Carrier filter
      if (selectedCarrier !== 'all' && rec.carrier?.toLowerCase() !== selectedCarrier.toLowerCase()) {
        return false;
      }

      // Status filter
      if (statusFilter !== 'all' && rec.carrier_status !== statusFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const name = (rec.member_name || '').toLowerCase();
        const memId = (rec.external_member_id || '').toLowerCase();
        const plan = (rec.plan || '').toLowerCase();
        const email = (rec.email || '').toLowerCase();
        return name.includes(q) || memId.includes(q) || plan.includes(q) || email.includes(q);
      }

      return true;
    });
  }, [records, selectedCarrier, statusFilter, searchQuery]);

  return (
    <div className="space-y-6 font-sans">
      {/* Header & Controls Bar */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full md:w-auto">
          {/* Carrier Filter */}
          <select
            value={selectedCarrier}
            onChange={(e) => setSelectedCarrier(e.target.value)}
            className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="all">All Carriers ({records.length})</option>
            <option value="oscar">Oscar Health</option>
            <option value="ambetter">Ambetter</option>
            <option value="molina">Molina Healthcare</option>
            <option value="florida_blue">Florida Blue</option>
            <option value="aetna">Aetna</option>
            <option value="uhc">UnitedHealthcare</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="grace_period">Grace Period</option>
            <option value="inactive">Inactive</option>
          </select>

          {/* Search Bar */}
          <input
            type="text"
            placeholder="Search name, member ID, plan..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-full sm:w-64"
          />
        </div>

        <button
          onClick={onOpenImportModal}
          className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-blue-500/10 shrink-0"
        >
          <span className="mr-1.5 text-sm">⬆</span>
          <span>Import CSV</span>
        </button>
      </div>

      {/* Main Carrier Book Table */}
      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-xs">
        {filteredRecords.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <p className="text-sm font-bold text-slate-700">No member records match your selected filters.</p>
            <p className="text-xs text-slate-400">Try adjusting your carrier or search filter, or import a carrier CSV file.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Member Name &amp; ID</th>
                  <th className="py-3.5 px-4">Carrier</th>
                  <th className="py-3.5 px-4">Plan &amp; Dates</th>
                  <th className="py-3.5 px-4">Premium</th>
                  <th className="py-3.5 px-4">Balance</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Autopay</th>
                  <th className="py-3.5 px-4">CRM Match</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredRecords.map((rec) => {
                  const isMatched = rec.match?.match_status === 'matched';
                  const isReview = rec.match?.match_status === 'review';
                  const hasBalance = Number(rec.balance || 0) > 0;

                  return (
                    <tr key={rec.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Member Name & ID */}
                      <td className="py-3.5 px-4">
                        <div className="font-extrabold text-slate-900 text-sm">
                          {rec.member_name || 'Unnamed Member'}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 font-medium">
                          {rec.external_member_id}
                        </div>
                        {rec.date_of_birth && (
                          <div className="text-[10px] text-slate-400">
                            DOB: {formatDateMMDDYYYY(rec.date_of_birth)}
                          </div>
                        )}
                      </td>

                      {/* Carrier */}
                      <td className="py-3.5 px-4">
                        <span className="font-extrabold text-slate-800 uppercase px-2 py-0.5 rounded bg-slate-100 border border-slate-200/60 text-[10px]">
                          {rec.carrier || 'Oscar'}
                        </span>
                      </td>

                      {/* Plan & Coverage Dates formatted MM/DD/YYYY */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800 truncate max-w-xs">{rec.plan || 'Standard Plan'}</div>
                        <div className="text-[10px] text-slate-500">
                          {formatDateMMDDYYYY(rec.coverage_start_date)} - {formatDateMMDDYYYY(rec.coverage_end_date)}
                        </div>
                      </td>

                      {/* Premium */}
                      <td className="py-3.5 px-4 font-bold text-slate-800">
                        ${Number(rec.premium_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>

                      {/* Balance */}
                      <td className="py-3.5 px-4">
                        <span className={`font-extrabold ${hasBalance ? 'text-rose-600' : 'text-slate-700'}`}>
                          ${Number(rec.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                            rec.carrier_status === 'active'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : rec.carrier_status === 'grace_period'
                              ? 'bg-amber-50 text-amber-800 border-amber-300 font-black'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {rec.carrier_status === 'grace_period' ? 'Grace Period' : rec.carrier_status}
                        </span>
                      </td>

                      {/* Autopay */}
                      <td className="py-3.5 px-4 text-xs font-bold">
                        {rec.autopay ? (
                          <span className="text-emerald-700 font-extrabold">✓ Yes</span>
                        ) : (
                          <span className="text-slate-400 font-medium">No</span>
                        )}
                      </td>

                      {/* CRM Match */}
                      <td className="py-3.5 px-4">
                        {isMatched ? (
                          <div>
                            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200 text-[10px]">
                              Matched ({rec.match?.confidence_score}%)
                            </span>
                            <div className="text-[11px] font-bold text-slate-800 mt-0.5 truncate max-w-xs">
                              {rec.match?.client?.full_name}
                            </div>
                          </div>
                        ) : isReview ? (
                          <div>
                            <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 font-bold border border-amber-300 text-[10px]">
                              Review ({rec.match?.confidence_score}%)
                            </span>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              Suggested: {rec.match?.client?.full_name}
                            </div>
                          </div>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 font-semibold text-[10px]">
                            Unmatched
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => onOpenMatchModal(rec)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg text-xs transition-all shadow-2xs"
                        >
                          {isMatched ? 'Edit Match' : 'Match Client'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
