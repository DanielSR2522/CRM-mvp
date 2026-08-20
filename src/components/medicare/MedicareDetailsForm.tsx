'use client';

import React from 'react';
import { MedicareDetailsData } from '@/types/medicare';
import DatePicker from '@/components/ui/DatePicker';

interface Props {
  data: MedicareDetailsData;
  onChange: (field: keyof MedicareDetailsData, value: any) => void;
  onSave?: () => void;
  saving?: boolean;
}

export default function MedicareDetailsForm({ data, onChange, onSave, saving = false }: Props) {
  return (
    <div className="bg-white border border-slate-200/70 rounded-xl p-5 shadow-2xs space-y-4 font-sans text-sm">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <div>
          <h4 className="text-[16px] font-bold text-slate-950 tracking-tight">
            Medicare Information 2026
          </h4>
          <p className="text-[12px] text-slate-500 mt-0.5 font-normal">
            Beneficiary identification, plan subtype, Medicaid levels, and coverage dates.
          </p>
        </div>

        {onSave && (
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-xs disabled:opacity-50"
          >
            {saving ? 'Saving Details...' : 'Save Medicare Details'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-3 text-sm font-sans pt-1">
        {/* Left Column */}
        <div className="space-y-3">
          {/* MBI */}
          <div className="grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[38px]">
            <label className="text-sm font-semibold text-slate-500 leading-snug break-words">
              MBI (Medicare Beneficiary Identifier)
            </label>
            <input
              type="text"
              disabled={saving}
              value={data.mbi || ''}
              onChange={(e) => onChange('mbi', e.target.value || null)}
              placeholder="e.g. 1EG4-TE5-MK72"
              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2 text-[15px] text-slate-950 font-mono font-semibold placeholder-slate-400 outline-none transition-all uppercase"
            />
          </div>

          {/* Part A Effective Date */}
          <div className="grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[38px]">
            <label className="text-sm font-semibold text-slate-500 leading-snug break-words">
              Hospital (Part A) Effective Date
            </label>
            <DatePicker
              value={data.part_a_effective_date}
              onChange={(isoDate) => onChange('part_a_effective_date', isoDate)}
              disabled={saving}
              placeholder="MM/DD/YYYY"
              optional
            />
          </div>

          {/* Part B Effective Date */}
          <div className="grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[38px]">
            <label className="text-slate-500 font-medium leading-snug break-words">
              Medical (Part B) Effective Date
            </label>
            <DatePicker
              value={data.part_b_effective_date}
              onChange={(isoDate) => onChange('part_b_effective_date', isoDate)}
              disabled={saving}
              placeholder="MM/DD/YYYY"
              optional
            />
          </div>

          {/* Part C Subtype */}
          <div className="grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[38px]">
            <label className="text-slate-500 font-medium leading-snug break-words">
              Advantage Plan Subtype (Part C)
            </label>
            <select
              disabled={saving}
              value={data.part_c_subtype || ''}
              onChange={(e) => onChange('part_c_subtype', e.target.value || null)}
              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2 text-sm text-slate-900 font-semibold outline-none transition-all"
            >
              <option value="">Select Subtype...</option>
              <option value="HMO">HMO (Health Maintenance Organization)</option>
              <option value="PPO">PPO (Preferred Provider Organization)</option>
              <option value="PFFS">PFFS (Private Fee-for-Service)</option>
              <option value="SNP-D">D-SNP (Dual Eligible Special Needs Plan)</option>
              <option value="SNP-C">C-SNP (Chronic Condition Special Needs Plan)</option>
              <option value="SNP-I">I-SNP (Institutional Special Needs Plan)</option>
              <option value="MSA">MSA (Medical Savings Account)</option>
            </select>
          </div>

          {/* Medicaid Level */}
          <div className="grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[38px]">
            <label className="text-slate-500 font-medium leading-snug break-words">
              Medicaid Level
            </label>
            <select
              disabled={saving}
              value={data.medicaid_level || ''}
              onChange={(e) => onChange('medicaid_level', e.target.value || null)}
              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2 text-sm text-slate-900 font-semibold outline-none transition-all"
            >
              <option value="">Select Medicaid Level...</option>
              <option value="Full Medicaid">Full Medicaid</option>
              <option value="QMB">QMB (Qualified Medicare Beneficiary)</option>
              <option value="QMB+">QMB+ (Qualified Medicare Beneficiary Plus)</option>
              <option value="SLMB">SLMB (Specified Low-Income Medicare Beneficiary)</option>
              <option value="SLMB+">SLMB+ (Specified Low-Income Medicare Beneficiary Plus)</option>
              <option value="QI">QI (Qualified Individual)</option>
              <option value="QDWI">QDWI (Qualified Disabled Working Individual)</option>
              <option value="None">None</option>
            </select>
          </div>

          {/* Medicaid ID */}
          <div className="grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[38px]">
            <label className="text-slate-500 font-medium leading-snug break-words">
              Medicaid ID
            </label>
            <input
              type="text"
              disabled={saving}
              value={data.medicaid_id || ''}
              onChange={(e) => onChange('medicaid_id', e.target.value || null)}
              placeholder="Medicaid ID number"
              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2 text-sm text-slate-900 font-semibold placeholder-slate-400 outline-none transition-all"
            />
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-3">
          {/* Medicare Renewal Status */}
          <div className="grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[38px]">
            <label className="text-slate-500 font-medium leading-snug break-words">
              Medicare Renewal Status
            </label>
            <select
              disabled={saving}
              value={data.renewal_status || ''}
              onChange={(e) => onChange('renewal_status', e.target.value || null)}
              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2 text-sm text-slate-900 font-semibold outline-none transition-all"
            >
              <option value="">Select Renewal Status...</option>
              <option value="Active">Active</option>
              <option value="Pending Renewal">Pending Renewal</option>
              <option value="Renewed 2026">Renewed 2026</option>
              <option value="Changed Plan">Changed Plan</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          {/* Medicare Company */}
          <div className="grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[38px]">
            <label className="text-slate-500 font-medium leading-snug break-words">
              Medicare Company / Carrier
            </label>
            <input
              type="text"
              disabled={saving}
              value={data.company || ''}
              onChange={(e) => onChange('company', e.target.value || null)}
              placeholder="e.g. Humana, UnitedHealthcare"
              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2 text-sm text-slate-900 font-semibold placeholder-slate-400 outline-none transition-all"
            />
          </div>

          {/* Plan Name */}
          <div className="grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[38px]">
            <label className="text-slate-500 font-medium leading-snug break-words">
              Plan Name
            </label>
            <input
              type="text"
              disabled={saving}
              value={data.plan_name || ''}
              onChange={(e) => onChange('plan_name', e.target.value || null)}
              placeholder="e.g. Humana Choice HMO-POS"
              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2 text-sm text-slate-900 font-semibold placeholder-slate-400 outline-none transition-all"
            />
          </div>

          {/* Plan ID */}
          <div className="grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[38px]">
            <label className="text-slate-500 font-medium leading-snug break-words">
              Plan ID
            </label>
            <input
              type="text"
              disabled={saving}
              value={data.plan_id || ''}
              onChange={(e) => onChange('plan_id', e.target.value || null)}
              placeholder="e.g. H1036-089-0"
              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2 text-sm text-slate-900 font-mono font-semibold placeholder-slate-400 outline-none transition-all uppercase"
            />
          </div>

          {/* Plan Effective Date */}
          <div className="grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[38px]">
            <label className="text-slate-500 font-medium leading-snug break-words">
              Plan Effective Date
            </label>
            <DatePicker
              value={data.plan_effective_date}
              onChange={(isoDate) => onChange('plan_effective_date', isoDate)}
              disabled={saving}
              placeholder="MM/DD/YYYY"
              optional
            />
          </div>
        </div>
      </div>
    </div>
  );
}
