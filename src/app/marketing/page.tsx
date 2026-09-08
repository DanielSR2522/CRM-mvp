'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import CrmPageContainer from '@/components/layout/CrmPageContainer';
import MarketingHeader, { MarketingTab } from '@/components/marketing/MarketingHeader';
import MarketingDashboardView from '@/components/marketing/MarketingDashboardView';
import CampaignsListView from '@/components/marketing/CampaignsListView';
import CampaignWizardModal from '@/components/marketing/CampaignWizardModal';
import SegmentsView from '@/components/marketing/SegmentsView';
import TemplatesView from '@/components/marketing/TemplatesView';
import AutomationsView from '@/components/marketing/AutomationsView';
import ReportsView from '@/components/marketing/ReportsView';
import EmailHealthView from '@/components/marketing/EmailHealthView';
import SenderSettingsView from '@/components/marketing/SenderSettingsView';

import {
  MarketingCampaign,
  MarketingSegment,
  MarketingTemplate,
  MarketingSuppression,
  MarketingSenderAccount,
  MarketingAutomation,
  SafetyCheckSummary,
} from '@/types/marketing';

import {
  getCampaigns,
  createCampaign,
  executeCampaignSend,
  getSegments,
  createSegment,
  getTemplates,
  createTemplate,
  getSuppressions,
  addSuppression,
  getSenderAccounts,
  getAutomations,
} from '@/lib/marketing/marketing-service';

import { useRouter, useSearchParams } from 'next/navigation';

