'use client';

import React from 'react';
import { formatDateMMDDYYYY } from '@/lib/carrier-portals/date-formatter';

interface UnmatchedTabProps {
  records: any[];
  onOpenMatchModal: (record: any) => void;
  onRefresh: () => void;
}

export default function UnmatchedTab({
  records,
  onOpenMatchModal,
  onRefresh,
}: UnmatchedTabProps) {
  // Filter for review or unmatched
  const unmatchedRecords = records.filter((r) => {
    const status = r.match?.match_status || 'unmatched';
    return status === 'review' || status === 'unmatched';
  });

  const handleIgnore = async (externalMemberId: string) => {
    try {
      const res = await fetch('/api/carrier-portals/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          external_member_id: externalMemberId,
          action: 'ignore',
          carrier: 'oscar',
        }),
      });
      if (res.ok) {
        onRefresh();
      }
    } catch (err) {
      console.error('Error ignoring match:', err);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-extrabold text-slate-900">Unmatched Carrier Members &amp; Review Queue</h3>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Showing {unmatchedRecords.length} member records requiring manual client linkage or confirmation
          </p>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          Deterministic Matching • DOB (+40), Email (+30), Phone (+20), Name (+10)
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-xs">
        {unmatchedRecords.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <p className="text-sm font-bold text-emerald-700">✓ All member records matched!</p>
            <p className="text-xs text-slate-400">
              There are currently zero unmatched or review-queued records.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Member Name &amp; ID</th>
                  <th className="py-3.5 px-4">Carrier</th>
                  <th className="py-3.5 px-4">DOB</th>
                  <th className="py-3.5 px-4">Email</th>
                  <th className="py-3.5 px-4">Phone</th>
                  <th className="py-3.5 px-4">Suggested CRM Client</th>
                  <th className="py-3.5 px-4">Confidence</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {unmatchedRecords.map((r) => {
                  const matchObj = r.match || {};
                  const isReview = matchObj.match_status === 'review';
                  const clientObj = matchObj.client;
                  const confidence = matchObj.confidence_score || 0;

                  return (
                    <tr key={r.id || r.external_member_id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Member Name & ID */}
                      <td className="py-3.5 px-4">
                        <span className="font-extrabold text-slate-900 block text-sm">{r.member_name}</span>
                        <span className="font-mono text-[10px] text-slate-400">{r.external_member_id}</span>
                      </td>

                      {/* Carrier */}
                      <td className="py-3.5 px-4">
                        <span className="font-extrabold text-slate-800 uppercase px-2 py-0.5 rounded bg-slate-100 border border-slate-200/60 text-[10px]">
                          {r.carrier || 'Oscar'}
                        </span>
                      </td>

                      {/* DOB formatted MM/DD/YYYY */}
                      <td className="py-3.5 px-4 font-semibold text-slate-700">
                        {formatDateMMDDYYYY(r.date_of_birth)}
                      </td>

                      {/* Email */}
                      <td className="py-3.5 px-4 font-medium text-slate-700">
                        {r.email || 'N/A'}
                      </td>

                      {/* Phone */}
                      <td className="py-3.5 px-4 font-medium text-slate-700">
                        {r.phone || 'N/A'}
                      </td>

                      {/* Suggested CRM Client */}
                      <td className="py-3.5 px-4 font-bold text-slate-800">
                        {clientObj ? clientObj.full_name : <span className="text-slate-400 font-normal">None found</span>}
                      </td>

                      {/* Confidence */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                            isReview
                              ? 'bg-amber-50 text-amber-800 border-amber-300'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {confidence}%
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right space-x-2">
                        <button
                          onClick={() => onOpenMatchModal(r)}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs transition-all shadow-xs"
                        >
                          Match
                        </button>
                        <button
                          onClick={() => handleIgnore(r.external_member_id)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs transition-all"
                        >
                          Ignore
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
