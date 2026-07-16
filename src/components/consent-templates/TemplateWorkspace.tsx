'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import type { TemplateDraft, TemplateLanguage } from '@/lib/consents/types';
import { LANGUAGE_LABELS, TEMPLATE_LANGUAGES } from '@/lib/consents/types';
import { validateTemplateDraft, issuesByField } from '@/lib/consents/validation';
import TemplateEditor from './TemplateEditor';
import TemplatePreview from './TemplatePreview';
import VariablePicker from './VariablePicker';

/**
 * The shared editing surface behind both /new and /[templateId].
 *
 * It owns nothing persistent: the parent supplies the draft and decides what a
 * save means (create, update-in-place, or publish a new version). That split is
 * what keeps the two pages thin while the versioning rules stay in one place.
 */

export interface TemplateWorkspaceProps {
  draft: TemplateDraft;
  onDraftChange: (draft: TemplateDraft) => void;
  /** Rendered in the header — Save/Publish/Duplicate/Archive live in the parent. */
  actions?: React.ReactNode;
  /** Extra panels under the variable picker, e.g. version history. */
  sidebar?: React.ReactNode;
  /** Blocks every input while a save is in flight. */
  disabled?: boolean;
  /** Set once the user has attempted a save, so errors do not shout on first paint. */
  showErrors: boolean;
}

