'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DOMPurify from 'isomorphic-dompurify';
import DashboardLayout from '@/components/DashboardLayout';
import CrmPageContainer from '@/components/layout/CrmPageContainer';
import TemplateStatusBadge from '@/components/consent-templates/TemplateStatusBadge';
import type { ConsentTemplate, ConsentTemplateVersion, TemplateStatus } from '@/lib/consents/types';
import {
  listTemplates,
  getCurrentVersion,
  duplicateTemplate,
  deleteTemplate
} from '@/lib/consents/template-service';
import { contentToHtml } from '@/lib/consents/template-blocks';
import { formatIsoToUsDate } from '@/utils/dateUtils';

export default function ConsentTemplatesPage() {
  const router = useRouter();

  const [templates, setTemplates] = useState<ConsentTemplate[]>([]);
  const [selected, setSelected] = useState<ConsentTemplate | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<ConsentTemplateVersion | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingVersion, setLoadingVersion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TemplateStatus | ''>('');
  const [languageFilter, setLanguageFilter] = useState('');

  // UI state
  const [showSigningSection, setShowSigningSection] = useState(false);
  const [deleteModalTemplate, setDeleteModalTemplate] = useState<ConsentTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 4000);
  };

  // Load templates list
  useEffect(() => {
    let cancelled = false;

    const timer = window.setTimeout(() => {
      (async () => {
        setLoading(true);
        setError(null);
        try {
          const rows = await listTemplates({
            search,
            status: statusFilter,
            language: languageFilter,
          });
          if (cancelled) return;

          setTemplates(rows);

          setSelected((prev) => {
            const stillVisible = prev && rows.find((r) => r.id === prev.id);
            return stillVisible ?? rows[0] ?? null;
          });
        } catch (err: any) {
          if (cancelled) return;
          setError(err?.message || 'Could not load consent templates.');
          setTemplates([]);
          setSelected(null);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search, statusFilter, languageFilter, reloadToken]);

  // Load selected template current version
  useEffect(() => {
    let cancelled = false;
    if (!selected) {
      setSelectedVersion(null);
      return;
    }

    (async () => {
      setLoadingVersion(true);
      try {
        const ver = await getCurrentVersion(selected);
        if (!cancelled) setSelectedVersion(ver);
      } catch (err) {
        console.error('Error loading template version:', err);
        if (!cancelled) setSelectedVersion(null);
      } finally {
        if (!cancelled) setLoadingVersion(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selected]);

  const handleDuplicate = async (template: ConsentTemplate) => {
    try {
      setLoading(true);
      const newId = await duplicateTemplate(template);
      flash(`Template duplicated cleanly as draft.`);
      reload();
    } catch (err: any) {
      setError(err?.message || 'Failed to duplicate template.');
      setLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteModalTemplate) return;

    setDeleting(true);
    setDeleteError(null);

    try {
      const deletedId = deleteModalTemplate.id;
      const deletedName = deleteModalTemplate.internal_name;

      await deleteTemplate(deletedId);
      flash(`Template "${deletedName}" deleted.`);

      if (selected?.id === deletedId) {
        setSelected(null);
        setSelectedVersion(null);
      }

      setDeleteModalTemplate(null);
      reload();
    } catch (err: any) {
      console.error('Delete template error:', err);
      setDeleteError(err?.message || 'Failed to delete template.');
    } finally {
      setDeleting(false);
    }
  };

  const renderedHtml = selectedVersion ? contentToHtml(selectedVersion.content) : '<p></p>';

  return (
    <DashboardLayout>
      <CrmPageContainer>
        
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Consent Templates</h1>
            <p className="text-xs text-slate-500 mt-1">
              Create, edit, and manage reusable electronic signature templates.
            </p>
          </div>

          <Link
            href="/consents/templates/new"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-bold px-5 py-3 rounded-xl transition-all shadow-md shadow-blue-500/10"
          >
            <span className="text-base leading-none">+</span> New Template
          </Link>
        </div>

        {notice && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs font-bold animate-fade-in">
            {notice}
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold">
            {error}
          </div>
        )}

        {/* Library Main Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* LEFT COLUMN: Template Cards List & Search */}
          <div className="lg:col-span-5 space-y-4">
            
            {/* Search & Filter Controls */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
              <div className="relative">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search templates..."
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl pl-9 pr-4 py-2.5 text-xs font-medium text-slate-800 outline-none transition-all placeholder-slate-400"
                />
                <svg className="w-4 h-4 text-slate-400 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as TemplateStatus | '')}
                  className="bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 outline-none"
                >
                  <option value="">All Statuses</option>
                  <option value="active">Published</option>
                  <option value="draft">Draft</option>
                </select>

                <select
                  value={languageFilter}
                  onChange={(e) => setLanguageFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 outline-none"
                >
                  <option value="">All Languages</option>
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                </select>
              </div>
            </div>

            {/* Template Card List */}
            <div className="space-y-3 max-h-[750px] overflow-y-auto pr-1">
              {loading ? (
                <div className="p-8 bg-white border border-slate-200 rounded-2xl text-center text-xs text-slate-400 font-medium">
                  Loading templates library...
                </div>
              ) : templates.length === 0 ? (
                <div className="p-8 bg-white border border-slate-200 rounded-2xl text-center space-y-3">
                  <p className="text-xs font-bold text-slate-500">No consent templates found.</p>
                  <Link
                    href="/consents/templates/new"
                    className="inline-block bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs font-bold px-4 py-2 rounded-xl transition-all"
                  >
                    Create Your First Template
                  </Link>
                </div>
              ) : (
                templates.map((tpl) => {
                  const isSelected = selected?.id === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => setSelected(tpl)}
                      className={`w-full text-left p-5 rounded-2xl border transition-all space-y-3 ${
                        isSelected
                          ? 'bg-blue-50/50 border-blue-500 shadow-md ring-1 ring-blue-500'
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <h3 className="text-sm font-extrabold text-slate-900 truncate">
                            {tpl.internal_name}
                          </h3>
                          <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                            {tpl.description || tpl.public_title}
                          </p>
                        </div>
                        <TemplateStatusBadge status={tpl.status} />
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 border-t border-slate-100 pt-3">
                        <div className="flex items-center gap-2">
                          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md uppercase tracking-wider font-bold text-[10px]">
                            {tpl.language}
                          </span>
                          <span>v{tpl.current_version}</span>
                          <span>•</span>
                          <span>{tpl.usage_count || 0} used</span>
                        </div>
                        <span>{formatIsoToUsDate(tpl.updated_at)}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Large Live Preview & Action Bar */}
          <div className="lg:col-span-7">
            {selected ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm space-y-6">
                
                {/* Header & Quick Action Toolbar */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-5 gap-4">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-xl font-extrabold text-slate-900">{selected.internal_name}</h2>
                      <TemplateStatusBadge status={selected.status} />
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Public Title: <span className="font-semibold text-slate-600">{selected.public_title}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/consents/templates/${selected.id}`}
                      className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all"
                    >
                      ✏️ Edit Template
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDuplicate(selected)}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl transition-all"
                    >
                      📋 Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteModalTemplate(selected);
                        setDeleteError(null);
                      }}
                      className="bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold px-3 py-2 rounded-xl transition-all"
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>

                {/* Signing Requirements Section Toggle Switch */}
                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
                  <span className="text-xs font-bold text-slate-700">Protected Legal Signing Section</span>
                  <button
                    type="button"
                    onClick={() => setShowSigningSection(!showSigningSection)}
                    className="text-xs font-extrabold text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    {showSigningSection ? 'Hide signing section' : 'Show signing section'}
                  </button>
                </div>

                {/* Preview Canvas */}
                <div className="border border-slate-200 rounded-2xl p-6 md:p-8 bg-slate-50/50 space-y-6 max-h-[600px] overflow-y-auto">
                  {loadingVersion ? (
                    <div className="text-center py-12 text-xs text-slate-400 font-bold">
                      Loading template preview...
                    </div>
                  ) : (
                    <>
                      {/* Document Body Content */}
                      <div
                        className="prose prose-slate max-w-none bg-white p-8 rounded-xl border border-slate-100 shadow-sm"
                        dangerouslySetInnerHTML={{
                          __html: DOMPurify.sanitize(renderedHtml || '<p className="text-slate-400 italic">No content in template.</p>')
                        }}
                      />

                      {/* Protected Legal Signing Requirements Footer (Shown when toggled or expanded) */}
                      {showSigningSection && (
                        <div className="bg-white border-2 border-slate-200 rounded-xl p-6 shadow-sm space-y-4 animate-fade-in">
                          <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                            <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                            Protected Signing Requirements Footer
                          </span>

                          <div className="flex items-start gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <input type="checkbox" disabled checked className="mt-1 h-4 w-4 text-blue-600 rounded" />
                            <p className="text-xs text-slate-700 font-medium leading-relaxed">
                              {selectedVersion?.consent_text || 'I agree to use an electronic signature.'}
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="border border-dashed border-slate-300 rounded-xl p-4 bg-slate-50 h-20 flex flex-col justify-between">
                              <span className="text-[10px] font-bold text-slate-400 uppercase">E-Signature Box</span>
                              <span className="text-xs text-slate-400 italic">Signer signature captured here</span>
                            </div>
                            <div className="border border-dashed border-slate-300 rounded-xl p-4 bg-slate-50 h-20 flex flex-col justify-between">
                              <span className="text-[10px] font-bold text-slate-400 uppercase">Timestamp</span>
                              <span className="text-xs text-slate-500 font-mono">Date: {new Date().toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 space-y-2">
                <p className="text-sm font-bold">Select a template to view its live preview.</p>
              </div>
            )}
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {deleteModalTemplate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in font-sans">
            <div className="w-full max-w-md bg-white border border-slate-100 rounded-2xl shadow-2xl p-6 space-y-6">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">Delete Template</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Are you sure you want to delete <span className="font-bold text-slate-800">"{deleteModalTemplate.internal_name}"</span>?
                </p>
              </div>

              {deleteError ? (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold leading-relaxed">
                  ⚠️ {deleteError}
                </div>
              ) : (
                <p className="text-xs text-slate-600 bg-amber-50 border border-amber-200 p-4 rounded-xl">
                  Unused templates will be permanently removed. If this template has been used by signature requests, permanent deletion is strictly blocked to preserve audit history.
                </p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteModalTemplate(null)}
                  disabled={deleting}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-4 py-2.5 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={deleting}
                  className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Confirm Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </CrmPageContainer>
    </DashboardLayout>
  );
}
