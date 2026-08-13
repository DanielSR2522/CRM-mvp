'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBusinessLines } from '@/contexts/BusinessLinesContext';

interface HealthClientHeaderProps {
  clientId: string;
  clientName: string;
  photoUrl?: string | null;
  lastUpdated?: string | null;
  onSendEmail?: () => void;
  onConsent?: () => void;
  onDeleteProfile?: () => void;
  isCompanyClient?: boolean;
  activeSection?: 'overview' | 'personal-information' | 'health' | 'medicare' | 'supplemental' | 'life' | 'policies' | 'documents' | 'notes' | 'timeline';
}

export default function HealthClientHeader({
  clientId,
  clientName,
  photoUrl,
  lastUpdated,
  onSendEmail,
  onConsent,
  onDeleteProfile,
  isCompanyClient = false,
  activeSection = 'health',
}: HealthClientHeaderProps) {
  const router = useRouter();
  const { isLineEnabled } = useBusinessLines();
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const getInitials = (name: string) => {
    if (!name) return 'C';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  const navTab = (label: string, section: string, isActive: boolean) => (
    <button
      key={section}
      type="button"
      onClick={() => router.push(`/clients/${clientId}?section=${section}`)}
      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
        isActive
          ? 'bg-blue-50 text-blue-700 border border-blue-100 font-extrabold shadow-2xs'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {label}
    </button>
  );

  const activeBadgeLabel = activeSection === 'medicare'
    ? 'Medicare Active'
    : activeSection === 'supplemental'
    ? 'Supplemental Active'
    : activeSection === 'life'
    ? 'Life Active'
    : activeSection === 'policies'
    ? 'P&C Active'
    : activeSection === 'health'
    ? 'Health Active'
    : 'Client Profile';

  return (
    <div className="bg-white border-b border-slate-200 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 font-sans shadow-2xs">
      {/* Left side: Back arrow, Avatar, Name & Level 1 Client Profile Navigation */}
      <div className="flex flex-wrap items-center gap-4 min-w-0 flex-1">
        <div className="flex items-center gap-3.5 shrink-0">
          <button
            type="button"
            onClick={() => router.push('/clients')}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
            title="Back to Clients List"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="relative">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={clientName}
                className="w-10 h-10 rounded-full object-cover border border-slate-200 shadow-2xs"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-extrabold text-sm flex items-center justify-center border border-blue-500 shadow-2xs">
                {getInitials(clientName)}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold text-slate-900 tracking-tight">{clientName || 'Client Profile'}</h1>
              <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-100 uppercase tracking-wider">
                {activeBadgeLabel}
              </span>
            </div>
            {lastUpdated && (
              <span className="text-[11px] font-medium text-slate-400 block">
                Last updated: {lastUpdated}
              </span>
            )}
          </div>
        </div>

        {/* Level 1 Dynamic Navigation beside Client Profile identity */}
        <nav className="flex flex-wrap items-center gap-1 border-l border-slate-200 pl-4 py-0.5 font-sans">
          {navTab('Overview', 'overview', activeSection === 'overview')}
          {navTab(isCompanyClient ? 'Company Information' : 'Personal Info', 'personal-information', activeSection === 'personal-information')}
          {isLineEnabled('health') && navTab('Health', 'health', activeSection === 'health')}
          {isLineEnabled('medicare') && navTab('Medicare', 'medicare', activeSection === 'medicare')}
          {isLineEnabled('supplemental') && navTab('Supplemental', 'supplemental', activeSection === 'supplemental')}
          {!isCompanyClient && isLineEnabled('life') && navTab('Life', 'life', activeSection === 'life')}
          {isLineEnabled('property_casualty') && navTab('Property & Casualty', 'policies', activeSection === 'policies')}
          {navTab('Documents', 'documents', activeSection === 'documents')}
          {navTab('Notes', 'notes', activeSection === 'notes')}
          {navTab('Timeline', 'timeline', activeSection === 'timeline')}
        </nav>
      </div>

      {/* Right side: Action Buttons */}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onSendEmail}
          className="px-3.5 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 rounded-xl transition-all shadow-2xs flex items-center gap-1.5"
        >
          <span>✉️</span> Send Email
        </button>

        <button
          type="button"
          onClick={onConsent}
          className="px-3.5 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 rounded-xl transition-all shadow-2xs flex items-center gap-1.5"
        >
          <span>📝</span> Consent
        </button>

        <button
          type="button"
          onClick={onDeleteProfile}
          className="px-3.5 py-1.5 text-xs font-bold text-rose-700 bg-rose-50/80 border border-rose-200 hover:bg-rose-100 rounded-xl transition-all flex items-center gap-1.5"
        >
          <span>🗑️</span> Delete Profile
        </button>

        {/* More Menu Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            className="p-1.5 text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
            title="More Options"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>

          {showMoreMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-50 text-xs font-medium animate-scale-up">
              <button
                type="button"
                onClick={() => {
                  setShowMoreMenu(false);
                  window.location.reload();
                }}
                className="w-full px-4 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2"
              >
                🔄 Refresh Page
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
