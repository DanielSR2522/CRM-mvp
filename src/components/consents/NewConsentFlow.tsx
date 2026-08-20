'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import type {
  ClientConsentRow,
  ConsentTemplate,
  ConsentTemplateVersion,
  DashboardConsentRow,
  MergeValues,
  PolicyMergeData,
  TemplateContent,
  UnresolvedVariable,
} from '@/lib/consents/types';
import { LANGUAGE_LABELS } from '@/lib/consents/types';
import { getCurrentVersion, getTemplate, getVersionById } from '@/lib/consents/template-service';
import {
  createConsentDraft,
  getConsent,
  getPrimarySigner,
  listActiveTemplates,
  listClientPolicies,
  updateConsentDraft,
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
import { deliverConsent } from '@/lib/delivery/delivery-service';
import { formatIsoToUsDate } from '@/utils/dateUtils';
import ConsentPreview from './ConsentPreview';

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

interface VariableDrift {
  token: string;
  before: string;
  after: string;
}

function findDrift(before: MergeValues, after: MergeValues): VariableDrift[] {
  const tokens = new Set([...Object.keys(before), ...Object.keys(after)]);
  const drifted: VariableDrift[] = [];

  for (const token of Array.from(tokens).sort()) {
    const oldValue = before[token];
    const newValue = after[token];
    if (oldValue === newValue) continue;
    drifted.push({
      token,
      before: oldValue ?? '(empty)',
      after: newValue ?? '(empty)',
    });
  }
  return drifted;
}

interface NewConsentFlowProps {
  clientId: string;
  clientName: string;
  initialPolicyId?: string | null;
  onCancel: () => void;
  onCreated: (message: string) => void;
  editDraft?: DashboardConsentRow | ClientConsentRow;
}

type Step = 1 | 2;
type DocumentChoice = 'keep' | 'regenerate';

export default function NewConsentFlow({
  clientId,
  clientName,
  initialPolicyId,
  onCancel,
  onCreated,
  editDraft,
}: NewConsentFlowProps) {
  const isEditing = Boolean(editDraft);
  const [step, setStep] = useState<Step>(isEditing ? 2 : 1);

  // Step 1 inputs
  const [templates, setTemplates] = useState<ConsentTemplate[]>([]);
  const [policies, setPolicies] = useState<PolicyOption[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [policyId, setPolicyId] = useState('');
  const [templateSearch, setTemplateSearch] = useState('');

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

  // Delivery Channel Modal State
  const [isChannelModalOpen, setIsChannelModalOpen] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<'whatsapp' | 'email' | 'sms'>('whatsapp');
  const [sendingConsent, setSendingConsent] = useState(false);

  // Editing draft state
  const [editLoading, setEditLoading] = useState(isEditing);
  const [editTemplate, setEditTemplate] = useState<ConsentTemplate | null>(null);
  const [documentChoice, setDocumentChoice] = useState<DocumentChoice>('keep');
  const [drift, setDrift] = useState<VariableDrift[]>([]);
  const [freshMerge, setFreshMerge] = useState<MergedDocument | null>(null);

  const template = useMemo(
    () => (isEditing ? editTemplate : templates.find((t) => t.id === templateId) ?? null),
    [isEditing, editTemplate, templates, templateId]
  );

  // Load active templates & client policies (with strict ownership validation)
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

        // STRICT POLICY OWNERSHIP VALIDATION:
        // Only set policyId if initialPolicyId actually belongs to this client!
        if (initialPolicyId) {
          const matched = clientPolicies.find((p) => p.id === initialPolicyId);
          if (matched) {
            setPolicyId(matched.id);
          } else {
            setPolicyId('');
          }
        } else {
          setPolicyId('');
        }
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
  }, [clientId, initialPolicyId]);

  // Load existing draft
  useEffect(() => {
    if (!editDraft) return;
    let cancelled = false;

    (async () => {
      setEditLoading(true);
      setMergeError(null);

      try {
        const [tpl, storedVersion, signer] = await Promise.all([
          getTemplate(editDraft.template_id),
          getVersionById(editDraft.template_version_id),
          getPrimarySigner(editDraft.id),
        ]);

        if (!storedVersion) {
          throw new Error('The template version this draft was built from is missing.');
        }
        if (cancelled) return;

        setEditTemplate(tpl);
        setVersion(storedVersion);
        setPolicyId(editDraft.policy_id ?? '');
        setTitle(editDraft.title);
        setSignerName(signer?.full_name ?? '');
        setSignerEmail(signer?.email ?? '');
        setSignerPhone(signer?.phone ?? '');

        if (editDraft.expires_at) {
          const remaining = Math.ceil(
            (new Date(editDraft.expires_at).getTime() - Date.now()) / 86_400_000
          );
          setExpiryDays(isValidExpiryDays(remaining) ? remaining : DEFAULT_EXPIRY_DAYS);
        }

        const snapshot = editDraft.merge_data_snapshot;
        setMerged({
          content: editDraft.rendered_content,
          consentText: snapshot?.rendered_consent_text ?? storedVersion.consent_text,
          values: snapshot?.values ?? {},
          unresolved: [],
          hash: editDraft.original_document_hash ?? '',
        });

        const client = await getClientMergeData(clientId);
        const policy = editDraft.policy_id
          ? await getPolicyMergeData(editDraft.policy_id, clientId)
          : null;

        const now = new Date();
        const freshValues = buildMergeData(client, policy, now);
        const freshContent = renderTemplateContent(storedVersion.content, freshValues);
        const freshConsent = renderConsentText(storedVersion.consent_text, freshValues);
        const freshUnresolved = findUnresolvedVariables(
          storedVersion.variables_used,
          freshValues,
          policy !== null
        );
        const freshHash = await createCanonicalContentHash(freshContent, freshConsent);

        if (cancelled) return;

        setPolicyData(policy);
        setFreshMerge({
          content: freshContent,
          consentText: freshConsent,
          values: freshValues,
          unresolved: freshUnresolved,
          hash: freshHash,
        });

        setDrift(
          findDrift(snapshot?.values ?? {}, freshValues).filter(
            (d) => d.token !== 'current_date' && d.token !== 'current_year'
          )
        );
      } catch (err) {
        if (cancelled) return;
        setMergeError(err instanceof Error ? err.message : 'Could not load this draft.');
      } finally {
        if (!cancelled) setEditLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [editDraft, clientId]);

  const activeDocument = useMemo(() => {
    if (!isEditing) return merged;
    return documentChoice === 'regenerate' ? freshMerge : merged;
  }, [isEditing, documentChoice, freshMerge, merged]);

  // Run Merge Document
  const runMerge = useCallback(async () => {
    if (!template) return;

    setMerging(true);
    setMergeError(null);
    setMerged(null);

    try {
      const currentVersion = await getCurrentVersion(template);
      if (!currentVersion) {
        throw new Error(
          `Version ${template.current_version} of "${template.internal_name}" is missing.`
        );
      }

      const client = await getClientMergeData(clientId);
      // Validate policy ownership cleanly
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

  // Validation Check
  const signerNameError = !signerName.trim() ? 'The signer needs a full name.' : null;
  const titleError = !title.trim() ? 'A title is required.' : null;
  const expiryError = !isValidExpiryDays(expiryDays)
    ? `Expiration must be between ${MIN_EXPIRY_DAYS} and ${MAX_EXPIRY_DAYS} days.`
    : null;
  const canSave = !signerNameError && !titleError && !expiryError;

  // Step 2 "Send" Button Click Handler -> Opens Channel Modal
  const handleOpenSendModal = () => {
    setShowErrors(true);
    setSaveError(null);
    if (!canSave) return;
    setIsChannelModalOpen(true);
  };

  // Channel Selection Modal -> Execute Delivery
  const handleExecuteSend = async () => {
    if (!template || !version || !merged) return;

    setSendingConsent(true);
    setSaveError(null);

    try {
      const expiresAt = expiryFromDays(expiryDays);
      const snapshot = buildMergeSnapshot(
        merged.values,
        merged.unresolved,
        clientId,
        policyData?.policy_id ?? null,
        merged.consentText
      );

      // 1. Create canonical signature_request record (policyId is NULL for general client consents)
      const draftResult = await createConsentDraft({
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

      // Update selected delivery channel on database
      await supabase
        .from('signature_requests')
        .update({ selected_delivery_channel: selectedChannel })
        .eq('id', draftResult.requestId);

      // 2. Fetch created signature_requests row and prepare DashboardConsentRow object for delivery orchestration
      const createdRow = await getConsent(draftResult.requestId);
      const dashboardRow: DashboardConsentRow = {
        ...createdRow,
        selected_delivery_channel: selectedChannel,
        client_name: clientName,
        template_internal_name: template.internal_name,
        signer_name: signerName,
        signer_email: signerEmail || null,
        signer_phone: signerPhone || null,
      };

      // 3. Trigger delivery adapter (opens WhatsApp / sends Email)
      await deliverConsent(dashboardRow, selectedChannel);

      setIsChannelModalOpen(false);
      onCreated(
        `Consent sent successfully via ${
          selectedChannel === 'whatsapp' ? 'WhatsApp' : selectedChannel === 'email' ? 'Email' : 'SMS'
        }.`
      );
    } catch (err: any) {
      console.error('Error sending consent:', err);
      setSaveError(err instanceof Error ? err.message : 'Could not send consent.');
      setIsChannelModalOpen(false);
    } finally {
      setSendingConsent(false);
    }
  };

  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden font-sans text-xs">
      {/* Header + step indicator */}
      <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900">New Consent</h3>
          <p className="text-xs text-slate-500 mt-0.5">For {clientName}</p>
        </div>
        <div className="flex items-center gap-2">
          <StepDot n={1} active={step === 1} done={step > 1} label="Document" />
          <div className="w-6 h-px bg-slate-200" />
          <StepDot n={2} active={step === 2} done={false} label="Review & Send" />
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
                A consent can only be built from an active template. Create one in Consent Templates.
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
                <div className="space-y-2">
                  <input
                    type="text"
                    value={templateSearch}
                    onChange={(e) => setTemplateSearch(e.target.value)}
                    placeholder="Search published templates..."
                    className="w-full text-xs text-slate-800 border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <select
                    id="consent-template"
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                    className="w-full text-xs font-semibold text-slate-800 border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a published template…</option>
                    {templates
                      .filter((t) =>
                        templateSearch.trim()
                          ? t.internal_name.toLowerCase().includes(templateSearch.toLowerCase()) ||
                            (t.description || '').toLowerCase().includes(templateSearch.toLowerCase())
                          : true
                      )
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.internal_name} · {LANGUAGE_LABELS[t.language]} · v{t.current_version}
                        </option>
                      ))}
                  </select>
                </div>
                {template?.description && (
                  <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl text-xs text-blue-900 mt-2 space-y-1">
                    <p className="font-bold">{template.internal_name} (v{template.current_version})</p>
                    <p className="text-[11px] text-blue-700">{template.description}</p>
                  </div>
                )}
              </div>

              {/* Policy Selection (Optional) */}
              <div>
                <label
                  htmlFor="consent-policy"
                  className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1"
                >
                  Policy <span className="font-medium normal-case tracking-normal text-slate-400">(optional)</span>
                </label>
                {policies.length === 0 ? (
                  <p className="text-xs text-slate-400 border border-slate-100 rounded-xl px-3 py-2 bg-slate-50/60">
                    This client has no policies. General client fields will be used.
                  </p>
                ) : (
                  <select
                    id="consent-policy"
                    value={policyId}
                    onChange={(e) => setPolicyId(e.target.value)}
                    className="w-full text-xs font-semibold text-slate-800 border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">No policy (General Client Consent)</option>
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
                  General consents leave policy_id as NULL. Policy-specific consents tie directly to that record.
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
      {step === 2 && editLoading && (
        <div className="p-5 space-y-3">
          <div className="h-10 bg-slate-50 rounded-xl animate-pulse" />
          <div className="h-32 bg-slate-50 rounded-xl animate-pulse" />
        </div>
      )}

      {step === 2 && !editLoading && activeDocument && template && (
        <div className="p-5 space-y-5">
          {saveError && <ErrorBox title="Could not process consent" message={saveError} />}

          {/* Warnings */}
          {activeDocument.unresolved.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-bold text-amber-800">
                {activeDocument.unresolved.length} field{activeDocument.unresolved.length === 1 ? '' : 's'} could not
                be filled
              </p>
              <ul className="mt-2 space-y-1.5">
                {activeDocument.unresolved.map((u) => (
                  <li key={u.token} className="text-xs text-amber-800">
                    <code className="font-mono font-bold">{`{{${u.token}}}`}</code> — {u.reason}
                  </li>
                ))}
              </ul>
              {activeDocument.unresolved.some((u) => u.needsPolicy) && (
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="mt-3 text-xs font-bold text-amber-900 underline hover:no-underline"
                >
                  Go back and select a policy
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            {/* Left: Signer & Settings */}
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
                      placeholder="Email address..."
                      className={inputClass(false)}
                    />
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
                      placeholder="Phone number..."
                      className={inputClass(false)}
                    />
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
                        : 'None (General Client Consent)'
                    }
                  />
                </dl>
              </div>

              {/* ACTION BUTTONS: SAVE AS DRAFT REPLACED WITH SEND */}
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
                    onClick={handleOpenSendModal}
                    className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors shadow-md active:scale-[0.98]"
                  >
                    Send →
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Document Preview */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Document preview
              </p>
              <ConsentPreview
                content={activeDocument.content}
                publicTitle={title}
                consentText={activeDocument.consentText}
              />
            </div>
          </div>
        </div>
      )}

      {/* SEND CONSENT / DELIVERY CHANNEL SELECTION MODAL */}
      {isChannelModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-2xl max-w-md w-full space-y-5 font-sans animate-scale-up">
            <div>
              <h4 className="text-base font-extrabold text-slate-900">Send Consent</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                {clientName} · {title || template?.public_title}
              </p>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-extrabold text-slate-700">
                Choose delivery method:
              </label>

              {/* WhatsApp Option */}
              <div
                onClick={() => setSelectedChannel('whatsapp')}
                className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-start gap-3 ${
                  selectedChannel === 'whatsapp'
                    ? 'border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-400/40'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="deliveryChannel"
                  checked={selectedChannel === 'whatsapp'}
                  onChange={() => setSelectedChannel('whatsapp')}
                  className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <span className="font-extrabold text-slate-900 block text-xs">WhatsApp</span>
                  <span className="text-xs text-slate-600 font-mono block mt-0.5">
                    {signerPhone || 'No phone number'}
                  </span>
                </div>
              </div>

              {/* Email Option */}
              <div
                onClick={() => setSelectedChannel('email')}
                className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-start gap-3 ${
                  selectedChannel === 'email'
                    ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-400/40'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="deliveryChannel"
                  checked={selectedChannel === 'email'}
                  onChange={() => setSelectedChannel('email')}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="font-extrabold text-slate-900 block text-xs">Email</span>
                  <span className="text-xs text-slate-600 font-medium block mt-0.5">
                    {signerEmail || 'No email address'}
                  </span>
                </div>
              </div>

              {/* SMS Option */}
              <div
                onClick={() => setSelectedChannel('sms')}
                className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-start gap-3 ${
                  selectedChannel === 'sms'
                    ? 'border-amber-500 bg-amber-50/60 ring-2 ring-amber-400/40'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="deliveryChannel"
                  checked={selectedChannel === 'sms'}
                  onChange={() => setSelectedChannel('sms')}
                  className="mt-0.5 text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <span className="font-extrabold text-slate-900 block text-xs">SMS</span>
                  <span className="text-xs text-slate-600 font-mono block mt-0.5">
                    {signerPhone || 'No phone number'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsChannelModalOpen(false)}
                disabled={sendingConsent}
                className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteSend}
                disabled={sendingConsent}
                className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md transition-all flex items-center gap-2"
              >
                {sendingConsent && <Spinner />}
                {sendingConsent ? 'Sending...' : 'Send Consent'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StepDot({ n, active, done, label }: { n: number; active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
          done
            ? 'bg-blue-600 text-white'
            : active
            ? 'bg-blue-600 text-white'
            : 'bg-slate-100 text-slate-400'
        }`}
      >
        {done ? '✓' : n}
      </div>
      <span className={`text-xs font-bold ${active || done ? 'text-slate-800' : 'text-slate-400'}`}>
        {label}
      </span>
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
    <div className="flex justify-between gap-3">
      <dt className="text-slate-400">{label}</dt>
      <dd
        className={`font-semibold text-slate-800 truncate text-right ${mono ? 'font-mono' : ''}`}
        title={title}
      >
        {value}
      </dd>
    </div>
  );
}

function FieldError({ message }: { message: string }) {
  return <p className="text-[10px] text-rose-500 mt-1 font-medium">{message}</p>;
}

function ErrorBox({ title, message }: { title: string; message: string }) {
  return (
    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900">
      <p className="font-bold">{title}</p>
      <p className="text-[11px] text-rose-700 mt-0.5">{message}</p>
    </div>
  );
}

function inputClass(hasError: boolean | string | null) {
  return `w-full text-xs font-semibold text-slate-800 border rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 ${
    hasError
      ? 'border-rose-300 focus:ring-rose-400 bg-rose-50/30'
      : 'border-slate-200 focus:ring-blue-500'
  }`;
}

function Spinner() {
  return (
    <svg className="animate-spin h-3.5 w-3.5 text-current" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
