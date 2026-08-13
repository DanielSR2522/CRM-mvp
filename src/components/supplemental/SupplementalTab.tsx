'use client';

import React, { useState, useEffect, useCallback } from 'react';
import HealthClientHeader from '@/components/health/HealthClientHeader';
import SupplementalLeftRail from './SupplementalLeftRail';
import SupplementalPolicyList from './SupplementalPolicyList';
import SupplementalPolicyDetails from './SupplementalPolicyDetails';
import SupplementalPolicyModal from './SupplementalPolicyModal';
import SupplementalDeleteConfirmModal from './SupplementalDeleteConfirmModal';
import ModuleDocumentsManager from '@/components/documents/ModuleDocumentsManager';
import UnifiedNotesManager from '@/components/notes/UnifiedNotesManager';
import { supabase } from '@/lib/supabaseClient';
import { SupplementalPolicy } from '@/types/supplemental';

interface Props {
  clientId: string;
  clientName?: string;
  photoUrl?: string | null;
  lastUpdated?: string | null;
  onSendEmail?: () => void;
  onConsent?: () => void;
  onDeleteProfile?: () => void;
  isCompanyClient?: boolean;
  initialPolicyId?: string | null;
  initialSubtab?: 'summary' | 'documents' | 'notes' | 'timeline' | 'links';
  currentUserId?: string | null;
  onPolicyDeleted?: () => void;
}

