'use client';

import React, { useState } from 'react';
import { MarketingCampaign } from '@/types/marketing';

interface CampaignsListViewProps {
  campaigns: MarketingCampaign[];
  onOpenWizard: () => void;
  onSelectCampaignHistory?: (campaign: MarketingCampaign) => void;
}

export default function CampaignsListView({
  campaigns,
  onOpenWizard,
  onSelectCampaignHistory,
}: CampaignsListViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const filteredCampaigns = campaigns.filter((c) => {
    const matchesSearch =
      !searchTerm.trim() ||
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.subject && c.subject.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 font-sans">
      {/* Header Actions & Filters Bar */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
          <div className="w-64 relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search campaigns..."
              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3.5 py-1.5 text-xs text-slate-800 outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5">
            {['ALL', 'DRAFT', 'SCHEDULED', 'SENT', 'FAILED'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
                  statusFilter === st
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenWizard}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-blue-600/10 flex items-center gap-1.5"
        >
          <span>+</span> Create Campaign
        </button>
      </div>

      {/* Campaigns Table */}
      <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-2xs">
        {filteredCampaigns.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <span className="text-3xl block">📋</span>
            <h3 className="text-sm font-bold text-slate-800">No campaigns found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No marketing campaigns match your current search or status criteria.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Campaign Name</th>
                <th className="py-3 px-4">Channel</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-center">Valid Recipients</th>
                <th className="py-3 px-4 text-center">Excluded</th>
                <th className="py-3 px-4">Created / Scheduled</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150 font-medium text-slate-800">
              {filteredCampaigns.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-slate-900">{c.name}</div>
                    <div className="text-[11px] text-slate-500 truncate max-w-xs">{c.subject || 'No subject line'}</div>
                  </td>
                  <td className="py-3.5 px-4 font-bold text-slate-600">
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px]">
                      {c.channel}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                      c.status === 'SENT' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      c.status === 'SCHEDULED' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      c.status === 'SENDING' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      'bg-slate-100 text-slate-600 border-slate-200'
                    }`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-center font-extrabold text-slate-900">
                    {c.valid_recipients || 0}
                  </td>
                  <td className="py-3.5 px-4 text-center text-slate-500 font-semibold">
                    {(c.excluded_duplicates || 0) + (c.excluded_unsubscribed || 0)}
                  </td>
                  <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                    {c.scheduled_at
                      ? `Scheduled: ${new Date(c.scheduled_at).toLocaleString()}`
                      : c.sent_at
                      ? `Sent: ${new Date(c.sent_at).toLocaleDateString()}`
                      : new Date(c.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => onSelectCampaignHistory && onSelectCampaignHistory(c)}
                      className="text-xs font-bold text-blue-600 hover:underline"
                    >
                      History & Audit →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
