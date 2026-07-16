'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type {
  ConsentTemplate,
  ConsentTemplateVersion,
  MergeValues,
  PolicyMergeData,
  TemplateContent,
  UnresolvedVariable,
} from '@/lib/consents/types';
import { LANGUAGE_LABELS } from '@/lib/consents/types';
import { getCurrentVersion } from '@/lib/consents/template-service';
import {
  createConsentDraft,
  listActiveTemplates,
  listClientPolicies,
} from '@/lib/consents/request-service';
import {
  buildMergeData,
  buildMergeSnapshot,
  createCanonicalContentHash,
  findUnresolvedVariables,
  getClientMergeData,
  getPolicyMergeData,
  renderConsentText,
  renderTemplateContent,
} from '@/lib/consents/merge-service';
import {
  DEFAULT_EXPIRY_DAYS,
  MAX_EXPIRY_DAYS,
  MIN_EXPIRY_DAYS,
  expiryFromDays,
  isValidExpiryDays,
} from '@/lib/consents/token-service';
import { formatIsoToUsDate } from '@/utils/dateUtils';
import ConsentPreview from './ConsentPreview';

/**
 * The New Consent wizard.
 *
 * Three steps, but only two of them ask for anything: pick a template and an
 * optional policy, then check the merged document and confirm the signer. The
 * merge itself runs between them and is where all the interesting failure modes
 * live, which is why its warnings get a whole panel rather than a toast.
 *
 * Nothing here sends. The wizard's only write is a draft.
 */

type PolicyOption = {
  id: string;
  policy_number: string | null;
  policy_type: string | null;
  policy_subtype: string | null;
  company_name: string | null;
  status: string | null;
  effective_date: string | null;
  expiration_date: string | null;
};

interface MergedDocument {
  content: TemplateContent;
  consentText: string;
  values: MergeValues;
  unresolved: UnresolvedVariable[];
  hash: string;
}

interface NewConsentFlowProps {
  clientId: string;
  clientName: string;
  onCancel: () => void;
  onCreated: (message: string) => void;
}

type Step = 1 | 2;

