'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { isoDateToMMDDYYYY } from '@/lib/formatters/date';
import USDateInput from '@/components/shared/USDateInput';

export interface LifePolicyBeneficiary {
  id: string;
  life_policy_id: string;
  name: string;
  dob: string | null;
  relationship_grade: string | null;
  is_client: boolean;
  phone: string | null;
  email: string | null;
  benefit_percentage: number;
  created_at: string;
}

interface LifePolicyBeneficiariesProps {
  lifePolicyId: string;
  onBeneficiariesChange?: () => void;
}

export default function LifePolicyBeneficiaries({ lifePolicyId, onBeneficiariesChange }: LifePolicyBeneficiariesProps) {
  const [beneficiaries, setBeneficiaries] = useState<LifePolicyBeneficiary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingBeneficiary, setEditingBeneficiary] = useState<LifePolicyBeneficiary | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState<string>('');
  const [dob, setDob] = useState<string>('');
  const [relationshipGrade, setRelationshipGrade] = useState<string>('Primary - Spouse');
  const [isClient, setIsClient] = useState<boolean>(false);
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [benefitPercentage, setBenefitPercentage] = useState<string>('');

  const loadBeneficiaries = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('life_policy_beneficiaries')
        .select('*')
        .eq('life_policy_id', lifePolicyId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setBeneficiaries(data || []);
    } catch (err) {
      console.error('Failed to load beneficiaries:', err);
    } finally {
      setLoading(false);
    }
  }, [lifePolicyId]);

  useEffect(() => {
    loadBeneficiaries();
  }, [loadBeneficiaries]);

  const totalPercentage = beneficiaries.reduce((sum, b) => sum + (Number(b.benefit_percentage) || 0), 0);
  const is100Percent = Math.abs(totalPercentage - 100) < 0.01;

  const openAddModal = () => {
    setEditingBeneficiary(null);
    setName('');
    setDob('');
    setRelationshipGrade('Primary - Spouse');
    setIsClient(false);
    setPhone('');
    setEmail('');
    
    // Default to remaining percentage up to 100%
    const remaining = Math.max(0, 100 - totalPercentage);
    setBenefitPercentage(remaining > 0 ? remaining.toString() : '');
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (b: LifePolicyBeneficiary) => {
    setEditingBeneficiary(b);
    setName(b.name);
    setDob(b.dob || '');
    setRelationshipGrade(b.relationship_grade || 'Primary - Spouse');
    setIsClient(b.is_client || false);
    setPhone(b.phone || '');
    setEmail(b.email || '');
    setBenefitPercentage(b.benefit_percentage ? b.benefit_percentage.toString() : '0');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSaveBeneficiary = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setFormError(null);

    const parsedPct = parseFloat(benefitPercentage);
    if (isNaN(parsedPct) || parsedPct <= 0 || parsedPct > 100) {
      setFormError('Benefit percentage must be a number between 1 and 100.');
      setIsSaving(false);
      return;
    }

    // Check that total does not exceed 100%
    const otherSum = beneficiaries
      .filter((b) => !editingBeneficiary || b.id !== editingBeneficiary.id)
      .reduce((sum, b) => sum + (Number(b.benefit_percentage) || 0), 0);

    const newTotal = parseFloat((otherSum + parsedPct).toFixed(2));

    if (newTotal > 100.001) {
      setFormError(`Total allocation cannot exceed 100%. Currently allocated: ${otherSum}%. Attempting to add ${parsedPct}% would reach ${newTotal}%.`);
      setIsSaving(false);
      return;
    }

    try {
      const payload = {
        life_policy_id: lifePolicyId,
        name: name.trim(),
        dob: dob || null,
        relationship_grade: relationshipGrade.trim() || null,
        is_client: isClient,
        phone: phone.trim() || null,
        email: email.trim() || null,
        benefit_percentage: parsedPct,
      };

      if (editingBeneficiary) {
        const { error } = await supabase
          .from('life_policy_beneficiaries')
          .update(payload)
          .eq('id', editingBeneficiary.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('life_policy_beneficiaries')
          .insert(payload);

        if (error) throw error;
      }

      setIsModalOpen(false);
      await loadBeneficiaries();
      if (onBeneficiariesChange) onBeneficiariesChange();
    } catch (err: any) {
      console.error('Failed to save beneficiary:', err);
      setFormError(err.message || 'Failed to save beneficiary');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteBeneficiary = async (bId: string) => {
    if (!confirm('Are you sure you want to delete this beneficiary?')) return;
    try {
      const { error } = await supabase
        .from('life_policy_beneficiaries')
        .delete()
        .eq('id', bId);

      if (error) throw error;
      await loadBeneficiaries();
      if (onBeneficiariesChange) onBeneficiariesChange();
    } catch (err: any) {
      console.error('Failed to delete beneficiary:', err);
      alert('Failed to delete beneficiary: ' + err.message);
    }
  };

  return (
    <div className="space-y-3 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 font-sans">Policy Beneficiaries</h4>
          <p className="text-[11px] text-slate-400 font-normal">
            Draft policies allow allocations from 0% to 100%. Total cannot exceed 100%.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          disabled={totalPercentage >= 100}
          className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg shadow-xs transition-all flex items-center gap-1 self-start sm:self-auto"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          + Add Beneficiary
        </button>
      </div>

      {/* Percentage Total Status Bar */}
      <div
        className={`p-2.5 rounded-lg border text-xs font-bold flex items-center justify-between transition-colors ${
          is100Percent
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-amber-50 border-amber-200 text-amber-900'
        }`}
      >
        <div className="flex items-center gap-2">
          <span>{is100Percent ? '✓ Allocation Complete:' : 'ℹ Allocation Total:'}</span>
          <span className="font-extrabold text-xs">{totalPercentage.toFixed(1)}% / 100%</span>
        </div>
        {!is100Percent && (
          <span className="text-[10px] font-semibold text-amber-700">
            (Draft mode active; 100% required to activate policy)
          </span>
        )}
      </div>

      {loading ? (
        <div className="py-6 text-center text-xs text-slate-400">Loading beneficiaries...</div>
      ) : beneficiaries.length === 0 ? (
        <div className="text-center py-8 bg-slate-50/50 border border-dashed border-slate-200 rounded-lg">
          <p className="text-xs text-slate-400 font-normal mb-2">No beneficiaries added to this policy yet.</p>
          <button
            type="button"
            onClick={openAddModal}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline"
          >
            + Add First Beneficiary
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200/80">
          <table className="w-full text-left text-xs font-sans">
            <thead className="bg-slate-50 border-b border-slate-200/80 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-2.5">Name</th>
                <th className="p-2.5">Relationship</th>
                <th className="p-2.5">DOB</th>
                <th className="p-2.5">Client?</th>
                <th className="p-2.5">Phone</th>
                <th className="p-2.5">Email</th>
                <th className="p-2.5">% Benefits</th>
                <th className="p-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-normal text-slate-700">
              {beneficiaries.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-2.5 font-bold text-slate-900">{b.name}</td>
                  <td className="p-2.5">{b.relationship_grade || '-'}</td>
                  <td className="p-2.5 font-semibold text-slate-800">{isoDateToMMDDYYYY(b.dob) || '-'}</td>
                  <td className="p-2.5">{b.is_client ? 'Yes' : 'No'}</td>
                  <td className="p-2.5">{b.phone || '-'}</td>
                  <td className="p-2.5">{b.email || '-'}</td>
                  <td className="p-2.5 font-bold text-indigo-600">{b.benefit_percentage}%</td>
                  <td className="p-2.5 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(b)}
                      className="text-indigo-600 hover:text-indigo-800 font-bold"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteBeneficiary(b.id)}
                      className="text-rose-600 hover:text-rose-800 font-bold"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Beneficiary Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in font-sans">
          <div className="bg-white rounded-2xl p-5 w-full max-w-lg shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-900">
                {editingBeneficiary ? 'Edit Beneficiary' : 'Add Beneficiary'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-2.5 bg-rose-50 border border-rose-100 rounded-lg text-rose-600 text-xs font-semibold">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveBeneficiary} className="space-y-3.5 text-xs font-sans">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="md:col-span-2">
                  <label className="block font-bold text-[10px] uppercase tracking-wider text-slate-500 mb-1">Beneficiary Name *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full legal name"
                    className="w-full border border-slate-200 rounded-lg p-2 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 text-xs font-semibold"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-[10px] uppercase tracking-wider text-slate-500 mb-1">Relationship Grade</label>
                  <select
                    value={relationshipGrade}
                    onChange={(e) => setRelationshipGrade(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 text-xs"
                  >
                    <option value="Primary - Spouse">Primary - Spouse</option>
                    <option value="Primary - Child">Primary - Child</option>
                    <option value="Primary - Parent">Primary - Parent</option>
                    <option value="Primary - Sibling">Primary - Sibling</option>
                    <option value="Contingent - Spouse">Contingent - Spouse</option>
                    <option value="Contingent - Child">Contingent - Child</option>
                    <option value="Contingent - Parent">Contingent - Parent</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-[10px] uppercase tracking-wider text-slate-500 mb-1">Date of Birth</label>
                  <USDateInput
                    value={dob}
                    onChange={(isoVal) => setDob(isoVal)}
                  />
                </div>

                <div>
                  <label className="block font-bold text-[10px] uppercase tracking-wider text-slate-500 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 000-0000"
                    className="w-full border border-slate-200 rounded-lg p-2 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[10px] uppercase tracking-wider text-slate-500 mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="w-full border border-slate-200 rounded-lg p-2 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[10px] uppercase tracking-wider text-slate-500 mb-1">Benefit Percentage (%) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="100"
                    value={benefitPercentage}
                    onChange={(e) => setBenefitPercentage(e.target.value)}
                    placeholder="60"
                    className="w-full border border-slate-200 rounded-lg p-2 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 text-xs font-bold"
                    required
                  />
                </div>

                <div className="flex items-center gap-2 pt-5">
                  <input
                    type="checkbox"
                    id="is_client_cb"
                    checked={isClient}
                    onChange={(e) => setIsClient(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  <label htmlFor="is_client_cb" className="font-bold text-slate-700 text-xs cursor-pointer">
                    Is also a CRM Client?
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all"
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-3.5 py-1.5 text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-all shadow-xs disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : editingBeneficiary ? 'Save Beneficiary' : 'Add Beneficiary'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
