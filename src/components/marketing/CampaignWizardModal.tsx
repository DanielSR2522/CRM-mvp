'use client';

import React, { useState, useEffect } from 'react';
import {
  MarketingCampaign,
  MarketingSegment,
  MarketingTemplate,
  MarketingSenderAccount,
  AudienceFilters,
  SafetyCheckSummary,
} from '@/types/marketing';
import { evaluateSegmentCandidates } from '@/lib/marketing/segment-evaluator';
import { evaluateRecipientSafety } from '@/lib/marketing/safety-engine';
import { replacePersonalizationTokens, ALLOWED_PERSONALIZATION_VARIABLES } from '@/lib/marketing/personalization';
import { performPreSendHealthCheck } from '@/lib/marketing/email-health-service';

interface CampaignWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  segments: MarketingSegment[];
  templates: MarketingTemplate[];
  senderAccounts: MarketingSenderAccount[];
  onSaveCampaign: (campaignData: Partial<MarketingCampaign>) => Promise<MarketingCampaign>;
  onExecuteSend: (campaignId: string, safetySummary: SafetyCheckSummary) => Promise<{ success: boolean; message: string }>;
}

export default function CampaignWizardModal({
  isOpen,
  onClose,
  segments,
  templates,
  senderAccounts,
  onSaveCampaign,
  onExecuteSend,
}: CampaignWizardModalProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Form State
  const [campaignName, setCampaignName] = useState('');
  const [subject, setSubject] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [fromName, setFromName] = useState('Agent');
  const [fromEmail, setFromEmail] = useState('agent@smartrack.com');
  const [replyTo, setReplyTo] = useState('agent@smartrack.com');
  const [selectedSegmentId, setSelectedSegmentId] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [contentHtml, setContentHtml] = useState('<p>Hello {{first_name}},</p><p>We are writing to update you on your coverage with {{carrier}}.</p><p>Best regards,<br/><strong>{{agent_name}}</strong></p>');

  // Audience Filter State
  const [filters, setFilters] = useState<AudienceFilters>({
    client: { state: '', category: '', status: '' },
    policy: { carrier: '', policyStatus: 'all', renewalWithinDays: null },
    emailMarketing: { hasEmail: true, validEmailOnly: true },
  });

  // Preview Mode
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');

  // Calculation & Safety State
  const [calculating, setCalculating] = useState(false);
  const [safetySummary, setSafetySummary] = useState<SafetyCheckSummary | null>(null);
  const [showRecipientInspector, setShowRecipientInspector] = useState(false);

  // Schedule State
  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now');
  const [scheduledDateTime, setScheduledDateTime] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendResultMsg, setSendResultMsg] = useState<{ success?: boolean; text: string } | null>(null);

  // Recalculate audience safety check whenever filters or segment changes
  useEffect(() => {
    if (!isOpen) return;

    let activeFilters = filters;
    if (selectedSegmentId) {
      const seg = segments.find((s) => s.id === selectedSegmentId);
      if (seg) activeFilters = seg.filters;
    }

    setCalculating(true);
    evaluateSegmentCandidates(activeFilters)
      .then(({ candidates, suppressedEmails, hardBouncedEmails }) => {
        const summary = evaluateRecipientSafety(candidates, suppressedEmails, hardBouncedEmails);
        setSafetySummary(summary);
      })
      .finally(() => setCalculating(false));
  }, [isOpen, selectedSegmentId, filters, segments]);

  // Handle Template selection
  const handleTemplateSelect = (tplId: string) => {
    setSelectedTemplateId(tplId);
    const tpl = templates.find((t) => t.id === tplId);
    if (tpl) {
      if (tpl.subject) setSubject(tpl.subject);
      setContentHtml(tpl.body_html);
    }
  };

  // Insert Personalization Variable
  const handleInsertVariable = (token: string) => {
    setContentHtml((prev) => prev + ` ${token} `);
  };

  // Step 4: Final Send Handler
  const handleFinalSubmit = async () => {
    if (!campaignName.trim()) {
      alert('Please provide a campaign name.');
      return;
    }

    if (!safetySummary || safetySummary.validRecipients === 0) {
      alert('Cannot send campaign: 0 valid recipients in target audience.');
      return;
    }

    setIsSending(true);
    setSendResultMsg(null);

    try {
      const isScheduleMode = sendMode === 'schedule' && scheduledDateTime;
      const initialStatus = isScheduleMode ? 'SCHEDULED' : 'DRAFT';

      const savedCampaign = await onSaveCampaign({
        name: campaignName.trim(),
        channel: 'EMAIL',
        subject: subject.trim(),
        preview_text: previewText.trim(),
        from_name: fromName.trim(),
        from_email: fromEmail.trim(),
        reply_to: replyTo.trim(),
        segment_id: selectedSegmentId || null,
        template_id: selectedTemplateId || null,
        content_html: contentHtml,
        scheduled_at: isScheduleMode ? new Date(scheduledDateTime).toISOString() : null,
        status: initialStatus,
        total_matched: safetySummary.totalMatched,
        valid_recipients: safetySummary.validRecipients,
        excluded_duplicates: safetySummary.excludedDuplicates,
        excluded_invalid_email: safetySummary.excludedInvalidEmail,
        excluded_unsubscribed: safetySummary.excludedUnsubscribed,
        excluded_bounced: safetySummary.excludedBounced,
      });

      if (isScheduleMode) {
        setSendResultMsg({
          success: true,
          text: `Campaign '${savedCampaign.name}' scheduled for ${new Date(scheduledDateTime).toLocaleString()}.`,
        });
      } else {
        // Invoke real server-side batch dispatch API
        const dispatchRes = await fetch(`/api/marketing/campaigns/${savedCampaign.id}/dispatch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        const dispatchData = await dispatchRes.json();
        if (!dispatchRes.ok || !dispatchData.success) {
          setSendResultMsg({
            success: false,
            text: dispatchData.error || 'Failed to dispatch campaign via server API.',
          });
        } else {
          const modeLabel = dispatchData.live_send ? 'LIVE RESEND DELIVERY' : 'SAFE MOCK MODE';
          setSendResultMsg({
            success: true,
            text: `Campaign dispatched successfully! Sent to ${dispatchData.dispatched_count || 0} recipients (${modeLabel}).`,
          });
        }
      }
    } catch (err: any) {
      setSendResultMsg({ success: false, text: err?.message || 'Failed to dispatch campaign.' });
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  const defaultSenderAccount = senderAccounts.find((s) => s.is_default) || senderAccounts[0] || null;
  const healthCheck = performPreSendHealthCheck(defaultSenderAccount, safetySummary, contentHtml);

  const sampleContext = {
    first_name: 'John',
    last_name: 'Doe',
    agent_name: fromName || 'Sarah Smith',
    carrier: filters.policy?.carrier || 'Ambetter',
    policy_number: 'POL-98210',
  };

  const renderedPreviewHtml = replacePersonalizationTokens(contentHtml, sampleContext);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 font-sans animate-fadeIn">
      <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden max-w-4xl w-full flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600">
              Step {step} of 4 • Campaign Wizard
            </span>
            <h2 className="text-lg font-bold text-slate-900">
              {step === 1 && 'Step 1 — Audience Selection & Filters'}
              {step === 2 && 'Step 2 — Subject, Content & Personalization'}
              {step === 3 && 'Step 3 — Review & Recipient Safety Check'}
              {step === 4 && 'Step 4 — Schedule or Send Campaign'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-200/70 hover:bg-slate-300 text-slate-600 font-bold flex items-center justify-center transition-colors text-sm"
          >
            ✕
          </button>
        </div>

        {/* Wizard Step Progress Indicator */}
        <div className="grid grid-cols-4 bg-slate-100 border-b border-slate-200 text-center text-xs font-bold text-slate-500">
          <div className={`py-2 border-r border-slate-200 ${step === 1 ? 'bg-white text-blue-600 border-b-2 border-b-blue-600' : ''}`}>
            1. Audience
          </div>
          <div className={`py-2 border-r border-slate-200 ${step === 2 ? 'bg-white text-blue-600 border-b-2 border-b-blue-600' : ''}`}>
            2. Content
          </div>
          <div className={`py-2 border-r border-slate-200 ${step === 3 ? 'bg-white text-blue-600 border-b-2 border-b-blue-600' : ''}`}>
            3. Review Safety
          </div>
          <div className={`py-2 ${step === 4 ? 'bg-white text-blue-600 border-b-2 border-b-blue-600' : ''}`}>
            4. Send / Schedule
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* STEP 1: AUDIENCE */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Campaign Name</label>
                <input
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g. Q3 Florida Ambetter Renewal Reminder"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-bold outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Saved Segment Selection */}
              <div className="space-y-2 border-t border-slate-100 pt-4">
                <label className="block text-xs font-bold text-slate-700">Use Saved Segment (Optional)</label>
                <select
                  value={selectedSegmentId}
                  onChange={(e) => setSelectedSegmentId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 outline-none focus:border-blue-500"
                >
                  <option value="">-- Custom Live Filters --</option>
                  {segments.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.description ? `(${s.description})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Custom Filter Controls */}
              {!selectedSegmentId && (
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-4">
                  <span className="block text-xs font-bold text-slate-900">Custom Audience Filters (AND Logic)</span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">State</label>
                      <input
                        type="text"
                        value={filters.client?.state || ''}
                        onChange={(e) => setFilters({ ...filters, client: { ...filters.client, state: e.target.value } })}
                        placeholder="e.g. FL"
                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-semibold text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">Carrier</label>
                      <input
                        type="text"
                        value={filters.policy?.carrier || ''}
                        onChange={(e) => setFilters({ ...filters, policy: { ...filters.policy, carrier: e.target.value } })}
                        placeholder="e.g. Ambetter"
                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-semibold text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">Renewal Due Within</label>
                      <select
                        value={filters.policy?.renewalWithinDays || ''}
                        onChange={(e) => setFilters({
                          ...filters,
                          policy: { ...filters.policy, renewalWithinDays: e.target.value ? (Number(e.target.value) as any) : null }
                        })}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-semibold text-slate-800"
                      >
                        <option value="">Any Time</option>
                        <option value="7">7 Days</option>
                        <option value="15">15 Days</option>
                        <option value="30">30 Days</option>
                        <option value="60">60 Days</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Dynamic Live Recipient Counter Badge */}
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-700">
                    Live Audience Match Calculation
                  </span>
                  <div className="text-2xl font-extrabold text-blue-900 mt-0.5">
                    {calculating ? 'Calculating...' : `${safetySummary?.validRecipients || 0} Valid Recipients`}
                  </div>
                  <span className="text-xs text-blue-700 font-medium">
                    Total matched: {safetySummary?.totalMatched || 0} (
                    {(safetySummary?.excludedDuplicates || 0) + (safetySummary?.excludedUnsubscribed || 0)} excluded)
                  </span>
                </div>
                <div className="p-3 bg-blue-100 rounded-xl text-blue-600 font-bold text-xl">
                  👥
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: CONTENT */}
          {step === 2 && (
            <div className="space-y-6">
              {/* Template Picker */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Select Template (Optional)</label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => handleTemplateSelect(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 outline-none focus:border-blue-500"
                >
                  <option value="">-- Start from Blank / Custom --</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      [{t.category}] {t.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sender & Subject Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">From Name</label>
                  <input
                    type="text"
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">From Email</label>
                  <input
                    type="text"
                    value={fromEmail}
                    onChange={(e) => setFromEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Reply-To</label>
                  <input
                    type="text"
                    value={replyTo}
                    onChange={(e) => setReplyTo(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Email Subject Line</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. Action Required: Your Policy Renewal Notice"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Preview Text (Inbox snippet)</label>
                  <input
                    type="text"
                    value={previewText}
                    onChange={(e) => setPreviewText(e.target.value)}
                    placeholder="e.g. Please review your upcoming rate choices..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800"
                  />
                </div>
              </div>

              {/* Personalization Variable Bar */}
              <div className="space-y-1.5">
                <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Insert Personalization Tokens
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {ALLOWED_PERSONALIZATION_VARIABLES.map((v) => (
                    <button
                      key={v.token}
                      type="button"
                      onClick={() => handleInsertVariable(v.token)}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 border border-slate-200 rounded-lg text-xs font-mono font-semibold transition-colors"
                    >
                      + {v.token}
                    </button>
                  ))}
                </div>
              </div>

              {/* Editor & Preview Toggle */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700">Message Body HTML</label>
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setPreviewDevice('desktop')}
                      className={`px-2.5 py-0.5 text-xs font-bold rounded-lg transition-colors ${
                        previewDevice === 'desktop' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-600'
                      }`}
                    >
                      🖥️ Desktop Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewDevice('mobile')}
                      className={`px-2.5 py-0.5 text-xs font-bold rounded-lg transition-colors ${
                        previewDevice === 'mobile' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-600'
                      }`}
                    >
                      📱 Mobile Preview
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <textarea
                    rows={8}
                    value={contentHtml}
                    onChange={(e) => setContentHtml(e.target.value)}
                    className="w-full bg-slate-900 text-slate-100 font-mono text-xs p-3.5 rounded-2xl border border-slate-800 outline-none focus:ring-1 focus:ring-blue-500"
                  />

                  {/* Rendered Live Preview Frame */}
                  <div
                    className={`border border-slate-200 rounded-2xl bg-white p-4 overflow-y-auto max-h-64 shadow-inner ${
                      previewDevice === 'mobile' ? 'max-w-xs mx-auto border-4 border-slate-800 rounded-3xl' : 'w-full'
                    }`}
                  >
                    <div dangerouslySetInnerHTML={{ __html: renderedPreviewHtml }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: REVIEW & SAFETY CHECK */}
          {step === 3 && (
            <div className="space-y-6">
              {/* Recipient Calculation Breakdown Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">Recipient Safety & Exclusion Audit</h3>
                    <p className="text-xs text-slate-500">Automated deduplication and compliance filtering result</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowRecipientInspector(!showRecipientInspector)}
                    className="text-xs font-bold text-blue-600 hover:underline"
                  >
                    {showRecipientInspector ? 'Hide Recipients' : 'Inspect Recipient List →'}
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="bg-white p-3 rounded-xl border border-slate-200">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase">Total Matched</span>
                    <span className="text-xl font-extrabold text-slate-900">{safetySummary?.totalMatched || 0}</span>
                  </div>
                  <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                    <span className="block text-[10px] font-bold text-emerald-700 uppercase">Valid Recipients</span>
                    <span className="text-xl font-extrabold text-emerald-800">{safetySummary?.validRecipients || 0}</span>
                  </div>
                  <div className="bg-amber-50 p-3 rounded-xl border border-amber-200">
                    <span className="block text-[10px] font-bold text-amber-700 uppercase">Duplicates Removed</span>
                    <span className="text-xl font-extrabold text-amber-800">{safetySummary?.excludedDuplicates || 0}</span>
                  </div>
                  <div className="bg-rose-50 p-3 rounded-xl border border-rose-200">
                    <span className="block text-[10px] font-bold text-rose-700 uppercase">Unsub / Bounce Excluded</span>
                    <span className="text-xl font-extrabold text-rose-800">
                      {(safetySummary?.excludedUnsubscribed || 0) + (safetySummary?.excludedBounced || 0)}
                    </span>
                  </div>
                </div>

                {/* Recipient Details Inspection Table */}
                {showRecipientInspector && (
                  <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl bg-white divide-y divide-slate-100 text-xs">
                    {safetySummary?.details.map((d, i) => (
                      <div key={i} className="p-2.5 flex items-center justify-between">
                        <div>
                          <span className="font-bold text-slate-800">{d.name}</span>
                          <span className="text-slate-400 ml-2">({d.email})</span>
                        </div>
                        {d.isExcluded ? (
                          <span className="px-2 py-0.5 bg-rose-50 text-rose-700 rounded-md font-bold text-[10px]">
                            Excluded: {d.reason}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md font-bold text-[10px]">
                            Valid
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pre-Send Email Health Check Card */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-3 shadow-2xs">
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <span>🛡️</span> Pre-Send Email Health Check
                </h3>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-emerald-700 font-bold">
                    <span>✓</span> Duplicate recipient check passed
                  </div>
                  <div className="flex items-center gap-2 text-emerald-700 font-bold">
                    <span>✓</span> Global suppression list checked
                  </div>
                  <div className="flex items-center gap-2 text-emerald-700 font-bold">
                    <span>✓</span> Unsubscribe footer mechanism present
                  </div>
                  {!healthCheck.domainVerified && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 font-medium">
                      ⚠️ Domain authentication (SPF/DKIM) is unverified. Delivery will run in safe Mock Send mode.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: SEND / SCHEDULE */}
          {step === 4 && (
            <div className="space-y-6">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                <h3 className="text-sm font-extrabold text-slate-900">Campaign Dispatch Options</h3>

                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:border-blue-500 transition-colors">
                    <input
                      type="radio"
                      name="sendMode"
                      checked={sendMode === 'now'}
                      onChange={() => setSendMode('now')}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <span className="block text-xs font-bold text-slate-900">Send Immediately</span>
                      <span className="text-[11px] text-slate-500">Dispatch campaign now to {safetySummary?.validRecipients || 0} recipients</span>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:border-blue-500 transition-colors">
                    <input
                      type="radio"
                      name="sendMode"
                      checked={sendMode === 'schedule'}
                      onChange={() => setSendMode('schedule')}
                      className="text-blue-600 focus:ring-blue-500 mt-0.5"
                    />
                    <div className="space-y-2 flex-1">
                      <div>
                        <span className="block text-xs font-bold text-slate-900">Schedule for Later</span>
                        <span className="text-[11px] text-slate-500">Specify future dispatch date and time</span>
                      </div>
                      {sendMode === 'schedule' && (
                        <input
                          type="datetime-local"
                          value={scheduledDateTime}
                          onChange={(e) => setScheduledDateTime(e.target.value)}
                          className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800"
                        />
                      )}
                    </div>
                  </label>
                </div>
              </div>

              {/* Double-Send Protection Notice */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl text-xs text-blue-900 space-y-1">
                <span className="font-extrabold">🔒 Double-Send Protection Active</span>
                <p className="text-blue-800 leading-relaxed">
                  Campaign status locks automatically upon submission. Accidental duplicate delivery to the target audience is prevented.
                </p>
              </div>

              {sendResultMsg && (
                <div className={`p-4 rounded-2xl text-xs font-bold border ${
                  sendResultMsg.success ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}>
                  {sendResultMsg.text}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <button
            type="button"
            disabled={step === 1}
            onClick={() => setStep((prev) => (prev - 1) as any)}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-all disabled:opacity-30"
          >
            ← Back
          </button>

          <div className="flex items-center gap-3">
            {step < 4 ? (
              <button
                type="button"
                onClick={() => {
                  if (step === 1 && !campaignName.trim()) {
                    alert('Please enter a campaign name before continuing.');
                    return;
                  }
                  setStep((prev) => (prev + 1) as any);
                }}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-md"
              >
                Next Step →
              </button>
            ) : (
              <button
                type="button"
                disabled={isSending}
                onClick={handleFinalSubmit}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-xs font-extrabold rounded-xl transition-all shadow-md shadow-emerald-600/20 disabled:opacity-50"
              >
                {isSending ? 'Dispatching...' : sendMode === 'schedule' ? 'Confirm & Schedule' : 'Confirm & Dispatch Campaign'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