export default function TemplateWorkspace({
  draft,
  onDraftChange,
  actions,
  sidebar,
  disabled = false,
  showErrors,
}: TemplateWorkspaceProps) {
  const [hasFocusTarget, setHasFocusTarget] = useState(false);
  const [consentFocused, setConsentFocused] = useState(false);
  const consentRef = useRef<HTMLTextAreaElement | null>(null);
  const insertRef = useRef<((token: string) => void) | null>(null);

  const validation = useMemo(() => validateTemplateDraft(draft), [draft]);
  const fieldErrors = useMemo(
    () => (showErrors ? issuesByField(validation.issues) : {}),
    [validation.issues, showErrors]
  );

  const patch = useCallback(
    (changes: Partial<TemplateDraft>) => onDraftChange({ ...draft, ...changes }),
    [draft, onDraftChange]
  );

  const registerInsert = useCallback((fn: (token: string) => void) => {
    insertRef.current = fn;
  }, []);

  /**
   * Routes an inserted token to whichever field was last focused. The consent
   * textarea lives outside the block editor, so it needs its own path.
   */
  const handleInsertVariable = (token: string) => {
    if (consentFocused && consentRef.current) {
      const el = consentRef.current;
      const start = el.selectionStart ?? draft.consent_text.length;
      const end = el.selectionEnd ?? draft.consent_text.length;
      const next = draft.consent_text.slice(0, start) + token + draft.consent_text.slice(end);
      patch({ consent_text: next });
      window.setTimeout(() => {
        el.focus();
        const pos = start + token.length;
        el.setSelectionRange(pos, pos);
      }, 0);
      return;
    }
    insertRef.current?.(token);
  };

  const canInsert = (hasFocusTarget || consentFocused) && !disabled;

  return (
    <div className="space-y-6">
      {/* Metadata */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 className="text-sm font-extrabold text-slate-900">Template details</h2>
          {actions}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            id="internal_name"
            label="Internal name"
            hint="Only you see this. Use it to find the template later."
            required
            errors={fieldErrors.internal_name}
          >
            <input
              id="internal_name"
              value={draft.internal_name}
              onChange={(e) => patch({ internal_name: e.target.value })}
              disabled={disabled}
              placeholder="e.g. HO3 renewal disclosure"
              className={inputClass(fieldErrors.internal_name)}
            />
          </Field>

          <Field
            id="public_title"
            label="Public title"
            hint="The heading your client sees on the document."
            required
            errors={fieldErrors.public_title}
          >
            <input
              id="public_title"
              value={draft.public_title}
              onChange={(e) => patch({ public_title: e.target.value })}
              disabled={disabled}
              placeholder="e.g. Homeowners Policy Renewal Consent"
              className={inputClass(fieldErrors.public_title)}
            />
          </Field>

          <Field id="description" label="Description" hint="Internal note. Optional.">
            <input
              id="description"
              value={draft.description}
              onChange={(e) => patch({ description: e.target.value })}
              disabled={disabled}
              placeholder="What this template is for"
              className={inputClass()}
            />
          </Field>

          <Field id="language" label="Language" required errors={fieldErrors.language}>
            <select
              id="language"
              value={draft.language}
              onChange={(e) => patch({ language: e.target.value as TemplateLanguage })}
              disabled={disabled}
              className={inputClass(fieldErrors.language)}
            >
              {TEMPLATE_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {LANGUAGE_LABELS[l]}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      {/* Editor / preview */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: blocks */}
        <div className="xl:col-span-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-slate-900">Document</h2>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {draft.content.blocks.length} block{draft.content.blocks.length === 1 ? '' : 's'}
            </span>
          </div>

          {showErrors && fieldErrors.content && (
            <div className="bg-rose-50 border border-rose-100 rounded-xl px-3 py-2 space-y-0.5">
              {fieldErrors.content.map((msg, i) => (
                <p key={i} className="text-xs text-rose-700 font-medium">
                  {msg}
                </p>
              ))}
            </div>
          )}

          <TemplateEditor
            content={draft.content}
            onChange={(content) => patch({ content })}
            issues={showErrors ? validation.issues : []}
            onRegisterInsert={registerInsert}
            onFocusTargetChange={setHasFocusTarget}
            disabled={disabled}
          />

          {/* Consent statement — stored in its own column, not as a block. */}
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <Field
              id="consent_text"
              label="Consent statement"
              hint="The signer must tick this before they can sign. Stored with every request so later edits cannot rewrite what was agreed."
              required
              errors={fieldErrors.consent_text}
            >
              <textarea
                id="consent_text"
                ref={consentRef}
                value={draft.consent_text}
                onChange={(e) => patch({ consent_text: e.target.value })}
                onFocus={() => setConsentFocused(true)}
                onBlur={() => setConsentFocused(false)}
                disabled={disabled}
                rows={3}
                placeholder="I have reviewed this document and agree to use an electronic signature…"
                className={inputClass(fieldErrors.consent_text) + ' resize-y'}
              />
            </Field>
          </div>
        </div>

        {/* Middle: preview */}
        <div className="xl:col-span-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-extrabold text-slate-900">Preview</h2>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Variables shown as tokens
            </span>
          </div>
          <div className="xl:sticky xl:top-6 max-h-[75vh] overflow-y-auto">
            <TemplatePreview
              content={draft.content}
              publicTitle={draft.public_title}
              consentText={draft.consent_text}
            />
          </div>
        </div>

        {/* Right: variables + extras */}
        <div className="xl:col-span-3 space-y-3">
          <div className="xl:sticky xl:top-6 space-y-3">
            <VariablePicker
              onInsert={handleInsertVariable}
              disabled={!canInsert}
              disabledReason="Click into a text field first."
            />
            {sidebar}
          </div>
        </div>
      </div>
    </div>
  );
}

function inputClass(errors?: string[]): string {
  const base =
    'w-full text-sm text-slate-800 border rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:border-transparent disabled:bg-slate-50 disabled:opacity-60';
  return errors?.length
    ? `${base} border-rose-300 focus:ring-rose-500`
    : `${base} border-slate-200 focus:ring-blue-500`;
}

function Field({
  id,
  label,
  hint,
  required,
  errors,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  errors?: string[];
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
        {label}
        {required && <span className="text-rose-400 ml-0.5">*</span>}
      </label>
      {children}
      {errors?.length ? (
        errors.map((msg, i) => (
          <p key={i} className="text-xs text-rose-600 font-medium mt-1">
            {msg}
          </p>
        ))
      ) : hint ? (
        <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{hint}</p>
      ) : null}
    </div>
  );
}
