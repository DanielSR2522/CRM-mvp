'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import PhoneInput from '@/components/common/PhoneInput';
import {
  InlineEditableSelect,
  InlineEditableText,
  InlineEditablePhone,
} from '@/components/common/inline-edit';

export interface ClientIncomeInformation {
  id: string;
  client_id: string;
  relationship_to_applicant: 'Applicant' | 'Spouse' | 'Son/Daughter' | 'Mother' | 'Father' | 'Other';
  income_type: 'W2' | '1099' | '';
  employer_name: string;
  employer_phone: string;
  income: number;
  created_at?: string;
  updated_at?: string;
}

interface ClientIncomeInformationSectionProps {
  clientId: string;
  onIncomeChanged?: () => void;
  containerClassName?: string;
}

export default function ClientIncomeInformationSection({
  clientId,
  onIncomeChanged,
  containerClassName = 'bg-white border border-slate-100 rounded-2xl shadow-sm p-6 relative font-sans'
}: ClientIncomeInformationSectionProps) {
  const [incomeList, setIncomeList] = useState<ClientIncomeInformation[]>([]);
  const [loadingIncome, setLoadingIncome] = useState(true);

  // Add Modal State
  const [isAddIncomeOpen, setIsAddIncomeOpen] = useState(false);
  const [incomeRelationship, setIncomeRelationship] = useState<ClientIncomeInformation['relationship_to_applicant']>('Applicant');
  const [incomeType, setIncomeType] = useState<ClientIncomeInformation['income_type']>('W2');
  const [incomeEmployerName, setIncomeEmployerName] = useState('');
  const [incomeEmployerPhone, setIncomeEmployerPhone] = useState('');
  const [incomeAmount, setIncomeAmount] = useState<number | ''>('');
  const [incomeSaving, setIncomeSaving] = useState(false);
  const [incomeError, setIncomeError] = useState<string | null>(null);

  const fetchIncomeInformation = useCallback(async () => {
    if (!clientId) return;
    try {
      setLoadingIncome(true);
      const { data, error } = await supabase
        .from('client_income_information')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setIncomeList(data || []);
    } catch (err: any) {
      console.error('Error fetching income info:', err);
    } finally {
      setLoadingIncome(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchIncomeInformation();
  }, [fetchIncomeInformation]);

  useEffect(() => {
    const handleGlobalIncomeUpdated = () => {
      fetchIncomeInformation();
    };
    window.addEventListener('income-updated', handleGlobalIncomeUpdated);
    return () => {
      window.removeEventListener('income-updated', handleGlobalIncomeUpdated);
    };
  }, [fetchIncomeInformation]);

  const notifyIncomeUpdated = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('income-updated', { detail: { clientId } }));
    }
    if (onIncomeChanged) {
      onIncomeChanged();
    }
  }, [clientId, onIncomeChanged]);

  const saveIncomeField = async (incomeId: string, fieldName: string, value: any) => {
    try {
      const { data: updated, error } = await supabase
        .from('client_income_information')
        .update({ [fieldName]: value, updated_at: new Date().toISOString() })
        .eq('id', incomeId)
        .select('*')
        .single();

      if (error || !updated) throw error || new Error('Failed to update income field');
      setIncomeList(prev => prev.map(inc => inc.id === incomeId ? updated : inc));
      notifyIncomeUpdated();
    } catch (err: any) {
      console.error('Error updating income field:', err);
      alert(err?.message || 'Failed to update income field');
    }
  };

  const handleAddIncomeSubmit = async () => {
    if (incomeAmount === '' || Number(incomeAmount) < 0) {
      setIncomeError('Please enter a valid non-negative income amount.');
      return;
    }
    setIncomeSaving(true);
    setIncomeError(null);

    try {
      const { error } = await supabase
        .from('client_income_information')
        .insert({
          client_id: clientId,
          relationship_to_applicant: incomeRelationship,
          income_type: incomeType,
          employer_name: incomeEmployerName.trim(),
          employer_phone: incomeEmployerPhone.trim(),
          income: Number(incomeAmount),
        });

      if (error) throw error;

      setIsAddIncomeOpen(false);
      setIncomeEmployerName('');
      setIncomeEmployerPhone('');
      setIncomeAmount('');
      setIncomeRelationship('Applicant');
      setIncomeType('W2');

      await fetchIncomeInformation();
      notifyIncomeUpdated();
    } catch (err: any) {
      console.error('Error adding income:', err);
      setIncomeError(err?.message || 'Failed to add income record.');
    } finally {
      setIncomeSaving(false);
    }
  };

  const handleDeleteIncome = async (incomeId: string) => {
    if (!confirm('Are you sure you want to delete this income record?')) return;
    try {
      const { error } = await supabase
        .from('client_income_information')
        .delete()
        .eq('id', incomeId);

      if (error) throw error;
      setIncomeList(prev => prev.filter(inc => inc.id !== incomeId));
      notifyIncomeUpdated();
    } catch (err: any) {
      console.error('Error deleting income record:', err);
      alert(err?.message || 'Failed to delete income record');
    }
  };

  return (
    <div className={containerClassName}>
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <h4 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider font-sans">Income Information</h4>
          <p className="text-xs text-slate-400 mt-0.5 font-sans">Manage client annual income sources (Shared canonical records)</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setIncomeError(null);
            setIsAddIncomeOpen(true);
          }}
          className="px-3.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-xs flex items-center gap-1 font-sans"
        >
          + Add Income
        </button>
      </div>

      <div className="pt-4">
        {loadingIncome ? (
          <div className="flex justify-center items-center py-8">
            <svg className="animate-spin h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : incomeList.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-slate-200 rounded-xl">
            <svg className="w-8 h-8 text-slate-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h4 className="text-xs font-bold text-slate-700">No income records registered</h4>
            <p className="text-[11px] text-slate-400 mt-0.5">Click "+ Add Income" above to add income details.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {incomeList.map((income) => (
              <div
                key={income.id}
                className="p-3.5 border border-slate-200/80 rounded-xl bg-slate-50/50 hover:bg-slate-50 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 flex-1 text-xs font-sans">
                  <InlineEditableSelect
                    label="Relationship"
                    value={income.relationship_to_applicant}
                    options={[
                      { label: 'Applicant', value: 'Applicant' },
                      { label: 'Spouse', value: 'Spouse' },
                      { label: 'Son/Daughter', value: 'Son/Daughter' },
                      { label: 'Mother', value: 'Mother' },
                      { label: 'Father', value: 'Father' },
                      { label: 'Other', value: 'Other' },
                    ]}
                    onSave={val => saveIncomeField(income.id, 'relationship_to_applicant', val)}
                  />

                  <InlineEditableSelect
                    label="Income Type"
                    value={income.income_type}
                    options={[
                      { label: 'W2', value: 'W2' },
                      { label: '1099', value: '1099' },
                    ]}
                    onSave={val => saveIncomeField(income.id, 'income_type', val)}
                  />

                  <InlineEditableText
                    label="Employer / Source"
                    value={income.employer_name}
                    onSave={val => saveIncomeField(income.id, 'employer_name', val)}
                  />

                  <InlineEditablePhone
                    label="Employer Phone"
                    value={income.employer_phone}
                    onSave={val => saveIncomeField(income.id, 'employer_phone', val)}
                  />

                  <InlineEditableText
                    label="Amount ($)"
                    type="number"
                    value={String(income.income || '')}
                    onSave={val => saveIncomeField(income.id, 'income', Number(val))}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteIncome(income.id)}
                  className="text-xs font-bold text-rose-500 hover:text-rose-700 p-1 self-end sm:self-center font-sans"
                  title="Delete income record"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ADD INCOME MODAL */}
        {isAddIncomeOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 border border-slate-100 font-sans">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h4 className="text-base font-extrabold text-slate-900">Add Income Record</h4>
                <button
                  type="button"
                  onClick={() => setIsAddIncomeOpen(false)}
                  className="text-slate-400 hover:text-slate-600 font-bold"
                >
                  ✕
                </button>
              </div>

              {incomeError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-semibold">
                  {incomeError}
                </div>
              )}

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Relationship</label>
                  <select
                    value={incomeRelationship}
                    onChange={e => setIncomeRelationship(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 outline-none"
                  >
                    <option value="Applicant">Applicant</option>
                    <option value="Spouse">Spouse</option>
                    <option value="Son/Daughter">Son/Daughter</option>
                    <option value="Mother">Mother</option>
                    <option value="Father">Father</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Income Type</label>
                  <select
                    value={incomeType}
                    onChange={e => setIncomeType(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 outline-none"
                  >
                    <option value="W2">W2</option>
                    <option value="1099">1099</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Employer / Source</label>
                  <input
                    type="text"
                    value={incomeEmployerName}
                    onChange={e => setIncomeEmployerName(e.target.value)}
                    placeholder="e.g. Acme Corp"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Employer Phone</label>
                  <PhoneInput
                    value={incomeEmployerPhone}
                    onChange={val => setIncomeEmployerPhone(val)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Annual Amount ($)</label>
                  <input
                    type="number"
                    value={incomeAmount}
                    onChange={e => setIncomeAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="e.g. 55000"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 outline-none"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddIncomeOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-50 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddIncomeSubmit}
                  disabled={incomeSaving}
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs disabled:opacity-50"
                >
                  {incomeSaving ? 'Saving...' : 'Save Income'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
