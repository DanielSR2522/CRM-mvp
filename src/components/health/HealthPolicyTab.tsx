'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { HealthPolicy } from '@/lib/health/types';
import { fetchHealthPolicy } from '@/lib/health/health-service';
import HealthPolicyForm from './HealthPolicyForm';
import HealthDocuments from './HealthDocuments';
import HealthNotes from './HealthNotes';
import HealthTimeline from './HealthTimeline';
import HealthClientHeader, { ClientProfileNavTabs } from './HealthClientHeader';
import HealthLeftRail from './HealthLeftRail';
import MarketplaceSearchWorkspace from './MarketplaceSearchWorkspace';
import HealthMedicalWorkspace from './HealthMedicalWorkspace';

interface HealthPolicyTabProps {
  clientId: string;
  agentName: string;
  currentUserId: string | null;
  formatIsoToUsDate: (date: string) => string;
  clientName?: string;
  photoUrl?: string | null;
  lastUpdated?: string | null;
  onSendEmail?: () => void;
  onConsent?: () => void;
  onDeleteProfile?: () => void;
  isCompanyClient?: boolean;
}

export default function HealthPolicyTab({
  clientId,
  agentName,
  currentUserId,
  formatIsoToUsDate,
  clientName = 'Client Profile',
  photoUrl,
  lastUpdated,
  onSendEmail,
  onConsent,
  onDeleteProfile,
  isCompanyClient = false
}: HealthPolicyTabProps) {
  const [healthPolicy, setHealthPolicy] = useState<HealthPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'summary' | 'documents' | 'notes' | 'timeline' | 'marketplace' | 'medical' | 'links'>('summary');
  const [marketplacePlan, setMarketplacePlan] = useState<any | null>(null);
  const [marketplaceContextInfo, setMarketplaceContextInfo] = useState<any | null>(null);
  
  // Self-contained Toast Notification System
  const [toast, setToast] = useState<{ title: string; description: string; type: 'success' | 'error' | 'warning' } | null>(null);

  const addToast = useCallback((t: { title: string; description: string; type: 'success' | 'error' | 'warning' }) => {
    setToast(t);
  }, []);

  // Clear toast after 4 seconds
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const loadPolicy = useCallback(async () => {
    if (!clientId) return;
    try {
      setLoading(true);
      const data = await fetchHealthPolicy(clientId);
      setHealthPolicy(data);
    } catch (err) {
      console.error('Failed to load health policy:', err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadPolicy();
  }, [loadPolicy]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-slate-500 text-sm font-semibold">
          <svg className="animate-spin h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading Health Workspace...
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full font-sans min-h-screen bg-white">
      {/* 1. White Client Identity Header Bar */}
      <HealthClientHeader
        clientId={clientId}
        clientName={clientName}
        photoUrl={photoUrl}
        lastUpdated={lastUpdated}
        onSendEmail={onSendEmail}
        onConsent={onConsent}
        onDeleteProfile={onDeleteProfile}
        isCompanyClient={isCompanyClient}
        activeSection="health"
        hideNavStrip={true}
      />

      {/* Toast Notification Header Banner if present */}
      {toast && (
        <div className={`mx-6 mt-4 p-4 rounded-xl border text-xs font-semibold shadow-xs animate-fadeIn ${
          toast.type === 'success'
            ? 'bg-emerald-50 border-emerald-100 text-emerald-800'
            : toast.type === 'error'
            ? 'bg-rose-50 border-rose-100 text-rose-800'
            : 'bg-amber-50 border-amber-100 text-amber-800'
        }`}>
          <h5 className="font-extrabold text-[10px] uppercase tracking-wider">{toast.title}</h5>
          <p className="text-xs font-semibold mt-0.5">{toast.description}</p>
        </div>
      )}

      {/* 2. Main Workspace Layout */}
      <div className="flex flex-col lg:flex-row items-stretch w-full flex-1 min-h-0">
        {/* Left Context Rail (White, extends full height to bottom) */}
        <HealthLeftRail
          clientId={clientId}
          activeSubTab={activeSubTab}
          setActiveSubTab={setActiveSubTab}
          marketplacePlanData={marketplacePlan}
          marketplaceContextInfo={marketplaceContextInfo}
        />

        {/* Soft-Gray Vertical Strip (8px wide, #F1F5F9 / bg-slate-100) */}
        <div className="hidden lg:block w-2 shrink-0 bg-slate-100 self-stretch" />

        {/* Right Main Content Workspace (Full Width) */}
        <div className="flex-1 w-full min-w-0 bg-white flex flex-col">
          {/* Profile Navigation Strip aligned at main content boundary (starting at vertical divider) */}
          <ClientProfileNavTabs
            clientId={clientId}
            activeSection="health"
            isCompanyClient={isCompanyClient}
          />

          {/* Main Content Area starting directly below tabs */}
          <div className="p-6 flex-1 bg-white space-y-6">
            {activeSubTab === 'marketplace' ? (
              <MarketplaceSearchWorkspace
                healthPolicyId={healthPolicy?.id}
                context={marketplaceContextInfo?.context || {
                  coverageYear: 2026,
                  zipCode: null,
                  state: null,
                  countyName: null,
                  countyFips: null,
                  householdIncome: null,
                  householdSize: 1,
                  coveredApplicants: 1,
                  people: [],
                  validationErrors: [],
                }}
                onApplyPlan={async (plan) => {
                  if (marketplaceContextInfo?.onApplyPlan) {
                    const res = await marketplaceContextInfo.onApplyPlan(plan);
                    await loadPolicy();
                    return res;
                  }
                }}
                onUnlinkPlan={async () => {
                  if (healthPolicy?.id) {
                    const { unlinkMarketplacePlan } = await import('@/lib/marketplace/snapshot-service');
                    const res = await unlinkMarketplacePlan(healthPolicy.id);
                    if (res.success) {
                      setMarketplacePlan(null);
                      await loadPolicy();
                    }
                    return res;
                  }
                  return { success: false, error: 'No policy ID' };
                }}
                appliedPlan={marketplaceContextInfo?.appliedPlan || null}
                addToast={addToast}
                onReturnToSummary={() => setActiveSubTab('summary')}
              />
            ) : activeSubTab === 'medical' && healthPolicy ? (
              <HealthMedicalWorkspace
                healthPolicyId={healthPolicy.id}
                clientId={clientId}
                addToast={addToast}
                onReturnToSummary={() => setActiveSubTab('summary')}
              />
            ) : !healthPolicy && !isEditing ? (
              <div className="py-12 text-center space-y-6 font-sans">
                <div className="max-w-md mx-auto space-y-2">
                  <h3 className="text-lg font-extrabold text-slate-900">No Health Policy Registered</h3>
                  <p className="text-slate-500 text-sm">
                    This client does not have a health policy registered yet. You can create one below.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-md shadow-blue-500/10"
                >
                  Create Health Policy
                </button>
              </div>
            ) : activeSubTab === 'summary' || isEditing ? (
              <HealthPolicyForm
                clientId={clientId}
                agentName={agentName}
                initialPolicy={healthPolicy}
                isEditing={isEditing}
                setIsEditing={setIsEditing}
                onSaved={(p) => {
                  setHealthPolicy(p);
                  loadPolicy();
                }}
                onMarketplacePlanLoaded={setMarketplacePlan}
                onMarketplaceContextUpdated={setMarketplaceContextInfo}
                addToast={addToast}
              />
            ) : activeSubTab === 'documents' && healthPolicy ? (
              <HealthDocuments
                clientId={clientId}
                healthPolicyId={healthPolicy.id}
                addToast={addToast}
              />
            ) : activeSubTab === 'notes' && healthPolicy ? (
              <HealthNotes
                clientId={clientId}
                healthPolicyId={healthPolicy.id}
                currentUserId={currentUserId}
                addToast={addToast}
              />
            ) : activeSubTab === 'timeline' && healthPolicy ? (
              <HealthTimeline
                clientId={clientId}
                healthPolicyId={healthPolicy.id}
                addToast={addToast}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
