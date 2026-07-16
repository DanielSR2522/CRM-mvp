'use client';

import React, { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import TemplateWorkspace from '@/components/consent-templates/TemplateWorkspace';
import TemplateStatusBadge from '@/components/consent-templates/TemplateStatusBadge';
import TemplateVersionHistory from '@/components/consent-templates/TemplateVersionHistory';
import type {
  ConsentTemplate,
  ConsentTemplateVersion,
  TemplateDraft,
} from '@/lib/consents/types';
import { emptyContent } from '@/lib/consents/template-blocks';
import {
  duplicateTemplate,
  getCurrentVersion,
  getTemplate,
  isVersionUsed,
  listVersions,
  saveTemplateBody,
  setTemplateStatus,
  updateTemplateMeta,
} from '@/lib/consents/template-service';
import { validateTemplateDraft } from '@/lib/consents/validation';
import { formatIsoToUsDate } from '@/utils/dateUtils';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function EditConsentTemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { templateId } = use(params);

  const [template, setTemplate] = useState<ConsentTemplate | null>(null);
  const [currentVersion, setCurrentVersion] = useState<ConsentTemplateVersion | null>(null);
  const [versions, setVersions] = useState<ConsentTemplateVersion[]>([]);
  const [versionUsed, setVersionUsed] = useState(false);

  const [draft, setDraft] = useState<TemplateDraft>({
    internal_name: '',
    public_title: '',
    description: '',
    language: 'en',
    content: emptyContent(),
    consent_text: '',
  });

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  // The "created" banner is derived from the URL during the first render rather
  // than pushed in from an effect, so there is no cascading re-render on arrival.
  const justCreated = searchParams.get('created') === '1';
  const [notice, setNotice] = useState<string | null>(
    justCreated ? 'Template created as a draft at version 1.' : null
  );

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3500);
  };

  // Bumping this token re-runs the fetch. Handlers call reload() instead of
  // invoking the fetch directly, which keeps all loading state changes inside the
  // effect and out of the render path.
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!UUID_PATTERN.test(templateId)) {
        setLoadError('That template id is not valid.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(null);

      try {
        // RLS makes another agent's template look exactly like a missing one, so a
        // single "not found" covers both cases without confirming existence.
        const tpl = await getTemplate(templateId);
        const version = await getCurrentVersion(tpl);
        if (!version) {
          throw new Error(`Version ${tpl.current_version} is missing for this template.`);
        }

        const [allVersions, used] = await Promise.all([
          listVersions(tpl.id),
          isVersionUsed(version.id),
        ]);

        // A newer request may have superseded this one while we awaited.
        if (cancelled) return;

        setTemplate(tpl);
        setCurrentVersion(version);
        setVersions(allVersions);
        setVersionUsed(used);
        setDraft({
          internal_name: tpl.internal_name,
          public_title: tpl.public_title,
          description: tpl.description ?? '',
          language: tpl.language,
          content: version.content,
          consent_text: version.consent_text,
        });
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Could not load the template.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [templateId, reloadToken]);

  // Strip the ?created flag and let the banner time out. Both are external
  // effects — the URL and a timer — not state synchronisation.
  useEffect(() => {
    if (!justCreated) return;
    router.replace(`/consents/templates/${templateId}`);
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [justCreated, router, templateId]);

  const isArchived = template?.status === 'archived';
  const readOnly = saving || isArchived;

  const handleSave = async (forceNewVersion: boolean) => {
    if (!template) return;
    setShowErrors(true);
    setError(null);

    const { valid } = validateTemplateDraft(draft);
    if (!valid) {
      setError('Fix the highlighted fields before saving.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSaving(true);
    try {
      // Metadata lives on the template row and is not versioned, so it always
      // saves in place.
      await updateTemplateMeta(template.id, {
        internal_name: draft.internal_name,
        public_title: draft.public_title,
        description: draft.description,
        language: draft.language,
      });

      const outcome = await saveTemplateBody(template, draft, { forceNewVersion });

      if (outcome.kind === 'version_published') {
        flash(`Published version ${outcome.version}. Earlier versions are kept.`);
      } else {
        flash(`Saved version ${outcome.version}.`);
      }

      // Refetch so current_version, usage and the version list reflect what the
      // database now holds rather than what we assumed it would.
      reload();
      setShowErrors(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the template.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async (status: 'active' | 'inactive' | 'archived') => {
    if (!template) return;
    setSaving(true);
    setError(null);
    try {
      await setTemplateStatus(template.id, status);
      flash(
        status === 'archived'
          ? 'Template archived. It stays available for existing consents.'
          : `Template is now ${status}.`
      );
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the status.');
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async () => {
    if (!template) return;
    setSaving(true);
    setError(null);
    try {
      const newId = await duplicateTemplate(template);
      router.push(`/consents/templates/${newId}?created=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not duplicate the template.');
      setSaving(false);
    }
  };

  // ---- Loading / error states ------------------------------------------

  if (loading) {
    return (
      <DashboardLayout>
        <div className="max-w-[1600px] space-y-6">
          <div className="h-4 bg-slate-100 rounded w-40 animate-pulse" />
          <div className="h-8 bg-slate-100 rounded w-72 animate-pulse" />
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
            <div className="h-4 bg-slate-100 rounded w-32 animate-pulse" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-slate-50 rounded-xl animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (loadError || !template || !currentVersion) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl">
          <Link
            href="/consents/templates"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
            </svg>
            Consent Templates
          </Link>

          <div className="bg-white border border-slate-100 rounded-2xl p-8 shadow-sm text-center mt-4">
            <div className="w-12 h-12 mx-auto rounded-xl bg-rose-50 flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.72-3L13.72 4a2 2 0 00-3.44 0L3.35 16a2 2 0 001.72 3z"
                />
              </svg>
            </div>
            <p className="text-sm font-bold text-slate-800">Template unavailable</p>
            <p className="text-xs text-slate-500 mt-1">{loadError}</p>
            <div className="flex items-center justify-center gap-2 mt-5">
              <button
                type="button"
                onClick={reload}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-colors"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => router.push('/consents/templates')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors"
              >
                Back to templates
              </button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ---- Loaded ------------------------------------------------------------

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-[1600px]">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="min-w-0">
            <Link
              href="/consents/templates"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
              </svg>
              Consent Templates
            </Link>

            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 truncate">
                {template.internal_name}
              </h1>
              <TemplateStatusBadge status={template.status} />
            </div>

            <div className="flex items-center gap-3 mt-2 flex-wrap text-xs text-slate-500">
              <span>
                Version <strong className="text-slate-700">v{template.current_version}</strong>
              </span>
              <span className="text-slate-300">·</span>
              <span>
                {template.usage_count} use{template.usage_count === 1 ? '' : 's'}
              </span>
              <span className="text-slate-300">·</span>
              <span>Created {formatIsoToUsDate(template.created_at)}</span>
              <span className="text-slate-300">·</span>
              <span>Updated {formatIsoToUsDate(template.updated_at)}</span>
            </div>
          </div>

          {/* Status actions */}
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            <button
              type="button"
              onClick={handleDuplicate}
              disabled={saving}
              className="px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50"
            >
              Duplicate
            </button>

            {template.status !== 'active' && !isArchived && (
              <button
                type="button"
                onClick={() => handleStatus('active')}
                disabled={saving}
                className="px-3 py-2 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
              >
                Activate
              </button>
            )}
            {template.status === 'active' && (
              <button
                type="button"
                onClick={() => handleStatus('inactive')}
                disabled={saving}
                className="px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50"
              >
                Deactivate
              </button>
            )}
            {isArchived ? (
              <button
                type="button"
                onClick={() => handleStatus('inactive')}
                disabled={saving}
                className="px-3 py-2 border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                Restore
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleStatus('archived')}
                disabled={saving}
                className="px-3 py-2 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:opacity-50"
              >
                Archive
              </button>
            )}
          </div>
        </div>

        {/* Alerts */}
        {notice && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
            <p className="text-sm font-semibold text-emerald-800">{notice}</p>
          </div>
        )}
        {error && (
          <div className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
            <p className="text-sm font-bold text-rose-800">Could not save</p>
            <p className="text-xs text-rose-700 mt-0.5">{error}</p>
          </div>
        )}

        {isArchived && (
          <div className="bg-slate-100 border border-slate-200 rounded-xl px-4 py-3">
            <p className="text-sm font-bold text-slate-700">This template is archived</p>
            <p className="text-xs text-slate-500 mt-0.5">
              It is read-only and cannot be used for new consents. Restore it to edit.
            </p>
          </div>
        )}

        {versionUsed && !isArchived && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
            <p className="text-sm font-bold text-blue-800">
              Version {template.current_version} has already been used
            </p>
            <p className="text-xs text-blue-700 mt-0.5">
              Consents were created from it, so it is frozen — that is what guarantees a signed
              document still says what the client agreed to. Saving will publish version{' '}
              {template.current_version + 1} instead, leaving earlier versions untouched.
            </p>
          </div>
        )}

        <TemplateWorkspace
          draft={draft}
          onDraftChange={setDraft}
          disabled={readOnly}
          showErrors={showErrors}
          actions={
            <div className="flex items-center gap-2">
              {versionUsed ? (
                <button
                  type="button"
                  onClick={() => handleSave(true)}
                  disabled={readOnly}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 active:scale-[0.98]"
                >
                  {saving && <Spinner />}
                  {saving ? 'Publishing…' : `Publish v${template.current_version + 1}`}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => handleSave(false)}
                    disabled={readOnly}
                    className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50"
                  >
                    {saving && <Spinner />}
                    {saving ? 'Saving…' : 'Save Draft'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSave(true)}
                    disabled={readOnly}
                    title={`Freeze v${template.current_version} and start v${template.current_version + 1}`}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 active:scale-[0.98]"
                  >
                    Publish New Version
                  </button>
                </>
              )}
            </div>
          }
          sidebar={
            <TemplateVersionHistory
              versions={versions}
              currentVersion={template.current_version}
              loading={false}
            />
          }
        />
      </div>
    </DashboardLayout>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
