'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
  isCompanyClient?: boolean;
  initialPolicyId?: string | null;
  initialSubtab?: 'summary' | 'documents' | 'notes' | 'timeline';
  currentUserId?: string | null;
  onPolicyDeleted?: () => void;
}

export default function SupplementalTab({
  clientId,
  isCompanyClient = false,
  initialPolicyId = null,
  initialSubtab = 'summary',
  currentUserId = null,
  onPolicyDeleted,
}: Props) {
  // Internal Floating Profile Navigation State: SUMMARY | DOCUMENTS | NOTES | TIMELINE
  const [activeSubtab, setActiveSubtab] = useState<'summary' | 'documents' | 'notes' | 'timeline'>(
    initialSubtab || 'summary'
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
      if (onPolicyDeleted) onPolicyDeleted(); // Instantly update Overview policy count & rows
    } catch (err: any) {
      console.error('Error deleting policy:', err);
      setError(err?.message || 'Failed to delete policy.');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20 bg-white border border-[#E8ECF2] rounded-2xl shadow-sm">
        <svg className="animate-spin h-8 w-8 text-[#2563EB]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Header Banner & Internal Floating Profile Tabs */}
      <div className="crm-card p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-[#172033]">Supplemental Insurance</h2>
            <p className="text-xs text-[#7C8799] mt-0.5">
              Dental, Vision, Accident, Critical Illness, and ancillary products.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setPolicyToEdit(null);
              setIsPolicyModalOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] active:scale-[0.98] text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition-all shadow-md shadow-blue-500/10"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            + Add Supplemental Policy
          </button>
        </div>

        {/* INTERNAL FLOATING NAVIGATION: SUMMARY | DOCUMENTS | NOTES | TIMELINE */}
        <div className="flex items-center gap-1 border-b border-[#E8ECF2] pt-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveSubtab('summary')}
            className={`px-4 py-2 text-xs font-bold transition-all border-b-2 -mb-px whitespace-nowrap ${
              activeSubtab === 'summary'
                ? 'border-[#2563EB] text-[#2563EB]'
                : 'border-transparent text-[#556176] hover:text-[#172033]'
            }`}
          >
            SUMMARY
          </button>
          <button
            type="button"
            onClick={() => setActiveSubtab('documents')}
            className={`px-4 py-2 text-xs font-bold transition-all border-b-2 -mb-px whitespace-nowrap ${
              activeSubtab === 'documents'
                ? 'border-[#2563EB] text-[#2563EB]'
                : 'border-transparent text-[#556176] hover:text-[#172033]'
            }`}
          >
            DOCUMENTS
          </button>
          <button
            type="button"
            onClick={() => setActiveSubtab('notes')}
            className={`px-4 py-2 text-xs font-bold transition-all border-b-2 -mb-px whitespace-nowrap ${
              activeSubtab === 'notes'
                ? 'border-[#2563EB] text-[#2563EB]'
                : 'border-transparent text-[#556176] hover:text-[#172033]'
            }`}
          >
            NOTES
          </button>
          <button
            type="button"
            onClick={() => setActiveSubtab('timeline')}
            className={`px-4 py-2 text-xs font-bold transition-all border-b-2 -mb-px whitespace-nowrap ${
              activeSubtab === 'timeline'
                ? 'border-[#2563EB] text-[#2563EB]'
                : 'border-transparent text-[#556176] hover:text-[#172033]'
            }`}
          >
            TIMELINE
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-medium">
          {error}
        </div>
      )}

      {/* 1. Top Policy Selector (Full Width Grid) */}
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
            <div className="crm-card p-12 text-center space-y-3 bg-[#F8FAFC]">
              <div className="w-12 h-12 rounded-full bg-[#EEF4FF] text-[#2563EB] flex items-center justify-center mx-auto">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-sm font-bold text-[#172033]">No Policy Selected</h3>
              <p className="text-xs text-[#7C8799] max-w-sm mx-auto">
                Select a supplemental policy from the top selector or create a new policy to manage coverage details and beneficiary information.
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
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4 animate-in fade-in duration-150">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-extrabold text-slate-800">
              Supplemental Activity Timeline {selectedPolicy ? `— ${selectedPolicy.product_type}` : ''}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Chronological activity record for the selected supplemental policy.</p>
          </div>
          {selectedPolicy ? (
            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-extrabold text-slate-900">{selectedPolicy.product_type} Policy Activity</span>
                <span className="text-slate-400 font-medium">{new Date(selectedPolicy.updated_at || Date.now()).toLocaleDateString()}</span>
              </div>
              <p className="text-xs text-slate-600">
                Carrier: <strong>{selectedPolicy.company || 'Not specified'}</strong> | Premium: <strong>${selectedPolicy.monthly_premium || 0}/mo</strong> | Status: <strong>{selectedPolicy.status || 'Active'}</strong>
              </p>
              {selectedPolicy.beneficiary_name && (
                <p className="text-xs text-[#556176]">
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