export default function NewConsentFlow({
  clientId,
  clientName,
  onCancel,
  onCreated,
}: NewConsentFlowProps) {
  const [step, setStep] = useState<Step>(1);

  // Step 1 inputs
  const [templates, setTemplates] = useState<ConsentTemplate[]>([]);
  const [policies, setPolicies] = useState<PolicyOption[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [policyId, setPolicyId] = useState('');

  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  // Merge output
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [merged, setMerged] = useState<MergedDocument | null>(null);
  const [version, setVersion] = useState<ConsentTemplateVersion | null>(null);
  const [policyData, setPolicyData] = useState<PolicyMergeData | null>(null);

  // Step 2 inputs
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [signerPhone, setSignerPhone] = useState('');
  const [expiryDays, setExpiryDays] = useState(DEFAULT_EXPIRY_DAYS);
  const [title, setTitle] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const template = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId]
  );

  // ---- Load pickers ------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setOptionsLoading(true);
      setOptionsError(null);
      try {
        const [activeTemplates, clientPolicies] = await Promise.all([
          listActiveTemplates(),
          listClientPolicies(clientId),
        ]);
        if (cancelled) return;
        setTemplates(activeTemplates);
        setPolicies(clientPolicies as PolicyOption[]);
      } catch (err) {
        if (cancelled) return;
        setOptionsError(err instanceof Error ? err.message : 'Could not load templates.');
      } finally {
        if (!cancelled) setOptionsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  // ---- Merge -------------------------------------------------------------

  /**
   * Loads real data, renders the document, and hashes it.
   *
   * Everything is recomputed from scratch on every run — no partial reuse — so
   * changing the policy can never leave a stale value behind in the preview.
   */
  const runMerge = useCallback(async () => {
    if (!template) return;

    setMerging(true);
    setMergeError(null);
    setMerged(null);

    try {
      const currentVersion = await getCurrentVersion(template);
      if (!currentVersion) {
        throw new Error(
          `Version ${template.current_version} of "${template.internal_name}" is missing. The template may be corrupted.`
        );
      }

      const client = await getClientMergeData(clientId);
      // getPolicyMergeData verifies the policy belongs to this client. An agent
      // owns many clients, so RLS alone would happily return someone else's
      // policy here.
      const policy = policyId ? await getPolicyMergeData(policyId, clientId) : null;

      const now = new Date();
      const values = buildMergeData(client, policy, now);
      const content = renderTemplateContent(currentVersion.content, values);
      const consentText = renderConsentText(currentVersion.consent_text, values);
      const unresolved = findUnresolvedVariables(
        currentVersion.variables_used,
        values,
        policy !== null
      );
      const hash = await createCanonicalContentHash(content, consentText);

      setVersion(currentVersion);
      setPolicyData(policy);
      setMerged({ content, consentText, values, unresolved, hash });

      // Prefill the signer from the client record — the agent can correct it.
      setSignerName(client.full_name ?? '');
      setSignerEmail(client.email ?? '');
      setSignerPhone(client.phone ?? '');
      setTitle(template.public_title);

      setStep(2);
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : 'Could not build the document.');
    } finally {
      setMerging(false);
    }
  }, [template, clientId, policyId]);

  // ---- Save --------------------------------------------------------------

  const signerNameError = !signerName.trim() ? 'The signer needs a full name.' : null;
  const titleError = !title.trim() ? 'A title is required.' : null;
  const expiryError = !isValidExpiryDays(expiryDays)
    ? `Expiration must be between ${MIN_EXPIRY_DAYS} and ${MAX_EXPIRY_DAYS} days.`
    : null;
  const canSave = !signerNameError && !titleError && !expiryError;

  const handleSave = async () => {
    setShowErrors(true);
    setSaveError(null);

    if (!template || !version || !merged || !canSave) return;

    setSaving(true);
    try {
      const expiresAt = expiryFromDays(expiryDays);
      const snapshot = buildMergeSnapshot(
        merged.values,
        merged.unresolved,
        clientId,
        policyData?.policy_id ?? null,
        merged.consentText
      );

      const result = await createConsentDraft({
        clientId,
        policyId: policyData?.policy_id ?? null,
        template,
        version,
        title,
        renderedContent: merged.content,
        renderedConsentText: merged.consentText,
        mergeSnapshot: snapshot,
        originalDocumentHash: merged.hash,
        signer: {
          fullName: signerName,
          email: signerEmail || null,
          phone: signerPhone || null,
        },
        expiresAt,
      });

      // The raw token is returned once and is not stored. This phase does not
      // deliver it anywhere, so it is intentionally dropped here — Phase 7 owns
      // the link. Reading result.token and doing nothing with it is the correct
      // behaviour today.
      void result.token;

      onCreated(
        result.warning
          ? `Draft saved. ${result.warning}`
          : 'Draft saved. Nothing has been sent to the client yet.'
      );
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the draft.');
      setSaving(false);
    }
  };

  // ---- Render ------------------------------------------------------------

  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
      {/* Header + step indicator */}
      <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900">New Consent</h3>
          <p className="text-xs text-slate-500 mt-0.5">For {clientName}</p>
        </div>
        <div className="flex items-center gap-2">
          <StepDot n={1} active={step === 1} done={step > 1} label="Document" />
          <div className="w-6 h-px bg-slate-200" />
          <StepDot n={2} active={step === 2} done={false} label="Review & signer" />
        </div>
      </div>

      {/* ---- Step 1 ---- */}
      {step === 1 && (
        <div className="p-5 space-y-4">
          {optionsError && <ErrorBox title="Could not load options" message={optionsError} />}
          {mergeError && <ErrorBox title="Could not build the document" message={mergeError} />}

          {optionsLoading ? (
            <div className="space-y-3">
              <div className="h-10 bg-slate-50 rounded-xl animate-pulse" />
              <div className="h-10 bg-slate-50 rounded-xl animate-pulse" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm font-bold text-slate-700">No active templates</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                A consent can only be built from an active template. Create one, or activate an
                existing draft.
              </p>
              <Link
                href="/consents/templates"
                className="inline-block mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors"
              >
                Go to Consent Templates
              </Link>
            </div>
          ) : (
            <>
              {/* Template */}
              <div>
                <label
                  htmlFor="consent-template"
                  className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1"
                >
                  Template <span className="text-rose-400">*</span>
                </label>
                <select
                  id="consent-template"
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="w-full text-sm text-slate-800 border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a template…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.internal_name} · {LANGUAGE_LABELS[t.language]} · v{t.current_version}
                    </option>
                  ))}
                </select>
                {template?.description && (
                  <p className="text-[10px] text-slate-400 mt-1">{template.description}</p>
                )}
              </div>

              {/* Policy */}
              <div>
                <label
                  htmlFor="consent-policy"
                  className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1"
                >
                  Policy <span className="font-medium normal-case tracking-normal text-slate-400">(optional)</span>
                </label>
                {policies.length === 0 ? (
                  <p className="text-xs text-slate-400 border border-slate-100 rounded-xl px-3 py-2 bg-slate-50/60">
                    This client has no policies. Documents using policy fields will show a warning.
                  </p>
                ) : (
                  <select
                    id="consent-policy"
                    value={policyId}
                    onChange={(e) => setPolicyId(e.target.value)}
                    className="w-full text-sm text-slate-800 border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">No policy</option>
                    {policies.map((p) => (
                      <option key={p.id} value={p.id}>
                        {[p.policy_number || 'No number', p.policy_type, p.company_name]
                          .filter(Boolean)
                          .join(' · ')}
                        {p.status ? ` (${p.status})` : ''}
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-[10px] text-slate-400 mt-1">
                  Only policies belonging to this client are listed.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={runMerge}
                  disabled={!templateId || merging}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50 active:scale-[0.98]"
                >
                  {merging && <Spinner />}
                  {merging ? 'Building document…' : 'Continue'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ---- Step 2 ---- */}
      {step === 2 && merged && template && (
        <div className="p-5 space-y-5">
          {saveError && <ErrorBox title="Could not save" message={saveError} />}

          {/* Warnings */}
          {merged.unresolved.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-bold text-amber-800">
                {merged.unresolved.length} field{merged.unresolved.length === 1 ? '' : 's'} could not
                be filled
              </p>
              <ul className="mt-2 space-y-1.5">
                {merged.unresolved.map((u) => (
                  <li key={u.token} className="text-xs text-amber-800">
                    <code className="font-mono font-bold">{`{{${u.token}}}`}</code> — {u.reason}
                  </li>
                ))}
              </ul>
              {merged.unresolved.some((u) => u.needsPolicy) && (
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="mt-3 text-xs font-bold text-amber-900 underline hover:no-underline"
                >
                  Go back and select a policy
                </button>
              )}
              <p className="text-[11px] text-amber-700 mt-2">
                You can still save this draft. The fields will print exactly as highlighted.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            {/* Left: signer + settings */}
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="consent-title"
                  className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1"
                >
                  Title <span className="text-rose-400">*</span>
                </label>
                <input
                  id="consent-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={saving}
                  className={inputClass(showErrors && titleError)}
                />
                {showErrors && titleError && <FieldError message={titleError} />}
              </div>

              <div className="border-t border-slate-50 pt-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Signer
                </p>

                <div className="space-y-3">
                  <div>
                    <label htmlFor="signer-name" className="block text-[10px] font-semibold text-slate-500 mb-1">
                      Full name <span className="text-rose-400">*</span>
                    </label>
                    <input
                      id="signer-name"
                      value={signerName}
                      onChange={(e) => setSignerName(e.target.value)}
                      disabled={saving}
                      className={inputClass(showErrors && signerNameError)}
                    />
                    {showErrors && signerNameError && <FieldError message={signerNameError} />}
                  </div>

                  <div>
                    <label htmlFor="signer-email" className="block text-[10px] font-semibold text-slate-500 mb-1">
                      Email
                    </label>
                    <input
                      id="signer-email"
                      type="email"
                      value={signerEmail}
                      onChange={(e) => setSignerEmail(e.target.value)}
                      disabled={saving}
                      placeholder="Not on file"
                      className={inputClass(false)}
                    />
                    {!signerEmail.trim() && (
                      <p className="text-[10px] text-slate-400 mt-1">
                        Optional for a draft. Required later to send by email.
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="signer-phone" className="block text-[10px] font-semibold text-slate-500 mb-1">
                      Phone
                    </label>
                    <input
                      id="signer-phone"
                      value={signerPhone}
                      onChange={(e) => setSignerPhone(e.target.value)}
                      disabled={saving}
                      placeholder="Not on file"
                      className={inputClass(false)}
                    />
                    {!signerPhone.trim() && (
                      <p className="text-[10px] text-slate-400 mt-1">
                        Optional for a draft. Required later to send by WhatsApp or SMS.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-50 pt-4">
                <label
                  htmlFor="consent-expiry"
                  className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1"
                >
                  Link expires in <span className="text-rose-400">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="consent-expiry"
                    type="number"
                    min={MIN_EXPIRY_DAYS}
                    max={MAX_EXPIRY_DAYS}
                    value={expiryDays}
                    onChange={(e) => setExpiryDays(Number(e.target.value))}
                    disabled={saving}
                    className={`w-24 ${inputClass(showErrors && expiryError)}`}
                  />
                  <span className="text-xs text-slate-500">
                    days — {formatIsoToUsDate(expiryFromDays(isValidExpiryDays(expiryDays) ? expiryDays : DEFAULT_EXPIRY_DAYS).toISOString())}
                  </span>
                </div>
                {showErrors && expiryError && <FieldError message={expiryError} />}
              </div>

              {/* Summary */}
              <div className="border-t border-slate-50 pt-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Summary
                </p>
                <dl className="space-y-1.5 text-xs">
                  <SummaryRow label="Client" value={clientName} />
                  <SummaryRow label="Template" value={`${template.internal_name} (v${template.current_version})`} />
                  <SummaryRow
                    label="Policy"
                    value={
                      policyData
                        ? [policyData.policy_number || 'No number', policyData.policy_type]
                            .filter(Boolean)
                            .join(' · ')
                        : 'None'
                    }
                  />
                  <SummaryRow label="Fields filled" value={`${Object.keys(merged.values).length}`} />
                  <SummaryRow
                    label="Document hash"
                    value={merged.hash.slice(0, 16) + '…'}
                    mono
                    title={merged.hash}
                  />
                </dl>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-50">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={saving}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-xl transition-colors disabled:opacity-50"
                >
                  Back
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onCancel}
                    disabled={saving}
                    className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-xl transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-60 active:scale-[0.98]"
                  >
                    {saving && <Spinner />}
                    {saving ? 'Saving…' : 'Save as Draft'}
                  </button>
                </div>
              </div>

              <p className="text-[10px] text-slate-400 text-center">
                Saving does not send anything. Delivery comes later.
              </p>
            </div>

            {/* Right: the real document */}
            <div className="lg:sticky lg:top-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                Document preview — real client data
              </p>
              <div className="max-h-[60vh] overflow-y-auto border border-slate-100 rounded-2xl">
                <ConsentPreview
                  content={merged.content}
                  publicTitle={title}
                  consentText={merged.consentText}
                  bare
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function inputClass(hasError: unknown): string {
  const base =
    'w-full text-sm text-slate-800 border rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:border-transparent disabled:bg-slate-50 disabled:opacity-60';
  return hasError ? `${base} border-rose-300 focus:ring-rose-500` : `${base} border-slate-200 focus:ring-blue-500`;
}

function FieldError({ message }: { message: string }) {
  return <p className="text-xs text-rose-600 font-medium mt-1">{message}</p>;
}

function ErrorBox({ title, message }: { title: string; message: string }) {
  return (
    <div className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
      <p className="text-sm font-bold text-rose-800">{title}</p>
      <p className="text-xs text-rose-700 mt-0.5">{message}</p>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  mono,
  title,
}: {
  label: string;
  value: string;
  mono?: boolean;
  title?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-400 font-semibold flex-shrink-0">{label}</dt>
      <dd
        className={`text-slate-700 font-semibold text-right truncate ${mono ? 'font-mono text-[10px]' : ''}`}
        title={title}
      >
        {value}
      </dd>
    </div>
  );
}

function StepDot({ n, active, done, label }: { n: number; active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5" title={label}>
      <span
        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
          done
            ? 'bg-emerald-100 text-emerald-700'
            : active
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-400'
        }`}
      >
        {done ? '✓' : n}
      </span>
      <span className={`text-[10px] font-bold hidden sm:inline ${active ? 'text-slate-700' : 'text-slate-400'}`}>
        {label}
      </span>
    </div>
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
