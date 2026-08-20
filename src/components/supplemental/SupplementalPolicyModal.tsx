'use client';

import React, { useState, useEffect } from 'react';
import DatePicker from '@/components/ui/DatePicker';
import { SupplementalPolicy, SupplementalProductType, SupplementalCoverageType, SupplementalStatus } from '@/types/supplemental';

interface Props {
  isOpen: boolean;
  initialData?: SupplementalPolicy | null;
  onClose: () => void;
  onSave: (data: Partial<SupplementalPolicy>) => Promise<void>;
}

const PRODUCT_TYPE_OPTIONS: SupplementalProductType[] = [
  'Dental',
  'Vision',
  'Accident',
  'Critical Illness',
  'Hospital Indemnity',
  'Cancer',
  'Short-Term Disability',
  'Long-Term Disability',
  'Private Health',
  'Other',
];

const COVERAGE_TYPE_OPTIONS: SupplementalCoverageType[] = [
  'Individual',
  'Individual & Spouse',
  'Family',
  'One-Parent Family',
];

const STATUS_OPTIONS: SupplementalStatus[] = [
  'Active',
  'Pending',
  'Cancelled',
  'Terminated',
  'Expired',
];

export default function SupplementalPolicyModal({
  isOpen,
  initialData,
  onClose,
  onSave,
}: Props) {
  // Policy Fields
  const [productType, setProductType] = useState<string>('Dental');
  const [company, setCompany] = useState<string>('');
  const [planName, setPlanName] = useState<string>('');
  const [coverageType, setCoverageType] = useState<string>('Individual');
  const [memberId, setMemberId] = useState<string>('');
  const [monthlyPremium, setMonthlyPremium] = useState<string>('');
  const [effectiveDate, setEffectiveDate] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Active');

  // Beneficiary Fields
  const [beneficiaryName, setBeneficiaryName] = useState<string>('');
  const [beneficiaryPhone, setBeneficiaryPhone] = useState<string>('');
  const [beneficiaryBirthDate, setBeneficiaryBirthDate] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setProductType(initialData.product_type || 'Dental');
      setCompany(initialData.company || '');
      setPlanName(initialData.plan_name || '');
      setCoverageType(initialData.coverage_type || 'Individual');
      setMemberId(initialData.member_id || '');
      setMonthlyPremium(initialData.monthly_premium !== undefined && initialData.monthly_premium !== null ? String(initialData.monthly_premium) : '');
      setEffectiveDate(initialData.effective_date || null);
      setStatus(initialData.status || 'Active');

      setBeneficiaryName(initialData.beneficiary_name || '');
      setBeneficiaryPhone(initialData.beneficiary_phone || '');
      setBeneficiaryBirthDate(initialData.beneficiary_birth_date || null);
    } else {
      setProductType('Dental');
      setCompany('');
      setPlanName('');
      setCoverageType('Individual');
      setMemberId('');
      setMonthlyPremium('');
      setEffectiveDate(null);
      setStatus('Active');

      setBeneficiaryName('');
      setBeneficiaryPhone('');
      setBeneficiaryBirthDate(null);
    }
    setError(null);
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!productType) {
      setError('Product Type is required.');
      return;
    }

    setSaving(true);
    try {
      const numPremium = monthlyPremium.trim() ? parseFloat(monthlyPremium.replace(/[^0-9.]/g, '')) : 0;
      await onSave({
        id: initialData?.id,
        product_type: productType,
        company: company.trim() || null,
        plan_name: planName.trim() || null,
        coverage_type: coverageType || null,
        member_id: memberId.trim() || null,
        monthly_premium: isNaN(numPremium) ? 0 : numPremium,
        effective_date: effectiveDate || null,
        status: status || 'Active',
        beneficiary_name: beneficiaryName.trim() || null,
        beneficiary_phone: beneficiaryPhone.trim() || null,
        beneficiary_birth_date: beneficiaryBirthDate || null,
      });
      onClose();
    } catch (err: any) {
      console.error('Error saving Supplemental policy:', err);
      setError(err?.message || 'Failed to save policy.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 font-sans">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h3 className="text-base font-extrabold text-slate-800">
              {initialData ? 'Edit Supplemental Policy' : 'Add Supplemental Policy'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Specify policy details, carrier, premium, status, and beneficiary details.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Form Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs font-medium">
              {error}
            </div>
          )}

          {/* Section 1: Policy Information */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Policy Details</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Product Type */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Product Type <span className="text-rose-500">*</span>
                </label>
                <select
                  value={productType}
                  onChange={(e) => setProductType(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                >
                  {PRODUCT_TYPE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              {/* Company / Carrier */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Company / Carrier
                </label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="e.g. Humana, VSP, Aflac"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none placeholder:text-slate-400"
                />
              </div>

              {/* Plan Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Plan Name
                </label>
                <input
                  type="text"
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  placeholder="e.g. Preventive Dental Plus"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none placeholder:text-slate-400"
                />
              </div>

              {/* Coverage Type */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Coverage Type
                </label>
                <select
                  value={coverageType}
                  onChange={(e) => setCoverageType(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                >
                  {COVERAGE_TYPE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              {/* Member ID / Policy Number */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Member ID / Policy Number
                </label>
                <input
                  type="text"
                  value={memberId}
                  onChange={(e) => setMemberId(e.target.value)}
                  placeholder="Policy or Member ID"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none placeholder:text-slate-400"
                />
              </div>

              {/* Monthly Premium */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Monthly Premium ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={monthlyPremium}
                  onChange={(e) => setMonthlyPremium(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none placeholder:text-slate-400"
                />
              </div>

              {/* Effective Date */}
              <div>
                <DatePicker
                  label="Effective Date"
                  value={effectiveDate}
                  onChange={(isoDate) => setEffectiveDate(isoDate)}
                  placeholder="MM/DD/YYYY"
                  optional
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Beneficiary Information */}
          <div className="pt-3 border-t border-slate-100 space-y-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Beneficiary Information</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Beneficiary Name
                </label>
                <input
                  type="text"
                  value={beneficiaryName}
                  onChange={(e) => setBeneficiaryName(e.target.value)}
                  placeholder="e.g. Maria Perez"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none placeholder:text-slate-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Beneficiary Phone
                </label>
                <input
                  type="text"
                  value={beneficiaryPhone}
                  onChange={(e) => setBeneficiaryPhone(e.target.value)}
                  placeholder="e.g. (305) 555-1234"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none placeholder:text-slate-400"
                />
              </div>

              <div>
                <DatePicker
                  label="Beneficiary Birth Date"
                  value={beneficiaryBirthDate}
                  onChange={(isoDate) => setBeneficiaryBirthDate(isoDate)}
                  placeholder="MM/DD/YYYY"
                  optional
                />
              </div>
            </div>
          </div>

          {/* Modal Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition-all shadow-md shadow-blue-500/10 disabled:opacity-50"
            >
              {saving ? 'Saving...' : initialData ? 'Save Changes' : 'Create Policy'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
