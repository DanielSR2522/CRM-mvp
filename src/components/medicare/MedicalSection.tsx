'use client';

import React from 'react';
import MedicalCategoryCard from './MedicalCategoryCard';
import {
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
  doctors: DoctorEntry[];
  hospitals: HospitalEntry[];
  urgentCares: UrgentCareEntry[];
  pharmacies: PharmacyEntry[];
  conditions: ConditionEntry[];
  specialists: SpecialistEntry[];
  medications: MedicationEntry[];
  onOpenAdd: (category: MedicalCategory) => void;
  onOpenEdit: (category: MedicalCategory, item: any) => void;
  onOpenDelete: (category: MedicalCategory, item: any) => void;
}

export default function MedicalSection({
  doctors,
  hospitals,
  urgentCares,
  pharmacies,
  conditions,
  specialists,
  medications,
  onOpenAdd,
  onOpenEdit,
  onOpenDelete,
}: Props) {
  return (
    <div className="space-y-6 pt-2">
      <div className="border-b border-[#E8ECF2] pb-3">
        <h2 className="text-lg font-extrabold tracking-tight text-[#172033]">Medical Section</h2>
        <p className="text-xs text-[#7C8799] mt-0.5">
          Dynamic records for providers, facilities, medical conditions, and medications.
        </p>
      </div>

      {/* Row 1: Doctors, Hospitals, Urgent Care */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Primary Doctors */}
        <MedicalCategoryCard
          title="Primary Doctors"
          count={doctors.length}
          emptyText="No primary doctors added yet."
          items={doctors}
          onAdd={() => onOpenAdd('doctors')}
          renderItem={(doc) => (
            <div key={doc.id} className="p-3 bg-[#F8FAFC] border border-[#E8ECF2] rounded-xl flex items-start justify-between gap-2 group hover:border-[#CBD5E1] transition-all">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[#172033] truncate">{doc.name}</p>
                {doc.specialty && <p className="text-[11px] text-[#2563EB] font-medium truncate mt-0.5">{doc.specialty}</p>}
                {doc.phone && <p className="text-[11px] text-[#556176] truncate mt-0.5">📞 {doc.phone}</p>}
                {doc.address && <p className="text-[11px] text-[#7C8799] truncate mt-0.5">📍 {doc.address}</p>}
              </div>
              <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => onOpenEdit('doctors', doc)}
                  className="p-1 text-[#556176] hover:text-[#2563EB] hover:bg-white rounded transition-all"
                  title="Edit Doctor"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenDelete('doctors', doc)}
                  className="p-1 text-[#556176] hover:text-rose-600 hover:bg-white rounded transition-all"
                  title="Delete Doctor"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        />

        {/* Hospitals */}
        <MedicalCategoryCard
          title="Hospitals"
          count={hospitals.length}
          emptyText="No hospitals added yet."
          items={hospitals}
          onAdd={() => onOpenAdd('hospitals')}
          renderItem={(hosp) => (
            <div key={hosp.id} className="p-3 bg-[#F8FAFC] border border-[#E8ECF2] rounded-xl flex items-start justify-between gap-2 group hover:border-[#CBD5E1] transition-all">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[#172033] truncate">{hosp.name}</p>
                {hosp.phone && <p className="text-[11px] text-[#556176] truncate mt-0.5">📞 {hosp.phone}</p>}
                {hosp.address && <p className="text-[11px] text-[#7C8799] truncate mt-0.5">📍 {hosp.address}</p>}
              </div>
              <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => onOpenEdit('hospitals', hosp)}
                  className="p-1 text-[#556176] hover:text-[#2563EB] hover:bg-white rounded transition-all"
                  title="Edit Hospital"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenDelete('hospitals', hosp)}
                  className="p-1 text-[#556176] hover:text-rose-600 hover:bg-white rounded transition-all"
                  title="Delete Hospital"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        />

        {/* Urgent Care */}
        <MedicalCategoryCard
          title="Urgent Care"
          count={urgentCares.length}
          emptyText="No urgent care centers added yet."
          items={urgentCares}
          onAdd={() => onOpenAdd('urgent_cares')}
          renderItem={(uc) => (
            <div key={uc.id} className="p-3 bg-[#F8FAFC] border border-[#E8ECF2] rounded-xl flex items-start justify-between gap-2 group hover:border-[#CBD5E1] transition-all">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[#172033] truncate">{uc.name}</p>
                {uc.phone && <p className="text-[11px] text-[#556176] truncate mt-0.5">📞 {uc.phone}</p>}
                {uc.address && <p className="text-[11px] text-[#7C8799] truncate mt-0.5">📍 {uc.address}</p>}
              </div>
              <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => onOpenEdit('urgent_cares', uc)}
                  className="p-1 text-[#556176] hover:text-[#2563EB] hover:bg-white rounded transition-all"
                  title="Edit Urgent Care"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenDelete('urgent_cares', uc)}
                  className="p-1 text-[#556176] hover:text-rose-600 hover:bg-white rounded transition-all"
                  title="Delete Urgent Care"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        />
      </div>

      {/* Row 2: Pharmacies, Conditions, Specialists */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Pharmacies */}
        <MedicalCategoryCard
          title="Pharmacies"
          count={pharmacies.length}
          emptyText="No pharmacies added yet."
          items={pharmacies}
          onAdd={() => onOpenAdd('pharmacies')}
          renderItem={(pharm) => (
            <div key={pharm.id} className="p-3 bg-[#F8FAFC] border border-[#E8ECF2] rounded-xl flex items-start justify-between gap-2 group hover:border-[#CBD5E1] transition-all">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[#172033] truncate">{pharm.name}</p>
                {pharm.phone && <p className="text-[11px] text-[#556176] truncate mt-0.5">📞 {pharm.phone}</p>}
                {pharm.address && <p className="text-[11px] text-[#7C8799] truncate mt-0.5">📍 {pharm.address}</p>}
              </div>
              <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => onOpenEdit('pharmacies', pharm)}
                  className="p-1 text-[#556176] hover:text-[#2563EB] hover:bg-white rounded transition-all"
                  title="Edit Pharmacy"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenDelete('pharmacies', pharm)}
                  className="p-1 text-[#556176] hover:text-rose-600 hover:bg-white rounded transition-all"
                  title="Delete Pharmacy"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        />

        {/* Conditions */}
        <MedicalCategoryCard
          title="Conditions"
          count={conditions.length}
          emptyText="No medical conditions added yet."
          items={conditions}
          onAdd={() => onOpenAdd('conditions')}
          renderItem={(cond) => (
            <div key={cond.id} className="p-3 bg-[#F8FAFC] border border-[#E8ECF2] rounded-xl flex items-start justify-between gap-2 group hover:border-[#CBD5E1] transition-all">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[#172033] truncate">{cond.name}</p>
                {cond.notes && <p className="text-[11px] text-[#556176] truncate mt-0.5">{cond.notes}</p>}
              </div>
              <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => onOpenEdit('conditions', cond)}
                  className="p-1 text-[#556176] hover:text-[#2563EB] hover:bg-white rounded transition-all"
                  title="Edit Condition"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenDelete('conditions', cond)}
                  className="p-1 text-[#556176] hover:text-rose-600 hover:bg-white rounded transition-all"
                  title="Delete Condition"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        />

        {/* Specialists */}
        <MedicalCategoryCard
          title="Specialists"
          count={specialists.length}
          emptyText="No specialists added yet."
          items={specialists}
          onAdd={() => onOpenAdd('specialists')}
          renderItem={(spec) => (
            <div key={spec.id} className="p-3 bg-[#F8FAFC] border border-[#E8ECF2] rounded-xl flex items-start justify-between gap-2 group hover:border-[#CBD5E1] transition-all">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[#172033] truncate">{spec.name}</p>
                {spec.specialty && <p className="text-[11px] text-[#2563EB] font-medium truncate mt-0.5">{spec.specialty}</p>}
                {spec.phone && <p className="text-[11px] text-[#556176] truncate mt-0.5">📞 {spec.phone}</p>}
                {spec.address && <p className="text-[11px] text-[#7C8799] truncate mt-0.5">📍 {spec.address}</p>}
              </div>
              <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => onOpenEdit('specialists', spec)}
                  className="p-1 text-[#556176] hover:text-[#2563EB] hover:bg-white rounded transition-all"
                  title="Edit Specialist"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenDelete('specialists', spec)}
                  className="p-1 text-[#556176] hover:text-rose-600 hover:bg-white rounded transition-all"
                  title="Delete Specialist"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        />
      </div>

      {/* Row 3: Medicines (Full Width) */}
      <div>
        <MedicalCategoryCard
          title="Medicines"
          count={medications.length}
          emptyText="No medications added yet."
          items={medications}
          fullWidth
          onAdd={() => onOpenAdd('medications')}
          renderItem={(med) => (
            <div key={med.id} className="p-3.5 bg-[#F8FAFC] border border-[#E8ECF2] rounded-xl flex items-start justify-between gap-3 group hover:border-[#CBD5E1] transition-all">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 flex-1 min-w-0">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#7C8799] block">Medication</span>
                  <p className="text-xs font-bold text-[#172033] truncate mt-0.5">{med.name}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#7C8799] block">Dosage</span>
                  <p className="text-xs text-[#556176] truncate mt-0.5">{med.dosage || '-'}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#7C8799] block">Frequency</span>
                  <p className="text-xs text-[#556176] truncate mt-0.5">{med.frequency || '-'}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#7C8799] block">Instructions</span>
                  <p className="text-xs text-[#556176] truncate mt-0.5">{med.instructions || '-'}</p>
                </div>
              </div>

              <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => onOpenEdit('medications', med)}
                  className="p-1 text-[#556176] hover:text-[#2563EB] hover:bg-white rounded transition-all"
                  title="Edit Medication"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenDelete('medications', med)}
                  className="p-1 text-[#556176] hover:text-rose-600 hover:bg-white rounded transition-all"
                  title="Delete Medication"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        />
      </div>
    </div>
  );
}
