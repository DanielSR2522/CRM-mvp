'use client';

import React from 'react';

export type MarketingTab =
  | 'dashboard'
  | 'campaigns'
  | 'segments'
  | 'templates'
  | 'automations'
  | 'reports'
  | 'email-health'
  | 'settings';

interface MarketingHeaderProps {
  activeTab: MarketingTab;
  onTabChange: (tab: MarketingTab) => void;
  onNewCampaignClick?: () => void;
}

export default function MarketingHeader({
  activeTab,
  onTabChange,
  onNewCampaignClick,
}: MarketingHeaderProps) {
  const tabs: { id: MarketingTab; label: string; badge?: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'campaigns', label: 'Campaigns' },
    { id: 'segments', label: 'Segments' },
    { id: 'templates', label: 'Templates' },
    { id: 'automations', label: 'Automations' },
    { id: 'reports', label: 'Reports' },
    { id: 'email-health', label: 'Email Health' },
    { id: 'settings', label: 'Connected Accounts' },
  ];

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-4 font-sans shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-md shadow-blue-500/20">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.2"
                d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.684A1.761 1.761 0 013 12c0-.97.784-1.76 1.75-1.76.27 0 .524.06.75.172l6.25 3.125m0 0a1.76 1.76 0 012.75-1.423"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight leading-tight">
              Marketing Module
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              SmarTrack CRM • Invernalia Campaign & Audience System
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            EMAIL Channel Active
          </span>
          <button
            type="button"
            onClick={onNewCampaignClick}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-blue-600/10 flex items-center gap-2"
          >
            <span>+</span> Create Campaign
          </button>
        </div>
      </div>

      {/* Primary Sub-Navigation Tabs */}
      <nav className="flex flex-wrap items-center gap-1 border-t border-slate-100 pt-3">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
                isActive
                  ? 'bg-blue-50 text-blue-600 font-extrabold shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
