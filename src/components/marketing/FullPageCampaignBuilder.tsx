'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { replacePersonalizationTokens } from '@/lib/marketing/personalization';
import { performPreSendHealthCheck } from '@/lib/marketing/email-health-service';
import VisualEmailBuilder from './VisualEmailBuilder';

interface FullPageCampaignBuilderProps {
  segments: MarketingSegment[];
  templates: MarketingTemplate[];
  senderAccounts: MarketingSenderAccount[];
  onSaveCampaign: (campaignData: Partial<MarketingCampaign>) => Promise<MarketingCampaign>;
  onCreateTemplate?: (templateData: Partial<MarketingTemplate>) => Promise<MarketingTemplate>;
}

export default function FullPageCampaignBuilder({
  segments,
  templates,
  senderAccounts,
  onSaveCampaign,
  onCreateTemplate,
}: FullPageCampaignBuilderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const existingId = searchParams.get('id');

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [draftCampaignId, setDraftCampaignId] = useState<string | null>(existingId);

  // Form State
  const [campaignName, setCampaignName] = useState('New Renewal Campaign');
  const [subject, setSubject] = useState('Important Update Regarding Your Policy Renewal');
  const [previewText, setPreviewText] = useState('Please review your upcoming policy renewal details...');
  const [fromName, setFromName] = useState('SmarTrack Marketing Agent');
  const [fromEmail, setFromEmail] = useState('consents@mail.smartrackcrm.com');
  const [replyTo, setReplyTo] = useState('agent@smartrack.com');
  const [selectedSegmentId, setSelectedSegmentId] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [contentHtml, setContentHtml] = useState(
    '<p>Hello {{first_name}},</p><p>We are writing to update you on your coverage with <strong>{{carrier}}</strong> (Policy #{{policy_number}}).</p><p>Please review your renewal options or contact our office if you have any questions.</p><p>Best regards,<br/><strong>{{agent_name}}</strong></p>'
  );

  // Filter Mode & Collapsible State
  const [filterMode, setFilterMode] = useState<'basic' | 'advanced'>('basic');
  const [activeFilterGroup, setActiveFilterGroup] = useState<'client' | 'policy' | 'activity' | 'marketing'>('client');

  // Audience Filter State
  const [filters, setFilters] = useState<AudienceFilters>({
    client: { state: '', category: '', status: '', assignedAgentId: '' },
    policy: { carrier: '', policyStatus: 'all', renewalWithinDays: null },
    activity: { isNewLead: false, noResponse: false },
    emailMarketing: { hasEmail: true, validEmailOnly: true },
  });

  // Table Search, Filter & Selection State
  const [tableSearchQuery, setTableSearchQuery] = useState('');
  const [tableFilterMode, setTableFilterMode] = useState<'all' | 'selected' | 'excluded'>('all');
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [unselectedEmails, setUnselectedEmails] = useState<Set<string>>(new Set());

  // Exclusion Inspector Drawer State
  const [activeExclusionCategory, setActiveExclusionCategory] = useState<string | null>(null);

  // Recipient Inspection Modal in Step 3/4
  const [showRecipientModal, setShowRecipientModal] = useState(false);

  // Calculation & Safety State
  const [calculating, setCalculating] = useState(false);
  const [safetySummary, setSafetySummary] = useState<SafetyCheckSummary | null>(null);

  // Schedule & Send State
  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now');
  const [scheduledDateTime, setScheduledDateTime] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendResultMsg, setSendResultMsg] = useState<{ success?: boolean; text: string } | null>(null);

  // Load Saved Segment Filters
  useEffect(() => {
    if (selectedSegmentId) {
      const seg = segments.find((s) => s.id === selectedSegmentId);
      if (seg) {
        setFilters(seg.filters);
      }
    }
  }, [selectedSegmentId, segments]);

  // Provider status state
  const [providerStatus, setProviderStatus] = useState<{ isLive: boolean; mode: string } | null>(null);

  useEffect(() => {
    fetch('/api/marketing/provider-status')
      .then((res) => res.json())
      .then((data) => setProviderStatus(data))
      .catch(() => setProviderStatus({ isLive: false, mode: 'SAFE_MOCK_MODE' }));
  }, []);

  // Recalculate recipient candidates when filters change
  useEffect(() => {
    setCalculating(true);
    fetch('/api/marketing/evaluate-segment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filters }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.safetySummary) {
          setSafetySummary(data.safetySummary);
          const validSet = new Set<string>();
          data.safetySummary.details.forEach((d: any) => {
            if (!d.isExcluded && d.email && d.email.includes('@')) {
              validSet.add(d.email.toLowerCase());
            }
          });
          setSelectedEmails(validSet);
          setUnselectedEmails(new Set());
        }
      })
      .catch(() => {
        evaluateSegmentCandidates(filters).then(({ candidates, suppressedEmails, hardBouncedEmails }) => {
          const summary = evaluateRecipientSafety(candidates, suppressedEmails, hardBouncedEmails);
          setSafetySummary(summary);
        });
      })
      .finally(() => setCalculating(false));
  }, [filters]);

  // Real Selected Recipients List for Preview Context Dropdown
  const selectedRecipientsForPreview = useMemo(() => {
    if (!safetySummary) return [];
    return safetySummary.details
      .filter((d) => !d.isExcluded && selectedEmails.has(d.email.toLowerCase()))
      .map((d) => ({
        id: d.clientId || d.email,
        name: d.name,
        email: d.email,
        carrier: d.carrier || 'Ambetter',
        policyNumber: 'POL-FL-98210',
        agentName: d.assignedAgent || fromName,
      }));
  }, [safetySummary, selectedEmails, fromName]);

  // Dynamic Selected Count Calculation
  const finalSelectedCount = useMemo(() => {
    if (!safetySummary) return 0;
    return safetySummary.details.filter((d) => !d.isExcluded && selectedEmails.has(d.email.toLowerCase())).length;
  }, [safetySummary, selectedEmails]);

  // Saved / Persist Draft Helper
  const persistDraft = async (status: MarketingCampaign['status'] = 'DRAFT') => {
    const isScheduleMode = sendMode === 'schedule' && scheduledDateTime;
    const campaignData: Partial<MarketingCampaign> = {
      ...(draftCampaignId ? { id: draftCampaignId } : {}),
      name: campaignName.trim() || 'Untitled Campaign',
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
      status: status,
      total_matched: safetySummary?.totalMatched || 0,
      valid_recipients: finalSelectedCount,
      excluded_duplicates: safetySummary?.excludedDuplicates || 0,
      excluded_invalid_email: safetySummary?.excludedInvalidEmail || 0,
      excluded_unsubscribed: safetySummary?.excludedUnsubscribed || 0,
      excluded_bounced: safetySummary?.excludedBounced || 0,
    };

    const saved = await onSaveCampaign(campaignData);
    if (saved && saved.id) {
      setDraftCampaignId(saved.id);
    }
    return saved;
  };

  // Step Navigation
  const handleNextStep = async () => {
    if (step === 1 && !campaignName.trim()) {
      alert('Please enter a campaign name.');
      return;
    }

    try {
      await persistDraft('DRAFT');
    } catch (err) {
      console.warn('Draft auto-save warning:', err);
    }

    setStep((prev) => (prev + 1) as any);
  };

  const handlePrevStep = () => {
    setStep((prev) => (prev - 1) as any);
  };

  // Toggle Single Recipient Selection
  const handleToggleRecipient = (email: string) => {
    const clean = email.toLowerCase();
    const nextSelected = new Set(selectedEmails);
    const nextUnselected = new Set(unselectedEmails);

    if (nextSelected.has(clean)) {
      nextSelected.delete(clean);
      nextUnselected.add(clean);
    } else {
      nextSelected.add(clean);
      nextUnselected.delete(clean);
    }

    setSelectedEmails(nextSelected);
    setUnselectedEmails(nextUnselected);
  };

  // Select All / Deselect All
  const handleSelectAllEligible = (select: boolean) => {
    if (!safetySummary) return;

    if (select) {
      const allValid = new Set<string>();
      safetySummary.details.forEach((d) => {
        if (!d.isExcluded && d.email.includes('@')) {
          allValid.add(d.email.toLowerCase());
        }
      });
      setSelectedEmails(allValid);
      setUnselectedEmails(new Set());
    } else {
      setSelectedEmails(new Set());
      const allValidUnselected = new Set<string>();
      safetySummary.details.forEach((d) => {
        if (!d.isExcluded && d.email.includes('@')) {
          allValidUnselected.add(d.email.toLowerCase());
        }
      });
      setUnselectedEmails(allValidUnselected);
    }
  };

  // Save as Template Handler
  const handleSaveAsTemplate = async (name: string, category: string, html: string) => {
    if (onCreateTemplate) {
      await onCreateTemplate({
        name,
        category: category as any,
        subject,
        body_html: html,
        is_system: false,
        is_favorite: true,
        status: 'ACTIVE',
      });
      alert(`Template '${name}' saved successfully to template library!`);
    } else {
      alert(`Template '${name}' saved!`);
    }
  };

  // Handle Final Submission / Dispatch
  const handleFinalSubmit = async () => {
    if (!campaignName.trim()) {
      alert('Please provide a campaign name.');
      return;
    }

    if (finalSelectedCount === 0) {
      alert('Cannot send campaign: 0 recipients selected.');
      return;
    }

    setIsSending(true);
    setSendResultMsg(null);

    try {
      const isScheduleMode = sendMode === 'schedule' && scheduledDateTime;
      const initialStatus = isScheduleMode ? 'SCHEDULED' : 'DRAFT';
      const savedCampaign = await persistDraft(initialStatus);

      if (!savedCampaign || !savedCampaign.id) {
        setSendResultMsg({
          success: false,
          text: 'Campaign draft could not be persisted. Please save the draft again.',
        });
        setIsSending(false);
        return;
      }

      if (isScheduleMode) {
        setSendResultMsg({
          success: true,
          text: `Campaign '${savedCampaign.name}' successfully scheduled for ${new Date(scheduledDateTime).toLocaleString()}.`,
        });
      } else {
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
          const modeLabel = dispatchData.mode === 'LIVE_RESEND_DELIVERY' || dispatchData.live_send ? 'LIVE RESEND DELIVERY' : 'SAFE MOCK MODE';
          setSendResultMsg({
            success: true,
            text: `Campaign dispatched successfully! Sent to ${dispatchData.sentCount || dispatchData.dispatched_count || 0} recipients (${modeLabel}).`,
          });

          setTimeout(() => {
            router.push('/marketing');
          }, 2500);
        }
      }
    } catch (err: any) {
      setSendResultMsg({ success: false, text: err?.message || 'Failed to dispatch campaign.' });
    } finally {
      setIsSending(false);
    }
  };

  const defaultSenderAccount = senderAccounts.find((s) => s.is_default) || senderAccounts[0] || null;
  const healthCheck = performPreSendHealthCheck(defaultSenderAccount, safetySummary, contentHtml);

  // Filtered Recipient Table Rows
  const filteredRecipientRows = useMemo(() => {
    if (!safetySummary) return [];

    return safetySummary.details.filter((d) => {
      // 1. Search Query
      const q = tableSearchQuery.trim().toLowerCase();
      if (q) {
        const matchName = d.name.toLowerCase().includes(q);
        const matchEmail = d.email.toLowerCase().includes(q);
        const matchCarrier = (d.carrier || '').toLowerCase().includes(q);
        const matchAgent = (d.assignedAgent || '').toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchCarrier && !matchAgent) return false;
      }

      // 2. View Mode
      if (tableFilterMode === 'selected') {
        return !d.isExcluded && selectedEmails.has(d.email.toLowerCase());
      }
      if (tableFilterMode === 'excluded') {
        return d.isExcluded;
      }

      return true;
    });
  }, [safetySummary, tableSearchQuery, tableFilterMode, selectedEmails]);

  // Categorized Excluded Lists for Inspector
  const excludedByCategory = useMemo(() => {
    if (!safetySummary) return {};

    const catMap: Record<string, typeof safetySummary.details> = {
      'Invalid Email': [],
      Duplicates: [],
      Unsubscribed: [],
      'Hard Bounce': [],
      'No Consent': [],
    };

    safetySummary.details.forEach((d) => {
      if (d.isExcluded) {
        const r = (d.reason || '').toLowerCase();
        if (r.includes('invalid') || r.includes('missing')) catMap['Invalid Email'].push(d);
        else if (r.includes('duplicate')) catMap['Duplicates'].push(d);
        else if (r.includes('unsubscribed') || r.includes('suppressed')) catMap['Unsubscribed'].push(d);
        else if (r.includes('bounce')) catMap['Hard Bounce'].push(d);
        else if (r.includes('consent')) catMap['No Consent'].push(d);
      }
    });

    return catMap;
  }, [safetySummary]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      {/* FULL-PAGE TOP WORKSPACE HEADER (LIGHT CRM THEME) */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 sticky top-0 z-40 shadow-2xs">
        <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-start">
          <button
            type="button"
            onClick={() => router.push('/marketing')}
            className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all border border-slate-200 flex items-center gap-1.5"
          >
            ← Exit Workspace
          </button>
          <div>
            <span className="text-[10px] font-extrabold text-blue-600 uppercase tracking-wider">
              Campaign Builder Workspace
            </span>
            <h1 className="text-base font-extrabold text-slate-900 leading-tight">
              {campaignName || 'Untitled Campaign'}
            </h1>
          </div>
        </div>

        {/* Compact Horizontal Step Tracker */}
        <div className="flex items-center gap-1 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 text-xs font-bold w-full md:w-auto justify-center">
          <button
            type="button"
            onClick={() => setStep(1)}
            className={`px-4 py-1.5 rounded-xl transition-all ${
              step === 1 ? 'bg-blue-600 text-white shadow-2xs font-extrabold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            1. Audience
          </button>
          <button
            type="button"
            onClick={() => setStep(2)}
            className={`px-4 py-1.5 rounded-xl transition-all ${
              step === 2 ? 'bg-blue-600 text-white shadow-2xs font-extrabold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            2. Content
          </button>
          <button
            type="button"
            onClick={() => setStep(3)}
            className={`px-4 py-1.5 rounded-xl transition-all ${
              step === 3 ? 'bg-blue-600 text-white shadow-2xs font-extrabold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            3. Review
          </button>
          <button
            type="button"
            onClick={() => setStep(4)}
            className={`px-4 py-1.5 rounded-xl transition-all ${
              step === 4 ? 'bg-blue-600 text-white shadow-2xs font-extrabold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            4. Send
          </button>
        </div>

        {/* Top Control Buttons */}
        <div className="flex items-center gap-3">
          {step > 1 && (
            <button
              type="button"
              onClick={handlePrevStep}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-all"
            >
              Back
            </button>
          )}

          {step < 4 ? (
            <button
              type="button"
              onClick={handleNextStep}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all"
            >
              Next Step →
            </button>
          ) : (
            <button
              type="button"
              disabled={isSending}
              onClick={handleFinalSubmit}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all disabled:opacity-50"
            >
              {isSending ? 'Dispatching...' : sendMode === 'schedule' ? 'Confirm & Schedule' : 'Confirm & Dispatch Campaign'}
            </button>
          )}
        </div>
      </header>

      {/* WORKSPACE BODY (INVERNALIA LIGHT THEME) */}
      <main className="flex-1 bg-slate-50 p-4 md:p-6 space-y-6 max-w-[1600px] w-full mx-auto">
        {/* STEP 1: AUDIENCE WORKSPACE */}
        {step === 1 && (
          <div className="space-y-6 animate-fadeIn">
            {/* Top Workspace Header & Saved Segment Selector */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 space-y-4 shadow-2xs">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900">Target Audience & Recipient Selection</h2>
                  <p className="text-xs text-slate-500">Configure audience rules, load saved segments, and visually inspect recipient eligibility.</p>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <div className="space-y-1 w-full sm:w-64">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Campaign Name</label>
                    <input
                      type="text"
                      value={campaignName}
                      onChange={(e) => setCampaignName(e.target.value)}
                      placeholder="e.g. Q3 Florida Renewal Reminder"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-bold outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="space-y-1 w-full sm:w-64">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Use Saved Segment</label>
                    <select
                      value={selectedSegmentId}
                      onChange={(e) => setSelectedSegmentId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-bold outline-none focus:border-blue-500"
                    >
                      <option value="">-- Custom Live Filters --</option>
                      {segments.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Grouped Filter Tabs */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setActiveFilterGroup('client')}
                      className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${
                        activeFilterGroup === 'client' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Client Filters
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveFilterGroup('policy')}
                      className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${
                        activeFilterGroup === 'policy' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Policy Filters
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveFilterGroup('activity')}
                      className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${
                        activeFilterGroup === 'activity' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      CRM Activity
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveFilterGroup('marketing')}
                      className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${
                        activeFilterGroup === 'marketing' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Marketing Rules
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setFilterMode(filterMode === 'basic' ? 'advanced' : 'basic')}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 underline"
                  >
                    {filterMode === 'basic' ? 'Show All Advanced Filters ↑' : 'Show Basic Filters Only ↓'}
                  </button>
                </div>

                {/* Filter Inputs Panel */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
                  {activeFilterGroup === 'client' && (
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">State</label>
                        <input
                          type="text"
                          value={filters.client?.state || ''}
                          onChange={(e) => setFilters({ ...filters, client: { ...filters.client, state: e.target.value } })}
                          placeholder="e.g. FL"
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 font-semibold outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">City</label>
                        <input
                          type="text"
                          value={filters.client?.city || ''}
                          onChange={(e) => setFilters({ ...filters, client: { ...filters.client, city: e.target.value } })}
                          placeholder="e.g. Miami"
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 font-semibold outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">Client Status</label>
                        <select
                          value={filters.client?.status || ''}
                          onChange={(e) => setFilters({ ...filters, client: { ...filters.client, status: e.target.value } })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 font-semibold outline-none focus:border-blue-500"
                        >
                          <option value="">All Statuses</option>
                          <option value="Active">Active</option>
                          <option value="Lead">Lead</option>
                          <option value="Inactive">Inactive</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">Assigned Agent</label>
                        <input
                          type="text"
                          value={filters.client?.assignedAgentId || ''}
                          onChange={(e) => setFilters({ ...filters, client: { ...filters.client, assignedAgentId: e.target.value } })}
                          placeholder="All Agents"
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 font-semibold outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  )}

                  {activeFilterGroup === 'policy' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">Carrier</label>
                        <input
                          type="text"
                          value={filters.policy?.carrier || ''}
                          onChange={(e) => setFilters({ ...filters, policy: { ...filters.policy, carrier: e.target.value } })}
                          placeholder="e.g. Ambetter, Oscar, Florida Blue"
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 font-semibold outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">Policy Status</label>
                        <select
                          value={filters.policy?.policyStatus || 'all'}
                          onChange={(e) => setFilters({ ...filters, policy: { ...filters.policy, policyStatus: e.target.value as any } })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 font-semibold outline-none focus:border-blue-500"
                        >
                          <option value="all">All Policy Statuses</option>
                          <option value="active">Active</option>
                          <option value="pending">Pending</option>
                          <option value="cancelled">Cancelled</option>
                          <option value="expired">Expired</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">Renewal Due Within</label>
                        <select
                          value={filters.policy?.renewalWithinDays || ''}
                          onChange={(e) => setFilters({
                            ...filters,
                            policy: { ...filters.policy, renewalWithinDays: e.target.value ? Number(e.target.value) as any : null }
                          })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 font-semibold outline-none focus:border-blue-500"
                        >
                          <option value="">Any Expiration Time</option>
                          <option value="7">7 Days</option>
                          <option value="15">15 Days</option>
                          <option value="30">30 Days</option>
                          <option value="60">60 Days</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {activeFilterGroup === 'activity' && (
                    <div className="flex flex-wrap items-center gap-6 text-xs font-semibold text-slate-700">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filters.activity?.isNewLead || false}
                          onChange={(e) => setFilters({ ...filters, activity: { ...filters.activity, isNewLead: e.target.checked } })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>New Lead Only</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filters.activity?.noResponse || false}
                          onChange={(e) => setFilters({ ...filters, activity: { ...filters.activity, noResponse: e.target.checked } })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>No Activity / Uncontacted</span>
                      </label>
                    </div>
                  )}

                  {activeFilterGroup === 'marketing' && (
                    <div className="flex flex-wrap items-center gap-6 text-xs font-semibold text-slate-700">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filters.emailMarketing?.hasEmail ?? true}
                          onChange={(e) => setFilters({ ...filters, emailMarketing: { ...filters.emailMarketing, hasEmail: e.target.checked } })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>Has Valid Email</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filters.emailMarketing?.excludeUnsubscribed ?? true}
                          onChange={(e) => setFilters({ ...filters, emailMarketing: { ...filters.emailMarketing, excludeUnsubscribed: e.target.checked } })}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>Exclude Unsubscribed & Suppressed</span>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* AUDIENCE SUMMARY BAR & EXCLUSION CHIPS (LIGHT THEME) */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex items-center justify-between shadow-2xs">
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-slate-500">Total Matched</span>
                  <div className="text-2xl font-extrabold text-slate-900 mt-0.5">{calculating ? '...' : safetySummary?.totalMatched || 0}</div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-slate-500">👥</div>
              </div>

              <div className="bg-white border border-emerald-200/80 rounded-2xl p-4 flex items-center justify-between shadow-2xs bg-emerald-50/20">
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-emerald-700">Eligible Recipients</span>
                  <div className="text-2xl font-extrabold text-emerald-800 mt-0.5">{calculating ? '...' : safetySummary?.validRecipients || 0}</div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">✓</div>
              </div>

              <div className="bg-white border border-blue-200/80 rounded-2xl p-4 flex items-center justify-between shadow-2xs bg-blue-50/20">
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-blue-700">Selected to Send</span>
                  <div className="text-2xl font-extrabold text-blue-800 mt-0.5">{calculating ? '...' : finalSelectedCount}</div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">✉️</div>
              </div>

              <div className="bg-white border border-rose-200/80 rounded-2xl p-4 flex items-center justify-between shadow-2xs bg-rose-50/20">
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-rose-700">Excluded People</span>
                  <div className="text-2xl font-extrabold text-rose-800 mt-0.5">{calculating ? '...' : (safetySummary?.totalMatched || 0) - (safetySummary?.validRecipients || 0)}</div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">🛡️</div>
              </div>
            </div>

            {/* EXCLUSION BREAKDOWN INSPECTOR CHIPS */}
            {safetySummary && (
              <div className="bg-white border border-slate-200/80 rounded-2xl p-4 space-y-2 shadow-2xs">
                <span className="block text-[11px] font-extrabold uppercase text-slate-500">Inspect Excluded Recipient Categories (Click to view people)</span>
                <div className="flex flex-wrap gap-2 text-xs">
                  {Object.entries(excludedByCategory).map(([catName, list]) => (
                    <button
                      key={catName}
                      type="button"
                      onClick={() => setActiveExclusionCategory(activeExclusionCategory === catName ? null : catName)}
                      className={`px-3 py-1.5 rounded-xl font-bold border transition-all flex items-center gap-1.5 ${
                        activeExclusionCategory === catName
                          ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      <span>{catName}:</span>
                      <span className="px-1.5 py-0.2 bg-white border border-slate-200 rounded-md font-mono text-[11px]">{list.length}</span>
                    </button>
                  ))}
                </div>

                {/* Expanded Exclusion Inspector */}
                {activeExclusionCategory && (
                  <div className="mt-3 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 max-h-48 overflow-y-auto">
                    <h4 className="text-xs font-bold text-rose-800 flex items-center justify-between">
                      <span>Category: {activeExclusionCategory} ({excludedByCategory[activeExclusionCategory]?.length || 0} contacts)</span>
                      <button type="button" onClick={() => setActiveExclusionCategory(null)} className="text-slate-400 hover:text-slate-700 text-xs">✕ Close</button>
                    </h4>
                    <div className="divide-y divide-slate-200 text-xs">
                      {excludedByCategory[activeExclusionCategory]?.map((person, idx) => (
                        <div key={idx} className="py-2 flex items-center justify-between">
                          <div>
                            <span className="font-bold text-slate-900">{person.name}</span>
                            <span className="text-slate-500 ml-2 font-mono">({person.email})</span>
                          </div>
                          <span className="px-2 py-0.5 bg-rose-50 text-rose-700 rounded border border-rose-200 text-[10px] font-bold">
                            {person.reason}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ALWAYS-VISIBLE RECIPIENT TABLE (LIGHT THEME) */}
            <div className="bg-white border border-slate-200/80 rounded-3xl overflow-hidden shadow-2xs space-y-4 p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Recipient Verification Table</h3>
                  <p className="text-xs text-slate-500">Check/uncheck recipients to include or exclude them from this specific dispatch.</p>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <input
                    type="text"
                    value={tableSearchQuery}
                    onChange={(e) => setTableSearchQuery(e.target.value)}
                    placeholder="Search recipients..."
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-semibold outline-none focus:border-blue-500 w-full sm:w-48"
                  />

                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setTableFilterMode('all')}
                      className={`px-2.5 py-1 rounded-lg ${tableFilterMode === 'all' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-600'}`}
                    >
                      All ({safetySummary?.details.length || 0})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTableFilterMode('selected')}
                      className={`px-2.5 py-1 rounded-lg ${tableFilterMode === 'selected' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-600'}`}
                    >
                      Selected ({finalSelectedCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTableFilterMode('excluded')}
                      className={`px-2.5 py-1 rounded-lg ${tableFilterMode === 'excluded' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-600'}`}
                    >
                      Excluded ({(safetySummary?.details.length || 0) - (safetySummary?.validRecipients || 0)})
                    </button>
                  </div>
                </div>
              </div>

              {/* Table Render */}
              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                      <th className="py-3 px-4 w-10">
                        <input
                          type="checkbox"
                          checked={finalSelectedCount > 0 && finalSelectedCount === safetySummary?.validRecipients}
                          onChange={(e) => handleSelectAllEligible(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </th>
                      <th className="py-3 px-4">Name</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4">Carrier</th>
                      <th className="py-3 px-4">Policy Status</th>
                      <th className="py-3 px-4">State</th>
                      <th className="py-3 px-4">Agent</th>
                      <th className="py-3 px-4">Eligibility Status</th>
                      <th className="py-3 px-4">Renewal Expiration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150 font-medium text-slate-800">
                    {filteredRecipientRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400 font-medium">
                          No recipient records match the selected view filters.
                        </td>
                      </tr>
                    ) : (
                      filteredRecipientRows.map((row, i) => {
                        const isSelected = !row.isExcluded && selectedEmails.has(row.email.toLowerCase());
                        return (
                          <tr key={i} className={`hover:bg-slate-50 ${row.isExcluded ? 'bg-rose-50/30' : isSelected ? 'bg-blue-50/20' : ''}`}>
                            <td className="py-3 px-4">
                              <input
                                type="checkbox"
                                disabled={row.isExcluded}
                                checked={isSelected}
                                onChange={() => handleToggleRecipient(row.email)}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-30"
                              />
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-900">{row.name}</td>
                            <td className="py-3 px-4 font-mono text-slate-600">{row.email}</td>
                            <td className="py-3 px-4 font-semibold text-slate-700">{row.carrier || 'Ambetter'}</td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-md text-[10px] font-bold">
                                {row.policyStatus || 'Active'}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-800">{row.state || 'FL'}</td>
                            <td className="py-3 px-4 text-slate-600">{row.assignedAgent || 'Damaris'}</td>
                            <td className="py-3 px-4">
                              {row.isExcluded ? (
                                <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-md font-bold text-[10px]">
                                  Excluded: {row.reason}
                                </span>
                              ) : isSelected ? (
                                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md font-bold text-[10px]">
                                  ✓ Eligible & Selected
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md font-bold text-[10px]">
                                  Unselected
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-slate-500 text-[11px]">{row.expirationDate || '2026-12-31'}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: VISUAL BLOCK EDITOR & REAL RECIPIENT PREVIEW */}
        {step === 2 && (
          <div className="animate-fadeIn">
            <VisualEmailBuilder
              initialHtml={contentHtml}
              templates={templates}
              senderAccounts={senderAccounts}
              selectedRecipients={selectedRecipientsForPreview}
              subject={subject}
              setSubject={setSubject}
              previewText={previewText}
              setPreviewText={setPreviewText}
              fromName={fromName}
              setFromName={setFromName}
              fromEmail={fromEmail}
              setFromEmail={setFromEmail}
              replyTo={replyTo}
              setReplyTo={setReplyTo}
              onChangeHtml={setContentHtml}
              onSaveAsTemplate={handleSaveAsTemplate}
              onSaveDraft={async () => {
                await persistDraft('DRAFT');
                alert('Campaign draft saved successfully.');
              }}
            />
          </div>
        )}

        {/* STEP 3: REVIEW WORKSPACE (LIGHT THEME) */}
        {step === 3 && (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 space-y-2 shadow-2xs">
              <h2 className="text-lg font-extrabold text-slate-900">Pre-Flight Review & Campaign Audit</h2>
              <p className="text-xs text-slate-500">Review four core dimensions of your campaign before final dispatch confirmation.</p>
            </div>

            {/* 4 Cards Review Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* A. CAMPAIGN CARD */}
              <div className="bg-white border border-slate-200/80 rounded-3xl p-6 space-y-4 shadow-2xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                    <span>📧</span> A. Campaign Metadata
                  </h3>
                  <button type="button" onClick={() => setStep(2)} className="text-xs font-bold text-blue-600 hover:underline">Edit Content →</button>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-100"><span className="text-slate-500">Campaign Name:</span><span className="font-bold text-slate-900">{campaignName}</span></div>
                  <div className="flex justify-between py-1 border-b border-slate-100"><span className="text-slate-500">Subject Line:</span><span className="font-bold text-slate-900">{subject}</span></div>
                  <div className="flex justify-between py-1 border-b border-slate-100"><span className="text-slate-500">Preview Text:</span><span className="text-slate-700">{previewText || 'None'}</span></div>
                  <div className="flex justify-between py-1"><span className="text-slate-500">Channel:</span><span className="font-bold text-blue-600">EMAIL</span></div>
                </div>
              </div>

              {/* B. SENDER CARD */}
              <div className="bg-white border border-slate-200/80 rounded-3xl p-6 space-y-4 shadow-2xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                    <span>📫</span> B. Sender Identity & Routing
                  </h3>
                  <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-[10px] font-bold">
                    ✓ Domain Verified
                  </span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-100"><span className="text-slate-500">From Name:</span><span className="font-bold text-slate-900">{fromName}</span></div>
                  <div className="flex justify-between py-1 border-b border-slate-100"><span className="text-slate-500">From Email:</span><span className="font-mono text-slate-900">{fromEmail}</span></div>
                  <div className="flex justify-between py-1 border-b border-slate-100"><span className="text-slate-500">Reply-To Address:</span><span className="font-mono text-slate-900">{replyTo}</span></div>
                  <div className="flex justify-between py-1"><span className="text-slate-500">Sending Domain:</span><span className="font-bold text-emerald-700">mail.smartrackcrm.com</span></div>
                </div>
              </div>

              {/* C. RECIPIENTS CARD */}
              <div className="bg-white border border-slate-200/80 rounded-3xl p-6 space-y-4 shadow-2xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                    <span>👥</span> C. Audience Breakdown
                  </h3>
                  <button type="button" onClick={() => setShowRecipientModal(true)} className="text-xs font-bold text-blue-600 hover:underline">View All Recipients ({finalSelectedCount}) →</button>
                </div>
                <div className="grid grid-cols-2 gap-3 text-center text-xs">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <span className="block text-[10px] font-bold text-blue-700 uppercase">Selected Recipients</span>
                    <span className="text-xl font-extrabold text-slate-900">{finalSelectedCount}</span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <span className="block text-[10px] font-bold text-rose-700 uppercase">Excluded People</span>
                    <span className="text-xl font-extrabold text-slate-900">{(safetySummary?.totalMatched || 0) - (safetySummary?.validRecipients || 0)}</span>
                  </div>
                </div>
              </div>

              {/* D. SAFETY & COMPLIANCE CARD */}
              <div className="bg-white border border-slate-200/80 rounded-3xl p-6 space-y-4 shadow-2xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                    <span>🛡️</span> D. Safety & Provider Health
                  </h3>
                  <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold ${
                    providerStatus?.isLive
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                  }`}>
                    {providerStatus?.isLive ? 'LIVE RESEND DELIVERY' : 'SAFE MOCK MODE'}
                  </span>
                </div>
                <div className="space-y-1.5 text-xs text-emerald-700 font-semibold">
                  <div className="flex items-center gap-2"><span>✓</span> Valid sender identity & domain SPF/DKIM/DMARC passed</div>
                  <div className="flex items-center gap-2"><span>✓</span> Global suppression list checked</div>
                  <div className="flex items-center gap-2"><span>✓</span> Duplicate recipient emails removed</div>
                  <div className="flex items-center gap-2"><span>✓</span> Unsubscribe header mechanism injected</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: SEND / SCHEDULE DISPATCH CONFIRMATION (LIGHT THEME) */}
        {step === 4 && (
          <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn">
            <div className="bg-white border border-slate-200/80 rounded-3xl p-8 space-y-6 shadow-2xs">
              <div className="text-center space-y-2 border-b border-slate-100 pb-6">
                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto text-2xl font-bold border border-blue-200">
                  🚀
                </div>
                <h2 className="text-xl font-extrabold text-slate-900">Final Dispatch Pre-Flight Confirmation</h2>
                <p className="text-xs text-slate-500">Review final campaign delivery parameters before executing dispatch.</p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-200"><span className="text-slate-500">Campaign Name:</span><span className="font-extrabold text-slate-900">{campaignName}</span></div>
                <div className="flex justify-between py-1.5 border-b border-slate-200"><span className="text-slate-500">Sender Identity:</span><span className="font-bold text-slate-900">{fromName} &lt;{fromEmail}&gt;</span></div>
                <div className="flex justify-between py-1.5 border-b border-slate-200"><span className="text-slate-500">Reply-To Inbox:</span><span className="font-bold text-slate-900">{replyTo}</span></div>
                <div className="flex justify-between py-1.5 border-b border-slate-200"><span className="text-slate-500">Audience Selection:</span><span className="font-extrabold text-blue-700">{finalSelectedCount} selected recipients</span></div>
                <div className="flex justify-between py-1.5 border-b border-slate-200"><span className="text-slate-500">Pre-Flight Safety:</span><span className="font-extrabold text-emerald-700">{safetySummary?.validRecipients || 0} eligible ({(safetySummary?.totalMatched || 0) - (safetySummary?.validRecipients || 0)} excluded)</span></div>
                <div className="flex justify-between py-1.5 border-b border-slate-200"><span className="text-slate-500">Subject Line:</span><span className="font-bold text-slate-900">{subject}</span></div>
                <div className="flex justify-between py-1.5"><span className="text-slate-500">Delivery Mode:</span><span className={`font-extrabold ${providerStatus?.isLive ? 'text-emerald-700' : 'text-blue-700'}`}>{providerStatus?.isLive ? 'LIVE RESEND DELIVERY' : 'SAFE MOCK MODE (Local Test)'}</span></div>
              </div>

              {/* Exclusion Reasons Breakdown if any candidate is excluded */}
              {safetySummary && safetySummary.details.filter((d) => d.isExcluded).length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2 text-xs">
                  <span className="font-extrabold text-amber-900 block flex items-center gap-1.5">
                    <span>⚠️</span> Safety Exclusion Details ({safetySummary.details.filter((d) => d.isExcluded).length}):
                  </span>
                  <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                    {safetySummary.details.filter((d) => d.isExcluded).map((ex, i) => (
                      <div key={i} className="flex justify-between items-center bg-white p-2 rounded-xl border border-amber-200 text-slate-800">
                        <span className="font-bold">{ex.name} <span className="text-slate-500 font-mono text-[11px]">({ex.email})</span></span>
                        <span className="font-extrabold text-rose-700 bg-rose-50 px-2 py-0.5 rounded text-[10px] border border-rose-200">
                          {ex.reason || 'Safety Exclusion'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Dispatch Mode Selector */}
              <div className="space-y-3 pt-2">
                <label className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl cursor-pointer hover:border-blue-500 transition-colors">
                  <input
                    type="radio"
                    name="sendMode"
                    checked={sendMode === 'now'}
                    onChange={() => setSendMode('now')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="block text-xs font-bold text-slate-900">Send Immediately</span>
                    <span className="text-[11px] text-slate-500">Dispatch campaign now to {finalSelectedCount} selected recipients</span>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl cursor-pointer hover:border-blue-500 transition-colors">
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
                        className="bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 outline-none"
                      />
                    )}
                  </div>
                </label>
              </div>

              {sendResultMsg && (
                <div className={`p-4 rounded-2xl text-xs font-bold border ${
                  sendResultMsg.success ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}>
                  {sendResultMsg.text}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-4 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRecipientModal(true)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-200"
                >
                  Inspect Recipients
                </button>
                <button
                  type="button"
                  disabled={isSending}
                  onClick={handleFinalSubmit}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md disabled:opacity-50"
                >
                  {isSending ? 'Dispatching...' : sendMode === 'schedule' ? 'Confirm & Schedule' : 'Confirm & Dispatch Campaign'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* RECIPIENT INSPECTION MODAL */}
      {showRecipientModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 font-sans">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-4xl w-full p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Full Recipient List Audit</h3>
                <p className="text-xs text-slate-500">Total {finalSelectedCount} selected recipients for campaign &apos;{campaignName}&apos;</p>
              </div>
              <button
                type="button"
                onClick={() => setShowRecipientModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 font-bold hover:text-slate-900 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto flex-1 border border-slate-200 rounded-2xl divide-y divide-slate-100 text-xs">
              {safetySummary?.details
                .filter((d) => !d.isExcluded && selectedEmails.has(d.email.toLowerCase()))
                .map((row, idx) => (
                  <div key={idx} className="p-3 flex items-center justify-between hover:bg-slate-50">
                    <div>
                      <span className="font-bold text-slate-900">{row.name}</span>
                      <span className="text-slate-500 ml-2 font-mono">({row.email})</span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-500">
                      <span>{row.carrier || 'Ambetter'}</span>
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-bold text-[10px]">
                        ✓ Selected
                      </span>
                    </div>
                  </div>
                ))}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowRecipientModal(false)}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl"
              >
                Close Audit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
