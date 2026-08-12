'use client';

import React from 'react';
import { MedicareDetailsData } from '@/types/medicare';
import DatePicker from '@/components/ui/DatePicker';

interface Props {
  data: MedicareDetailsData;
  onChange: (field: keyof MedicareDetailsData, value: any) => void;
  saving?: boolean;
}

export default function MedicareDetailsForm({ data, onChange, saving = false }: Props) {
  return (
    <div className="crm-card p-5 space-y-4">
      <div className="border-b border-[#E8ECF2] pb-3">
        <h3 className="text-base font-bold text-[#172033]">Medicare Details</h3>
        <p className="text-xs text-[#7C8799] mt-0.5">
          Beneficiary identification, plan subtype, Medicaid levels, and coverage dates.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-1">
        {/* Left Column */}
        <div className="space-y-4">
          {/* MBI */}
          <div>
            <label className="block text-xs font-semibold text-[#556176] mb-1.5">
              MBI (Medicare Beneficiary Identifier)
            </label>
            <input
              type="text"
              disabled={saving}
              value={data.mbi || ''}
              onChange={(e) => onChange('mbi', e.target.value || null)}
              placeholder="e.g. 1EG4-TE5-MK72"
              className="w-full bg-[#F8FAFC] border border-[#DCE2EA] focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] rounded-md px-3 py-1.5 text-xs text-[#172033] placeholder-[#94A3B8] outline-none transition-all uppercase"
            />
          </div>

          {/* Part A Effective Date */}
          <div>
            <DatePicker
              label="Hospital (Part A) Effective Date"
              value={data.part_a_effective_date}
              onChange={(isoDate) => onChange('part_a_effective_date', isoDate)}
              disabled={saving}
              placeholder="MM/DD/YYYY"
              optional
            />
          </div>

          {/* Part B Effective Date */}
          <div>
            <DatePicker
              label="Medical (Part B) Effective Date"
              value={data.part_b_effective_date}
              onChange={(isoDate) => onChange('part_b_effective_date', isoDate)}
              disabled={saving}
              placeholder="MM/DD/YYYY"
              optional
            />
          </div>

          {/* Part C Subtype */}
          <div>
            <label className="block text-xs font-semibold text-[#556176] mb-1.5">
              Medicare Advantage Plan Subtype (Part C)
            </label>
            <select
              disabled={saving}
              value={data.part_c_subtype || ''}
              onChange={(e) => onChange('part_c_subtype', e.target.value || null)}
              className="w-full bg-[#F8FAFC] border border-[#DCE2EA] focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] rounded-md px-3 py-1.5 text-xs text-[#172033] outline-none transition-all"
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
          <div>
            <label className="block text-xs font-semibold text-[#556176] mb-1.5">
              Medicaid Level
            </label>
            <select
              disabled={saving}
              value={data.medicaid_level || ''}
              onChange={(e) => onChange('medicaid_level', e.target.value || null)}
              className="w-full bg-[#F8FAFC] border border-[#DCE2EA] focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] rounded-md px-3 py-1.5 text-xs text-[#172033] outline-none transition-all"
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
          <div>
            <label className="block text-xs font-semibold text-[#556176] mb-1.5">
              Medicaid ID
            </label>
            <input
              type="text"
              disabled={saving}
              value={data.medicaid_id || ''}
              onChange={(e) => onChange('medicaid_id', e.target.value || null)}
              placeholder="Medicaid ID number"
              className="w-full bg-[#F8FAFC] border border-[#DCE2EA] focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] rounded-md px-3 py-1.5 text-xs text-[#172033] placeholder-[#94A3B8] outline-none transition-all"
            />
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          {/* Medicare Renewal Status */}
          <div>
            <label className="block text-xs font-semibold text-[#556176] mb-1.5">
              Medicare Renewal Status
            </label>
            <select
              disabled={saving}
              value={data.renewal_status || ''}
              onChange={(e) => onChange('renewal_status', e.target.value || null)}
              className="w-full bg-[#F8FAFC] border border-[#DCE2EA] focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] rounded-md px-3 py-1.5 text-xs text-[#172033] outline-none transition-all"
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
          <div>
            <label className="block text-xs font-semibold text-[#556176] mb-1.5">
              Medicare Company / Carrier
            </label>
            <input
              type="text"
              disabled={saving}
              value={data.company || ''}
              onChange={(e) => onChange('company', e.target.value || null)}
              placeholder="e.g. Humana, UnitedHealthcare, Aetna, Devoted"
              className="w-full bg-[#F8FAFC] border border-[#DCE2EA] focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] rounded-md px-3 py-1.5 text-xs text-[#172033] placeholder-[#94A3B8] outline-none transition-all"
            />
          </div>

          {/* Plan Name */}
          <div>
            <label className="block text-xs font-semibold text-[#556176] mb-1.5">
              Plan Name
            </label>
            <input
              type="text"
              disabled={saving}
              value={data.plan_name || ''}
              onChange={(e) => onChange('plan_name', e.target.value || null)}
              placeholder="e.g. Humana Choice Choice HMO-POS"
              className="w-full bg-[#F8FAFC] border border-[#DCE2EA] focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] rounded-md px-3 py-1.5 text-xs text-[#172033] placeholder-[#94A3B8] outline-none transition-all"
            />
          </div>

          {/* Plan ID */}
          <div>
            <label className="block text-xs font-semibold text-[#556176] mb-1.5">
              Plan ID
            </label>
            <input
              type="text"
              disabled={saving}
              value={data.plan_id || ''}
              onChange={(e) => onChange('plan_id', e.target.value || null)}
              placeholder="e.g. H1036-089-0"
              className="w-full bg-[#F8FAFC] border border-[#DCE2EA] focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] rounded-md px-3 py-1.5 text-xs text-[#172033] placeholder-[#94A3B8] outline-none transition-all uppercase"
            />
          </div>

          {/* Plan Effective Date */}
          <div>
            <DatePicker
              label="Plan Effective Date"
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
