'use client';

import React from 'react';
import { SupplementalPolicy } from '@/types/supplemental';
import { formatIsoToUsDate } from '@/utils/dateUtils';

interface Props {
  policy: SupplementalPolicy;
  onOpenEditPolicy: (policy: SupplementalPolicy) => void;
}

export default function BeneficiarySection({ policy, onOpenEditPolicy }: Props) {
  const hasBeneficiary = policy.beneficiary_name || policy.beneficiary_phone || policy.beneficiary_birth_date;

  return (
    <div className="crm-card p-6 space-y-4 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E8ECF2] pb-3">
        <div>
          <h3 className="text-base font-extrabold text-[#172033]">Beneficiary Information</h3>
          <p className="text-xs text-[#7C8799] mt-0.5">
            Designated beneficiary details for this supplemental policy.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onOpenEditPolicy(policy)}
          className="inline-flex items-center gap-1.5 bg-[#EEF4FF] hover:bg-[#DCE6FF] text-[#2563EB] text-xs font-bold px-3.5 py-2 rounded-xl transition-all active:scale-[0.98]"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          {hasBeneficiary ? 'Edit Beneficiary' : '+ Add Beneficiary'}
        </button>
      </div>

      {!hasBeneficiary ? (
        <div className="py-6 text-center border border-dashed border-[#DCE2EA] rounded-2xl bg-[#F8FAFC]">
          <p className="text-xs text-[#7C8799] font-medium">No beneficiary information added yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 text-xs">
          <div>
            <span className="text-[10px] uppercase font-bold text-[#7C8799] block">Beneficiary Name</span>
            <p className="font-extrabold text-[#172033] mt-0.5">{policy.beneficiary_name || '—'}</p>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-[#7C8799] block">Beneficiary Phone</span>
            <p className="font-bold text-[#172033] mt-0.5">{policy.beneficiary_phone || '—'}</p>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-[#7C8799] block">Beneficiary Birth Date</span>
            <p className="font-bold text-[#172033] mt-0.5">{formatIsoToUsDate(policy.beneficiary_birth_date)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
