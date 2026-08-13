'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import CollapsibleSidebar from '@/components/common/CollapsibleSidebar';
import LifeProfileHeader from './LifeProfileHeader';

export interface ClientLinkItem {
  id: string;
  client_id: string;
  title: string;
  url: string;
  created_at?: string;
}

interface LifeLeftRailProps {
  clientId: string;
  activeSubTab: 'summary' | 'documents' | 'notes' | 'timeline' | 'links';
  setActiveSubTab: (tab: 'summary' | 'documents' | 'notes' | 'timeline' | 'links') => void;
}

export default function LifeLeftRail({
  clientId,
  activeSubTab,
  setActiveSubTab,
}: LifeLeftRailProps) {
  const [links, setLinks] = useState<ClientLinkItem[]>([]);
  const [loadingLinks, setLoadingLinks] = useState<boolean>(true);
  const [showAddLinkModal, setShowAddLinkModal] = useState<boolean>(false);
  const [newLinkTitle, setNewLinkTitle] = useState<string>('');
  const [newLinkUrl, setNewLinkUrl] = useState<string>('');
  const [addingLink, setAddingLink] = useState<boolean>(false);

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
      console.error('Failed to load client links:', err);
    } finally {
      setLoadingLinks(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  const handleAddLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLinkTitle.trim() || !newLinkUrl.trim() || !clientId) return;

    try {
      setAddingLink(true);
      let formattedUrl = newLinkUrl.trim();
      if (!/^https?:\/\//i.test(formattedUrl)) {
        formattedUrl = `https://${formattedUrl}`;
      }

      const { error } = await supabase.from('client_links').insert({
        client_id: clientId,
        title: newLinkTitle.trim(),
        url: formattedUrl,
      });

      if (error) throw error;

      setNewLinkTitle('');
      setNewLinkUrl('');
      setShowAddLinkModal(false);
      await loadLinks();
    } catch (err) {
      console.error('Failed to add client link:', err);
    } finally {
      setAddingLink(false);
    }
  };

  const handleDeleteLink = async (linkId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
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
    <CollapsibleSidebar title="Life">
      {/* 1. Contextual Navigation Rail */}
      <div className="space-y-1">
        <span className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider px-2 mb-2">
          Life Workspace
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

      {/* 3. CLIENT LIFE PROFILE Box (Placed DIRECTLY AFTER Links) */}
      <div className="border-t border-slate-100 pt-4">
        <LifeProfileHeader clientId={clientId} />
      </div>

      {/* Add Link Modal */}
      {showAddLinkModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-2xl max-w-sm w-full space-y-4 font-sans">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h4 className="text-sm font-extrabold text-slate-900">Add External Link</h4>
              <button
                type="button"
                onClick={() => setShowAddLinkModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddLink} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">Title *</label>
                <input
                  type="text"
                  value={newLinkTitle}
                  onChange={(e) => setNewLinkTitle(e.target.value)}
                  placeholder="e.g. Carrier Portal, Life Illustration"
                  required
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2 text-slate-900 text-xs outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">URL *</label>
                <input
                  type="text"
                  value={newLinkUrl}
                  onChange={(e) => setNewLinkUrl(e.target.value)}
                  placeholder="https://..."
                  required
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2 text-slate-900 text-xs outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddLinkModal(false)}
                  className="px-3.5 py-1.5 font-bold text-slate-600 hover:text-slate-800 bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingLink}
                  className="px-3.5 py-1.5 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs"
                >
                  {addingLink ? 'Saving...' : 'Add Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </CollapsibleSidebar>
  );
}
