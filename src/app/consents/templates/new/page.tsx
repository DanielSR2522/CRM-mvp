'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import TemplateWorkspace from '@/components/consent-templates/TemplateWorkspace';
import type { TemplateDraft } from '@/lib/consents/types';
import { createStarterContent } from '@/lib/consents/template-blocks';
import { createTemplate } from '@/lib/consents/template-service';
import { validateTemplateDraft } from '@/lib/consents/validation';

/** Suggested starting point. The agent can rewrite it entirely — nothing is fixed. */
const DEFAULT_CONSENT_TEXT =
  'I have reviewed this document and agree to use an electronic signature. I understand that my electronic signature represents my intent to sign this document.';

export default function NewConsentTemplatePage() {
  const router = useRouter();

  const [draft, setDraft] = useState<TemplateDraft>({
    internal_name: '',
    public_title: '',
    description: '',
    language: 'en',
    content: createStarterContent(),
    consent_text: DEFAULT_CONSENT_TEXT,
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const handleSave = async () => {
    setShowErrors(true);
    setError(null);

    // Validate before touching the network so the user gets a precise message
    // instead of a Postgres constraint name.
    const { valid } = validateTemplateDraft(draft);
    if (!valid) {
      setError('Fix the highlighted fields before saving.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSaving(true);
    try {
      const outcome = await createTemplate(draft);
      // Land on the editor: the template exists now, and this is where publishing
      // and version history live.
      router.push(`/consents/templates/${outcome.templateId}?created=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the template.');
      setSaving(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-[1600px]">
        {/* Header */}
        <div>
          <Link
            href="/consents/templates"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
            </svg>
            Consent Templates
          </Link>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 mt-2">New Template</h1>
          <p className="text-sm text-slate-500 mt-1">
            Saves as a draft at version 1. Nothing is sent to anyone until you create a consent from it.
          </p>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
            <p className="text-sm font-bold text-rose-800">Could not save</p>
            <p className="text-xs text-rose-700 mt-0.5">{error}</p>
          </div>
        )}

        <TemplateWorkspace
          draft={draft}
          onDraftChange={setDraft}
          disabled={saving}
          showErrors={showErrors}
          actions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.push('/consents/templates')}
                disabled={saving}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 active:scale-[0.98]"
              >
                {saving && (
                  <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                )}
                {saving ? 'Creating…' : 'Create Draft'}
              </button>
            </div>
          }
        />
      </div>
    </DashboardLayout>
  );
}
