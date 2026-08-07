'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import TipTapConsentEditor from '@/components/consents/TipTapConsentEditor';
import ConsentVariablesSidebar from '@/components/consents/ConsentVariablesSidebar';
import ConsentPreviewModal from '@/components/consents/ConsentPreviewModal';
import { uploadAndParseDocument } from '@/lib/consents/import-service';
import { saveTemplateDraft, publishTemplate } from '@/lib/consents/template-service';
import type { ConsentTemplate, TemplateLanguage } from '@/lib/consents/types';

interface UnifiedConsentTemplateEditorProps {
  initialTemplate?: ConsentTemplate | null;
  initialHtmlContent?: string;
  initialConsentText?: string;
  isNew?: boolean;
}

export default function UnifiedConsentTemplateEditor({
  initialTemplate,
  initialHtmlContent,
  initialConsentText,
  isNew = false
}: UnifiedConsentTemplateEditorProps) {
  const router = useRouter();
  const editorRef = useRef<any>(null);

  // Creation Mode step (only when creating a new template)
  const [creationMode, setCreationMode] = useState<'select' | 'scratch' | 'import'>(
    isNew ? 'select' : 'scratch'
  );

  // Template Header Metadata
  const [internalName, setInternalName] = useState(initialTemplate?.internal_name || '');
  const [publicTitle, setPublicTitle] = useState(initialTemplate?.public_title || '');
  const [description, setDescription] = useState(initialTemplate?.description || '');
  const [language, setLanguage] = useState<TemplateLanguage>(initialTemplate?.language || 'en');

  // Document Content & Legal Consent Statement
  const [htmlContent, setHtmlContent] = useState(initialHtmlContent || '<p></p>');
  const [consentText, setConsentText] = useState(
    initialConsentText ||
      'I have reviewed this document and agree to use an electronic signature. I understand that my electronic signature represents my intent to sign this document.'
  );

  // Import File state
  const [importing, setImporting] = useState(false);
  const [importedMeta, setImportedMeta] = useState<any>(null);

  // UI & Action states
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setImporting(true);
    setErrorMsg(null);

    try {
      const result = await uploadAndParseDocument(file);

      setHtmlContent(result.html);
      setImportedMeta(result.imported);

      if (!internalName) {
        setInternalName(file.name.replace(/\.[^/.]+$/, ''));
      }
      if (!publicTitle) {
        setPublicTitle(file.name.replace(/\.[^/.]+$/, ''));
      }

      setCreationMode('import');
    } catch (err: any) {
      console.error('Document import failed:', err);
      setErrorMsg(err?.message || 'Failed to parse imported file. Please try another file.');
    } finally {
      setImporting(false);
    }
  };

  const handleInsertVariable = (token: string) => {
    if (editorRef.current) {
      editorRef.current.chain().focus().insertContent(` ${token} `).run();
    } else {
      setHtmlContent(prev => prev + ` ${token} `);
    }
  };

  const handleSaveDraft = async () => {
    if (!internalName.trim()) {
      setErrorMsg('Template Internal Name is required.');
      return;
    }

    setSavingDraft(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const template = await saveTemplateDraft({
        id: initialTemplate?.id,
        internal_name: internalName.trim(),
        public_title: publicTitle.trim() || internalName.trim(),
        description: description.trim() || null,
        language,
        htmlContent,
        consentText,
        imported: importedMeta
      });

      setSuccessMsg('Draft saved successfully.');
      if (isNew && template.id) {
        router.push(`/consents/templates/${template.id}`);
      }
    } catch (err: any) {
      console.error('Error saving template draft:', err);
      setErrorMsg(err?.message || 'Failed to save template draft.');
    } finally {
      setSavingDraft(false);
    }
  };

  const handlePublish = async () => {
    if (!internalName.trim()) {
      setErrorMsg('Template Internal Name is required.');
      return;
    }
    if (!htmlContent.trim() || htmlContent === '<p></p>') {
      setErrorMsg('Document content cannot be empty.');
      return;
    }

    setPublishing(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      // 1. Save draft first to update template record
      const template = await saveTemplateDraft({
        id: initialTemplate?.id,
        internal_name: internalName.trim(),
        public_title: publicTitle.trim() || internalName.trim(),
        description: description.trim() || null,
        language,
        htmlContent,
        consentText,
        imported: importedMeta
      });

      // 2. Publish new version
      await publishTemplate(template.id);

      setSuccessMsg('Template published successfully!');
      setTimeout(() => {
        router.push('/consents/templates');
      }, 1000);
    } catch (err: any) {
      console.error('Error publishing template:', err);
      setErrorMsg(err?.message || 'Failed to publish template.');
      setPublishing(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6 font-sans">
        
        {/* Top Header & Actions */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-extrabold text-slate-900">
                {isNew ? 'Create Consent Template' : 'Edit Consent Template'}
              </h1>
              {initialTemplate && (
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                  initialTemplate.status === 'active'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  {initialTemplate.status === 'active' ? `Published (v${initialTemplate.current_version})` : 'Draft'}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Professional document authoring & variable merging engine
            </p>
          </div>

          {creationMode !== 'select' && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsPreviewOpen(true)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-4 py-2.5 rounded-xl transition-all"
              >
                👁 Preview
              </button>
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={savingDraft || publishing}
                className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold px-4 py-2.5 rounded-xl transition-all disabled:opacity-50"
              >
                {savingDraft ? 'Saving...' : 'Save Draft'}
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={savingDraft || publishing}
                className="bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all shadow-md shadow-blue-500/10 disabled:opacity-50"
              >
                {publishing ? 'Publishing...' : 'Publish Template'}
              </button>
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm font-medium">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm font-medium">
            {successMsg}
          </div>
        )}

        {/* ENTRY SCREEN: SELECT CREATION MODE */}
        {creationMode === 'select' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 md:p-12 shadow-sm space-y-8 text-center max-w-3xl mx-auto">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900">How do you want to create this template?</h2>
              <p className="text-sm text-slate-500 mt-2">
                Choose between starting from a blank canvas or converting an existing document into a reusable consent template.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
              {/* Option A: Create from Scratch */}
              <button
                type="button"
                onClick={() => setCreationMode('scratch')}
                className="p-8 rounded-2xl border-2 border-slate-200 hover:border-blue-600 hover:bg-blue-50/40 text-left transition-all group flex flex-col justify-between space-y-6 shadow-sm hover:shadow-md"
              >
                <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                  📝
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                    Create from Scratch
                  </h3>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    Build the document directly in the rich-text CRM editor with formatting tools, lists, and inline CRM variables.
                  </p>
                </div>
                <span className="text-xs font-bold text-blue-600 flex items-center gap-1 pt-2">
                  Start Blank Template →
                </span>
              </button>

              {/* Option B: Import a Document */}
              <label className="p-8 rounded-2xl border-2 border-slate-200 hover:border-emerald-600 hover:bg-emerald-50/40 text-left transition-all group flex flex-col justify-between space-y-6 shadow-sm hover:shadow-md cursor-pointer">
                <input
                  type="file"
                  accept=".docx,.txt,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={importing}
                />
                <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                  📄
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">
                    Import a Document
                  </h3>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    Upload DOCX, TXT, or PDF documents. Extracted text will automatically convert into the rich-text editor for review.
                  </p>
                </div>
                <span className="text-xs font-bold text-emerald-600 flex items-center gap-1 pt-2">
                  {importing ? 'Extracting File Content...' : 'Upload DOCX / TXT / PDF →'}
                </span>
              </label>
            </div>
          </div>
        )}

        {/* UNIFIED TEMPLATE WORKSPACE */}
        {creationMode !== 'select' && (
          <div className="space-y-6">
            
            {/* Import Warning Banner */}
            {importedMeta && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-amber-900">
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">⚠️</span>
                  <div>
                    <span className="font-bold">Imported Document Source:</span> {importedMeta.source_filename} ({importedMeta.source_type?.toUpperCase()})
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      Review imported text and verify formatting before saving or publishing.
                    </p>
                  </div>
                </div>
                {importedMeta.warning && (
                  <span className="bg-amber-100 text-amber-800 font-semibold px-3 py-1 rounded-xl truncate max-w-sm">
                    {importedMeta.warning}
                  </span>
                )}
              </div>
            )}

            {/* Template Metadata Form */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-3">
                1. Template Information
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Internal Template Name *
                  </label>
                  <input
                    type="text"
                    value={internalName}
                    onChange={e => setInternalName(e.target.value)}
                    placeholder="e.g. ACA Client Consent Form 2026"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-xs outline-none transition-all font-medium"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Public Title (Shown to Signer) *
                  </label>
                  <input
                    type="text"
                    value={publicTitle}
                    onChange={e => setPublicTitle(e.target.value)}
                    placeholder="e.g. Electronic Authorization & Consent"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-xs outline-none transition-all font-medium"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Description (Internal Notes)
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="e.g. Standard consent form required for Marketplace applications."
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-xs outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Language
                  </label>
                  <select
                    value={language}
                    onChange={e => setLanguage(e.target.value as TemplateLanguage)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-xs outline-none font-medium"
                  >
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 2. Main Authoring Grid: TipTap Editor + Variables Sidebar */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left/Center Editor Column */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                    2. Document Body Editor
                  </h3>
                  <span className="text-xs text-slate-400">
                    Continuous Rich-Text Editor
                  </span>
                </div>

                <TipTapConsentEditor
                  content={htmlContent}
                  onChange={setHtmlContent}
                  editorRef={editorRef}
                />
              </div>

              {/* Right Column: CRM Variables Sidebar */}
              <div className="lg:col-span-1">
                <ConsentVariablesSidebar onInsertVariable={handleInsertVariable} />
              </div>
            </div>

            {/* 3. Protected Signing Requirements Section */}
            <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  3. Signing Requirements (Protected Legal Controls)
                </h3>
                <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-full">
                  Appended Automatically
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Signer Role</label>
                  <input
                    type="text"
                    disabled
                    value="Client (Recipient)"
                    className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-600 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Require E-Signature</label>
                  <input
                    type="text"
                    disabled
                    value="Yes (Draw / Type)"
                    className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-600 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Signing Timestamp</label>
                  <input
                    type="text"
                    disabled
                    value="Automatic ISO Timestamp"
                    className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-600 font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Consent Statement Checkbox Text *
                </label>
                <textarea
                  value={consentText}
                  onChange={e => setConsentText(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-xs outline-none transition-all"
                  required
                />
              </div>
            </div>
          </div>
        )}

        {/* Live Preview Modal */}
        <ConsentPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          title={publicTitle || internalName}
          htmlContent={htmlContent}
          consentText={consentText}
        />
      </div>
    </DashboardLayout>
  );
}
