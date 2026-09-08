'use client';

import React from 'react';
import { MarketingCampaign } from '@/types/marketing';

interface MarketingDashboardViewProps {
  campaigns: MarketingCampaign[];
  onNavigateTab: (tab: any) => void;
  onNewCampaign: () => void;
}

export default function MarketingDashboardView({
  campaigns,
  onNavigateTab,
  onNewCampaign,
}: MarketingDashboardViewProps) {
  const sentCampaigns = campaigns.filter((c) => c.status === 'SENT');
  const totalEmailsSent = sentCampaigns.reduce((acc, c) => acc + (c.valid_recipients || 0), 0);
  const draftCount = campaigns.filter((c) => c.status === 'DRAFT').length;

  const mockDeliveredRate = sentCampaigns.length > 0 ? 98.4 : 0;
  const mockOpenRate = sentCampaigns.length > 0 ? 42.1 : 0;
  const mockClickRate = sentCampaigns.length > 0 ? 14.6 : 0;

  return (
    <div className="space-y-6 font-sans">
      {/* Channel Availability Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-md flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-400">
            Multi-Channel Architecture Status
          </span>
          <h2 className="text-lg font-bold">Email Campaign Engine Active</h2>
          <p className="text-xs text-slate-300">
            SMS and WhatsApp channels are structured in the system architecture and ready for future integration.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 bg-emerald-500/20 border border-emerald-400/30 rounded-xl text-emerald-300 text-xs font-bold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            EMAIL (Active)
          </div>
          <div className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-400 text-xs font-bold opacity-60">
            WHATSAPP (Future)
          </div>
          <div className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-400 text-xs font-bold opacity-60">
            SMS (Future)
          </div>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Campaigns Sent</span>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-slate-900">{sentCampaigns.length}</span>
            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
              {draftCount} Drafts
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Emails Sent</span>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-slate-900">{totalEmailsSent.toLocaleString()}</span>
            <span className="text-xs font-semibold text-slate-500">Recipients</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Delivery Rate</span>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-emerald-600">{sentCampaigns.length > 0 ? `${mockDeliveredRate}%` : '0%'}</span>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">High</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Average Open / Click</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-slate-900">
              {sentCampaigns.length > 0 ? `${mockOpenRate}% / ${mockClickRate}%` : '0% / 0%'}
            </span>
            <span className="text-xs font-semibold text-slate-500">Opens / Clicks</span>
          </div>
        </div>
      </div>

      {/* Main Grid Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Best Performing Campaigns & Recent Campaigns */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900">Recent Campaigns</h3>
              <button
                type="button"
                onClick={() => onNavigateTab('campaigns')}
                className="text-xs font-bold text-blue-600 hover:underline"
              >
                View All Campaigns →
              </button>
            </div>

            {campaigns.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl bg-slate-50/50 space-y-3">
                <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto text-xl">
                  ✉️
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">No Marketing Campaigns Yet</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                    Create your first audience-filtered campaign to reach your clients with policy renewal notices, welcome emails, or promotions.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onNewCampaign}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-md"
                >
                  Create First Campaign
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-150">
                {campaigns.slice(0, 5).map((c) => (
                  <div key={c.id} className="p-4 bg-white hover:bg-slate-50 transition-colors flex items-center justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 truncate">{c.name}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          c.status === 'SENT' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          c.status === 'SCHEDULED' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          c.status === 'SENDING' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>
                          {c.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 truncate">{c.subject || 'No subject line specified'}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="block text-xs font-bold text-slate-900">{c.valid_recipients || 0} Recipients</span>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {c.sent_at ? new Date(c.sent_at).toLocaleDateString() : new Date(c.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Quick Actions & Email Health Widget */}
        <div className="space-y-6">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-2xs space-y-4">
            <h3 className="text-sm font-extrabold text-slate-900">Marketing Quick Actions</h3>
            <div className="space-y-2">
              <button
                type="button"
                onClick={onNewCampaign}
                className="w-full text-left p-3 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors flex items-center justify-between group"
              >
                <div>
                  <span className="block text-xs font-bold text-blue-900">Create Campaign</span>
                  <span className="text-[11px] text-blue-700">4-step audience & content wizard</span>
                </div>
                <span className="text-blue-600 font-bold text-sm group-hover:translate-x-1 transition-transform">→</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('segments')}
                className="w-full text-left p-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors flex items-center justify-between group"
              >
                <div>
                  <span className="block text-xs font-bold text-slate-800">Build Saved Segment</span>
                  <span className="text-[11px] text-slate-500">Filter clients by carrier, state, renewal</span>
                </div>
                <span className="text-slate-400 font-bold text-sm group-hover:translate-x-1 transition-transform">→</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('templates')}
                className="w-full text-left p-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors flex items-center justify-between group"
              >
                <div>
                  <span className="block text-xs font-bold text-slate-800">Email Templates Catalog</span>
                  <span className="text-[11px] text-slate-500">Renewal notices, birthday, welcome templates</span>
                </div>
                <span className="text-slate-400 font-bold text-sm group-hover:translate-x-1 transition-transform">→</span>
              </button>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900">Email Sender Health</h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                Setup Required
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Sender reputation domain checks (SPF, DKIM, DMARC) are unverified. Connect your professional email account to enable full sender domain protection.
            </p>
            <button
              type="button"
              onClick={() => onNavigateTab('settings')}
              className="text-xs font-bold text-blue-600 hover:underline pt-1 inline-block"
            >
              Configure Sender Account →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
