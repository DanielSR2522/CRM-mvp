'use client';

import React from 'react';
import BeneficiarySection from './BeneficiarySection';
import { SupplementalPolicy } from '@/types/supplemental';
import { formatIsoToUsDate } from '@/utils/dateUtils';

interface Props {
  policy: SupplementalPolicy;
  onOpenEditPolicy: (policy: SupplementalPolicy) => void;
  onOpenDeletePolicy: (policy: SupplementalPolicy) => void;
}

export default function SupplementalPolicyDetails({
  policy,
  onOpenEditPolicy,
  onOpenDeletePolicy,
}: Props) {
  const formattedPremium = typeof policy.monthly_premium === 'number'
    ? `$${policy.monthly_premium.toFixed(2)}`
    : policy.monthly_premium ? `$${policy.monthly_premium}` : '$0.00';

  return (
    <div className="space-y-6 font-sans">
      {/* Full-Width Supplemental Policy Details Card */}
      <div className="crm-card p-6 space-y-5">
        {/* Card Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E8ECF2] pb-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl font-extrabold text-[#172033]">
                {policy.product_type} Policy Details
              </h2>
              <span
                className={`px-3 py-0.5 rounded-full text-xs font-extrabold uppercase ${
                  policy.status === 'Active'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                    : policy.status === 'Cancelled' || policy.status === 'Terminated'
                    ? 'bg-rose-50 text-rose-700 border border-rose-100'
                    : 'bg-amber-50 text-amber-700 border border-amber-100'
                }`}
              >
                {policy.status || 'Active'}
              </span>
            </div>
            <p className="text-xs text-[#7C8799] mt-0.5">
              Specific coverage type, carrier information, monthly premium, and status.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenEditPolicy(policy)}
              className="inline-flex items-center gap-1.5 bg-[#EEF4FF] hover:bg-[#DCE6FF] text-[#2563EB] text-xs font-bold px-3.5 py-2 rounded-xl transition-all active:scale-[0.98]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit Policy
            </button>

            <button
              type="button"
              onClick={() => onOpenDeletePolicy(policy)}
              className="inline-flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold px-3.5 py-2 rounded-xl transition-all active:scale-[0.98]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>
          </div>
        </div>

        {/* 3-Column Grid Layout */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
          {/* Row 1 */}
          <div>
            <span className="text-sm font-semibold text-slate-500 block mb-0.5">Product Type</span>
            <p className="text-[15px] font-semibold text-slate-950">{policy.product_type}</p>
          </div>

          <div>
            <span className="text-sm font-semibold text-slate-500 block mb-0.5">Company / Carrier</span>
            <p className="text-[15px] font-semibold text-slate-950">{policy.company || 'Not specified'}</p>
          </div>

          <div>
            <span className="text-sm font-semibold text-slate-500 block mb-0.5">Plan Name</span>
            <p className="text-[15px] font-semibold text-slate-950">{policy.plan_name || '—'}</p>
          </div>

          {/* Row 2 */}
          <div>
            <span className="text-sm font-semibold text-slate-500 block mb-0.5">Coverage Type</span>
            <p className="text-[15px] font-semibold text-slate-950">{policy.coverage_type || 'Individual'}</p>
          </div>

          <div>
            <span className="text-sm font-semibold text-slate-500 block mb-0.5">Member ID / Policy Number</span>
            <p className="text-[15px] font-semibold text-slate-950">{policy.member_id || '—'}</p>
          </div>

          <div>
            <span className="text-sm font-semibold text-slate-500 block mb-0.5">Monthly Premium</span>
            <p className="text-[15px] font-semibold text-emerald-600">{formattedPremium} / month</p>
          </div>

          {/* Row 3 */}
          <div>
            <span className="text-sm font-semibold text-slate-500 block mb-0.5">Effective Date</span>
            <p className="text-[15px] font-semibold text-slate-950">{formatIsoToUsDate(policy.effective_date)}</p>
          </div>

          <div>
            <span className="text-sm font-semibold text-slate-500 block mb-0.5">Status</span>
            <p className="text-[15px] font-semibold text-slate-950">{policy.status || 'Active'}</p>
          </div>
        </div>
      </div>

      {/* Full-Width Beneficiary Section */}
      <BeneficiarySection
        policy={policy}
        onOpenEditPolicy={onOpenEditPolicy}
      />
    </div>
  );
}
