'use client';

import React from 'react';
import { SupplementalPolicy } from '@/types/supplemental';
import { formatIsoToUsDate } from '@/utils/dateUtils';

interface Props {
  policies: SupplementalPolicy[];
  selectedPolicyId: string | null;
  onSelectPolicy: (policyId: string) => void;
  onOpenAddModal: () => void;
}

export default function SupplementalPolicyList({
  policies,
  selectedPolicyId,
  onSelectPolicy,
  onOpenAddModal,
}: Props) {
  return (
    <div className="crm-card p-5 space-y-4 font-sans">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-[#E8ECF2] pb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-extrabold text-[#172033]">
            Supplemental Policies
          </h3>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-[#2563EB]/10 text-[#2563EB]">
            {policies.length}
          </span>
        </div>

        <button
          type="button"
          onClick={onOpenAddModal}
          className="inline-flex items-center gap-1.5 bg-[#EEF4FF] hover:bg-[#DCE6FF] text-[#2563EB] text-xs font-bold px-3.5 py-2 rounded-xl transition-all active:scale-[0.98]"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
          </svg>
          + Add Supplemental Policy
        </button>
      </div>

      {/* Top Selector Grid */}
      {policies.length === 0 ? (
        <div className="py-8 text-center border border-dashed border-[#DCE2EA] rounded-2xl bg-[#F8FAFC]">
          <p className="text-xs text-[#7C8799] font-medium">No supplemental policies added yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {policies.map((p) => {
            const isSelected = p.id === selectedPolicyId;
            const formattedPremium = typeof p.monthly_premium === 'number'
              ? `$${p.monthly_premium.toFixed(2)}/mo`
              : p.monthly_premium ? `$${p.monthly_premium}/mo` : '$0.00/mo';

            return (
              <div
                key={p.id}
                onClick={() => onSelectPolicy(p.id)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer space-y-2 relative ${
                  isSelected
                    ? 'bg-[#EEF4FF]/70 border-[#2563EB] shadow-md shadow-blue-500/5 ring-2 ring-[#2563EB]'
                    : 'bg-white border-[#E8ECF2] hover:border-[#CBD5E1] hover:bg-[#F8FAFC]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-extrabold text-[#172033] truncate">
                    {p.product_type}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                      p.status === 'Active'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                        : p.status === 'Cancelled' || p.status === 'Terminated'
                        ? 'bg-rose-50 text-rose-700 border border-rose-100'
                        : 'bg-amber-50 text-amber-700 border border-amber-100'
                    }`}
                  >
                    {p.status || 'Active'}
                  </span>
                </div>

                <div className="text-xs text-[#556176] font-semibold truncate">
                  {p.company || 'Carrier Unspecified'}
                </div>

                <div className="flex items-center justify-between text-xs pt-1 border-t border-[#E8ECF2]/60">
                  <span className="text-[#7C8799] font-medium text-[11px] truncate">{p.coverage_type || 'Individual'}</span>
                  <span className="text-emerald-600 font-extrabold">{formattedPremium}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
