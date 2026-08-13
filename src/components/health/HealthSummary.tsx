'use client';

import React, { useState } from 'react';
import { HealthPolicy } from '@/lib/health/types';
import { updateHealthPolicyField } from '@/lib/health/health-service';
import HealthMedicalSection from './HealthMedicalSection';

interface HealthSummaryProps {
  healthPolicy: HealthPolicy | null;
  isEditingHealth: boolean;
  setIsEditingHealth: (val: boolean) => void;
  formatIsoToUsDate: (date: string) => string;
  onPolicyUpdated?: (updatedPolicy: HealthPolicy) => void;
  addToast?: (toast: { title: string; description: string; type: 'success' | 'error' | 'warning' }) => void;
}

const POLICY_STATUS_OPTIONS: Array<'Active' | 'Pending' | 'Cancelled'> = ['Active', 'Pending', 'Cancelled'];
const ACTION_PENDING_OPTIONS: Array<'Documents' | 'Verification' | 'Call To Marketplace' | 'Completed'> = [
  'Documents',
  'Verification',
  'Call To Marketplace',
  'Completed'
];

export default function HealthSummary({
  healthPolicy,
  isEditingHealth,
  setIsEditingHealth,
  formatIsoToUsDate,
  onPolicyUpdated,
  addToast
}: HealthSummaryProps) {
  const [editingStatus, setEditingStatus] = useState<boolean>(false);
  const [editingAction, setEditingAction] = useState<boolean>(false);
  const [savingField, setSavingField] = useState<string | null>(null);

  if (!healthPolicy) return null;

  const policy = healthPolicy;
  const monthlyPremium = (Number(policy.plan_cost || 0) + Number(policy.tax_credit || 0)).toFixed(2);

  const handleStatusChange = async (newStatus: 'Active' | 'Pending' | 'Cancelled') => {
    if (savingField || newStatus === policy.policy_status) {
      setEditingStatus(false);
      return;
    }

    setSavingField('policy_status');
    try {
      const updated = await updateHealthPolicyField(policy.id, { policy_status: newStatus });
      setEditingStatus(false);
      if (onPolicyUpdated) onPolicyUpdated(updated);
      
      // Dispatch Overview sync event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('crm:overview-refresh'));
      }

      if (addToast) {
        addToast({
          title: 'Policy Status Updated',
          description: `Policy Status changed to ${newStatus}.`,
          type: 'success'
        });
      }
    } catch (err: any) {
      console.error('Failed to update policy status:', err);
      if (addToast) {
        addToast({
          title: 'Error Updating Status',
          description: err?.message || 'Could not update policy status.',
          type: 'error'
        });
      }
    } finally {
      setSavingField(null);
    }
  };

  const handleActionChange = async (newAction: 'Documents' | 'Verification' | 'Call To Marketplace' | 'Completed') => {
    if (savingField || newAction === policy.action_pending) {
      setEditingAction(false);
      return;
    }

    setSavingField('action_pending');
    try {
      const updated = await updateHealthPolicyField(policy.id, { action_pending: newAction });
      setEditingAction(false);
      if (onPolicyUpdated) onPolicyUpdated(updated);

      if (addToast) {
        addToast({
          title: 'Action Pending Updated',
          description: `Action Pending changed to ${newAction}.`,
          type: 'success'
        });
      }
    } catch (err: any) {
      console.error('Failed to update action pending:', err);
      if (addToast) {
        addToast({
          title: 'Error Updating Action Pending',
          description: err?.message || 'Could not update action pending.',
          type: 'error'
        });
      }
    } finally {
      setSavingField(null);
    }
  };

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm font-sans space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-50 pb-4 gap-4">
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

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-4 text-xs font-sans">
        <div>
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">ENROLLED</span>
          <span className="font-semibold text-slate-800 mt-1 block">{policy.active ? 'Yes' : 'No'}</span>
        </div>

        {/* POLICY STATUS INLINE EDIT */}
        <div className="relative group">
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">POLICY STATUS</span>
          {editingStatus ? (
            <div className="mt-1 flex items-center gap-1">
              <select
                value={policy.policy_status}
                disabled={savingField === 'policy_status'}
                onChange={(e) => handleStatusChange(e.target.value as any)}
                className="bg-slate-50 border border-blue-500 rounded px-1.5 py-0.5 text-xs font-bold text-slate-900 outline-none"
                autoFocus
              >
                {POLICY_STATUS_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setEditingStatus(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold px-1"
                title="Cancel"
              >
                ✕
              </button>
            </div>
          ) : (
            <div
              onClick={() => setEditingStatus(true)}
              className="mt-1 cursor-pointer hover:bg-slate-50 rounded px-1 py-0.5 -ml-1 transition-all flex items-center justify-between gap-1 group/item"
              title="Click to change Policy Status"
            >
              <span className={`font-bold ${
                policy.policy_status === 'Active'
                  ? 'text-emerald-600'
                  : policy.policy_status === 'Cancelled'
                  ? 'text-rose-600'
                  : 'text-amber-600'
              }`}>
                {policy.policy_status || '-'}
              </span>
              <span className="text-[10px] opacity-0 group-hover/item:opacity-100 text-slate-400 font-normal">✏️</span>
            </div>
          )}
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

        {/* ACTION PENDING INLINE EDIT */}
        <div className="relative group">
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Action Pending</span>
          {editingAction ? (
            <div className="mt-1 flex items-center gap-1">
              <select
                value={policy.action_pending}
                disabled={savingField === 'action_pending'}
                onChange={(e) => handleActionChange(e.target.value as any)}
                className="bg-slate-50 border border-blue-500 rounded px-1.5 py-0.5 text-xs font-bold text-slate-900 outline-none"
                autoFocus
              >
                {ACTION_PENDING_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setEditingAction(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold px-1"
                title="Cancel"
              >
                ✕
              </button>
            </div>
          ) : (
            <div
              onClick={() => setEditingAction(true)}
              className="mt-1 cursor-pointer hover:bg-slate-50 rounded px-1 py-0.5 -ml-1 transition-all flex items-center justify-between gap-1 group/item"
              title="Click to change Action Pending"
            >
              <span className={`font-semibold ${policy.action_pending === 'Completed' ? 'text-emerald-600' : 'text-amber-600'}`}>
                {policy.action_pending}
              </span>
              <span className="text-[10px] opacity-0 group-hover/item:opacity-100 text-slate-400 font-normal">✏️</span>
            </div>
          )}
        </div>
      </div>

      {/* HEALTH MEDICAL SECTION */}
      <HealthMedicalSection
        healthPolicyId={policy.id}
        clientId={policy.client_id}
        addToast={addToast}
      />
    </div>
  );
}
