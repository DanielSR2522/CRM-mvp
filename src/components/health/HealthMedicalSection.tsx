'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  HealthDoctor,
  HealthHospital,
  HealthUrgentCare,
  HealthPharmacy,
  HealthCondition,
  HealthSpecialist,
  HealthMedication,
  HealthMedicalData
} from '@/lib/health/types';
import { fetchHealthMedicalData, syncHealthPolicyMedicalSummaries } from '@/lib/health/health-service';

interface HealthMedicalSectionProps {
  healthPolicyId: string;
  clientId: string;
  addToast?: (toast: { title: string; description: string; type: 'success' | 'error' | 'warning' }) => void;
  onDataChanged?: () => void;
}

type CategoryType = 'doctors' | 'hospitals' | 'urgentCares' | 'pharmacies' | 'conditions' | 'specialists' | 'medications';

export default function HealthMedicalSection({
  healthPolicyId,
  clientId,
  addToast,
  onDataChanged
}: HealthMedicalSectionProps) {
  const [medicalData, setMedicalData] = useState<HealthMedicalData>({
    doctors: [],
    hospitals: [],
    urgentCares: [],
    pharmacies: [],
    conditions: [],
    specialists: [],
    medications: [],
  });
  const [loading, setLoading] = useState<boolean>(true);

  // Modal State
  const [activeCategory, setActiveCategory] = useState<CategoryType | null>(null);
  const [editingItem, setEditingItem] = useState<Record<string, unknown> | null>(null);
  const [savingItem, setSavingItem] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Delete Confirmation State
  const [deletingTarget, setDeletingTarget] = useState<{ category: CategoryType; id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  // Form Fields State
  const [fieldName, setFieldName] = useState<string>('');
  const [fieldAddress, setFieldAddress] = useState<string>('');
  const [fieldPhone, setFieldPhone] = useState<string>('');
  const [fieldSpecialty, setFieldSpecialty] = useState<string>('');
  const [fieldDosage, setFieldDosage] = useState<string>('');
  const [fieldFrequency, setFieldFrequency] = useState<string>('');
  const [fieldInstructions, setFieldInstructions] = useState<string>('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchHealthMedicalData(healthPolicyId);
      setMedicalData(data);
    } catch (err) {
      console.error('Failed to load Health Medical Data:', err);
    } finally {
      setLoading(false);
    }
  }, [healthPolicyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openAddModal = (category: CategoryType) => {
    setActiveCategory(category);
    setEditingItem(null);
    setFieldName('');
    setFieldAddress('');
    setFieldPhone('');
    setFieldSpecialty('');
    setFieldDosage('');
    setFieldFrequency('');
    setFieldInstructions('');
    setModalError(null);
  };

  const openEditModal = (category: CategoryType, item: any) => {
    setActiveCategory(category);
    setEditingItem(item);
    setModalError(null);

    if (category === 'doctors') {
      setFieldName((item.doctor_name as string) || '');
      setFieldAddress((item.address as string) || '');
      setFieldPhone((item.phone as string) || '');
      setFieldSpecialty((item.specialty as string) || '');
    } else if (category === 'hospitals') {
      setFieldName((item.hospital_name as string) || '');
      setFieldAddress((item.address as string) || '');
      setFieldPhone((item.phone as string) || '');
    } else if (category === 'urgentCares') {
      setFieldName((item.urgent_care_name as string) || '');
      setFieldAddress((item.address as string) || '');
      setFieldPhone((item.phone as string) || '');
    } else if (category === 'pharmacies') {
      setFieldName((item.pharmacy_name as string) || '');
      setFieldAddress((item.address as string) || '');
      setFieldPhone((item.phone as string) || '');
    } else if (category === 'conditions') {
      setFieldName((item.condition_name as string) || '');
    } else if (category === 'specialists') {
      setFieldName((item.specialist_name as string) || '');
      setFieldSpecialty((item.specialty as string) || '');
      setFieldAddress((item.address as string) || '');
      setFieldPhone((item.phone as string) || '');
    } else if (category === 'medications') {
      setFieldName((item.medication_name as string) || '');
      setFieldDosage((item.dosage as string) || '');
      setFieldFrequency((item.frequency as string) || '');
      setFieldInstructions((item.instructions as string) || '');
    }
  };

  const closeModal = () => {
    setActiveCategory(null);
    setEditingItem(null);
    setModalError(null);
    setSavingItem(false);
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCategory || savingItem) return;

    if (!fieldName.trim()) {
      setModalError('Name is required.');
      return;
    }

    setSavingItem(true);
    setModalError(null);

    try {
      let table = '';
      const payload: Record<string, unknown> = {
        health_policy_id: healthPolicyId,
        client_id: clientId,
        updated_at: new Date().toISOString()
      };

      if (activeCategory === 'doctors') {
        table = 'client_health_doctors';
        payload.doctor_name = fieldName.trim();
        payload.address = fieldAddress.trim() || null;
        payload.phone = fieldPhone.trim() || null;
        payload.specialty = fieldSpecialty.trim() || null;
      } else if (activeCategory === 'hospitals') {
        table = 'client_health_hospitals';
        payload.hospital_name = fieldName.trim();
        payload.address = fieldAddress.trim() || null;
        payload.phone = fieldPhone.trim() || null;
      } else if (activeCategory === 'urgentCares') {
        table = 'client_health_urgent_cares';
        payload.urgent_care_name = fieldName.trim();
        payload.address = fieldAddress.trim() || null;
        payload.phone = fieldPhone.trim() || null;
      } else if (activeCategory === 'pharmacies') {
        table = 'client_health_pharmacies';
        payload.pharmacy_name = fieldName.trim();
        payload.address = fieldAddress.trim() || null;
        payload.phone = fieldPhone.trim() || null;
      } else if (activeCategory === 'conditions') {
        table = 'client_health_conditions';
        payload.condition_name = fieldName.trim();
      } else if (activeCategory === 'specialists') {
        table = 'client_health_specialists';
        payload.specialist_name = fieldName.trim();
        payload.specialty = fieldSpecialty.trim() || null;
        payload.address = fieldAddress.trim() || null;
        payload.phone = fieldPhone.trim() || null;
      } else if (activeCategory === 'medications') {
        table = 'client_health_medications';
        payload.medication_name = fieldName.trim();
        payload.dosage = fieldDosage.trim() || null;
        payload.frequency = fieldFrequency.trim() || null;
        payload.instructions = fieldInstructions.trim() || null;
      }

      if (editingItem?.id) {
        const { error } = await supabase
          .from(table)
          .update(payload)
          .eq('id', editingItem.id as string);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from(table)
          .insert(payload);
        if (error) throw error;
      }

      await syncHealthPolicyMedicalSummaries(healthPolicyId);
      await loadData();
      if (onDataChanged) onDataChanged();

      if (addToast) {
        addToast({
          title: 'Medical Record Saved',
          description: `Successfully saved item in Health Medical Section.`,
          type: 'success'
        });
      }
      closeModal();
    } catch (err: unknown) {
      console.error('Failed to save medical item:', err);
      const msg = err instanceof Error ? err.message : 'Failed to save record.';
      setModalError(msg);
    } finally {
      setSavingItem(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!deletingTarget || deleting) return;
    setDeleting(true);

    try {
      let table = '';
      if (deletingTarget.category === 'doctors') table = 'client_health_doctors';
      else if (deletingTarget.category === 'hospitals') table = 'client_health_hospitals';
      else if (deletingTarget.category === 'urgentCares') table = 'client_health_urgent_cares';
      else if (deletingTarget.category === 'pharmacies') table = 'client_health_pharmacies';
      else if (deletingTarget.category === 'conditions') table = 'client_health_conditions';
      else if (deletingTarget.category === 'specialists') table = 'client_health_specialists';
      else if (deletingTarget.category === 'medications') table = 'client_health_medications';

      const { error } = await supabase.from(table).delete().eq('id', deletingTarget.id);
      if (error) throw error;

      await syncHealthPolicyMedicalSummaries(healthPolicyId);
      await loadData();
      if (onDataChanged) onDataChanged();

      if (addToast) {
        addToast({
          title: 'Item Deleted',
          description: `Removed "${deletingTarget.name}" from Health Medical Section.`,
          type: 'success'
        });
      }
      setDeletingTarget(null);
    } catch (err: unknown) {
      console.error('Failed to delete medical item:', err);
      if (addToast) {
        addToast({
          title: 'Error Deleting Item',
          description: err instanceof Error ? err.message : 'Failed to delete record.',
          type: 'error'
        });
      }
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <svg className="animate-spin h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans mt-6 border-t border-slate-100 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-extrabold text-slate-800">Health Medical Section</h3>
          <p className="text-xs text-slate-400 mt-0.5">Manage doctors, hospitals, pharmacies, conditions and medications directly.</p>
        </div>
      </div>

      {/* Grid of Medical Categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* 1. Primary Doctors */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-50 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold text-slate-800">Primary Doctors</span>
              <span className="bg-blue-50 text-blue-600 font-extrabold text-[10px] px-2 py-0.5 rounded-full">
                {medicalData.doctors.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => openAddModal('doctors')}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg transition-all"
            >
              + Add
            </button>
          </div>
          {medicalData.doctors.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-2">No primary doctors registered.</p>
          ) : (
            <div className="space-y-2.5">
              {medicalData.doctors.map((doc) => (
                <div key={doc.id} className="p-3 bg-slate-50/70 border border-slate-100 rounded-xl flex items-start justify-between gap-3 text-xs">
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-800 block">{doc.doctor_name}</span>
                    {doc.specialty && <span className="text-[11px] text-blue-600 font-semibold block">{doc.specialty}</span>}
                    {doc.address && <span className="text-[11px] text-slate-500 block truncate max-w-[200px]">{doc.address}</span>}
                    {doc.phone && <span className="text-[11px] text-slate-500 block">📞 {doc.phone}</span>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => openEditModal('doctors', doc)} className="text-slate-400 hover:text-blue-600 p-1">✏️</button>
                    <button type="button" onClick={() => setDeletingTarget({ category: 'doctors', id: doc.id, name: doc.doctor_name })} className="text-slate-400 hover:text-rose-600 p-1">🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 2. Hospitals */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-50 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold text-slate-800">Hospitals</span>
              <span className="bg-blue-50 text-blue-600 font-extrabold text-[10px] px-2 py-0.5 rounded-full">
                {medicalData.hospitals.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => openAddModal('hospitals')}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg transition-all"
            >
              + Add
            </button>
          </div>
          {medicalData.hospitals.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-2">No hospitals registered.</p>
          ) : (
            <div className="space-y-2.5">
              {medicalData.hospitals.map((hosp) => (
                <div key={hosp.id} className="p-3 bg-slate-50/70 border border-slate-100 rounded-xl flex items-start justify-between gap-3 text-xs">
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-800 block">{hosp.hospital_name}</span>
                    {hosp.address && <span className="text-[11px] text-slate-500 block truncate max-w-[200px]">{hosp.address}</span>}
                    {hosp.phone && <span className="text-[11px] text-slate-500 block">📞 {hosp.phone}</span>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => openEditModal('hospitals', hosp)} className="text-slate-400 hover:text-blue-600 p-1">✏️</button>
                    <button type="button" onClick={() => setDeletingTarget({ category: 'hospitals', id: hosp.id, name: hosp.hospital_name })} className="text-slate-400 hover:text-rose-600 p-1">🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 3. Urgent Care */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-50 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold text-slate-800">Urgent Care</span>
              <span className="bg-blue-50 text-blue-600 font-extrabold text-[10px] px-2 py-0.5 rounded-full">
                {medicalData.urgentCares.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => openAddModal('urgentCares')}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg transition-all"
            >
              + Add
            </button>
          </div>
          {medicalData.urgentCares.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-2">No urgent care centers registered.</p>
          ) : (
            <div className="space-y-2.5">
              {medicalData.urgentCares.map((urg) => (
                <div key={urg.id} className="p-3 bg-slate-50/70 border border-slate-100 rounded-xl flex items-start justify-between gap-3 text-xs">
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-800 block">{urg.urgent_care_name}</span>
                    {urg.address && <span className="text-[11px] text-slate-500 block truncate max-w-[200px]">{urg.address}</span>}
                    {urg.phone && <span className="text-[11px] text-slate-500 block">📞 {urg.phone}</span>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => openEditModal('urgentCares', urg)} className="text-slate-400 hover:text-blue-600 p-1">✏️</button>
                    <button type="button" onClick={() => setDeletingTarget({ category: 'urgentCares', id: urg.id, name: urg.urgent_care_name })} className="text-slate-400 hover:text-rose-600 p-1">🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 4. Pharmacies */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-50 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold text-slate-800">Pharmacies</span>
              <span className="bg-blue-50 text-blue-600 font-extrabold text-[10px] px-2 py-0.5 rounded-full">
                {medicalData.pharmacies.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => openAddModal('pharmacies')}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg transition-all"
            >
              + Add
            </button>
          </div>
          {medicalData.pharmacies.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-2">No pharmacies registered.</p>
          ) : (
            <div className="space-y-2.5">
              {medicalData.pharmacies.map((pharm) => (
                <div key={pharm.id} className="p-3 bg-slate-50/70 border border-slate-100 rounded-xl flex items-start justify-between gap-3 text-xs">
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-800 block">{pharm.pharmacy_name}</span>
                    {pharm.address && <span className="text-[11px] text-slate-500 block truncate max-w-[200px]">{pharm.address}</span>}
                    {pharm.phone && <span className="text-[11px] text-slate-500 block">📞 {pharm.phone}</span>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => openEditModal('pharmacies', pharm)} className="text-slate-400 hover:text-blue-600 p-1">✏️</button>
                    <button type="button" onClick={() => setDeletingTarget({ category: 'pharmacies', id: pharm.id, name: pharm.pharmacy_name })} className="text-slate-400 hover:text-rose-600 p-1">🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 5. Conditions */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-50 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold text-slate-800">Conditions</span>
              <span className="bg-blue-50 text-blue-600 font-extrabold text-[10px] px-2 py-0.5 rounded-full">
                {medicalData.conditions.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => openAddModal('conditions')}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg transition-all"
            >
              + Add
            </button>
          </div>
          {medicalData.conditions.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-2">No conditions registered.</p>
          ) : (
            <div className="space-y-2.5">
              {medicalData.conditions.map((cond) => (
                <div key={cond.id} className="p-3 bg-slate-50/70 border border-slate-100 rounded-xl flex items-center justify-between gap-3 text-xs">
                  <span className="font-bold text-slate-800">{cond.condition_name}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => openEditModal('conditions', cond)} className="text-slate-400 hover:text-blue-600 p-1">✏️</button>
                    <button type="button" onClick={() => setDeletingTarget({ category: 'conditions', id: cond.id, name: cond.condition_name })} className="text-slate-400 hover:text-rose-600 p-1">🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 6. Specialists */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-50 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold text-slate-800">Specialists</span>
              <span className="bg-blue-50 text-blue-600 font-extrabold text-[10px] px-2 py-0.5 rounded-full">
                {medicalData.specialists.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => openAddModal('specialists')}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg transition-all"
            >
              + Add
            </button>
          </div>
          {medicalData.specialists.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-2">No specialists registered.</p>
          ) : (
            <div className="space-y-2.5">
              {medicalData.specialists.map((spec) => (
                <div key={spec.id} className="p-3 bg-slate-50/70 border border-slate-100 rounded-xl flex items-start justify-between gap-3 text-xs">
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-800 block">{spec.specialist_name}</span>
                    {spec.specialty && <span className="text-[11px] text-blue-600 font-semibold block">{spec.specialty}</span>}
                    {spec.phone && <span className="text-[11px] text-slate-500 block">📞 {spec.phone}</span>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => openEditModal('specialists', spec)} className="text-slate-400 hover:text-blue-600 p-1">✏️</button>
                    <button type="button" onClick={() => setDeletingTarget({ category: 'specialists', id: spec.id, name: spec.specialist_name })} className="text-slate-400 hover:text-rose-600 p-1">🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Row 3: Medicines Full Width */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-50 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-extrabold text-slate-800">Medicines / Medications</span>
            <span className="bg-blue-50 text-blue-600 font-extrabold text-[10px] px-2 py-0.5 rounded-full">
              {medicalData.medications.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => openAddModal('medications')}
            className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg transition-all"
          >
            + Add Medicine
          </button>
        </div>
        {medicalData.medications.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-2">No medicines registered.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {medicalData.medications.map((med) => (
              <div key={med.id} className="p-3 bg-slate-50/70 border border-slate-100 rounded-xl flex items-start justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <span className="font-bold text-slate-800 block text-sm">{med.medication_name}</span>
                  <div className="flex items-center gap-2 text-[11px] text-slate-600 font-medium">
                    {med.dosage && <span>Dosage: <strong>{med.dosage}</strong></span>}
                    {med.frequency && <span>Frequency: <strong>{med.frequency}</strong></span>}
                  </div>
                  {med.instructions && <p className="text-[11px] text-slate-500 italic mt-0.5">{med.instructions}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => openEditModal('medications', med)} className="text-slate-400 hover:text-blue-600 p-1">✏️</button>
                  <button type="button" onClick={() => setDeletingTarget({ category: 'medications', id: med.id, name: med.medication_name })} className="text-slate-400 hover:text-rose-600 p-1">🗑️</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit Category Modal */}
      {activeCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs font-sans">
          <div className="bg-white border border-slate-100 rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4 animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="text-sm font-extrabold text-slate-900 capitalize">
                {editingItem ? 'Edit' : 'Add'} {activeCategory.replace(/([A-Z])/g, ' $1').trim().slice(0, -1)}
              </h4>
              <button type="button" onClick={closeModal} className="text-slate-400 hover:text-slate-600 p-1">✕</button>
            </div>

            {modalError && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-600 font-medium">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSaveModal} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={fieldName}
                  onChange={(e) => setFieldName(e.target.value)}
                  placeholder="e.g. Dr. John Smith"
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-2 text-slate-800 font-medium outline-none"
                  required
                />
              </div>

              {(activeCategory === 'doctors' || activeCategory === 'specialists') && (
                <div>
                  <label className="block font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Specialty
                  </label>
                  <input
                    type="text"
                    value={fieldSpecialty}
                    onChange={(e) => setFieldSpecialty(e.target.value)}
                    placeholder="e.g. Cardiology"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-2 text-slate-800 font-medium outline-none"
                  />
                </div>
              )}

              {(activeCategory === 'doctors' || activeCategory === 'hospitals' || activeCategory === 'urgentCares' || activeCategory === 'pharmacies' || activeCategory === 'specialists') && (
                <>
                  <div>
                    <label className="block font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Address
                    </label>
                    <input
                      type="text"
                      value={fieldAddress}
                      onChange={(e) => setFieldAddress(e.target.value)}
                      placeholder="e.g. 123 Medical Way, Suite 100"
                      className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-2 text-slate-800 font-medium outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Phone Number
                    </label>
                    <input
                      type="text"
                      value={fieldPhone}
                      onChange={(e) => setFieldPhone(e.target.value)}
                      placeholder="e.g. (305) 555-0199"
                      className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-2 text-slate-800 font-medium outline-none"
                    />
                  </div>
                </>
              )}

              {activeCategory === 'medications' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-600 uppercase tracking-wider mb-1">Dosage</label>
                      <input
                        type="text"
                        value={fieldDosage}
                        onChange={(e) => setFieldDosage(e.target.value)}
                        placeholder="e.g. 10mg"
                        className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-2 text-slate-800 font-medium outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-600 uppercase tracking-wider mb-1">Frequency</label>
                      <input
                        type="text"
                        value={fieldFrequency}
                        onChange={(e) => setFieldFrequency(e.target.value)}
                        placeholder="e.g. Daily"
                        className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-2 text-slate-800 font-medium outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-600 uppercase tracking-wider mb-1">Instructions / Notes</label>
                    <input
                      type="text"
                      value={fieldInstructions}
                      onChange={(e) => setFieldInstructions(e.target.value)}
                      placeholder="e.g. Take with food in the morning"
                      className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-2 text-slate-800 font-medium outline-none"
                    />
                  </div>
                </>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingItem}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-xs"
                >
                  {savingItem ? 'Saving...' : 'Save Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs font-sans">
          <div className="bg-white border border-slate-100 rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4 text-center animate-scale-up">
            <h4 className="text-base font-extrabold text-slate-900">Confirm Delete</h4>
            <p className="text-xs text-slate-600">
              Are you sure you want to remove <strong>"{deletingTarget.name}"</strong>?
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingTarget(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteItem}
                disabled={deleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-xs"
              >
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
