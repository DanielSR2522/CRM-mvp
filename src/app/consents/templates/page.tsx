'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import TemplateList from '@/components/consent-templates/TemplateList';
import TemplatePreview from '@/components/consent-templates/TemplatePreview';
import TemplateStatusBadge from '@/components/consent-templates/TemplateStatusBadge';
import type { ConsentTemplate, ConsentTemplateVersion, TemplateStatus } from '@/lib/consents/types';
import { LANGUAGE_LABELS, TEMPLATE_LANGUAGES, TEMPLATE_STATUSES } from '@/lib/consents/types';
import {
  duplicateTemplate,
  getCurrentVersion,
  listTemplates,
  setTemplateStatus,
} from '@/lib/consents/template-service';
import { formatIsoToUsDate } from '@/utils/dateUtils';

/**
 * Consent Templates — list on the left, live preview of the selection on the right.
 *
 * Every read here is RLS-scoped: listTemplates cannot return another agent's
 * template because consent_templates.agent_id = auth.uid() is enforced in Postgres.
 */
export default function ConsentTemplatesPage() {
  const router = useRouter();

  const [templates, setTemplates] = useState<ConsentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [selected, setSelected] = useState<ConsentTemplate | null>(null);

  /**
   * The loaded preview, tagged with the template it belongs to. Tagging lets the
   * render decide whether what we hold is still relevant, instead of clearing
   * state from an effect every time the selection changes.
   */
  const [versionEntry, setVersionEntry] = useState<{
    templateId: string;
    version: ConsentTemplateVersion | null;
    error: string | null;
  } | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TemplateStatus | ''>('');
  const [languageFilter, setLanguageFilter] = useState('');

  const filtered = Boolean(search.trim() || statusFilter || languageFilter);

  // Bumping this token re-runs the list query. Handlers call reload() rather than
  // fetching directly, so loading state only ever changes inside the effect.
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  // Debounced so typing in the search box does not fire a query per keystroke.
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

          // Keep the current selection if it survived the filter; otherwise select
          // the first result so the preview is never stranded on a hidden row.
          setSelected((prev) => {
            const stillVisible = prev && rows.find((r) => r.id === prev.id);
            return stillVisible ?? rows[0] ?? null;
          });
        } catch (err) {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : 'Could not load templates.');
          setTemplates([]);
          setSelected(null);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search, statusFilter, languageFilter, reloadToken]);

  // Load the selected template's current version for the preview panel.
  useEffect(() => {
    if (!selected) return;

    let cancelled = false;
    const templateId = selected.id;
    const versionNumber = selected.current_version;

    (async () => {
      try {
        const version = await getCurrentVersion(selected);
        if (cancelled) return;
        setVersionEntry({
          templateId,
          version,
          error: version ? null : `Version ${versionNumber} is missing for this template.`,
        });
      } catch (err) {
        if (cancelled) return;
        setVersionEntry({
          templateId,
          version: null,
          error: err instanceof Error ? err.message : 'Could not load the preview.',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selected]);

  // What we hold is only usable if it belongs to the row that is selected now.
  const previewReady = Boolean(selected && versionEntry?.templateId === selected.id);
  const previewVersion = previewReady ? versionEntry?.version ?? null : null;
  const previewError = previewReady ? versionEntry?.error ?? null : null;

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3500);
  };

  const runAction = async (template: ConsentTemplate, action: () => Promise<void>, success: string) => {
    setBusyId(template.id);
    setError(null);
    try {
      await action();
      flash(success);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDuplicate = async (template: ConsentTemplate) => {
    setBusyId(template.id);
    setError(null);
    try {
      const newId = await duplicateTemplate(template);
      flash(`Duplicated "${template.internal_name}".`);
      router.push(`/consents/templates/${newId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not duplicate the template.');
      setBusyId(null);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setLanguageFilter('');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-[1400px]">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Consent Templates</h1>
            <p className="text-sm text-slate-500 mt-1">
              Documents your clients read and sign. Edit here, send from a client profile.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/consents/templates/new')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-[0.98]"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            New Template
          </button>
        </div>

        {/* Alerts */}
        {notice && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
            <p className="text-sm font-semibold text-emerald-800">{notice}</p>
          </div>
        )}
        {error && (
          <div className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-rose-800">Something went wrong</p>
              <p className="text-xs text-rose-700 mt-0.5">{error}</p>
            </div>
            <button
              type="button"
              onClick={reload}
              className="text-xs font-bold text-rose-700 hover:text-rose-900 whitespace-nowrap"
            >
              Retry
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <label htmlFor="tpl-search" className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Search
              </label>
              <input
                id="tpl-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or title"
                className="w-full text-sm text-slate-800 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="tpl-status" className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Status
              </label>
              <select
                id="tpl-status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as TemplateStatus | '')}
                className="w-full text-sm text-slate-800 border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All statuses</option>
                {TEMPLATE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="tpl-lang" className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Language
              </label>
              <select
                id="tpl-lang"
                value={languageFilter}
                onChange={(e) => setLanguageFilter(e.target.value)}
                className="w-full text-sm text-slate-800 border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All languages</option>
                {TEMPLATE_LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {LANGUAGE_LABELS[l]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filtered && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-50">
              <span className="text-xs text-slate-500">
                {loading ? 'Searching…' : `${templates.length} result${templates.length === 1 ? '' : 's'}`}
              </span>
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>

        {/* List + preview */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
          <div className="lg:col-span-3">
            <TemplateList
              templates={templates}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
              loading={loading}
              busyId={busyId}
              filtered={filtered}
              onClearFilters={clearFilters}
              onCreate={() => router.push('/consents/templates/new')}
              onEdit={(t) => router.push(`/consents/templates/${t.id}`)}
              onDuplicate={handleDuplicate}
              onActivate={(t) =>
                runAction(t, () => setTemplateStatus(t.id, 'active'), `"${t.internal_name}" is now active.`)
              }
              onDeactivate={(t) =>
                runAction(t, () => setTemplateStatus(t.id, 'inactive'), `"${t.internal_name}" is now inactive.`)
              }
              onArchive={(t) =>
                runAction(t, () => setTemplateStatus(t.id, 'archived'), `"${t.internal_name}" was archived.`)
              }
            />
          </div>

          {/* Preview panel */}
          <div className="lg:col-span-2 lg:sticky lg:top-6">
            {!selected ? (
              <div className="bg-white border border-slate-100 rounded-2xl p-8 shadow-sm text-center">
                <p className="text-sm text-slate-400">Select a template to preview it.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="text-sm font-extrabold text-slate-900 truncate">
                        {selected.internal_name}
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Created {formatIsoToUsDate(selected.created_at)}
                      </p>
                    </div>
                    <TemplateStatusBadge status={selected.status} />
                  </div>

                  <button
                    type="button"
                    onClick={() => router.push(`/consents/templates/${selected.id}`)}
                    className="w-full mt-3 px-4 py-2 border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 text-slate-700 hover:text-blue-700 text-xs font-bold rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    Open editor
                  </button>
                </div>

                {!previewReady ? (
                  <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
                    <div className="h-5 bg-slate-100 rounded w-1/2 animate-pulse" />
                    <div className="h-3 bg-slate-50 rounded w-full mt-4 animate-pulse" />
                    <div className="h-3 bg-slate-50 rounded w-5/6 mt-2 animate-pulse" />
                  </div>
                ) : previewError ? (
                  <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                    <p className="text-xs font-bold text-amber-800">Preview unavailable</p>
                    <p className="text-xs text-amber-700 mt-0.5">{previewError}</p>
                  </div>
                ) : previewVersion ? (
                  <div className="max-h-[70vh] overflow-y-auto">
                    <TemplatePreview
                      content={previewVersion.content}
                      publicTitle={selected.public_title}
                      consentText={previewVersion.consent_text}
                    />
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
