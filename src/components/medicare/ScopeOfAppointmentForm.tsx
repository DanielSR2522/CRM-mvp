'use client';

import React from 'react';
import { ScopeOfAppointmentData } from '@/types/medicare';
import DatePicker from '@/components/ui/DatePicker';

interface Props {
  data: ScopeOfAppointmentData;
  onChange: (field: keyof ScopeOfAppointmentData, value: any) => void;
  saving?: boolean;
}

export default function ScopeOfAppointmentForm({ data, onChange, saving = false }: Props) {
  return (
    <div className="crm-card p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-[#E8ECF2] pb-3">
        <div>
          <h3 className="text-base font-bold text-[#172033]">Scope of Appointment</h3>
          <p className="text-xs text-[#7C8799] mt-0.5">
            Documentation of scope of appointment consent.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
        {/* Scope of Appointment Toggle / Segmented Control */}
        <div>
          <label className="block text-xs font-semibold text-[#556176] mb-1.5">
            Scope of Appointment
          </label>
          <div className="inline-flex rounded-lg border border-[#DCE2EA] bg-[#F8FAFC] p-1 w-full">
            <button
              type="button"
              disabled={saving}
              onClick={() => onChange('scope_of_appointment', true)}
              className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${
                data.scope_of_appointment === true
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-[#556176] hover:text-[#172033]'
              }`}
            >
              Yes
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => onChange('scope_of_appointment', false)}
              className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${
                data.scope_of_appointment === false
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-[#556176] hover:text-[#172033]'
              }`}
            >
              No
            </button>
          </div>
        </div>

        {/* SOA Date */}
        <div>
          <DatePicker
            label="SOA Date"
            value={data.soa_date}
            onChange={(isoDate) => onChange('soa_date', isoDate)}
            disabled={saving}
            placeholder="MM/DD/YYYY"
            optional
          />
        </div>

        {/* SOA Method */}
        <div>
          <label className="block text-xs font-semibold text-[#556176] mb-1.5">
            SOA Method
          </label>
          <select
            disabled={saving}
            value={data.soa_method || ''}
            onChange={(e) => onChange('soa_method', e.target.value || null)}
            className="w-full bg-[#F8FAFC] border border-[#DCE2EA] focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] rounded-md px-3 py-1.5 text-xs text-[#172033] outline-none transition-all"
          >
            <option value="">Select Method...</option>
            <option value="Phone">Phone</option>
            <option value="Electronic">Electronic</option>
            <option value="Paper">Paper</option>
            <option value="In Person">In Person</option>
          </select>
        </div>
      </div>
    </div>
  );
}
