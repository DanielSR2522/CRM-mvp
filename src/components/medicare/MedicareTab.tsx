'use client';

import React, { useState, useEffect, useCallback } from 'react';
import HealthClientHeader from '@/components/health/HealthClientHeader';
import MedicareLeftRail from './MedicareLeftRail';
import MedicareDetailsForm from './MedicareDetailsForm';
import MedicalSection from './MedicalSection';
import MedicalEntryModal from './MedicalEntryModal';
import MedicationEntryModal from './MedicationEntryModal';
import MedicalDeleteConfirmModal from './MedicalDeleteConfirmModal';
import ModuleDocumentsManager from '@/components/documents/ModuleDocumentsManager';
import UnifiedNotesManager from '@/components/notes/UnifiedNotesManager';
import { supabase } from '@/lib/supabaseClient';
import {
  MedicareInformationData,
  DoctorEntry,
  HospitalEntry,
  UrgentCareEntry,
  PharmacyEntry,
  ConditionEntry,
  SpecialistEntry,
  MedicationEntry,
  MedicalCategory,
} from '@/types/medicare';

interface Props {
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
  onPolicyDeleted?: () => void;
}

const DEFAULT_MEDICARE_INFO: MedicareInformationData = {
  client_id: '',
  scope_of_appointment: null,
  soa_date: null,
  soa_method: null,
  mbi: null,
  part_a_effective_date: null,
  part_b_effective_date: null,
  part_c_subtype: null,
  medicaid_level: null,
  medicaid_id: null,
  renewal_status: null,
  company: null,
  plan_name: null,
  plan_id: null,
  plan_effective_date: null,
};

