'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import MarketplacePlanLookupPanel from './MarketplacePlanLookupPanel';
import CollapsibleSidebar from '@/components/common/CollapsibleSidebar';
import { MarketplaceClientContext, MarketplacePlanPreview } from '@/lib/marketplace/types';

export interface ClientLinkItem {
  id: string;
  client_id: string;
  title: string;
  url: string;
  created_at?: string;
}

interface HealthLeftRailProps {
  clientId: string;
  activeSubTab: 'summary' | 'documents' | 'notes' | 'timeline' | 'links';
  setActiveSubTab: (tab: 'summary' | 'documents' | 'notes' | 'timeline' | 'links') => void;
  marketplacePlanData?: any | null;
  marketplaceContextInfo?: {
    context: MarketplaceClientContext;
    planId: string;
    appliedPlan: MarketplacePlanPreview | null;
    onApplyPlan: (plan: MarketplacePlanPreview) => Promise<{ success: boolean; error?: string }> | void;
    addToast: (toast: { title: string; description: string; type: 'success' | 'error' | 'warning' }) => void;
    isEditing: boolean;
  } | null;
}

export default function HealthLeftRail({
  clientId,
  activeSubTab,
  setActiveSubTab,
  marketplacePlanData,
  marketplaceContextInfo
}: HealthLeftRailProps) {
  const [links, setLinks] = useState<ClientLinkItem[]>([]);
  const [loadingLinks, setLoadingLinks] = useState<boolean>(true);
  const [showAddLinkModal, setShowAddLinkModal] = useState<boolean>(false);
  const [linkTitle, setLinkTitle] = useState<string>('');
  const [linkUrl, setLinkUrl] = useState<string>('');
  const [savingLink, setSavingLink] = useState<boolean>(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Accordion state for Plan Benefits
  const [openBenefitGroup, setOpenBenefitGroup] = useState<'overview' | 'medical' | 'drugs' | 'extra' | null>('overview');

  const loadLinks = useCallback(async () => {
    try {
      setLoadingLinks(true);
      const { data, error } = await supabase
        .from('client_links')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setLinks(data);
      }
    } catch (err) {
      console.error('Failed to load client links:', err);
    } finally {
      setLoadingLinks(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  const handleSaveLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkTitle.trim() || !linkUrl.trim() || savingLink) return;

    setSavingLink(true);
    setLinkError(null);

    let cleanUrl = linkUrl.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = 'https://' + cleanUrl;
    }

    try {
      const { error } = await supabase.from('client_links').insert({
        client_id: clientId,
        title: linkTitle.trim(),
        url: cleanUrl
      });

      if (error) throw error;

      setLinkTitle('');
      setLinkUrl('');
      setShowAddLinkModal(false);
      await loadLinks();
    } catch (err: any) {
      console.error('Failed to save link:', err);
      setLinkError(err?.message || 'Failed to save link.');
    } finally {
      setSavingLink(false);
    }
  };

  const handleDeleteLink = async (linkId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { error } = await supabase.from('client_links').delete().eq('id', linkId);
      if (error) throw error;
      await loadLinks();
    } catch (err) {
      console.error('Failed to delete link:', err);
    }
  };

  const navItems: Array<{ id: 'summary' | 'documents' | 'notes' | 'timeline' | 'links'; label: string; icon: string }> = [
    { id: 'summary', label: 'SUMMARY', icon: '📋' },
    { id: 'documents', label: 'DOCUMENTS', icon: '📁' },
    { id: 'notes', label: 'NOTES', icon: '📝' },
    { id: 'timeline', label: 'TIMELINE', icon: '⏱️' },
    { id: 'links', label: 'LINKS', icon: '🔗' },
  ];

  return (
    <CollapsibleSidebar title="Health">
      {/* 1. Contextual Navigation Rail */}
      <div className="space-y-1">
        <span className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider px-2 mb-2">
          Health Workspace
        </span>
        {navItems.map((item) => {
          const isActive = activeSubTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSubTab(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all text-left ${
                isActive
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <span className="text-sm">{item.icon}</span>
              <span className="tracking-wider">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* 2. Links Area */}
      <div className="border-t border-slate-100 pt-4 space-y-3">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Links</span>
          <button
            type="button"
            onClick={() => setShowAddLinkModal(true)}
            className="text-[11px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg transition-all"
          >
            + Add Link
          </button>
        </div>

        {loadingLinks ? (
          <p className="text-xs text-slate-400 italic px-1">Loading links...</p>
        ) : links.length === 0 ? (
          <p className="text-xs text-slate-400 italic px-1">No saved links yet.</p>
        ) : (
          <div className="space-y-1.5">
            {links.map((link) => (
              <div
                key={link.id}
                className="group flex items-center justify-between p-2 rounded-xl bg-slate-50 hover:bg-slate-100 transition-all text-xs"
              >
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-blue-600 hover:underline truncate max-w-[170px]"
                  title={link.url}
                >
                  🔗 {link.title}
                </a>
                <button
                  type="button"
                  onClick={(e) => handleDeleteLink(link.id, e)}
                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 text-[10px] p-0.5 transition-opacity"
                  title="Delete Link"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Marketplace Lookup Area (Above Plan Benefits) */}
      {marketplaceContextInfo && (
        <div className="border-t border-slate-100 pt-4">
          <MarketplacePlanLookupPanel
            initialPlanId={marketplaceContextInfo.planId}
            context={marketplaceContextInfo.context}
            isEditing={marketplaceContextInfo.isEditing}
            onApplyPlan={marketplaceContextInfo.onApplyPlan}
            appliedPlan={marketplaceContextInfo.appliedPlan}
            addToast={marketplaceContextInfo.addToast}
          />
        </div>
      )}

      {/* 4. Plan Benefits Area */}
      <div className="border-t border-slate-100 pt-4 space-y-3">
        <span className="block text-xs font-extrabold text-slate-800 uppercase tracking-wider px-1">
          Plan Benefits
        </span>

        {!marketplacePlanData ? (
          <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center text-xs text-slate-400 font-medium">
            Search a Marketplace plan to view benefits.
          </div>
        ) : (
          <div className="space-y-2 text-xs">
            <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl space-y-1">
              <span className="font-extrabold text-blue-900 block truncate">{marketplacePlanData.name || marketplacePlanData.plan_name || 'Selected Plan'}</span>
              <span className="text-[11px] text-blue-700 font-semibold block">{marketplacePlanData.issuer_name || marketplacePlanData.company_2026 || 'Marketplace Insurer'}</span>
            </div>

            {/* Overview Accordion */}
            <div className="border border-slate-100 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenBenefitGroup(openBenefitGroup === 'overview' ? null : 'overview')}
                className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100 flex items-center justify-between font-bold text-slate-800 text-left"
              >
                <span>Overview</span>
                <span>{openBenefitGroup === 'overview' ? '▲' : '▼'}</span>
              </button>
              {openBenefitGroup === 'overview' && (
                <div className="p-3 space-y-1.5 bg-white text-[11px] text-slate-600 border-t border-slate-100">
                  <div className="flex justify-between"><span>Deductible:</span> <strong>${marketplacePlanData.deductible ?? marketplacePlanData.medical_deductible ?? '—'}</strong></div>
                  <div className="flex justify-between"><span>Max Out of Pocket:</span> <strong>${marketplacePlanData.moop ?? marketplacePlanData.max_out_of_pocket ?? '—'}</strong></div>
                  <div className="flex justify-between"><span>Plan Type:</span> <strong>{marketplacePlanData.type_plan || marketplacePlanData.plan_type || '—'}</strong></div>
                </div>
              )}
            </div>

            {/* Medical Accordion */}
            <div className="border border-slate-100 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenBenefitGroup(openBenefitGroup === 'medical' ? null : 'medical')}
                className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100 flex items-center justify-between font-bold text-slate-800 text-left"
              >
                <span>Medical</span>
                <span>{openBenefitGroup === 'medical' ? '▲' : '▼'}</span>
              </button>
              {openBenefitGroup === 'medical' && (
                <div className="p-3 space-y-1.5 bg-white text-[11px] text-slate-600 border-t border-slate-100">
                  <div className="flex justify-between"><span>Primary Doctor:</span> <strong>${marketplacePlanData.primary_care_copay ?? '—'}</strong></div>
                  <div className="flex justify-between"><span>Specialist:</span> <strong>${marketplacePlanData.specialist_copay ?? '—'}</strong></div>
                  <div className="flex justify-between"><span>Emergency Room:</span> <strong>${marketplacePlanData.emergency_room_copay ?? '—'}</strong></div>
                </div>
              )}
            </div>

            {/* Drugs Accordion */}
            <div className="border border-slate-100 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenBenefitGroup(openBenefitGroup === 'drugs' ? null : 'drugs')}
                className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100 flex items-center justify-between font-bold text-slate-800 text-left"
              >
                <span>Drugs</span>
                <span>{openBenefitGroup === 'drugs' ? '▲' : '▼'}</span>
              </button>
              {openBenefitGroup === 'drugs' && (
                <div className="p-3 space-y-1.5 bg-white text-[11px] text-slate-600 border-t border-slate-100">
                  <div className="flex justify-between"><span>Generic Drugs:</span> <strong>${marketplacePlanData.generic_drug_copay ?? '—'}</strong></div>
                  <div className="flex justify-between"><span>Brand Drugs:</span> <strong>${marketplacePlanData.brand_drug_copay ?? '—'}</strong></div>
                </div>
              )}
            </div>

            {/* Extra Benefits Accordion */}
            <div className="border border-slate-100 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenBenefitGroup(openBenefitGroup === 'extra' ? null : 'extra')}
                className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100 flex items-center justify-between font-bold text-slate-800 text-left"
              >
                <span>Extra Benefits</span>
                <span>{openBenefitGroup === 'extra' ? '▲' : '▼'}</span>
              </button>
              {openBenefitGroup === 'extra' && (
                <div className="p-3 space-y-1.5 bg-white text-[11px] text-slate-600 border-t border-slate-100">
                  <div className="flex justify-between"><span>Dental:</span> <strong>{marketplacePlanData.has_dental ? 'Included' : 'Not Included'}</strong></div>
                  <div className="flex justify-between"><span>Vision:</span> <strong>{marketplacePlanData.has_vision ? 'Included' : 'Not Included'}</strong></div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add Link Modal */}
      {showAddLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs font-sans">
          <div className="bg-white border border-slate-100 rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4 animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="text-sm font-extrabold text-slate-900">Add Link</h4>
              <button type="button" onClick={() => setShowAddLinkModal(false)} className="text-slate-400 hover:text-slate-600 p-1">✕</button>
            </div>

            {linkError && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-600 font-medium">
                {linkError}
              </div>
            )}

            <form onSubmit={handleSaveLink} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-600 uppercase tracking-wider mb-1">Link Title *</label>
                <input
                  type="text"
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value)}
                  placeholder="e.g. Client Portal"
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-2 text-slate-800 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 uppercase tracking-wider mb-1">URL *</label>
                <input
                  type="text"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-2 text-slate-800 outline-none"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddLinkModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingLink}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-xs"
                >
                  {savingLink ? 'Saving...' : 'Save Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </CollapsibleSidebar>
  );
}
