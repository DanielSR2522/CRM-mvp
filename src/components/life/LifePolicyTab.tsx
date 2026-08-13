'use client';

import React, { useState, useEffect, useCallback } from 'react';
import HealthClientHeader from '@/components/health/HealthClientHeader';
import LifeLeftRail from './LifeLeftRail';
import LifePolicyCard, { LifePolicy } from './LifePolicyCard';
import ModuleDocumentsManager from '@/components/documents/ModuleDocumentsManager';
import UnifiedNotesManager from '@/components/notes/UnifiedNotesManager';
import { supabase } from '@/lib/supabaseClient';

interface LifePolicyTabProps {
  clientId: string;
  clientName?: string;
  photoUrl?: string | null;
  lastUpdated?: string | null;
  onSendEmail?: () => void;
  onConsent?: () => void;
  onDeleteProfile?: () => void;
  isCompanyClient?: boolean;
  initialSubtab?: 'summary' | 'documents' | 'notes' | 'timeline' | 'links';
  currentUserId?: string | null;
  onPoliciesChanged?: () => void;
}

export default function LifePolicyTab({
  clientId,
  clientName = 'Client Profile',
  photoUrl = null,
  lastUpdated = null,
  onSendEmail,
  onConsent,
  onDeleteProfile,
  isCompanyClient = false,
  initialSubtab = 'summary',
  currentUserId = null,
  onPoliciesChanged,
}: LifePolicyTabProps) {
  // Navigation State: SUMMARY | DOCUMENTS | NOTES | TIMELINE | LINKS
  const [activeSubtab, setActiveSubtab] = useState<'summary' | 'documents' | 'notes' | 'timeline' | 'links'>(
    (initialSubtab as any) || 'summary'
  );

  const [policies, setPolicies] = useState<LifePolicy[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isAdding, setIsAdding] = useState<boolean>(false);

  const loadPolicies = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('life_policies')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setPolicies(data || []);
    } catch (err) {
      console.error('Failed to load life policies:', err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadPolicies();
  }, [loadPolicies]);

  const handleAddPolicy = async () => {
    setIsAdding(true);
    try {
      const { data, error } = await supabase
        .from('life_policies')
        .insert({
          client_id: clientId,
          status: 'Active',
        })
        .select('*')
        .single();

      if (error) throw error;

      // Create initial timeline event
      await supabase.from('life_policy_timeline_events').insert({
        life_policy_id: data.id,
        title: 'Life Policy Created',
        description: 'New Life Policy record initialized',
        event_type: 'policy_created',
      });

      await loadPolicies();
      if (onPoliciesChanged) onPoliciesChanged();
    } catch (err: any) {
      console.error('Failed to add life policy:', err);
      alert('Failed to add life policy: ' + err.message);
    } finally {
      setIsAdding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-16 font-sans">
        <div className="flex items-center gap-3 text-slate-500 text-xs font-bold">
          <svg className="animate-spin h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading Life Workspace...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 font-sans">
      {/* 1. Canonical Shared Client Header */}
      <HealthClientHeader
        clientId={clientId}
        clientName={clientName}
        photoUrl={photoUrl}
        lastUpdated={null}
        onSendEmail={onSendEmail}
        onConsent={onConsent}
        onDeleteProfile={onDeleteProfile}
        isCompanyClient={isCompanyClient}
        activeSection="life"
      />

      {/* 2. Main Workspace Layout */}
      <div className="px-4 py-6 md:px-8 md:py-8 flex flex-col lg:flex-row items-start gap-6">
        {/* Left Context Rail (Includes Client Life Profile box placed directly after Links) */}
        <LifeLeftRail
          clientId={clientId}
          activeSubTab={activeSubtab}
          setActiveSubTab={setActiveSubtab}
        />

        {/* Right Main Content Workspace */}
        <div className="flex-1 w-full min-w-0 space-y-4">
          {/* SUBTAB 1: SUMMARY */}
          {activeSubtab === 'summary' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="bg-white border border-slate-200/70 rounded-xl p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-sans">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">
                    Life Policies
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Manage life insurance policies, attached products, and beneficiaries.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddPolicy}
                  disabled={isAdding}
                  className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-blue-500/10 disabled:opacity-50"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                  </svg>
                  {isAdding ? 'Creating Policy...' : '+ Add Life Policy'}
                </button>
              </div>

              {policies.length === 0 ? (
                <div className="bg-white border border-slate-200/70 rounded-xl p-12 text-center space-y-3 font-sans">
                  <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <h4 className="text-sm font-bold text-slate-800">No Life Policies Found</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    This client does not have any Life Insurance policies recorded yet. Click below to add the first policy.
                  </p>
                  <button
                    type="button"
                    onClick={handleAddPolicy}
                    disabled={isAdding}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-xl transition-all shadow-xs"
                  >
                    + Add First Life Policy
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {policies.map((p, idx) => (
                    <LifePolicyCard
                      key={p.id}
                      policy={p}
                      index={idx}
                      onPolicyUpdated={() => {
                        loadPolicies();
                        if (onPoliciesChanged) onPoliciesChanged();
                      }}
                      onPolicyDeleted={() => {
                        loadPolicies();
                        if (onPoliciesChanged) onPoliciesChanged();
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SUBTAB 2: DOCUMENTS */}
          {activeSubtab === 'documents' && (
            <div className="animate-in fade-in duration-150">
              <ModuleDocumentsManager
                clientId={clientId}
                moduleType="life"
                moduleLabel="Life Insurance"
              />
            </div>
          )}

          {/* SUBTAB 3: NOTES */}
          {activeSubtab === 'notes' && (
            <div className="animate-in fade-in duration-150">
              <UnifiedNotesManager
                clientId={clientId}
                inferredCategory="life"
                currentUserId={currentUserId}
              />
            </div>
          )}

          {/* SUBTAB 4: TIMELINE */}
          {activeSubtab === 'timeline' && (
            <div className="bg-white border border-slate-200/70 rounded-xl p-6 shadow-2xs space-y-4 animate-in fade-in duration-150 font-sans">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">Life Activity Timeline</h3>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">Chronological record of Life policy updates and status changes.</p>
              </div>
              <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2 text-xs">
                <div className="flex items-center justify-between font-bold">
                  <span className="text-slate-900">Life Policies Count ({policies.length})</span>
                  <span className="text-slate-500 font-medium">{new Date().toLocaleDateString()}</span>
                </div>
                <p className="text-slate-600 font-medium">
                  Recorded life policies: {policies.map((p) => (p as any).carrier_name || (p as any).writing_company || (p as any).company || p.policy_number || 'Active Policy').join(', ') || 'None'}
                </p>
              </div>
            </div>
          )}

          {/* SUBTAB 5: LINKS */}
          {activeSubtab === 'links' && (
            <div className="bg-white border border-slate-200/70 rounded-xl p-6 shadow-2xs space-y-4 animate-in fade-in duration-150 font-sans">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">Saved Client Links</h3>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">Quick reference links for Life portals and carrier tools.</p>
              </div>
              <p className="text-xs text-slate-600">
                Saved links are also available for quick access in the left workspace rail.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