export default function MarketingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');

  const [activeTab, setActiveTab] = useState<MarketingTab>('dashboard');
  const [selectedHistoryCampaign, setSelectedHistoryCampaign] = useState<MarketingCampaign | null>(null);

  const oauthParam = searchParams.get('oauth');
  const statusParam = searchParams.get('status');

  useEffect(() => {
    if (tabParam && ['dashboard', 'campaigns', 'segments', 'templates', 'automations', 'reports', 'email-health', 'settings'].includes(tabParam)) {
      setActiveTab(tabParam as MarketingTab);
    }
    if (oauthParam || statusParam) {
      loadData();
    }
  }, [tabParam, oauthParam, statusParam]);

  // Data Collections
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [segments, setSegments] = useState<MarketingSegment[]>([]);
  const [templates, setTemplates] = useState<MarketingTemplate[]>([]);
  const [suppressions, setSuppressions] = useState<MarketingSuppression[]>([]);
  const [senderAccounts, setSenderAccounts] = useState<MarketingSenderAccount[]>([]);
  const [automations, setAutomations] = useState<MarketingAutomation[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cList, segList, tplList, supList, sndList, autList] = await Promise.all([
        getCampaigns(),
        getSegments(),
        getTemplates(),
        getSuppressions(),
        getSenderAccounts(),
        getAutomations(),
      ]);

      setCampaigns(cList);
      setSegments(segList);
      setTemplates(tplList);
      setSuppressions(supList);
      setSenderAccounts(sndList);
      setAutomations(autList);
    } catch (err) {
      console.error('Failed to load marketing data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveCampaign = async (data: Partial<MarketingCampaign>) => {
    const created = await createCampaign(data);
    await loadData();
    return created;
  };

  const handleExecuteSend = async (campaignId: string, safetySummary: SafetyCheckSummary) => {
    const res = await executeCampaignSend(campaignId, safetySummary);
    await loadData();
    return res;
  };

  const handleCreateSegment = async (data: Partial<MarketingSegment>) => {
    const created = await createSegment(data);
    await loadData();
    return created;
  };

  const handleCreateTemplate = async (data: Partial<MarketingTemplate>) => {
    const created = await createTemplate(data);
    await loadData();
    return created;
  };

  const handleAddSuppression = async (
    email: string,
    reason: MarketingSuppression['reason'],
    details?: string
  ) => {
    const created = await addSuppression(email, reason, details);
    await loadData();
    return created;
  };

  return (
    <DashboardLayout>
      <MarketingHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onNewCampaignClick={() => router.push('/marketing/campaigns/builder')}
      />

      <CrmPageContainer className="p-4 md:p-6 lg:p-8 font-sans">
        {loading ? (
          <div className="flex justify-center items-center py-20 bg-white border border-slate-100 rounded-2xl shadow-sm">
            <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <MarketingDashboardView
                campaigns={campaigns}
                onNavigateTab={setActiveTab}
                onNewCampaign={() => router.push('/marketing/campaigns/builder')}
              />
            )}

            {activeTab === 'campaigns' && (
              <CampaignsListView
                campaigns={campaigns}
                onOpenWizard={() => router.push('/marketing/campaigns/builder')}
                onSelectCampaignHistory={(c) => setSelectedHistoryCampaign(c)}
              />
            )}

            {activeTab === 'segments' && (
              <SegmentsView
                segments={segments}
                onCreateSegment={handleCreateSegment}
              />
            )}

            {activeTab === 'templates' && (
              <TemplatesView
                templates={templates}
                onCreateTemplate={handleCreateTemplate}
              />
            )}

            {activeTab === 'automations' && (
              <AutomationsView automations={automations} />
            )}

            {activeTab === 'reports' && (
              <ReportsView campaigns={campaigns} />
            )}

            {activeTab === 'email-health' && (
              <EmailHealthView
                suppressions={suppressions}
                senderAccounts={senderAccounts}
                onAddSuppression={handleAddSuppression}
              />
            )}

            {activeTab === 'settings' && (
              <SenderSettingsView senderAccounts={senderAccounts} onRefreshData={loadData} />
            )}
          </>
        )}
      </CrmPageContainer>

      {/* Campaign History & Audit Drawer */}
      {selectedHistoryCampaign && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-end font-sans">
          <div className="bg-white h-full w-full max-w-lg shadow-2xl p-6 space-y-6 overflow-y-auto animate-slideInRight">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600">
                  Campaign Audit Log
                </span>
                <h3 className="text-base font-bold text-slate-900">{selectedHistoryCampaign.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedHistoryCampaign(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold flex items-center justify-center text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
                <div className="flex justify-between"><span className="text-slate-400 font-medium">Status:</span><span className="font-bold text-slate-900">{selectedHistoryCampaign.status}</span></div>
                <div className="flex justify-between"><span className="text-slate-400 font-medium">Channel:</span><span className="font-bold text-slate-900">{selectedHistoryCampaign.channel}</span></div>
                <div className="flex justify-between"><span className="text-slate-400 font-medium">Subject Line:</span><span className="font-bold text-slate-900">{selectedHistoryCampaign.subject || 'N/A'}</span></div>
                <div className="flex justify-between"><span className="text-slate-400 font-medium">From:</span><span className="font-bold text-slate-900">{selectedHistoryCampaign.from_name} ({selectedHistoryCampaign.from_email})</span></div>
                <div className="flex justify-between"><span className="text-slate-400 font-medium">Created At:</span><span className="font-bold text-slate-900">{new Date(selectedHistoryCampaign.created_at).toLocaleString()}</span></div>
                {selectedHistoryCampaign.sent_at && (
                  <div className="flex justify-between"><span className="text-slate-400 font-medium">Dispatched At:</span><span className="font-bold text-slate-900">{new Date(selectedHistoryCampaign.sent_at).toLocaleString()}</span></div>
                )}
              </div>

              <div className="border border-slate-200 rounded-2xl p-4 space-y-2 bg-white">
                <h4 className="font-bold text-slate-900">Safety & Exclusion Breakdown</h4>
                <div className="grid grid-cols-2 gap-2 text-center text-xs pt-2">
                  <div className="p-2 bg-slate-50 rounded-lg"><span className="block text-[10px] text-slate-400">Matched</span><span className="font-bold">{selectedHistoryCampaign.total_matched}</span></div>
                  <div className="p-2 bg-emerald-50 text-emerald-800 rounded-lg"><span className="block text-[10px] text-emerald-600">Valid</span><span className="font-bold">{selectedHistoryCampaign.valid_recipients}</span></div>
                  <div className="p-2 bg-amber-50 text-amber-800 rounded-lg"><span className="block text-[10px] text-amber-600">Duplicates Excl.</span><span className="font-bold">{selectedHistoryCampaign.excluded_duplicates}</span></div>
                  <div className="p-2 bg-rose-50 text-rose-800 rounded-lg"><span className="block text-[10px] text-rose-600">Unsub/Bounce Excl.</span><span className="font-bold">{(selectedHistoryCampaign.excluded_unsubscribed || 0) + (selectedHistoryCampaign.excluded_bounced || 0)}</span></div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedHistoryCampaign(null)}
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
              >
                Close Audit Log
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