export default function MedicareTab({
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
  onPolicyDeleted,
}: Props) {
  // Navigation State: SUMMARY | DOCUMENTS | NOTES | TIMELINE | LINKS
  const [activeSubtab, setActiveSubtab] = useState<'summary' | 'documents' | 'notes' | 'timeline' | 'links'>(
    (initialSubtab as any) || 'summary'
  );

  const [loading, setLoading] = useState(true);
  const [savingInfo, setSavingInfo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Toast notification state
  const [toast, setToast] = useState<{ title: string; description: string; type: 'success' | 'error' | 'warning' } | null>(null);

  const addToast = useCallback((t: { title: string; description: string; type: 'success' | 'error' | 'warning' }) => {
    setToast(t);
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Medicare Master Info State
  const [medicareInfo, setMedicareInfo] = useState<MedicareInformationData>({
    ...DEFAULT_MEDICARE_INFO,
    client_id: clientId,
  });

  // Medical Section Relational Arrays State
  const [doctors, setDoctors] = useState<DoctorEntry[]>([]);
  const [hospitals, setHospitals] = useState<HospitalEntry[]>([]);
  const [urgentCares, setUrgentCares] = useState<UrgentCareEntry[]>([]);
  const [pharmacies, setPharmacies] = useState<PharmacyEntry[]>([]);
  const [conditions, setConditions] = useState<ConditionEntry[]>([]);
  const [specialists, setSpecialists] = useState<SpecialistEntry[]>([]);
  const [medications, setMedications] = useState<MedicationEntry[]>([]);

  // Modals Control State
  const [activeCategory, setActiveCategory] = useState<MedicalCategory | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<any | null>(null);
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [isMedicationModalOpen, setIsMedicationModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Fetch all Medicare data for client
  const loadMedicareData = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch Master Medicare Information
      const { data: infoData, error: infoErr } = await supabase
        .from('client_medicare_information')
        .select('*')
        .eq('client_id', clientId)
        .maybeSingle();

      if (infoErr) throw infoErr;
      if (infoData) {
        setMedicareInfo(infoData);
      } else {
        setMedicareInfo({ ...DEFAULT_MEDICARE_INFO, client_id: clientId });
      }

      // 2. Parallel Queries for 7 Medical Categories
      const [
        docRes,
        hospRes,
        ucRes,
        pharmRes,
        condRes,
        specRes,
        medRes,
      ] = await Promise.all([
        supabase.from('client_medicare_doctors').select('*').eq('client_id', clientId).order('created_at', { ascending: true }),
        supabase.from('client_medicare_hospitals').select('*').eq('client_id', clientId).order('created_at', { ascending: true }),
        supabase.from('client_medicare_urgent_cares').select('*').eq('client_id', clientId).order('created_at', { ascending: true }),
        supabase.from('client_medicare_pharmacies').select('*').eq('client_id', clientId).order('created_at', { ascending: true }),
        supabase.from('client_medicare_conditions').select('*').eq('client_id', clientId).order('created_at', { ascending: true }),
        supabase.from('client_medicare_specialists').select('*').eq('client_id', clientId).order('created_at', { ascending: true }),
        supabase.from('client_medicare_medications').select('*').eq('client_id', clientId).order('created_at', { ascending: true }),
      ]);

      setDoctors(docRes.data || []);
      setHospitals(hospRes.data || []);
      setUrgentCares(ucRes.data || []);
      setPharmacies(pharmRes.data || []);
      setConditions(condRes.data || []);
      setSpecialists(specRes.data || []);
      setMedications(medRes.data || []);
    } catch (err: any) {
      console.error('Error loading Medicare data:', err);
      setError(err?.message || 'Failed to load Medicare records.');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadMedicareData();
  }, [loadMedicareData]);

  // Field change handler
  const handleInfoChange = (field: keyof MedicareInformationData, value: any) => {
    setMedicareInfo((prev) => ({ ...prev, [field]: value }));
  };

  // Save Master Medicare Information
  const handleSaveInfo = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingInfo(true);
    setError(null);

    try {
      const payload = {
        ...medicareInfo,
        client_id: clientId,
        updated_at: new Date().toISOString(),
      };

      const { data, error: upsertErr } = await supabase
        .from('client_medicare_information')
        .upsert(payload, { onConflict: 'client_id' })
        .select()
        .single();

      if (upsertErr) throw upsertErr;
      if (data) setMedicareInfo(data);

      addToast({
        title: 'Medicare Saved',
        description: 'Medicare information and Scope of Appointment details saved successfully.',
        type: 'success',
      });

      if (onPolicyDeleted) onPolicyDeleted();
    } catch (err: any) {
      console.error('Error saving Medicare information:', err);
      setError(err?.message || 'Failed to save Medicare details.');
      addToast({
        title: 'Save Failed',
        description: err?.message || 'Failed to save Medicare details.',
        type: 'error',
      });
    } finally {
      setSavingInfo(false);
    }
  };

  // Modal Triggers
  const handleOpenAdd = (category: MedicalCategory) => {
    setActiveCategory(category);
    setSelectedEntry(null);
    if (category === 'medications') {
      setIsMedicationModalOpen(true);
    } else {
      setIsEntryModalOpen(true);
    }
  };

  const handleOpenEdit = (category: MedicalCategory, item: any) => {
    setActiveCategory(category);
    setSelectedEntry(item);
    if (category === 'medications') {
      setIsMedicationModalOpen(true);
    } else {
      setIsEntryModalOpen(true);
    }
  };

  const handleOpenDelete = (category: MedicalCategory, item: any) => {
    setActiveCategory(category);
    setSelectedEntry(item);
    setIsDeleteModalOpen(true);
  };

  // Save Category Item
  const handleSaveEntry = async (entryData: any) => {
    if (!activeCategory || !clientId) return;

    const tableNameMap: Record<MedicalCategory, string> = {
      doctors: 'client_medicare_doctors',
      hospitals: 'client_medicare_hospitals',
      urgent_cares: 'client_medicare_urgent_cares',
      pharmacies: 'client_medicare_pharmacies',
      conditions: 'client_medicare_conditions',
      specialists: 'client_medicare_specialists',
      medications: 'client_medicare_medications',
    };

    const tableName = tableNameMap[activeCategory];
    const payload = {
      ...entryData,
      client_id: clientId,
      updated_at: new Date().toISOString(),
    };

    let resError;
    if (payload.id) {
      const { error } = await supabase.from(tableName).update(payload).eq('id', payload.id);
      resError = error;
    } else {
      const { error } = await supabase.from(tableName).insert(payload);
      resError = error;
    }

    if (resError) throw resError;
    await loadMedicareData();
  };

  // Delete Category Item
  const handleConfirmDelete = async () => {
    if (!activeCategory || !selectedEntry?.id) return;

    setDeleting(true);
    try {
      const tableNameMap: Record<MedicalCategory, string> = {
        doctors: 'client_medicare_doctors',
        hospitals: 'client_medicare_hospitals',
        urgent_cares: 'client_medicare_urgent_cares',
        pharmacies: 'client_medicare_pharmacies',
        conditions: 'client_medicare_conditions',
        specialists: 'client_medicare_specialists',
        medications: 'client_medicare_medications',
      };

      const tableName = tableNameMap[activeCategory];
      const { error: delErr } = await supabase.from(tableName).delete().eq('id', selectedEntry.id);

      if (delErr) throw delErr;

      setIsDeleteModalOpen(false);
      setSelectedEntry(null);
      await loadMedicareData();
    } catch (err: any) {
      console.error('Error deleting entry:', err);
      setError(err?.message || 'Failed to delete record.');
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
          Loading Medicare Workspace...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 font-sans">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 p-4 rounded-xl border shadow-xl flex flex-col gap-1 animate-fade-in font-sans min-w-[280px] max-w-sm ${
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

      {/* Main Workspace Layout */}
      <div className="flex flex-col lg:flex-row items-start gap-3 w-full">
        {/* Left Context Rail */}
        <MedicareLeftRail
          clientId={clientId}
          activeSubTab={activeSubtab}
          setActiveSubTab={setActiveSubtab}
          medicareInfo={medicareInfo}
          onInfoChange={handleInfoChange}
          saving={savingInfo}
        />

        {/* Right Main Content Workspace (Full Width) */}
        <div className="flex-1 w-full min-w-0 space-y-4">
          {error && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-800 text-xs font-medium">
              {error}
            </div>
          )}

          {/* SUBTAB 1: SUMMARY */}
          {activeSubtab === 'summary' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Medicare Details Form (Starts directly with Medicare Info 2026; SOA is in left rail) */}
              <MedicareDetailsForm
                data={medicareInfo}
                onChange={handleInfoChange}
                onSave={handleSaveInfo}
                saving={savingInfo}
              />

              {/* Medical & Provider Relational Section */}
              <MedicalSection
                doctors={doctors}
                hospitals={hospitals}
                urgentCares={urgentCares}
                pharmacies={pharmacies}
                conditions={conditions}
                specialists={specialists}
                medications={medications}
                onOpenAdd={handleOpenAdd}
                onOpenEdit={handleOpenEdit}
                onOpenDelete={handleOpenDelete}
              />
            </div>
          )}

          {/* SUBTAB 2: DOCUMENTS */}
          {activeSubtab === 'documents' && (
            <div className="animate-in fade-in duration-150">
              <ModuleDocumentsManager
                clientId={clientId}
                moduleType="medicare"
                moduleLabel="Medicare"
              />
            </div>
          )}

          {/* SUBTAB 3: NOTES */}
          {activeSubtab === 'notes' && (
            <div className="animate-in fade-in duration-150">
              <UnifiedNotesManager
                clientId={clientId}
                inferredCategory="medicare"
                currentUserId={currentUserId}
              />
            </div>
          )}

          {/* SUBTAB 4: TIMELINE */}
          {activeSubtab === 'timeline' && (
            <div className="bg-white border border-slate-200/70 rounded-xl p-6 shadow-2xs space-y-4 animate-in fade-in duration-150 font-sans">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">Medicare Activity Timeline</h3>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">Chronological record of Medicare registrations and updates.</p>
              </div>
              <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2 text-xs">
                <div className="flex items-center justify-between font-bold">
                  <span className="text-slate-900">Medicare Profile Activity</span>
                  <span className="text-slate-500 font-medium">
                    {medicareInfo.updated_at
                      ? new Date(medicareInfo.updated_at).toLocaleDateString()
                      : 'No update date'}
                  </span>
                </div>
                <p className="text-slate-600 font-medium">
                  MBI: <strong>{medicareInfo.mbi || 'Not specified'}</strong> | Carrier: <strong>{medicareInfo.company || 'Not specified'}</strong> | Status: <strong>{medicareInfo.renewal_status || 'Active'}</strong>
                </p>
              </div>
            </div>
          )}

          {/* SUBTAB 5: LINKS */}
          {activeSubtab === 'links' && (
            <div className="bg-white border border-slate-200/70 rounded-xl p-6 shadow-2xs space-y-4 animate-in fade-in duration-150 font-sans">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">Saved Client Links</h3>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">Quick reference links for Medicare portals and carrier tools.</p>
              </div>
              <p className="text-xs text-slate-600">
                Saved links are also available for quick access in the left workspace rail.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <MedicalEntryModal
        isOpen={isEntryModalOpen}
        category={activeCategory}
        initialData={selectedEntry}
        onClose={() => {
          setIsEntryModalOpen(false);
          setSelectedEntry(null);
        }}
        onSave={handleSaveEntry}
      />

      <MedicationEntryModal
        isOpen={isMedicationModalOpen}
        initialData={selectedEntry}
        onClose={() => {
          setIsMedicationModalOpen(false);
          setSelectedEntry(null);
        }}
        onSave={handleSaveEntry}
      />

      <MedicalDeleteConfirmModal
        isOpen={isDeleteModalOpen}
        title={`Delete ${activeCategory ? activeCategory.replace('_', ' ') : 'item'}?`}
        itemName={selectedEntry?.name}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setSelectedEntry(null);
        }}
        onConfirm={handleConfirmDelete}
        deleting={deleting}
      />
    </div>
  );
}
