'use client';

import React, { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import UnifiedConsentTemplateEditor from '@/components/consents/UnifiedConsentTemplateEditor';
import type { ConsentTemplate, ConsentTemplateVersion } from '@/lib/consents/types';
import { getTemplate, getCurrentVersion } from '@/lib/consents/template-service';
import { contentToHtml } from '@/lib/consents/template-blocks';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function EditConsentTemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const router = useRouter();
  const { templateId } = use(params);

  const [template, setTemplate] = useState<ConsentTemplate | null>(null);
  const [currentVersion, setCurrentVersion] = useState<ConsentTemplateVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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
        const tpl = await getTemplate(templateId);
        const version = await getCurrentVersion(tpl);
        if (!version) {
          throw new Error(`Version ${tpl.current_version} is missing for this template.`);
        }

        if (cancelled) return;

        setTemplate(tpl);
        setCurrentVersion(version);
      } catch (err: any) {
        if (cancelled) return;
        setLoadError(err?.message || 'Could not load template.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [templateId]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center py-24 font-sans">
          <div className="flex items-center gap-3">
            <svg className="animate-spin h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-xs font-bold text-slate-500">Loading consent template...</span>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (loadError || !template || !currentVersion) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto py-12 font-sans">
          <div className="bg-rose-50 border border-rose-100 rounded-2xl p-6 text-center space-y-4">
            <h3 className="text-lg font-bold text-rose-900">Template Load Error</h3>
            <p className="text-xs text-rose-600">{loadError || 'Template not found or access denied.'}</p>
            <button
              onClick={() => router.push('/consents/templates')}
              className="bg-rose-600 text-white text-xs font-bold px-4 py-2 rounded-xl"
            >
              Return to Templates Library
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const initialHtmlContent = contentToHtml(currentVersion.content);

  return (
    <UnifiedConsentTemplateEditor
      initialTemplate={template}
      initialHtmlContent={initialHtmlContent}
      initialConsentText={currentVersion.consent_text}
      isNew={false}
    />
  );
}
