'use client';

import React, { useState, useEffect, Suspense } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import FullPageCampaignBuilder from '@/components/marketing/FullPageCampaignBuilder';
import {
  MarketingSegment,
  MarketingTemplate,
  MarketingSenderAccount,
  MarketingCampaign,
} from '@/types/marketing';
import {
  getSegments,
  getTemplates,
  getSenderAccounts,
  createCampaign,
  createTemplate,
} from '@/lib/marketing/marketing-service';

function CampaignBuilderContent() {
  const [segments, setSegments] = useState<MarketingSegment[]>([]);
  const [templates, setTemplates] = useState<MarketingTemplate[]>([]);
  const [senderAccounts, setSenderAccounts] = useState<MarketingSenderAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadInitialData() {
      try {
        const [segList, tplList, sndList] = await Promise.all([
          getSegments(),
          getTemplates(),
          getSenderAccounts(),
        ]);
        setSegments(segList);
        setTemplates(tplList);
        setSenderAccounts(sndList);
      } catch (err) {
        console.error('Failed to load builder data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadInitialData();
  }, []);

  const handleSaveCampaign = async (data: Partial<MarketingCampaign>) => {
    return await createCampaign(data);
  };

  const handleCreateTemplate = async (data: Partial<MarketingTemplate>) => {
    return await createTemplate(data);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8 text-slate-900 font-sans text-xs">
          <div className="flex items-center gap-3 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <svg className="animate-spin h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="font-bold">Loading Campaign Workspace...</span>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <FullPageCampaignBuilder
        segments={segments}
        templates={templates}
        senderAccounts={senderAccounts}
        onSaveCampaign={handleSaveCampaign}
        onCreateTemplate={handleCreateTemplate}
      />
    </DashboardLayout>
  );
}

export default function CampaignBuilderPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-700 text-xs">Loading Builder Workspace...</div>}>
      <CampaignBuilderContent />
    </Suspense>
  );
}
