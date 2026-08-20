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
  activeSubTab: 'summary' | 'documents' | 'notes' | 'timeline' | 'marketplace' | 'medical' | 'links';
  setActiveSubTab: (tab: 'summary' | 'documents' | 'notes' | 'timeline' | 'marketplace' | 'medical' | 'links') => void;
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
    if (!clientId) return;
    try {
      setLoadingLinks(true);
      const { data, error } = await supabase
        .from('client_links')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLinks(data || []);
    } catch (err) {
      console.error('Failed to load links:', err);
    } finally {
      setLoadingLinks(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  const handleSaveLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLinkError(null);
    if (!linkTitle.trim() || !linkUrl.trim()) {
      setLinkError('Title and URL are required.');
      return;
    }

    try {
      setSavingLink(true);
      const formattedUrl = linkUrl.startsWith('http://') || linkUrl.startsWith('https://')
        ? linkUrl
        : `https://${linkUrl}`;

      const { error } = await supabase
        .from('client_links')
        .insert([{ client_id: clientId, title: linkTitle.trim(), url: formattedUrl }]);

      if (error) throw error;
      setLinkTitle('');
      setLinkUrl('');
      setShowAddLinkModal(false);
      await loadLinks();
    } catch (err: any) {
      console.error('Failed to add link:', err);
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

  const navItems: Array<{ id: 'summary' | 'documents' | 'notes' | 'timeline' | 'marketplace' | 'medical' | 'links'; label: string; icon: string }> = [
    { id: 'summary', label: 'SUMMARY', icon: '📋' },
    { id: 'documents', label: 'DOCUMENTS', icon: '📁' },
    { id: 'notes', label: 'NOTES', icon: '📝' },
    { id: 'timeline', label: 'TIMELINE', icon: '⏱️' },
    { id: 'marketplace', label: 'MARKETPLACE SEARCH', icon: '🔍' },
    { id: 'medical', label: 'HEALTH MEDICAL', icon: '🩺' },
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
