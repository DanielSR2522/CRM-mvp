import React from 'react';
import { HealthPolicy } from '@/lib/health/types';

interface HealthSummaryProps {
  healthPolicy: HealthPolicy | null;
  isEditingHealth: boolean;
  setIsEditingHealth: (val: boolean) => void;
  formatIsoToUsDate: (date: string) => string;
}

export default function HealthSummary({
  healthPolicy,
  isEditingHealth,
  setIsEditingHealth,
  formatIsoToUsDate
}: HealthSummaryProps) {
  if (!healthPolicy) return null;

  const policy = healthPolicy;
  const monthlyPremium = (Number(policy.plan_cost || 0) + Number(policy.tax_credit || 0)).toFixed(2);

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-50 pb-4 mb-4 gap-4">
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-sans">Health Policy Summary</span>
          <div className="flex items-center gap-3 mt-1">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
              policy.policy_status === 'Active'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                : policy.policy_status === 'Cancelled'
                ? 'bg-rose-50 text-rose-700 border-rose-100'
                : 'bg-amber-50 text-amber-700 border-amber-100'
            }`}>
              {policy.policy_status}
            </span>
            <span className="font-extrabold text-slate-800 text-sm font-sans">{policy.company_2026 || 'No Insurer'}</span>
          </div>
        </div>
        {!isEditingHealth && (
          <button
            type="button"
            onClick={() => setIsEditingHealth(true)}
            className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-lg transition-all font-sans"
          >
            Edit Policy
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4 text-xs font-sans">
        <div>
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</span>
          <span className="font-semibold text-slate-800 mt-1 block">{policy.policy_status}</span>
        </div>
        <div>
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Company 2026</span>
          <span className="font-semibold text-slate-800 mt-1 block">{policy.company_2026 || '-'}</span>
        </div>
        <div>
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Type Plan</span>
          <span className="font-semibold text-slate-800 mt-1 block">{policy.type_plan || '-'}</span>
        </div>
        <div>
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">No. Membership</span>
          <span className="font-semibold text-slate-800 mt-1 block">{policy.no_membership || '-'}</span>
        </div>
        <div>
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Effective Date</span>
          <span className="font-semibold text-slate-800 mt-1 block">{policy.effective_date ? formatIsoToUsDate(policy.effective_date) : '-'}</span>
        </div>
        <div>
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Monthly Premium</span>
          <span className="font-extrabold text-blue-700 mt-1 block">${monthlyPremium}</span>
        </div>
        <div>
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Renovation Status</span>
          <span className="font-semibold text-slate-800 mt-1 block">{policy.renovation_status || '-'}</span>
        </div>
        <div>
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Action Pending</span>
          <span className={`font-semibold mt-1 block ${policy.action_pending === 'Completed' ? 'text-emerald-600' : 'text-amber-600'}`}>{policy.action_pending}</span>
        </div>
      </div>
    </div>
  );
}