export default function SupplementalTab({
  clientId,
  clientName = 'Client Profile',
  photoUrl = null,
  lastUpdated = null,
  onSendEmail,
  onConsent,
  onDeleteProfile,
  isCompanyClient = false,
  initialPolicyId = null,
  initialSubtab = 'summary',
  currentUserId = null,
  onPolicyDeleted,
}: Props) {
  // Navigation State: SUMMARY | DOCUMENTS | NOTES | TIMELINE | LINKS
  const [activeSubtab, setActiveSubtab] = useState<'summary' | 'documents' | 'notes' | 'timeline' | 'links'>(
    (initialSubtab as any) || 'summary'
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [policies, setPolicies] = useState<SupplementalPolicy[]>([]);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(initialPolicyId);

  // Policy Modal Control State
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState(false);
  const [policyToEdit, setPolicyToEdit] = useState<SupplementalPolicy | null>(null);

  // Delete Confirm Modal State
  const [policyToDelete, setPolicyToDelete] = useState<SupplementalPolicy | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Sync initialPolicyId if passed via props / URL deep link
  useEffect(() => {
    if (initialPolicyId) {
      setSelectedPolicyId(initialPolicyId);
    }
  }, [initialPolicyId]);

  // Load Supplemental Policies for Client
  const loadSupplementalData = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);

    try {
      const { data: polData, error: polErr } = await supabase
        .from('client_supplemental_policies')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: true });

      if (polErr) throw polErr;

      const rawPolicies: SupplementalPolicy[] = polData || [];
      setPolicies(rawPolicies);

      // Auto-select initial target or first policy if none selected
      if (rawPolicies.length > 0) {
        if (initialPolicyId && rawPolicies.some((p) => p.id === initialPolicyId)) {
          setSelectedPolicyId(initialPolicyId);
        } else if (!selectedPolicyId || !rawPolicies.some((p) => p.id === selectedPolicyId)) {
          setSelectedPolicyId(rawPolicies[0].id);
        }
      } else {
        setSelectedPolicyId(null);
      }
    } catch (err: any) {
      console.error('Error loading Supplemental policies:', err);
      setError(err?.message || 'Failed to load Supplemental records.');
    } finally {
      setLoading(false);
    }
  }, [clientId, initialPolicyId, selectedPolicyId]);

  useEffect(() => {
    loadSupplementalData();
  }, [loadSupplementalData]);

  // Selected Policy Object
  const selectedPolicy = policies.find((p) => p.id === selectedPolicyId) || null;

  // Policy Save Handler (Insert / Update)
  const handleSavePolicy = async (policyData: Partial<SupplementalPolicy>) => {
    setError(null);
    const payload = {
      ...policyData,
      client_id: clientId,
      updated_at: new Date().toISOString(),
    };

    let resError;
    let savedId = policyData.id;

    if (policyData.id) {
      const { error } = await supabase
        .from('client_supplemental_policies')
        .update(payload)
        .eq('id', policyData.id);
      resError = error;
    } else {
      const { data, error } = await supabase
        .from('client_supplemental_policies')
        .insert(payload)
        .select('id')
        .single();
      resError = error;
      if (data) savedId = data.id;
    }

    if (resError) throw resError;
    if (savedId) setSelectedPolicyId(savedId);
    await loadSupplementalData();
    if (onPolicyDeleted) onPolicyDeleted();
  };

  // Delete Confirm Handler
  const handleConfirmDelete = async () => {
    if (!policyToDelete) return;
    setDeleting(true);
    setError(null);

    try {
      const { error } = await supabase
        .from('client_supplemental_policies')
        .delete()
        .eq('id', policyToDelete.id);
      if (error) throw error;

      setPolicyToDelete(null);
      setSelectedPolicyId(null);
      await loadSupplementalData();
      if (onPolicyDeleted) onPolicyDeleted();
    } catch (err: any) {
      console.error('Error deleting policy:', err);
      setError(err?.message || 'Failed to delete policy.');
    } finally {
      setDeleting(false);
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
          Loading Supplemental Workspace...
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
        activeSection="supplemental"
      />

      {/* 2. Main Workspace Layout */}
      <div className="px-4 py-6 md:px-8 md:py-8 flex flex-col lg:flex-row items-start gap-6">
        {/* Left Context Rail (Nothing extra below Links) */}
        <SupplementalLeftRail
          clientId={clientId}
          activeSubTab={activeSubtab}
          setActiveSubTab={setActiveSubtab}
        />

        {/* Right Main Content Workspace */}
        <div className="flex-1 w-full min-w-0 space-y-4">
          {error && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-800 text-xs font-medium">
              {error}
            </div>
          )}

          {/* Top Policy Selector (Full Width Grid) */}
          <SupplementalPolicyList
            policies={policies}
            selectedPolicyId={selectedPolicyId}
            onSelectPolicy={(id) => setSelectedPolicyId(id)}
            onOpenAddModal={() => {
              setPolicyToEdit(null);
              setIsPolicyModalOpen(true);
            }}
          />

          {/* SUBTAB 1: SUMMARY */}
          {activeSubtab === 'summary' && (
            <div className="animate-in fade-in duration-150">
              {selectedPolicy ? (
                <SupplementalPolicyDetails
                  policy={selectedPolicy}
                  onOpenEditPolicy={(pol) => {
                    setPolicyToEdit(pol);
                    setIsPolicyModalOpen(true);
                  }}
                  onOpenDeletePolicy={(pol) => {
                    setPolicyToDelete(pol);
                  }}
                />
              ) : (
                <div className="bg-white border border-slate-200/70 rounded-xl p-12 text-center space-y-3 font-sans">
                  <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-sm font-bold text-slate-800">No Policy Selected</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Select a supplemental policy from the top selector or create a new policy to manage coverage details.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* SUBTAB 2: DOCUMENTS */}
          {activeSubtab === 'documents' && (
            <div className="animate-in fade-in duration-150">
              <ModuleDocumentsManager
                clientId={clientId}
                moduleType="supplemental"
                policyId={selectedPolicyId}
                moduleLabel={`Supplemental — ${selectedPolicy?.product_type || 'Policy'}`}
              />
            </div>
          )}

          {/* SUBTAB 3: NOTES */}
          {activeSubtab === 'notes' && (
            <div className="animate-in fade-in duration-150">
              <UnifiedNotesManager
                clientId={clientId}
                inferredCategory="supplemental"
                policyId={selectedPolicyId}
                currentUserId={currentUserId}
              />
            </div>
          )}

          {/* SUBTAB 4: TIMELINE */}
          {activeSubtab === 'timeline' && (
            <div className="bg-white border border-slate-200/70 rounded-xl p-6 shadow-2xs space-y-4 animate-in fade-in duration-150 font-sans">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">
                  Supplemental Activity Timeline {selectedPolicy ? `— ${selectedPolicy.product_type}` : ''}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">Chronological activity record for the selected supplemental policy.</p>
              </div>
              {selectedPolicy ? (
                <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center justify-between font-bold">
                    <span className="text-slate-900">{selectedPolicy.product_type} Policy Activity</span>
                    <span className="text-slate-500 font-medium">{new Date(selectedPolicy.updated_at || Date.now()).toLocaleDateString()}</span>
                  </div>
                  <p className="text-slate-600 font-medium">
                    Carrier: <strong>{selectedPolicy.company || 'Not specified'}</strong> | Premium: <strong>${selectedPolicy.monthly_premium || 0}/mo</strong> | Status: <strong>{selectedPolicy.status || 'Active'}</strong>
                  </p>
                  {selectedPolicy.beneficiary_name && (
                    <p className="text-slate-500">
                      Beneficiary: <strong>{selectedPolicy.beneficiary_name}</strong>
                    </p>
                  )}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-400 font-medium">
                  Select a policy above to view policy-specific activity events.
                </div>
              )}
            </div>
          )}

          {/* SUBTAB 5: LINKS */}
          {activeSubtab === 'links' && (
            <div className="bg-white border border-slate-200/70 rounded-xl p-6 shadow-2xs space-y-4 animate-in fade-in duration-150 font-sans">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">Saved Client Links</h3>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">Quick reference links for Supplemental portals and carrier tools.</p>
              </div>
              <p className="text-xs text-slate-600">
                Saved links are also available for quick access in the left workspace rail.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <SupplementalPolicyModal
        isOpen={isPolicyModalOpen}
        initialData={policyToEdit}
        onClose={() => {
          setIsPolicyModalOpen(false);
          setPolicyToEdit(null);
        }}
        onSave={handleSavePolicy}
      />

      <SupplementalDeleteConfirmModal
        isOpen={policyToDelete !== null}
        title={`Delete ${policyToDelete?.product_type || 'Supplemental'} Policy?`}
        itemName={`${policyToDelete?.product_type} ${policyToDelete?.company ? '(' + policyToDelete.company + ')' : ''}`}
        description="Are you sure you want to delete this supplemental policy? This action cannot be undone."
        onClose={() => setPolicyToDelete(null)}
        onConfirm={handleConfirmDelete}
        deleting={deleting}
      />
    </div>
  );
}
